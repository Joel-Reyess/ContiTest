using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using tiempo_libre.DTOs;
using tiempo_libre.Models;
using tiempo_libre.Models.Enums;

namespace tiempo_libre.Services
{
    /// <summary>
    /// Alta, baja y consulta de las reglas dominicales por unidad organizativa y
    /// periodo. Qué día queda no laborable lo decide CalendarioLaboralService.
    /// </summary>
    public class ReglasDomingoService
    {
        private static readonly string[] Tipos = { "SinDomingo", "RolNormal" };

        private readonly FreeTimeDbContext _db;
        private readonly ILogger<ReglasDomingoService> _logger;

        public ReglasDomingoService(FreeTimeDbContext db, ILogger<ReglasDomingoService> logger)
        {
            _db = db;
            _logger = logger;
        }

        public async Task<ApiResponse<ReglasDomingoResponse>> ListarAsync(int? anio, int? areaId, bool incluirInactivas)
        {
            if (!await new CalendarioLaboralService(_db).TablaExisteAsync())
                return new ApiResponse<ReglasDomingoResponse>(true, new ReglasDomingoResponse { TablaExiste = false }, null);

            var q = _db.ReglasDomingo.AsNoTracking().AsQueryable();
            if (!incluirInactivas) q = q.Where(r => r.Activa);
            if (areaId.HasValue) q = q.Where(r => r.AreaId == areaId.Value);
            if (anio.HasValue)
            {
                var ini = new DateOnly(anio.Value, 1, 1);
                var fin = new DateOnly(anio.Value, 12, 31);
                q = q.Where(r => r.FechaInicio <= fin && r.FechaFin >= ini);
            }

            var reglas = await q
                .OrderByDescending(r => r.Activa).ThenBy(r => r.Area!.NombreGeneral).ThenBy(r => r.FechaInicio)
                .Select(r => new ReglaDomingoDto
                {
                    Id = r.Id,
                    AreaId = r.AreaId,
                    Area = r.Area != null ? r.Area.NombreGeneral : "",
                    GrupoId = r.GrupoId,
                    Grupo = r.Grupo != null ? r.Grupo.Rol : null,
                    Tipo = r.Tipo,
                    IncluyeSabado = r.IncluyeSabado,
                    FechaInicio = r.FechaInicio,
                    FechaFin = r.FechaFin,
                    Motivo = r.Motivo,
                    Activa = r.Activa,
                    CreadoPor = r.CreadoPor != null ? r.CreadoPor.FullName : null,
                    FechaCreacion = r.FechaCreacion,
                    DesactivadoPor = r.DesactivadoPor != null ? r.DesactivadoPor.FullName : null,
                    FechaDesactivacion = r.FechaDesactivacion
                })
                .ToListAsync();

            return new ApiResponse<ReglasDomingoResponse>(true, new ReglasDomingoResponse { Reglas = reglas }, null);
        }

        public async Task<ApiResponse<ResultadoReglasDomingoDto>> CrearAsync(CrearReglaDomingoRequest req, int usuarioId)
        {
            ApiResponse<ResultadoReglasDomingoDto> Error(string msg) => new(false, null, msg);

            if (!await new CalendarioLaboralService(_db).TablaExisteAsync())
                return Error("Falta crear la tabla: corre Scripts/Migration_ReglasDomingo.sql.");
            if (!Tipos.Contains(req.Tipo))
                return Error("El tipo debe ser SinDomingo (no laborable) o RolNormal (en base a rol).");
            if (req.FechaFin < req.FechaInicio)
                return Error("La fecha final no puede ser antes de la inicial.");
            if (req.FechaFin.DayNumber - req.FechaInicio.DayNumber > 366)
                return Error("El periodo no puede pasar de un año.");
            var tieneFinDeSemana = false;
            for (var f = req.FechaInicio; f <= req.FechaFin && !tieneFinDeSemana; f = f.AddDays(1))
                tieneFinDeSemana = f.DayOfWeek is DayOfWeek.Sunday or DayOfWeek.Saturday;
            if (!tieneFinDeSemana)
                return Error("El periodo elegido no tiene ningún sábado ni domingo.");

            var areas = req.TodaLaPlanta
                ? await _db.Areas.Select(a => new { a.AreaId, a.NombreGeneral }).ToListAsync()
                : await _db.Areas.Where(a => req.AreaIds.Contains(a.AreaId)).Select(a => new { a.AreaId, a.NombreGeneral }).ToListAsync();
            var areaIds = req.TodaLaPlanta ? areas.Select(a => a.AreaId).ToList() : (req.AreaIds ?? new List<int>()).Distinct().ToList();
            if (areaIds.Count == 0)
                return Error("Selecciona al menos una unidad organizativa.");
            if (areas.Count != areaIds.Count)
                return Error("Alguna unidad organizativa no existe.");

            var grupoId = req.TodaLaPlanta ? null : req.GrupoId;
            if (grupoId.HasValue)
            {
                if (areaIds.Count != 1)
                    return Error("Para elegir un grupo selecciona una sola unidad organizativa.");
                var grupo = await _db.Grupos.FirstOrDefaultAsync(g => g.GrupoId == grupoId.Value);
                if (grupo == null || grupo.AreaId != areaIds[0])
                    return Error("El grupo no pertenece a esa unidad organizativa.");
            }

            // Todas con la misma hora: así la pantalla las muestra como un solo renglón
            // (p. ej. "Toda la planta") y se desactivan juntas.
            var ahora = DateTime.Now;
            var incluyeSabado = req.Tipo == "SinDomingo" && req.IncluyeSabado;
            var motivo = string.IsNullOrWhiteSpace(req.Motivo) ? null : req.Motivo.Trim();
            var creadoPor = usuarioId > 0 ? usuarioId : (int?)null;

            // Las reglas pueden encimarse (manda la de periodo más corto, ver
            // CalendarioLaboralService). Solo una de la MISMA unidad/grupo y las MISMAS
            // fechas no tendría sentido: si dice lo mismo se deja, si dice otra cosa la
            // nueva la reemplaza (la anterior queda desactivada con quién y cuándo).
            var mismas = await _db.ReglasDomingo
                .Where(r => r.Activa && areaIds.Contains(r.AreaId) && r.GrupoId == grupoId &&
                            r.FechaInicio == req.FechaInicio && r.FechaFin == req.FechaFin)
                .ToListAsync();

            var resultado = new ResultadoReglasDomingoDto();
            var nuevas = new List<ReglaDomingo>();
            foreach (var areaId in areaIds)
            {
                var previas = mismas.Where(r => r.AreaId == areaId).ToList();
                if (previas.Any(r => r.Tipo == req.Tipo && r.IncluyeSabado == incluyeSabado))
                {
                    resultado.YaExistian++;
                    continue;
                }
                foreach (var previa in previas)
                {
                    previa.Activa = false;
                    previa.DesactivadoPorId = creadoPor;
                    previa.FechaDesactivacion = ahora;
                }
                if (previas.Count > 0) resultado.Reemplazadas++;
                nuevas.Add(new ReglaDomingo
                {
                    AreaId = areaId,
                    GrupoId = grupoId,
                    Tipo = req.Tipo,
                    IncluyeSabado = incluyeSabado,
                    FechaInicio = req.FechaInicio,
                    FechaFin = req.FechaFin,
                    Motivo = motivo,
                    Activa = true,
                    CreadoPorId = creadoPor,
                    FechaCreacion = ahora
                });
            }
            resultado.Creadas = nuevas.Count;

            _db.ReglasDomingo.AddRange(nuevas);
            await _db.SaveChangesAsync();
            _logger.LogWarning("Reglas dominicales creadas por usuario {Usuario}: {Tipo} {Inicio:yyyy-MM-dd}..{Fin:yyyy-MM-dd} sábado={Sabado} planta={Planta} áreas {Areas} grupo {Grupo}; nuevas {Nuevas}, reemplazadas {Reemplazadas}, ya estaban {Ya}",
                usuarioId, req.Tipo, req.FechaInicio, req.FechaFin, incluyeSabado, req.TodaLaPlanta,
                req.TodaLaPlanta ? "todas" : string.Join(",", areas.Select(a => a.NombreGeneral)), grupoId,
                resultado.Creadas, resultado.Reemplazadas, resultado.YaExistian);
            return new ApiResponse<ResultadoReglasDomingoDto>(true, resultado, null);
        }

        /// <summary>Desactiva o reactiva de una vez varias reglas (las que se guardaron juntas).</summary>
        public async Task<ApiResponse<int>> CambiarEstadoAsync(CambiarEstadoReglasDomingoRequest req, int usuarioId)
        {
            var ids = (req.Ids ?? new List<int>()).Distinct().ToList();
            if (ids.Count == 0) return new ApiResponse<int>(false, 0, "No se indicó ninguna regla.");
            var reglas = await _db.ReglasDomingo.Where(r => ids.Contains(r.Id)).ToListAsync();
            if (reglas.Count != ids.Count) return new ApiResponse<int>(false, 0, "Alguna regla no existe.");

            var cambian = reglas.Where(r => r.Activa != req.Activa).ToList();
            if (req.Activa)
            {
                foreach (var r in cambian)
                {
                    var choque = await ChoqueAsync(r);
                    if (choque != null) return new ApiResponse<int>(false, 0, choque + " No se reactivó ninguna.");
                }
            }
            var ahora = DateTime.Now;
            foreach (var r in cambian)
            {
                r.Activa = req.Activa;
                r.DesactivadoPorId = req.Activa ? null : (usuarioId > 0 ? usuarioId : null);
                r.FechaDesactivacion = req.Activa ? null : ahora;
            }
            await _db.SaveChangesAsync();
            _logger.LogWarning("Reglas dominicales {Ids} {Accion} por usuario {Usuario}",
                string.Join(",", cambian.Select(r => r.Id)), req.Activa ? "reactivadas" : "desactivadas", usuarioId);
            return new ApiResponse<int>(true, cambian.Count, null);
        }

        public async Task<ApiResponse<object>> DesactivarAsync(int id, int usuarioId)
        {
            var r = await _db.ReglasDomingo.FirstOrDefaultAsync(x => x.Id == id);
            if (r == null) return new ApiResponse<object>(false, null, "No se encontró la regla.");
            if (!r.Activa) return new ApiResponse<object>(false, null, "Ya estaba desactivada.");
            r.Activa = false;
            r.DesactivadoPorId = usuarioId > 0 ? usuarioId : null;
            r.FechaDesactivacion = DateTime.Now;
            await _db.SaveChangesAsync();
            _logger.LogWarning("Regla dominical {Id} desactivada por usuario {Usuario}", id, usuarioId);
            return new ApiResponse<object>(true, null, "Desactivada: en esas fechas vuelve a mandar la regla que siga (o el rol normal).");
        }

        public async Task<ApiResponse<object>> ReactivarAsync(int id, int usuarioId)
        {
            var r = await _db.ReglasDomingo.FirstOrDefaultAsync(x => x.Id == id);
            if (r == null) return new ApiResponse<object>(false, null, "No se encontró la regla.");
            if (r.Activa) return new ApiResponse<object>(false, null, "Ya estaba activa.");
            var choque = await ChoqueAsync(r);
            if (choque != null) return new ApiResponse<object>(false, null, choque);
            r.Activa = true;
            r.DesactivadoPorId = null;
            r.FechaDesactivacion = null;
            await _db.SaveChangesAsync();
            _logger.LogWarning("Regla dominical {Id} reactivada por usuario {Usuario}", id, usuarioId);
            return new ApiResponse<object>(true, null, "Reactivada.");
        }

        /// <summary>Reglas que tocan al empleado en el año (aviso arriba de su calendario).</summary>
        public async Task<ApiResponse<List<ReglaDomingoDto>>> DelEmpleadoAsync(int empleadoId, int anio)
        {
            var grupoId = await _db.Users.Where(u => u.Id == empleadoId).Select(u => u.GrupoId).FirstOrDefaultAsync();
            if (grupoId == null) return new ApiResponse<List<ReglaDomingoDto>>(true, new List<ReglaDomingoDto>(), null);
            var reglas = await new CalendarioLaboralService(_db).ReglasDelGrupoAsync(grupoId.Value, anio);
            var areas = await _db.Areas.Where(a => reglas.Select(r => r.AreaId).Contains(a.AreaId))
                .ToDictionaryAsync(a => a.AreaId, a => a.NombreGeneral);
            return new ApiResponse<List<ReglaDomingoDto>>(true, reglas.Select(r => new ReglaDomingoDto
            {
                Id = r.Id,
                AreaId = r.AreaId,
                Area = areas.GetValueOrDefault(r.AreaId) ?? "",
                GrupoId = r.GrupoId,
                Tipo = r.Tipo,
                IncluyeSabado = r.IncluyeSabado,
                FechaInicio = r.FechaInicio,
                FechaFin = r.FechaFin,
                Motivo = r.Motivo,
                Activa = r.Activa,
                FechaCreacion = r.FechaCreacion
            }).ToList(), null);
        }

        /// <summary>
        /// Vacaciones activas que quedaron en un día que una regla dejó no laborable
        /// (se programaron antes de la regla). No se mueven solas: se listan para
        /// que el superusuario las reprograme desde el calendario del empleado.
        /// </summary>
        public async Task<ApiResponse<List<VacacionEnNoLaborableDto>>> VacacionesEnNoLaborablesAsync(int anio)
        {
            var calendario = new CalendarioLaboralService(_db);
            if (!await calendario.TablaExisteAsync())
                return new ApiResponse<List<VacacionEnNoLaborableDto>>(true, new List<VacacionEnNoLaborableDto>(), null);

            var ini = new DateOnly(anio, 1, 1);
            var fin = new DateOnly(anio, 12, 31);
            var reglas = await _db.ReglasDomingo.AsNoTracking()
                .Where(r => r.Activa && r.Tipo == "SinDomingo" && r.FechaInicio <= fin && r.FechaFin >= ini)
                .ToListAsync();
            if (reglas.Count == 0) return new ApiResponse<List<VacacionEnNoLaborableDto>>(true, new List<VacacionEnNoLaborableDto>(), null);

            var areaIds = reglas.Select(r => r.AreaId).Distinct().ToList();
            var desde = reglas.Min(r => r.FechaInicio) < ini ? ini : reglas.Min(r => r.FechaInicio);
            var hasta = reglas.Max(r => r.FechaFin) > fin ? fin : reglas.Max(r => r.FechaFin);

            var candidatas = await _db.VacacionesProgramadas.AsNoTracking()
                .Where(v => v.EstadoVacacion == "Activa" && v.FechaVacacion >= desde && v.FechaVacacion <= hasta &&
                            v.Empleado.GrupoId != null && v.Empleado.Status == UserStatus.Activo &&
                            areaIds.Contains(v.Empleado.Grupo!.AreaId))
                .Select(v => new
                {
                    v.Id, v.EmpleadoId, v.FechaVacacion, v.TipoVacacion,
                    GrupoId = v.Empleado.GrupoId!.Value,
                    v.Empleado.Nomina, v.Empleado.FullName,
                    Grupo = v.Empleado.Grupo!.Rol,
                    Area = v.Empleado.Grupo!.Area!.NombreGeneral
                })
                .ToListAsync();

            var fines = candidatas.Where(v => v.FechaVacacion.DayOfWeek is DayOfWeek.Sunday or DayOfWeek.Saturday).ToList();
            var tabla = await calendario.PrecargarAsync(fines.Select(v => v.GrupoId));
            var lista = fines
                .Select(v => new { v, Motivo = tabla.Motivo(v.GrupoId, v.FechaVacacion) })
                .Where(x => x.Motivo != null)
                .OrderBy(x => x.v.Area).ThenBy(x => x.v.FechaVacacion).ThenBy(x => x.v.Nomina)
                .Select(x => new VacacionEnNoLaborableDto
                {
                    VacacionId = x.v.Id,
                    EmpleadoId = x.v.EmpleadoId,
                    Nomina = x.v.Nomina,
                    Nombre = x.v.FullName ?? "",
                    Area = x.v.Area ?? "",
                    Grupo = x.v.Grupo ?? "",
                    Fecha = x.v.FechaVacacion,
                    TipoVacacion = x.v.TipoVacacion,
                    Motivo = x.Motivo!
                })
                .ToList();
            return new ApiResponse<List<VacacionEnNoLaborableDto>>(true, lista, null);
        }

        /// <summary>
        /// Las reglas pueden encimarse (manda la de periodo más corto); solo no puede
        /// haber dos activas para la misma unidad (o el mismo grupo) con las mismas
        /// fechas exactas: no habría cómo saber cuál manda.
        /// </summary>
        private async Task<string?> ChoqueAsync(ReglaDomingo r)
        {
            var existente = await _db.ReglasDomingo
                .Where(x => x.Activa && x.Id != r.Id && x.AreaId == r.AreaId && x.GrupoId == r.GrupoId &&
                            x.FechaInicio == r.FechaInicio && x.FechaFin == r.FechaFin)
                .FirstOrDefaultAsync();
            return existente == null
                ? null
                : $"Ya hay una regla activa con esas mismas fechas ({(existente.Tipo == "SinDomingo" ? "no laborable" : "en base a rol")} del " +
                  $"{existente.FechaInicio:dd/MM/yyyy} al {existente.FechaFin:dd/MM/yyyy}). Desactívala primero.";
        }
    }
}
