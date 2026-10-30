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

        public async Task<ApiResponse<int>> CrearAsync(CrearReglaDomingoRequest req, int usuarioId)
        {
            if (!await new CalendarioLaboralService(_db).TablaExisteAsync())
                return new ApiResponse<int>(false, 0, "Falta crear la tabla: corre Scripts/Migration_ReglasDomingo.sql.");
            var areaIds = (req.AreaIds ?? new List<int>()).Distinct().ToList();
            if (areaIds.Count == 0)
                return new ApiResponse<int>(false, 0, "Selecciona al menos una unidad organizativa.");
            if (!Tipos.Contains(req.Tipo))
                return new ApiResponse<int>(false, 0, "El tipo debe ser SinDomingo o RolNormal.");
            if (req.FechaFin < req.FechaInicio)
                return new ApiResponse<int>(false, 0, "La fecha final no puede ser antes de la inicial.");
            if (req.FechaFin.DayNumber - req.FechaInicio.DayNumber > 366)
                return new ApiResponse<int>(false, 0, "El periodo no puede pasar de un año.");

            var areas = await _db.Areas.Where(a => areaIds.Contains(a.AreaId))
                .Select(a => new { a.AreaId, a.NombreGeneral }).ToListAsync();
            if (areas.Count != areaIds.Count)
                return new ApiResponse<int>(false, 0, "Alguna unidad organizativa no existe.");

            if (req.GrupoId.HasValue)
            {
                if (areaIds.Count != 1)
                    return new ApiResponse<int>(false, 0, "Para elegir un grupo selecciona una sola unidad organizativa.");
                var grupo = await _db.Grupos.FirstOrDefaultAsync(g => g.GrupoId == req.GrupoId.Value);
                if (grupo == null || grupo.AreaId != areaIds[0])
                    return new ApiResponse<int>(false, 0, "El grupo no pertenece a esa unidad organizativa.");
            }

            var nuevas = areas.Select(a => new ReglaDomingo
            {
                AreaId = a.AreaId,
                GrupoId = req.GrupoId,
                Tipo = req.Tipo,
                IncluyeSabado = req.Tipo == "SinDomingo" && req.IncluyeSabado,
                FechaInicio = req.FechaInicio,
                FechaFin = req.FechaFin,
                Motivo = string.IsNullOrWhiteSpace(req.Motivo) ? null : req.Motivo.Trim(),
                Activa = true,
                CreadoPorId = usuarioId > 0 ? usuarioId : null,
                FechaCreacion = DateTime.Now
            }).ToList();

            foreach (var r in nuevas)
            {
                var choque = await ChoqueAsync(r);
                if (choque != null)
                {
                    var nombre = areas.First(a => a.AreaId == r.AreaId).NombreGeneral;
                    return new ApiResponse<int>(false, 0, $"{nombre}: {choque} No se guardó ninguna.");
                }
            }

            _db.ReglasDomingo.AddRange(nuevas);
            await _db.SaveChangesAsync();
            _logger.LogWarning("Reglas dominicales creadas por usuario {Usuario}: {Tipo} {Inicio:yyyy-MM-dd}..{Fin:yyyy-MM-dd} sábado={Sabado} áreas {Areas} grupo {Grupo}",
                usuarioId, req.Tipo, req.FechaInicio, req.FechaFin, req.IncluyeSabado,
                string.Join(",", areas.Select(a => a.NombreGeneral)), req.GrupoId);
            return new ApiResponse<int>(true, nuevas.Count, null);
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
            return new ApiResponse<object>(true, null, "Desactivada: en esas fechas vuelve el rol normal.");
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
        /// Dos reglas activas para lo mismo (la misma unidad, o el mismo grupo) no se
        /// pueden encimar: no habría cómo saber cuál manda.
        /// </summary>
        private async Task<string?> ChoqueAsync(ReglaDomingo r)
        {
            var existente = await _db.ReglasDomingo
                .Where(x => x.Activa && x.Id != r.Id && x.AreaId == r.AreaId && x.GrupoId == r.GrupoId &&
                            x.FechaInicio <= r.FechaFin && x.FechaFin >= r.FechaInicio)
                .FirstOrDefaultAsync();
            return existente == null
                ? null
                : $"Ya hay una regla activa que se encima ({(existente.Tipo == "SinDomingo" ? "sin domingos" : "rol normal")} del " +
                  $"{existente.FechaInicio:dd/MM/yyyy} al {existente.FechaFin:dd/MM/yyyy}). Desactívala primero.";
        }
    }
}
