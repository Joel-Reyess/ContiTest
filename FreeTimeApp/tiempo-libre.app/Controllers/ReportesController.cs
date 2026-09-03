using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using tiempo_libre.Services;
using tiempo_libre.Models;

namespace tiempo_libre.Controllers
{
    [ApiController]
    [Route("api/reportes")]
    [Authorize]
    public class ReportesController : ControllerBase
    {
        private readonly VacacionesExportService _exportService;
        private readonly ReportesVacacionesService _reportesService;
        private readonly EdicionDiasEmpresaService _edicionDiasEmpresaService;
        private readonly FreeTimeDbContext _db;
        private readonly ILogger<ReportesController> _logger;

        private static DateTime? ParseFechaHora(string? fecha, string? hora, bool esInicio)
        {
            if (string.IsNullOrEmpty(fecha)) return null;
            if (!DateOnly.TryParse(fecha, out var d)) return null;

            TimeOnly t = esInicio ? TimeOnly.MinValue : new TimeOnly(23, 59, 59);
            if (!string.IsNullOrEmpty(hora) && TimeOnly.TryParse(hora, out var horaParseada))
                t = horaParseada;

            return d.ToDateTime(t);
        }
        public ReportesController(
            VacacionesExportService exportService,
            ReportesVacacionesService reportesService,
            EdicionDiasEmpresaService edicionDiasEmpresaService,
            FreeTimeDbContext db,
            ILogger<ReportesController> logger)
        {
            _exportService = exportService;
            _reportesService = reportesService;
            _edicionDiasEmpresaService = edicionDiasEmpresaService;
            _db = db;
            _logger = logger;
        }

        /// <summary>
        /// Areas que el usuario autenticado puede exportar.
        ///
        /// null = sin restriccion (SuperUsuario). Lista vacia = tiene alcance por
        /// area pero no tiene ninguna asignada, y entonces no debe salir nada.
        /// Mismo criterio que AusenciaController para que un jefe no se lleve la
        /// planta completa en un Excel.
        /// </summary>
        private async Task<List<int>?> ResolverAreasPermitidasAsync()
        {
            if (User.IsInRole("SuperUsuario") || User.IsInRole("Super Usuario"))
                return null;

            var tieneAlcancePorArea =
                User.IsInRole("Jefe De Area") || User.IsInRole("JefeArea") || User.IsInRole("JefeDeArea") ||
                User.IsInRole("Lider De Grupo") || User.IsInRole("LiderDeGrupo") ||
                User.IsInRole("Ingeniero Industrial") || User.IsInRole("IngenieroIndustrial") ||
                User.IsInRole("Gerente BT") || User.IsInRole("GerenteBT") ||
                User.IsInRole("RH");

            if (!tieneAlcancePorArea) return null;

            var claim = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
            if (!int.TryParse(claim, out var userId))
                return new List<int>();

            return await Helpers.AreasVisiblesHelper.AreasVisiblesAsync(_db, userId);
        }

        /// <summary>
        /// Exporta las vacaciones programadas agrupadas por área en formato Excel
        /// </summary>
        /// <param name="year">Año a filtrar (opcional)</param>
        /// <returns>Archivo Excel con las vacaciones programadas por área</returns>
        [HttpGet("vacaciones-por-area")]
        public async Task<IActionResult> ExportarVacacionesPorArea([FromQuery] int? year = null, int? areaId = null)
        {
            try
            {
                _logger.LogInformation("Solicitada exportación de vacaciones por área. Año: {Year}", year?.ToString() ?? "Todos");

                // El jefe de area pide el reporte sin areaId cuando quiere "todas":
                // para el, "todas" son las suyas, no la planta. Sin este filtro el
                // endpoint (solo [Authorize]) le devolvia el Excel completo.
                var areasPermitidas = await ResolverAreasPermitidasAsync();
                if (areasPermitidas != null)
                {
                    if (areasPermitidas.Count == 0)
                        return BadRequest(new ApiResponse<object>(false, null,
                            "No tienes áreas asignadas, así que no hay nada que exportar."));

                    if (areaId.HasValue && !areasPermitidas.Contains(areaId.Value))
                        return StatusCode(403, new ApiResponse<object>(false, null,
                            "Esa área no está dentro de tu alcance."));
                }

                var (stream, fileName) = await _exportService.GenerarExcelPorAreaAsync(year, areaId, areasPermitidas);

                // Devolver el archivo Excel
                return File(
                    stream,
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    fileName
                );
            }
            catch (InvalidOperationException ex)
            {
                _logger.LogWarning("No hay datos para exportar: {Message}", ex.Message);
                return BadRequest(new ApiResponse<object>(false, null, ex.Message));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al exportar vacaciones por área");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        [HttpGet("reporte-sap")]
        public async Task<IActionResult> ExportarReporteSap(
        [FromQuery] int year,
        [FromQuery] int? areaId = null,
        [FromQuery] List<string>? gruposRol = null)
        {
            try
            {
                _logger.LogInformation("Generando reporte SAP. Año={Year}, Área={AreaId}, Grupos={Grupos}",
                    year, areaId?.ToString() ?? "Todos", gruposRol != null ? string.Join(",", gruposRol) : "Todos");

                var (stream, fileName) = await _exportService.GenerarReporteSapAsync(year, areaId, gruposRol);
                stream.Position = 0;

                return File(stream, "text/plain", fileName);
            }
            catch (InvalidOperationException ex)
            {
                _logger.LogWarning("No hay datos para exportar en el reporte SAP: {Message}", ex.Message);
                return BadRequest(new ApiResponse<object>(false, null, ex.Message));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al generar el reporte SAP");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        [HttpGet("reporte-sap-repro-eliminar")]
        public async Task<IActionResult> ExportarReporteSapReproEliminar(
        [FromQuery] int year,
        [FromQuery] int? areaId = null,
        [FromQuery] List<string>? gruposRol = null,
        [FromQuery] string? fechaResolucionDesde = null,
        [FromQuery] string? horaDesde = null,
        [FromQuery] string? fechaResolucionHasta = null,
        [FromQuery] string? horaHasta = null)
        {
            try
            {
                DateTime? desde = ParseFechaHora(fechaResolucionDesde, horaDesde, esInicio: true);
                DateTime? hasta = ParseFechaHora(fechaResolucionHasta, horaHasta, esInicio: false);

                var (stream, fileName) = await _exportService.GenerarReporteSapReprogramacionEliminarAsync(year, areaId, gruposRol, desde, hasta);
                stream.Position = 0;
                return File(stream, "text/plain", fileName);
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new ApiResponse<object>(false, null, ex.Message));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al generar el reporte SAP Reprogramación Eliminar");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        [HttpGet("reporte-sap-repro-nuevos")]
        public async Task<IActionResult> ExportarReporteSapReproNuevos(
        [FromQuery] int year,
        [FromQuery] int? areaId = null,
        [FromQuery] List<string>? gruposRol = null,
        [FromQuery] string? fechaResolucionDesde = null,
        [FromQuery] string? horaDesde = null,
        [FromQuery] string? fechaResolucionHasta = null,
        [FromQuery] string? horaHasta = null)
        {
            try
            {
                DateTime? desde = ParseFechaHora(fechaResolucionDesde, horaDesde, esInicio: true);
                DateTime? hasta = ParseFechaHora(fechaResolucionHasta, horaHasta, esInicio: false);

                var (stream, fileName) = await _exportService.GenerarReporteSapReprogramacionNuevosAsync(year, areaId, gruposRol, desde, hasta);
                stream.Position = 0;
                return File(stream, "text/plain", fileName);
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new ApiResponse<object>(false, null, ex.Message));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al generar el reporte SAP Reprogramación Nuevos");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        [HttpGet("empleados-faltantes-vacaciones")]
        public async Task<IActionResult> ObtenerEmpleadosFaltantesCaptura(
            [FromQuery] int anioObjetivo,
            [FromQuery] int? areaId = null,
            [FromQuery] int? grupoId = null,
            CancellationToken ct = default)
        {
            // ct viene de HttpContext.RequestAborted: si el navegador se rinde,
            // la consulta se cancela y suelta su conexión en vez de seguir
            // corriendo sola en el servidor.
            var response = await _reportesService.ObtenerEmpleadosFaltantesCapturaVacacionesAsync(anioObjetivo, areaId, grupoId, ct);

            if (!response.Success)
                return BadRequest(response);

            return Ok(response);
        }

        [HttpGet("vacaciones-asignadas-empresa")]
        public async Task<IActionResult> ObtenerVacacionesAsignadasEmpresa(
            [FromQuery] int anioObjetivo,
            [FromQuery] int? areaId = null,
            [FromQuery] int? grupoId = null,
            CancellationToken ct = default)
        {
            var response = await _reportesService.ObtenerVacacionesAsignadasPorEmpresaAsync(anioObjetivo, areaId, grupoId, ct);

            if (!response.Success)
                return BadRequest(response);

            return Ok(response);
        }

        [HttpGet("empleados-en-vacaciones")]
        public async Task<IActionResult> ObtenerEmpleadosEnVacaciones(
            [FromQuery] DateOnly? fecha = null,
            [FromQuery] int? areaId = null,
            [FromQuery] int? grupoId = null,
            CancellationToken ct = default)
        {
            var response = await _reportesService.ObtenerEmpleadosEnVacacionesAsync(fecha, areaId, grupoId, ct);

            if (!response.Success)
                return BadRequest(response);

            return Ok(response);
        }

        [HttpGet("reporte-sap-permutas")]
        public async Task<IActionResult> ExportarReporteSapPermutas(
            [FromQuery] int year,
            [FromQuery] int? areaId = null,
            [FromQuery] List<string>? gruposRol = null,
            [FromQuery] string? fechaResolucionDesde = null,
            [FromQuery] string? horaDesde = null,
            [FromQuery] string? fechaResolucionHasta = null,
            [FromQuery] string? horaHasta = null)
        {
            try
            {
                DateTime? desde = ParseFechaHora(fechaResolucionDesde, horaDesde, esInicio: true);
                DateTime? hasta = ParseFechaHora(fechaResolucionHasta, horaHasta, esInicio: false);

                var (stream, fileName) = await _exportService.GenerarReporteSapPermutasAsync(year, areaId, gruposRol, desde, hasta);
                stream.Position = 0;
                return File(stream, "text/plain", fileName);
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new ApiResponse<object>(false, null, ex.Message));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al generar el reporte SAP de Permutas");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        [HttpGet("reporte-sap-permutas-nuevos")]
        [Authorize(Roles = "SuperUsuario,Super Usuario,JefeDeArea,Jefe De Area,IngenieroIndustrial,Ingeniero Industrial,Gerente BT,GerenteBT,RH")]
        public Task<IActionResult> ExportarReporteSapPermutasNuevos(
            [FromQuery] int year,
            [FromQuery] int? areaId = null,
            [FromQuery] List<string>? gruposRol = null,
            [FromQuery] string? fechaResolucionDesde = null,
            [FromQuery] string? horaDesde = null,
            [FromQuery] string? fechaResolucionHasta = null,
            [FromQuery] string? horaHasta = null)
            => ExportarReporteSapPermutas(year, areaId, gruposRol, fechaResolucionDesde, horaDesde, fechaResolucionHasta, horaHasta);

        [HttpGet("reporte-sap-permutas-eliminar")]
        [Authorize(Roles = "SuperUsuario,Super Usuario,JefeDeArea,Jefe De Area,IngenieroIndustrial,Ingeniero Industrial,Gerente BT,GerenteBT,RH")]
        public async Task<IActionResult> ExportarReporteSapPermutasEliminar(
            [FromQuery] int year,
            [FromQuery] int? areaId = null,
            [FromQuery] List<string>? gruposRol = null,
            [FromQuery] string? fechaResolucionDesde = null,
            [FromQuery] string? horaDesde = null,
            [FromQuery] string? fechaResolucionHasta = null,
            [FromQuery] string? horaHasta = null)
        {
            try
            {
                DateTime? desde = ParseFechaHora(fechaResolucionDesde, horaDesde, esInicio: true);
                DateTime? hasta = ParseFechaHora(fechaResolucionHasta, horaHasta, esInicio: false);

                var (stream, fileName) = await _exportService.GenerarReporteSapPermutasEliminarAsync(year, areaId, gruposRol, desde, hasta);
                stream.Position = 0;
                return File(stream, "text/plain", fileName);
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new ApiResponse<object>(false, null, ex.Message));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al generar el reporte SAP Permutas Eliminar");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        [HttpGet("reporte-sap-festivos-nuevos")]
        [Authorize(Roles = "SuperUsuario,Super Usuario,JefeDeArea,Jefe De Area,IngenieroIndustrial,Ingeniero Industrial,Gerente BT,GerenteBT,RH")]
        public async Task<IActionResult> ExportarReporteSapFestivosNuevos(
            [FromQuery] int year,
            [FromQuery] int? areaId = null,
            [FromQuery] List<string>? gruposRol = null,
            [FromQuery] string? fechaResolucionDesde = null,
            [FromQuery] string? horaDesde = null,
            [FromQuery] string? fechaResolucionHasta = null,
            [FromQuery] string? horaHasta = null)
        {
            try
            {
                DateTime? desde = ParseFechaHora(fechaResolucionDesde, horaDesde, esInicio: true);
                DateTime? hasta = ParseFechaHora(fechaResolucionHasta, horaHasta, esInicio: false);

                var (stream, fileName) = await _exportService.GenerarReporteSapFestivosNuevosAsync(year, areaId, gruposRol, desde, hasta);
                stream.Position = 0;
                return File(stream, "text/plain", fileName);
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new ApiResponse<object>(false, null, ex.Message));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al generar el reporte SAP Festivos Nuevos");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        [HttpGet("reporte-sap-festivos-eliminar")]
        [Authorize(Roles = "SuperUsuario,Super Usuario,JefeDeArea,Jefe De Area,IngenieroIndustrial,Ingeniero Industrial,Gerente BT,GerenteBT,RH")]
        public async Task<IActionResult> ExportarReporteSapFestivosEliminar(
            [FromQuery] int year,
            [FromQuery] int? areaId = null,
            [FromQuery] List<string>? gruposRol = null,
            [FromQuery] string? fechaResolucionDesde = null,
            [FromQuery] string? horaDesde = null,
            [FromQuery] string? fechaResolucionHasta = null,
            [FromQuery] string? horaHasta = null)
        {
            try
            {
                DateTime? desde = ParseFechaHora(fechaResolucionDesde, horaDesde, esInicio: true);
                DateTime? hasta = ParseFechaHora(fechaResolucionHasta, horaHasta, esInicio: false);

                var (stream, fileName) = await _exportService.GenerarReporteSapFestivosEliminarAsync(year, areaId, gruposRol, desde, hasta);
                stream.Position = 0;
                return File(stream, "text/plain", fileName);
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new ApiResponse<object>(false, null, ex.Message));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al generar el reporte SAP Festivos Eliminar");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>Reporte de días reprogramados por la empresa (ediciones del sindicato aprobadas)</summary>
        [HttpGet("dias-reprogramados-empresa")]
        [Authorize(Roles = "SuperUsuario,Super Usuario,JefeDeArea,Jefe De Area,JefeArea,IngenieroIndustrial,Ingeniero Industrial")]
        public async Task<IActionResult> ReporteDiasReprogramadosEmpresa(
            [FromQuery] int? anio = null,
            [FromQuery] int? areaId = null,
            [FromQuery] string? fechaDesde = null,
            [FromQuery] string? fechaHasta = null,
            [FromQuery] string? horaDesde = null,
            [FromQuery] string? horaHasta = null)
        {
            try
            {
                // El rango se arma combinando fecha + hora opcional. Sin hora, el
                // límite inferior es 00:00 y el superior 23:59:59, para que un
                // rango de un solo día incluya todo ese día.
                var desde = CombinarFechaHora(fechaDesde, horaDesde, esInicio: true);
                var hasta = CombinarFechaHora(fechaHasta, horaHasta, esInicio: false);

                var datos = await _edicionDiasEmpresaService.GenerarReporteAsync(anio, areaId, desde, hasta);
                return Ok(new ApiResponse<object>(true, datos));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al generar reporte días reprogramados empresa");
                return StatusCode(500, new ApiResponse<object>(false, null, ex.Message));
            }
        }

        /// <summary>
        /// Une "yyyy-MM-dd" con "HH:mm" opcional. Devuelve null si no hay fecha,
        /// para que el filtro simplemente no se aplique.
        /// </summary>
        private static DateTime? CombinarFechaHora(string? fecha, string? hora, bool esInicio)
        {
            if (string.IsNullOrWhiteSpace(fecha)) return null;

            if (!DateTime.TryParse(fecha, System.Globalization.CultureInfo.InvariantCulture,
                    System.Globalization.DateTimeStyles.None, out var dia))
                return null;

            if (!string.IsNullOrWhiteSpace(hora) &&
                TimeSpan.TryParse(hora, System.Globalization.CultureInfo.InvariantCulture, out var h))
                return dia.Date.Add(h);

            return esInicio ? dia.Date : dia.Date.AddDays(1).AddTicks(-1);
        }
    }
}
