using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using tiempo_libre.DTOs;
using tiempo_libre.Models;

namespace tiempo_libre.Services
{
    public class ReportesVacacionesService
    {
        private readonly FreeTimeDbContext _db;
        private readonly ILogger<ReportesVacacionesService> _logger;

        /// <summary>
        /// Techo para los reportes pesados de este servicio. Antes era 0 (sin
        /// límite): una consulta atorada se quedaba corriendo para siempre,
        /// reteniendo su conexión del pool aunque el navegador ya se hubiera
        /// rendido. Con un techo, SQL Server la aborta y libera la conexión.
        /// </summary>
        private const int TimeoutReportesSegundos = 180;

        public ReportesVacacionesService(
            FreeTimeDbContext db,
            ILogger<ReportesVacacionesService> logger)
        {
            _db = db;
            _logger = logger;
            // OJO: aquí NO se toca el CommandTimeout. El DbContext es Scoped y lo
            // comparten todos los servicios del request; poner el timeout en el
            // constructor se lo aplicaba también a VacacionesExportService y a
            // EdicionDiasEmpresaService, que conviven en ReportesController y
            // nunca lo pidieron. El timeout se fija por método.
        }

        public async Task<ApiResponse<EmpleadosFaltantesCapturaResponse>> ObtenerEmpleadosFaltantesCapturaVacacionesAsync(
            int anioObjetivo,
            int? areaId = null,
            int? grupoId = null,
            CancellationToken ct = default)
        {
            try
            {
                _db.Database.SetCommandTimeout(TimeoutReportesSegundos);
                if (anioObjetivo <= 0)
                {
                    return new ApiResponse<EmpleadosFaltantesCapturaResponse>(false, null, "El año objetivo es obligatorio");
                }

                _logger.LogInformation("Obteniendo empleados sin vacaciones manuales para año {Anio} (Area={AreaId}, Grupo={GrupoId})",
                    anioObjetivo, areaId?.ToString() ?? "Todos", grupoId?.ToString() ?? "Todos");

                var manualesActivas = _db.VacacionesProgramadas
                    .Where(v => v.FechaVacacion.Year == anioObjetivo
                             && v.EstadoVacacion == "Activa"
                             && v.OrigenAsignacion != null
                             && v.OrigenAsignacion.Trim().ToUpper() == "MANUAL");

                var query = from asignacion in _db.AsignacionesBloque
                            join bloque in _db.BloquesReservacion on asignacion.BloqueId equals bloque.Id
                            join grupo in _db.Grupos on bloque.GrupoId equals grupo.GrupoId
                            join area in _db.Areas on grupo.AreaId equals area.AreaId
                            join empleado in _db.Users on asignacion.EmpleadoId equals empleado.Id
                            join vacacionManual in manualesActivas on empleado.Id equals vacacionManual.EmpleadoId into vacacionManualJoin
                            from vacacionManual in vacacionManualJoin.DefaultIfEmpty()
                            where bloque.AnioGeneracion == anioObjetivo
                                  && bloque.EsBloqueCola
                            select new
                            {
                                asignacion,
                                bloque,
                                grupo,
                                area,
                                empleado,
                                vacacionManual
                            };

                if (areaId.HasValue)
                {
                    query = query.Where(x => x.area.AreaId == areaId.Value);
                }

                if (grupoId.HasValue)
                {
                    query = query.Where(x => x.grupo.GrupoId == grupoId.Value);
                }

                var empleados = await query
                    .Where(x => x.vacacionManual == null)
                    .OrderBy(x => x.area.NombreGeneral)
                    .ThenBy(x => x.grupo.Rol)
                    .ThenBy(x => x.bloque.NumeroBloque)
                    .ThenBy(x => x.empleado.FullName)
                    .Select(x => new EmpleadoFaltanteCapturaDto
                    {
                        EmpleadoId = x.empleado.Id,
                        NombreCompleto = x.empleado.FullName ?? "",
                        Nomina = x.empleado.Nomina.HasValue ? x.empleado.Nomina.Value.ToString() : "",
                        Maquina = x.empleado.Maquina,
                        GrupoId = x.grupo.GrupoId,
                        NombreGrupo = x.grupo.Rol ?? "",
                        AreaId = x.area.AreaId,
                        NombreArea = x.area.NombreGeneral ?? "",
                        BloqueId = x.bloque.Id,
                        NumeroBloque = x.bloque.NumeroBloque,
                        EsBloqueCola = x.bloque.EsBloqueCola,
                        FechaLimiteBloque = x.bloque.FechaHoraFin,
                        FechaAsignacion = x.asignacion.FechaAsignacion,
                        Observaciones = x.asignacion.Observaciones,
                        RequiereAccionUrgente = x.bloque.EsBloqueCola
                    })
                    .ToListAsync(ct);

                var response = new EmpleadosFaltantesCapturaResponse
                {
                    Anio = anioObjetivo,
                    TotalEmpleados = empleados.Count,
                    TotalCriticos = empleados.Count(e => e.EsBloqueCola),
                    Empleados = empleados,
                    FechaReporte = DateTime.Now
                };

                return new ApiResponse<EmpleadosFaltantesCapturaResponse>(true, response, null);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener empleados faltantes de captura de vacaciones");
                return new ApiResponse<EmpleadosFaltantesCapturaResponse>(false, null, $"Error inesperado: {ex.Message}");
            }
        }

        public async Task<ApiResponse<VacacionesAsignadasEmpresaResponse>> ObtenerVacacionesAsignadasPorEmpresaAsync(
            int anioObjetivo,
            int? areaId = null,
            int? grupoId = null,
            CancellationToken ct = default)
        {
            try
            {
                // Antes heredaba el timeout 0 que ponía el constructor.
                _db.Database.SetCommandTimeout(TimeoutReportesSegundos);

                if (anioObjetivo <= 0)
                {
                    return new ApiResponse<VacacionesAsignadasEmpresaResponse>(false, null, "El año objetivo es obligatorio");
                }

                _logger.LogInformation("Obteniendo vacaciones asignadas por la empresa para {Anio} (Area={AreaId}, Grupo={GrupoId})",
                    anioObjetivo, areaId?.ToString() ?? "Todos", grupoId?.ToString() ?? "Todos");

                var query = _db.VacacionesProgramadas
                    .AsNoTracking()
                    .AsSplitQuery()
                    .Include(v => v.Empleado)
                        .ThenInclude(e => e.Area)
                    .Include(v => v.Empleado)
                        .ThenInclude(e => e.Grupo)
                    .Where(v => v.FechaVacacion.Year == anioObjetivo
                             && v.EstadoVacacion == "Activa")
                    .Where(v =>
                        (v.OrigenAsignacion != null && v.OrigenAsignacion.Trim().ToUpper() == "AUTOMATICA") ||
                        (v.OrigenAsignacion != null && v.OrigenAsignacion.Trim().ToUpper() == "SISTEMA") ||
                        v.TipoVacacion == "Automatica");

                if (areaId.HasValue)
                {
                    query = query.Where(v => v.Empleado.AreaId == areaId.Value);
                }

                if (grupoId.HasValue)
                {
                    query = query.Where(v => v.Empleado.GrupoId == grupoId.Value);
                }

                var vacaciones = await query
                    .OrderBy(v => v.Empleado.Nomina)
                    .ThenBy(v => v.FechaVacacion)
                    .Select(v => new VacacionAsignadaEmpresaDto
                    {
                        EmpleadoId = v.EmpleadoId,
                        NombreCompleto = v.Empleado.FullName ?? "",
                        Nomina = v.Empleado.Nomina.HasValue ? v.Empleado.Nomina.Value.ToString() : "",
                        Maquina = v.Empleado.Maquina,
                        AreaId = v.Empleado.AreaId,
                        NombreArea = v.Empleado.Area != null ? v.Empleado.Area.NombreGeneral : null,
                        GrupoId = v.Empleado.GrupoId,
                        NombreGrupo = v.Empleado.Grupo != null ? v.Empleado.Grupo.Rol : null,
                        FechaVacacion = v.FechaVacacion,
                        TipoVacacion = v.TipoVacacion,
                        OrigenAsignacion = v.OrigenAsignacion,
                        EstadoVacacion = v.EstadoVacacion,
                        PeriodoProgramacion = v.PeriodoProgramacion,
                        FechaProgramacion = v.FechaProgramacion,
                        Observaciones = v.Observaciones
                    })
                    .ToListAsync(ct);

                var response = new VacacionesAsignadasEmpresaResponse
                {
                    Anio = anioObjetivo,
                    TotalVacaciones = vacaciones.Count,
                    TotalEmpleados = vacaciones.Select(v => v.EmpleadoId).Distinct().Count(),
                    Vacaciones = vacaciones,
                    FechaReporte = DateTime.Now
                };

                return new ApiResponse<VacacionesAsignadasEmpresaResponse>(true, response, null);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener vacaciones asignadas por la empresa");
                return new ApiResponse<VacacionesAsignadasEmpresaResponse>(false, null, $"Error inesperado: {ex.Message}");
            }
        }

        public async Task<ApiResponse<EmpleadosEnVacacionesResponse>> ObtenerEmpleadosEnVacacionesAsync(
            DateOnly? fechaConsulta = null,
            int? areaId = null,
            int? grupoId = null,
            CancellationToken ct = default)
        {
            try
            {
                // Antes heredaba el timeout 0 que ponía el constructor.
                _db.Database.SetCommandTimeout(TimeoutReportesSegundos);

                var fecha = fechaConsulta ?? DateOnly.FromDateTime(DateTime.Now);

                _logger.LogInformation("Obteniendo empleados en vacaciones para fecha {Fecha} (Area={AreaId}, Grupo={GrupoId})",
                    fecha, areaId?.ToString() ?? "Todos", grupoId?.ToString() ?? "Todos");

                var query = _db.VacacionesProgramadas
                    .AsNoTracking()
                    .Include(v => v.Empleado)
                        .ThenInclude(e => e.Area)
                    .Include(v => v.Empleado)
                        .ThenInclude(e => e.Grupo)
                    .Where(v => v.FechaVacacion == fecha
                             && v.EstadoVacacion == "Activa");

                if (areaId.HasValue)
                {
                    query = query.Where(v => v.Empleado.AreaId == areaId.Value);
                }

                if (grupoId.HasValue)
                {
                    query = query.Where(v => v.Empleado.GrupoId == grupoId.Value);
                }

                var empleados = await query
                    .OrderBy(v => v.Empleado.Area != null ? v.Empleado.Area.NombreGeneral : "")
                    .ThenBy(v => v.Empleado.Grupo != null ? v.Empleado.Grupo.Rol : "")
                    .ThenBy(v => v.Empleado.Nomina)
                    .Select(v => new EmpleadoEnVacacionesDto
                    {
                        EmpleadoId = v.EmpleadoId,
                        NombreCompleto = v.Empleado.FullName ?? "",
                        Nomina = v.Empleado.Nomina.HasValue ? v.Empleado.Nomina.Value.ToString() : "",
                        Maquina = v.Empleado.Maquina,
                        AreaId = v.Empleado.AreaId,
                        NombreArea = v.Empleado.Area != null ? v.Empleado.Area.NombreGeneral : null,
                        GrupoId = v.Empleado.GrupoId,
                        NombreGrupo = v.Empleado.Grupo != null ? v.Empleado.Grupo.Rol : null,
                        FechaVacacion = v.FechaVacacion,
                        TipoVacacion = v.TipoVacacion,
                        OrigenAsignacion = v.OrigenAsignacion,
                        EstadoVacacion = v.EstadoVacacion,
                        PeriodoProgramacion = v.PeriodoProgramacion,
                        Observaciones = v.Observaciones
                    })
                    .ToListAsync(ct);

                var response = new EmpleadosEnVacacionesResponse
                {
                    FechaConsulta = fecha,
                    TotalRegistros = empleados.Count,
                    TotalEmpleados = empleados.Select(e => e.EmpleadoId).Distinct().Count(),
                    Empleados = empleados,
                    FechaReporte = DateTime.Now
                };

                return new ApiResponse<EmpleadosEnVacacionesResponse>(true, response, null);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener empleados en vacaciones");
                return new ApiResponse<EmpleadosEnVacacionesResponse>(false, null, $"Error inesperado: {ex.Message}");
            }
        }
    }
}




