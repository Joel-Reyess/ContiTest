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
        private readonly ILogger<ReportesController> _logger;

        public ReportesController(
            VacacionesExportService exportService,
            ReportesVacacionesService reportesService,
            ILogger<ReportesController> logger)
        {
            _exportService = exportService;
            _reportesService = reportesService;
            _logger = logger;
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

                var (stream, fileName) = await _exportService.GenerarExcelPorAreaAsync(year, areaId);

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
            [FromQuery] List<string>? gruposRol = null)
        {
            try
            {
                var (stream, fileName) = await _exportService.GenerarReporteSapReprogramacionEliminarAsync(year, areaId, gruposRol);
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
            [FromQuery] List<string>? gruposRol = null)
        {
            try
            {
                var (stream, fileName) = await _exportService.GenerarReporteSapReprogramacionNuevosAsync(year, areaId, gruposRol);
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
            [FromQuery] int? grupoId = null)
        {
            var response = await _reportesService.ObtenerEmpleadosFaltantesCapturaVacacionesAsync(anioObjetivo, areaId, grupoId);

            if (!response.Success)
                return BadRequest(response);

            return Ok(response);
        }

        [HttpGet("vacaciones-asignadas-empresa")]
        public async Task<IActionResult> ObtenerVacacionesAsignadasEmpresa(
            [FromQuery] int anioObjetivo,
            [FromQuery] int? areaId = null,
            [FromQuery] int? grupoId = null)
        {
            var response = await _reportesService.ObtenerVacacionesAsignadasPorEmpresaAsync(anioObjetivo, areaId, grupoId);

            if (!response.Success)
                return BadRequest(response);

            return Ok(response);
        }

        [HttpGet("empleados-en-vacaciones")]
        public async Task<IActionResult> ObtenerEmpleadosEnVacaciones(
            [FromQuery] DateOnly? fecha = null,
            [FromQuery] int? areaId = null,
            [FromQuery] int? grupoId = null)
        {
            var response = await _reportesService.ObtenerEmpleadosEnVacacionesAsync(fecha, areaId, grupoId);

            if (!response.Success)
                return BadRequest(response);

            return Ok(response);
        }




    }
}
