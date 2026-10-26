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
        private static readonly string[] Periodos = { "Dia", "Semana", "Mes" };

        private readonly FreeTimeDbContext _db;
        private readonly LimitePorcentajeService _limites;
        private readonly ILogger<CapacidadPorcentajeService> _logger;

        public CapacidadPorcentajeService(FreeTimeDbContext db, LimitePorcentajeService limites,
            ILogger<CapacidadPorcentajeService> logger)
        {
            _db = db;
            _limites = limites;
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

            var filas = await q
                .OrderByDescending(c => c.Activa).ThenBy(c => c.FechaInicio).ThenBy(c => c.Id)
                .Select(c => new
                {
                    Capacidad = c,
                    Area = c.Area != null ? c.Area.NombreGeneral : (c.Grupo != null && c.Grupo.Area != null ? c.Grupo.Area.NombreGeneral : null),
                    Grupo = c.Grupo != null ? c.Grupo.Rol : null,
                    CreadoPor = c.CreadoPor != null ? c.CreadoPor.FullName : null,
                    DesactivadoPor = c.DesactivadoPor != null ? c.DesactivadoPor.FullName : null
                })
                .ToListAsync();

            respuesta.Capacidades = filas.Select(f => new CapacidadPorcentajeDto
            {
                Id = f.Capacidad.Id,
                Alcance = f.Capacidad.Alcance,
                AreaId = f.Capacidad.AreaId,
                Area = f.Area,
                GrupoId = f.Capacidad.GrupoId,
                Grupo = f.Grupo,
                Periodo = f.Capacidad.Periodo,
                FechaInicio = f.Capacidad.FechaInicio,
                FechaFin = f.Capacidad.FechaFin,
                Porcentaje = f.Capacidad.Porcentaje,
                Motivo = f.Capacidad.Motivo,
                Activa = f.Capacidad.Activa,
                CreadoPor = f.CreadoPor,
                FechaCreacion = f.Capacidad.FechaCreacion,
                DesactivadoPor = f.DesactivadoPor,
                FechaDesactivacion = f.Capacidad.FechaDesactivacion,
                Descripcion = LimitePorcentajeService.DescribirCapacidad(f.Capacidad)
            }).ToList();

            return new ApiResponse<CapacidadesPorcentajeResponse>(true, respuesta, null);
        }

        public async Task<ApiResponse<int>> CrearAsync(CrearCapacidadPorcentajeRequest req, int usuarioId)
        {
            if (!await _limites.TablaExisteAsync())
                return new ApiResponse<int>(false, 0, "Falta crear la tabla: corre Scripts/Migration_CapacidadesPorcentaje.sql.");
            if (!Alcances.Contains(req.Alcance))
                return new ApiResponse<int>(false, 0, "El alcance debe ser Planta, Area o Grupo.");
            if (!Periodos.Contains(req.Periodo))
                return new ApiResponse<int>(false, 0, "El periodo debe ser Dia, Semana o Mes.");
            if (req.Porcentaje <= 0 || req.Porcentaje > 100)
                return new ApiResponse<int>(false, 0, "El porcentaje debe ser mayor a 0 y hasta 100.");

            var capacidad = new CapacidadPorcentaje
            {
                Alcance = req.Alcance,
                Periodo = req.Periodo,
                Porcentaje = Math.Round(req.Porcentaje, 2),
                Motivo = string.IsNullOrWhiteSpace(req.Motivo) ? null : req.Motivo.Trim(),
                Activa = true,
                CreadoPorId = usuarioId > 0 ? usuarioId : null,
                FechaCreacion = DateTime.Now
            };

            switch (req.Alcance)
            {
                case "Area":
                    if (req.AreaId == null || !await _db.Areas.AnyAsync(a => a.AreaId == req.AreaId))
                        return new ApiResponse<int>(false, 0, "Selecciona un área válida.");
                    capacidad.AreaId = req.AreaId;
                    break;
                case "Grupo":
                    var grupo = req.GrupoId == null ? null : await _db.Grupos.FirstOrDefaultAsync(g => g.GrupoId == req.GrupoId);
                    if (grupo == null) return new ApiResponse<int>(false, 0, "Selecciona un grupo válido.");
                    capacidad.GrupoId = grupo.GrupoId;
                    break;
            }

            // Fechas según el periodo: la semana es de lunes a domingo, el mes completo.
            switch (req.Periodo)
            {
                case "Dia":
                    capacidad.FechaInicio = req.FechaInicio;
                    capacidad.FechaFin = req.FechaFin ?? req.FechaInicio;
                    if (capacidad.FechaFin < capacidad.FechaInicio)
                        return new ApiResponse<int>(false, 0, "La fecha final no puede ser antes de la inicial.");
                    if (capacidad.FechaFin.DayNumber - capacidad.FechaInicio.DayNumber > 30)
                        return new ApiResponse<int>(false, 0, "Por día se pueden marcar hasta 31 días seguidos; para más usa semana o mes.");
                    break;
                case "Semana":
                    var lunes = req.FechaInicio.AddDays(-(((int)req.FechaInicio.DayOfWeek + 6) % 7));
                    capacidad.FechaInicio = lunes;
                    capacidad.FechaFin = lunes.AddDays(6);
                    break;
                default:
                    capacidad.FechaInicio = new DateOnly(req.FechaInicio.Year, req.FechaInicio.Month, 1);
                    capacidad.FechaFin = capacidad.FechaInicio.AddMonths(1).AddDays(-1);
                    break;
            }

            var choque = await ChoqueAsync(capacidad);
            if (choque != null) return new ApiResponse<int>(false, 0, choque);

            _db.CapacidadesPorcentaje.Add(capacidad);
            await _db.SaveChangesAsync();
            _logger.LogWarning("Capacidad por periodo {Id} creada por usuario {Usuario}: {Descripcion} = {Pct}% ({Motivo})",
                capacidad.Id, usuarioId, LimitePorcentajeService.DescribirCapacidad(capacidad), capacidad.Porcentaje, capacidad.Motivo);
            return new ApiResponse<int>(true, capacidad.Id, null);
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
                            x.FechaInicio <= c.FechaFin && x.FechaFin >= c.FechaInicio)
                .FirstOrDefaultAsync();
            return existente == null
                ? null
                : $"Ya hay una capacidad activa para eso: {LimitePorcentajeService.DescribirCapacidad(existente)} = {existente.Porcentaje}%. Desactívala primero.";
        }
    }
}
