using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using tiempo_libre.DTOs;
using tiempo_libre.Models;

namespace tiempo_libre.Services
{
    /// <summary>
    /// Alta, baja y consulta de la capacidad adicional de ausencia por periodo
    /// (CapacidadesPorcentaje). El cálculo de qué porcentaje rige cada día está en
    /// LimitePorcentajeService; aquí solo se administra.
    /// </summary>
    public class CapacidadPorcentajeService
    {
        private static readonly string[] Alcances = { "Planta", "Area", "Grupo" };
        private static readonly string[] Periodos = { "Dia", "Semana", "Mes", "Anio" };
        private static readonly string[] Aplicaciones = { "Ambos", "Empresa", "Operador" };
        private const string ScriptPorDiaYAnual = "Scripts/Migration_CapacidadPorDiaYAnual.sql";

        private readonly FreeTimeDbContext _db;
        private readonly LimitePorcentajeService _limites;
        private readonly ValidadorPorcentajeService _validador;
        private readonly ILogger<CapacidadPorcentajeService> _logger;

        public CapacidadPorcentajeService(FreeTimeDbContext db, LimitePorcentajeService limites,
            ValidadorPorcentajeService validador, ILogger<CapacidadPorcentajeService> logger)
        {
            _db = db;
            _limites = limites;
            _validador = validador;
            _logger = logger;
        }

        public async Task<ApiResponse<CapacidadesPorcentajeResponse>> ListarAsync(int? anio, bool incluirInactivas)
        {
            var config = await _db.ConfiguracionVacaciones
                .OrderByDescending(c => c.CreatedAt).ThenByDescending(c => c.Id)
                .FirstOrDefaultAsync();
            var respuesta = new CapacidadesPorcentajeResponse
            {
                PorcentajeGeneral = Helpers.PorcentajeAusenciaHelper.ParaAnio(config, -1),
                AnioPreparacion = config?.AnioProgramacionAnual,
                PorcentajePreparacion = config?.PorcentajeAusenciaPreparacion
            };
            if (!await _limites.TablaExisteAsync())
            {
                respuesta.TablaExiste = false;
                return new ApiResponse<CapacidadesPorcentajeResponse>(true, respuesta, null);
            }

            var q = _db.CapacidadesPorcentaje.AsNoTracking().AsQueryable();
            if (!incluirInactivas) q = q.Where(c => c.Activa);
            if (anio.HasValue)
            {
                var ini = new DateOnly(anio.Value, 1, 1);
                var fin = new DateOnly(anio.Value, 12, 31);
                q = q.Where(c => c.FechaInicio <= fin && c.FechaFin >= ini);
            }

            q = q.OrderByDescending(c => c.Activa).ThenBy(c => c.FechaInicio).ThenBy(c => c.Id);
            List<CapacidadPorcentajeDto> filas;
            try
            {
                filas = await q.Select(c => new CapacidadPorcentajeDto
                {
                    Id = c.Id, Alcance = c.Alcance, AplicaA = c.AplicaA, Turno = c.Turno,
                    AreaId = c.AreaId,
                    Area = c.Area != null ? c.Area.NombreGeneral : (c.Grupo != null && c.Grupo.Area != null ? c.Grupo.Area.NombreGeneral : null),
                    GrupoId = c.GrupoId,
                    Grupo = c.Grupo != null ? c.Grupo.Rol : null,
                    Periodo = c.Periodo, Medicion = c.Medicion,
                    FechaInicio = c.FechaInicio, FechaFin = c.FechaFin, Porcentaje = c.Porcentaje, Motivo = c.Motivo,
                    Activa = c.Activa,
                    CreadoPor = c.CreadoPor != null ? c.CreadoPor.FullName : null,
                    FechaCreacion = c.FechaCreacion,
                    DesactivadoPor = c.DesactivadoPor != null ? c.DesactivadoPor.FullName : null,
                    FechaDesactivacion = c.FechaDesactivacion,
                    ModificadoPor = c.ModificadoPor != null ? c.ModificadoPor.FullName : null,
                    FechaModificacion = c.FechaModificacion
                }).ToListAsync();
            }
            catch (Exception ex)
            {
                // Sin las columnas nuevas (no se corrió el script): se listan como
                // antes, todas por grupo, para que la pantalla no truene.
                _logger.LogWarning(ex, "Capacidades sin columnas Medicion/ModificadoPor: falta {Script}", ScriptPorDiaYAnual);
                respuesta.FaltaScript = ScriptPorDiaYAnual;
                filas = await q.Select(c => new CapacidadPorcentajeDto
                {
                    Id = c.Id, Alcance = c.Alcance, AplicaA = c.AplicaA, Turno = c.Turno,
                    AreaId = c.AreaId,
                    Area = c.Area != null ? c.Area.NombreGeneral : (c.Grupo != null && c.Grupo.Area != null ? c.Grupo.Area.NombreGeneral : null),
                    GrupoId = c.GrupoId,
                    Grupo = c.Grupo != null ? c.Grupo.Rol : null,
                    Periodo = c.Periodo,
                    FechaInicio = c.FechaInicio, FechaFin = c.FechaFin, Porcentaje = c.Porcentaje, Motivo = c.Motivo,
                    Activa = c.Activa,
                    CreadoPor = c.CreadoPor != null ? c.CreadoPor.FullName : null,
                    FechaCreacion = c.FechaCreacion,
                    DesactivadoPor = c.DesactivadoPor != null ? c.DesactivadoPor.FullName : null,
                    FechaDesactivacion = c.FechaDesactivacion
                }).ToListAsync();
            }

            foreach (var f in filas)
            {
                f.CadaAnio = f.Periodo == "Anio" && f.FechaFin == CapacidadPorcentaje.SinFin;
                f.Descripcion = LimitePorcentajeService.DescribirCapacidad(new CapacidadPorcentaje
                {
                    Alcance = f.Alcance, AplicaA = f.AplicaA, Turno = f.Turno, Periodo = f.Periodo, Medicion = f.Medicion,
                    FechaInicio = f.FechaInicio, FechaFin = f.FechaFin
                });
            }
            respuesta.Capacidades = filas;

            return new ApiResponse<CapacidadesPorcentajeResponse>(true, respuesta, null);
        }

        public async Task<ApiResponse<int>> CrearAsync(CrearCapacidadPorcentajeRequest req, int usuarioId)
        {
            if (!await _limites.TablaExisteAsync())
                return new ApiResponse<int>(false, 0, "Falta crear la tabla: corre Scripts/Migration_CapacidadesPorcentaje.sql.");

            var capacidad = new CapacidadPorcentaje
            {
                Activa = true,
                CreadoPorId = usuarioId > 0 ? usuarioId : null,
                FechaCreacion = DateTime.Now
            };
            var error = await LlenarAsync(capacidad, req);
            if (error != null) return new ApiResponse<int>(false, 0, error);

            var choque = await ChoqueAsync(capacidad);
            if (choque != null) return new ApiResponse<int>(false, 0, choque);

            _db.CapacidadesPorcentaje.Add(capacidad);
            var faltaScript = await GuardarAsync();
            if (faltaScript != null) return new ApiResponse<int>(false, 0, faltaScript);
            _logger.LogWarning("Capacidad por periodo {Id} creada por usuario {Usuario}: {Descripcion} = {Pct}% ({Motivo})",
                capacidad.Id, usuarioId, LimitePorcentajeService.DescribirCapacidad(capacidad), capacidad.Porcentaje, capacidad.Motivo);
            return new ApiResponse<int>(true, capacidad.Id, null);
        }

        /// <summary>
        /// Editar una capacidad en su lugar (nov-2026: antes había que desactivarla y
        /// capturarla otra vez). Queda quién la editó y cuándo; lo que tenía antes
        /// queda en el log.
        /// </summary>
        public async Task<ApiResponse<object>> ActualizarAsync(int id, CrearCapacidadPorcentajeRequest req, int usuarioId)
        {
            if (!await _limites.TablaExisteAsync())
                return new ApiResponse<object>(false, null, "Falta crear la tabla: corre Scripts/Migration_CapacidadesPorcentaje.sql.");
            var capacidad = await _db.CapacidadesPorcentaje.FirstOrDefaultAsync(x => x.Id == id);
            if (capacidad == null) return new ApiResponse<object>(false, null, "No se encontró la capacidad.");

            var antes = $"{LimitePorcentajeService.DescribirCapacidad(capacidad)} = {capacidad.Porcentaje}% ({capacidad.Motivo})";
            var error = await LlenarAsync(capacidad, req);
            if (error != null) return new ApiResponse<object>(false, null, error);

            if (capacidad.Activa)
            {
                var choque = await ChoqueAsync(capacidad);
                if (choque != null) return new ApiResponse<object>(false, null, choque);
            }

            capacidad.ModificadoPorId = usuarioId > 0 ? usuarioId : null;
            capacidad.FechaModificacion = DateTime.Now;
            var faltaScript = await GuardarAsync();
            if (faltaScript != null) return new ApiResponse<object>(false, null, faltaScript);
            _logger.LogWarning("Capacidad por periodo {Id} editada por usuario {Usuario}. Antes: {Antes}. Ahora: {Descripcion} = {Pct}% ({Motivo})",
                id, usuarioId, antes, LimitePorcentajeService.DescribirCapacidad(capacidad), capacidad.Porcentaje, capacidad.Motivo);
            return new ApiResponse<object>(true, null, "Cambios guardados.");
        }

        /// <summary>Valida la petición y la pasa a la capacidad (alta y edición). Devuelve el error o null.</summary>
        private async Task<string?> LlenarAsync(CapacidadPorcentaje capacidad, CrearCapacidadPorcentajeRequest req)
        {
            if (!Alcances.Contains(req.Alcance))
                return "El alcance debe ser Planta, Area o Grupo.";
            if (!Periodos.Contains(req.Periodo))
                return "El periodo debe ser Dia, Semana, Mes o Anio.";
            if (req.Porcentaje <= 0 || req.Porcentaje > 100)
                return "El porcentaje debe ser mayor a 0 y hasta 100.";
            var aplicaA = string.IsNullOrWhiteSpace(req.AplicaA) ? "Ambos" : req.AplicaA;
            if (!Aplicaciones.Contains(aplicaA))
                return "Debe aplicar a Ambos, Empresa u Operador.";
            var turno = string.IsNullOrWhiteSpace(req.Turno) ? null : req.Turno.Trim();
            if (turno != null && turno != "1" && turno != "2" && turno != "3")
                return "El turno debe ser todo el día, 1, 2 o 3.";
            var medicion = string.IsNullOrWhiteSpace(req.Medicion) ? "Grupo" : req.Medicion.Trim();
            if (medicion != "Grupo" && medicion != "Dia")
                return "El porcentaje se mide por grupo o por día.";
            if (medicion == "Dia" && req.Alcance != "Area")
                return "Por día solo se puede para un área (unidad organizativa): suma el personal de sus grupos que trabajan ese día.";
            if (medicion == "Dia" && turno != null)
                return "Por día es para todo el día (los tres turnos juntos); para un solo turno usa por grupo.";

            capacidad.Alcance = req.Alcance;
            capacidad.AplicaA = aplicaA;
            capacidad.Turno = turno;
            capacidad.Medicion = medicion;
            capacidad.Periodo = req.Periodo;
            capacidad.Porcentaje = Math.Round(req.Porcentaje, 2);
            capacidad.Motivo = string.IsNullOrWhiteSpace(req.Motivo) ? null : req.Motivo.Trim();
            capacidad.AreaId = null;
            capacidad.GrupoId = null;

            switch (req.Alcance)
            {
                case "Area":
                    if (req.AreaId == null || !await _db.Areas.AnyAsync(a => a.AreaId == req.AreaId))
                        return "Selecciona un área válida.";
                    capacidad.AreaId = req.AreaId;
                    break;
                case "Grupo":
                    var grupo = req.GrupoId == null ? null : await _db.Grupos.FirstOrDefaultAsync(g => g.GrupoId == req.GrupoId);
                    if (grupo == null) return "Selecciona un grupo válido.";
                    capacidad.GrupoId = grupo.GrupoId;
                    break;
            }

            // Fechas según el periodo: la semana de hasta 7 días (sin fecha final, de lunes
            // a domingo), el mes completo y el año completo o cada año.
            switch (req.Periodo)
            {
                case "Dia":
                    capacidad.FechaInicio = req.FechaInicio;
                    capacidad.FechaFin = req.FechaFin ?? req.FechaInicio;
                    if (capacidad.FechaFin < capacidad.FechaInicio)
                        return "La fecha final no puede ser antes de la inicial.";
                    if (capacidad.FechaFin.DayNumber - capacidad.FechaInicio.DayNumber > 30)
                        return "Por día se pueden marcar hasta 31 días seguidos; para más usa semana, mes o año.";
                    break;
                case "Semana":
                    if (req.FechaFin.HasValue)
                    {
                        // Del día que elijan al que elijan (nov-2026: antes solo de lunes a domingo).
                        capacidad.FechaInicio = req.FechaInicio;
                        capacidad.FechaFin = req.FechaFin.Value;
                        if (capacidad.FechaFin < capacidad.FechaInicio)
                            return "La fecha final no puede ser antes de la inicial.";
                        if (capacidad.FechaFin.DayNumber - capacidad.FechaInicio.DayNumber > 6)
                            return "Una semana es de hasta 7 días; para más usa día (hasta 31 días), mes o año.";
                    }
                    else
                    {
                        var lunes = req.FechaInicio.AddDays(-(((int)req.FechaInicio.DayOfWeek + 6) % 7));
                        capacidad.FechaInicio = lunes;
                        capacidad.FechaFin = lunes.AddDays(6);
                    }
                    break;
                case "Anio":
                    capacidad.FechaInicio = new DateOnly(req.FechaInicio.Year, 1, 1);
                    capacidad.FechaFin = req.CadaAnio ? CapacidadPorcentaje.SinFin : new DateOnly(req.FechaInicio.Year, 12, 31);
                    break;
                default:
                    capacidad.FechaInicio = new DateOnly(req.FechaInicio.Year, req.FechaInicio.Month, 1);
                    capacidad.FechaFin = capacidad.FechaInicio.AddMonths(1).AddDays(-1);
                    break;
            }
            return null;
        }

        /// <summary>Guarda; si falta una columna porque no se corrió su script, dice cuál.</summary>
        private async Task<string?> GuardarAsync()
        {
            try
            {
                await _db.SaveChangesAsync();
                return null;
            }
            catch (DbUpdateException ex)
            {
                var msg = ex.GetBaseException().Message;
                if (msg.Contains("Medicion") || msg.Contains("ModificadoPor") || msg.Contains("CK_CapPct_Periodo"))
                    return $"Falta correr {ScriptPorDiaYAnual} en la base de datos (por día, por año y editar).";
                if (msg.Contains("Turno"))
                    return "Falta correr Scripts/Migration_ReglasTrabajo_CapacidadTurno.sql en la base de datos (columna Turno).";
                throw;
            }
        }

        /// <summary>
        /// Vista previa del formulario "por día": qué grupos del área trabajan cada día
        /// (según su rol) y cuántas personas suman, y con el % cuántos pueden faltar.
        /// </summary>
        public async Task<ApiResponse<List<PersonalDelDiaDto>>> PersonalDelDiaAsync(int areaId, DateOnly desde, int dias, decimal? porcentaje)
        {
            dias = Math.Clamp(dias, 1, 31);
            var cultura = new System.Globalization.CultureInfo("es-MX");
            var lista = new List<PersonalDelDiaDto>();
            var personas = await _db.Users
                .Where(u => u.GrupoId.HasValue && u.Grupo != null && u.Grupo.AreaId == areaId && u.Status == Models.Enums.UserStatus.Activo)
                .GroupBy(u => u.GrupoId!.Value)
                .Select(g => new { GrupoId = g.Key, Personas = g.Count() })
                .ToDictionaryAsync(x => x.GrupoId, x => x.Personas);
            for (var f = desde; f < desde.AddDays(dias); f = f.AddDays(1))
            {
                var turnos = await _limites.TurnosDelAreaAsync(areaId, f);
                var trabajan = turnos.Where(t => !Helpers.TurnosHelper.EsDescanso(t.Turno)).ToList();
                var dto = new PersonalDelDiaDto
                {
                    Fecha = f,
                    Dia = f.ToString("ddd dd/MM", cultura),
                    Grupos = trabajan.Select(t => new PersonalGrupoDiaDto
                    {
                        GrupoId = t.GrupoId, Grupo = t.Rol, Turno = t.Turno, Personas = personas.GetValueOrDefault(t.GrupoId)
                    }).ToList()
                };
                dto.Total = dto.Grupos.Sum(g => g.Personas);
                if (porcentaje is > 0m) dto.MaximoAusentes = _validador.MaximoAusentes(dto.Total, porcentaje.Value);
                lista.Add(dto);
            }
            return new ApiResponse<List<PersonalDelDiaDto>>(true, lista, null);
        }

        public async Task<ApiResponse<object>> DesactivarAsync(int id, int usuarioId)
        {
            var c = await _db.CapacidadesPorcentaje.FirstOrDefaultAsync(x => x.Id == id);
            if (c == null) return new ApiResponse<object>(false, null, "No se encontró la capacidad.");
            if (!c.Activa) return new ApiResponse<object>(false, null, "Ya estaba desactivada.");
            c.Activa = false;
            c.DesactivadoPorId = usuarioId > 0 ? usuarioId : null;
            c.FechaDesactivacion = DateTime.Now;
            await _db.SaveChangesAsync();
            _logger.LogWarning("Capacidad por periodo {Id} desactivada por usuario {Usuario}", id, usuarioId);
            return new ApiResponse<object>(true, null, "Desactivada: en esas fechas vuelve a regir el porcentaje general.");
        }

        public async Task<ApiResponse<object>> ReactivarAsync(int id, int usuarioId)
        {
            var c = await _db.CapacidadesPorcentaje.FirstOrDefaultAsync(x => x.Id == id);
            if (c == null) return new ApiResponse<object>(false, null, "No se encontró la capacidad.");
            if (c.Activa) return new ApiResponse<object>(false, null, "Ya estaba activa.");
            var choque = await ChoqueAsync(c);
            if (choque != null) return new ApiResponse<object>(false, null, choque);
            c.Activa = true;
            c.DesactivadoPorId = null;
            c.FechaDesactivacion = null;
            await _db.SaveChangesAsync();
            _logger.LogWarning("Capacidad por periodo {Id} reactivada por usuario {Usuario}", id, usuarioId);
            return new ApiResponse<object>(true, null, "Reactivada.");
        }

        /// <summary>Límite de un grupo día por día (máximo 62 días).</summary>
        public async Task<ApiResponse<List<LimiteDiaDto>>> LimitesAsync(int grupoId, DateOnly desde, DateOnly hasta)
        {
            if (hasta < desde) (desde, hasta) = (hasta, desde);
            if (hasta.DayNumber - desde.DayNumber > 61) hasta = desde.AddDays(61);
            var tabla = await _limites.PrecargarAsync(new[] { grupoId }, desde, hasta);
            var lista = new List<LimiteDiaDto>();
            for (var f = desde; f <= hasta; f = f.AddDays(1))
            {
                var d = tabla.Detalle(grupoId, f);
                lista.Add(new LimiteDiaDto { Fecha = f, GrupoId = grupoId, Porcentaje = d.Porcentaje, Origen = d.Origen });
            }
            return new ApiResponse<List<LimiteDiaDto>>(true, lista, null);
        }

        /// <summary>
        /// Dos capacidades activas del mismo periodo y para lo mismo (planta, la misma
        /// área o el mismo grupo) no se pueden encimar: no habría cómo saber cuál
        /// manda. De distinto periodo o alcance sí (manda la más específica).
        /// </summary>
        private async Task<string?> ChoqueAsync(CapacidadPorcentaje c)
        {
            var existente = await _db.CapacidadesPorcentaje
                .Where(x => x.Activa && x.Id != c.Id && x.Periodo == c.Periodo && x.Alcance == c.Alcance &&
                            x.AreaId == c.AreaId && x.GrupoId == c.GrupoId &&
                            // "Ambos" se encima con todo; "Empresa" y "Operador" no entre sí.
                            (x.AplicaA == c.AplicaA || x.AplicaA == "Ambos" || c.AplicaA == "Ambos") &&
                            // Una de todo el día y otra de un turno sí pueden convivir (manda la
                            // del turno); dos del mismo turno no.
                            x.Turno == c.Turno &&
                            x.FechaInicio <= c.FechaFin && x.FechaFin >= c.FechaInicio)
                .FirstOrDefaultAsync();
            return existente == null
                ? null
                : $"Ya hay una capacidad activa para eso: {LimitePorcentajeService.DescribirCapacidad(existente)} = {existente.Porcentaje}%. Desactívala primero.";
        }
    }
}
