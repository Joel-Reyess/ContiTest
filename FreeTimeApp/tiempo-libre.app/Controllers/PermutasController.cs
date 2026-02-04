using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using Microsoft.EntityFrameworkCore;
using System;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using System.IO;
using tiempo_libre.DTOs;
using tiempo_libre.Services;
using tiempo_libre.Models;
namespace tiempo_libre.Controllers
{
    [ApiController]
    [Route("api/permutas")]
    [Authorize]
    public class PermutasController : ControllerBase
    {
        private readonly PermutaService _permutaService;
        private readonly ILogger<PermutasController> _logger;

        public PermutasController(
            PermutaService permutaService,
            ILogger<PermutasController> logger)
        {
            _permutaService = permutaService;
            _logger = logger;
        }

        [HttpPost("solicitar")]
        [Authorize(Roles = "EmpleadoSindicalizado,Empleado Sindicalizado,DelegadoSindical,Delegado Sindical,SuperUsuario")]
        public async Task<IActionResult> SolicitarPermuta([FromBody] SolicitudPermutaRequest request)
        {
            try
            {
                _logger.LogInformation("=== INICIO SOLICITUD PERMUTA ===");
                _logger.LogInformation("ModelState.IsValid: {IsValid}", ModelState.IsValid);

                if (!ModelState.IsValid)
                {
                    foreach (var error in ModelState)
                    {
                        _logger.LogError("Campo: {Key}, Errores: {Errors}",
                            error.Key,
                            string.Join(", ", error.Value.Errors.Select(e => e.ErrorMessage)));
                    }

                    var errors = ModelState.Values
                        .SelectMany(v => v.Errors)
                        .Select(e => e.ErrorMessage)
                        .ToList();

                    return BadRequest(new ApiResponse<object>(false, null,
                        $"Datos inválidos: {string.Join(", ", errors)}"));
                }

                _logger.LogInformation("Request recibido: EmpleadoOrigenId={Origen}, EmpleadoDestinoId={Destino}, FechaPermuta={Fecha}",
                    request.EmpleadoOrigenId, request.EmpleadoDestinoId, request.FechaPermuta);

                var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(userIdClaim) || !int.TryParse(userIdClaim, out var usuarioId))
                {
                    return Unauthorized(new ApiResponse<object>(false, null, "No se pudo identificar el usuario"));
                }

                request.SolicitadoPor = usuarioId;

                var response = await _permutaService.SolicitarPermutaAsync(request, usuarioId);

                if (!response.Success)
                {
                    _logger.LogWarning("Permuta rechazada: {Mensaje}", response.ErrorMsg);
                    return BadRequest(response);
                }

                _logger.LogInformation("Permuta exitosa, ID: {PermutaId}", response.Data?.PermutaId);
                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al solicitar permuta");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        [HttpPost("responder/{permutaId}")]
        [Authorize(Roles = "JefeArea,Jefe De Area,SuperUsuario,DelegadoSindical,Delegado Sindical")]
        public async Task<IActionResult> ResponderPermuta(
    int permutaId,
    [FromBody] ResponderPermutaRequest request)
        {
            try
            {
                _logger.LogInformation("=== INICIO ResponderPermuta Controller ===");
                _logger.LogInformation("PermutaId: {PermutaId}, Aprobar: {Aprobar}, MotivoRechazo: {Motivo}",
                    permutaId, request.Aprobar, request.MotivoRechazo ?? "NULL");

                var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(userIdClaim) || !int.TryParse(userIdClaim, out var jefeId))
                {
                    _logger.LogWarning("No se pudo identificar el usuario del token");
                    return Unauthorized(new ApiResponse<object>(false, null,
                        "No se pudo identificar el usuario"));
                }

                _logger.LogInformation("Usuario identificado: {JefeId}", jefeId);

                var response = await _permutaService.ResponderSolicitudPermutaAsync(
                    permutaId, request.Aprobar, request.MotivoRechazo, jefeId);

                if (!response.Success)
                {
                    _logger.LogWarning("Servicio retornó error: {ErrorMsg}", response.ErrorMsg);
                    return BadRequest(response);
                }

                _logger.LogInformation("✅ Permuta procesada exitosamente");
                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "❌ Error inesperado en ResponderPermuta");
                return StatusCode(500, new ApiResponse<object>(false, null,
                    $"Error inesperado: {ex.Message}"));
            }
        }

        [HttpGet("listado")]
        [Authorize]
        public async Task<IActionResult> ObtenerPermutas([FromQuery] int? anio, [FromQuery] int? areaId)
        {
            try
            {
                var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(userIdClaim) || !int.TryParse(userIdClaim, out var usuarioId))
                {
                    return Unauthorized(new ApiResponse<object>(false, null, "No se pudo identificar el usuario"));
                }

                _logger.LogInformation("🔍 ObtenerPermutas - Usuario: {UsuarioId}, Año: {Anio}, AreaId: {AreaId}",
                    usuarioId, anio, areaId);

                var response = await _permutaService.ObtenerPermutasAsync(anio, usuarioId, areaId);

                _logger.LogInformation("📊 Permutas retornadas: {Count}", response.Total);

                return Ok(new ApiResponse<PermutasListResponse>(true, response));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener listado de permutas");
                return StatusCode(500, new ApiResponse<object>(false, null, "Error al obtener permutas"));
            }
        }

        [HttpGet("exportar-csv")]
        [Authorize]
        public async Task<IActionResult> ExportarPermutasCsv([FromQuery] int? anio)
        {
            try
            {
                var csvBytes = await _permutaService.ExportarPermutasACsvAsync(anio);
                var fileName = $"Permutas_{anio ?? DateTime.Now.Year}_{DateTime.Now:yyyyMMdd}.csv";

                return File(csvBytes, "text/csv", fileName);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al exportar permutas");
                return StatusCode(500, new ApiResponse<object>(false, null, "Error al generar reporte"));
            }
        }

        [HttpGet("exportar-excel")]
        [Authorize]
        public async Task<IActionResult> ExportarPermutasExcel([FromQuery] int? anio)
        {
            try
            {
                var permutas = await _permutaService.ObtenerPermutasAsync(anio);

                using var workbook = new ClosedXML.Excel.XLWorkbook();
                var worksheet = workbook.Worksheets.Add("Permutas");

                // Encabezados
                worksheet.Cell(1, 1).Value = "ID";
                worksheet.Cell(1, 2).Value = "Fecha Solicitud";
                worksheet.Cell(1, 3).Value = "Fecha Permuta";
                worksheet.Cell(1, 4).Value = "Empleado Origen";
                worksheet.Cell(1, 5).Value = "Turno Origen";
                worksheet.Cell(1, 6).Value = "Empleado Destino";
                worksheet.Cell(1, 7).Value = "Turno Destino";
                worksheet.Cell(1, 8).Value = "Motivo";
                worksheet.Cell(1, 9).Value = "Solicitado Por";

                // Datos
                int row = 2;
                foreach (var p in permutas.Permutas)
                {
                    worksheet.Cell(row, 1).Value = p.Id;
                    worksheet.Cell(row, 2).Value = p.FechaSolicitud.ToString("yyyy-MM-dd HH:mm");
                    worksheet.Cell(row, 3).Value = p.FechaPermuta.ToString("yyyy-MM-dd");
                    worksheet.Cell(row, 4).Value = p.EmpleadoOrigenNombre;
                    worksheet.Cell(row, 5).Value = p.TurnoEmpleadoOrigen;
                    worksheet.Cell(row, 6).Value = p.EmpleadoDestinoNombre;
                    worksheet.Cell(row, 7).Value = p.TurnoEmpleadoDestino;
                    worksheet.Cell(row, 8).Value = p.Motivo;
                    worksheet.Cell(row, 9).Value = p.SolicitadoPorNombre;
                    row++;
                }

                worksheet.Columns().AdjustToContents();

                using var stream = new MemoryStream();
                workbook.SaveAs(stream);
                var content = stream.ToArray();

                var fileName = $"Permutas_{anio ?? DateTime.Now.Year}_{DateTime.Now:yyyyMMdd}.xlsx";

                return File(content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileName);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al exportar permutas");
                return StatusCode(500, new ApiResponse<object>(false, null, "Error al generar reporte"));
            }
        }
    }
}