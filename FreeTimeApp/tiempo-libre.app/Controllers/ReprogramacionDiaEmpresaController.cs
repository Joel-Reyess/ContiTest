using System;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using tiempo_libre.DTOs;
using tiempo_libre.Models;
using tiempo_libre.Services;

namespace tiempo_libre.Controllers
{
    /// <summary>
    /// Punto 9 del PDF: SuperUsuario reprograma días asignados por empresa con
    /// motivo de catálogo cerrado, con aprobación del jefe de área.
    /// </summary>
    [ApiController]
    [Route("api/reprogramacion-dia-empresa")]
    [Authorize]
    public class ReprogramacionDiaEmpresaController : ControllerBase
    {
        private readonly ReprogramacionDiaEmpresaService _service;
        private readonly ILogger<ReprogramacionDiaEmpresaController> _logger;

        public ReprogramacionDiaEmpresaController(
            ReprogramacionDiaEmpresaService service,
            ILogger<ReprogramacionDiaEmpresaController> logger)
        {
            _service = service;
            _logger = logger;
        }

        private int ObtenerUsuarioId()
        {
            var claim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (!int.TryParse(claim, out var id))
                throw new UnauthorizedAccessException("No se pudo identificar el usuario.");
            return id;
        }

        /// <summary>Catálogo cerrado de motivos válidos.</summary>
        [HttpGet("motivos")]
        public IActionResult ObtenerMotivos()
        {
            return Ok(new ApiResponse<object>(true, _service.ObtenerCatalogoMotivos()));
        }

        /// <summary>
        /// Vacaciones asignadas por la empresa (Automatica/AsignadaAutomaticamente)
        /// no consumidas del empleado. Punto 9: candidatas a reprogramación.
        /// </summary>
        [HttpGet("vacaciones-asignadas/{empleadoId:int}")]
        [Authorize(Roles = "SuperUsuario,Super Usuario")]
        public async Task<IActionResult> ObtenerVacacionesAsignadas(int empleadoId)
        {
            try
            {
                var data = await _service.ObtenerVacacionesAsignadasNoConsumidasAsync(empleadoId);
                return Ok(new ApiResponse<object>(true, data));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error obteniendo vacaciones asignadas no consumidas para {EmpleadoId}", empleadoId);
                return StatusCode(500, new ApiResponse<object>(false, null, ex.Message));
            }
        }

        /// <summary>Crear solicitud (SOLO SuperUsuario).</summary>
        [HttpPost("solicitar")]
        [Authorize(Roles = "SuperUsuario,Super Usuario")]
        public async Task<IActionResult> Solicitar([FromBody] SolicitarReprogramacionDiaEmpresaRequest request)
        {
            try
            {
                if (!ModelState.IsValid)
                {
                    var errors = string.Join("; ", ModelState
                        .SelectMany(x => x.Value?.Errors ?? Enumerable.Empty<Microsoft.AspNetCore.Mvc.ModelBinding.ModelError>())
                        .Select(x => x.ErrorMessage));
                    return BadRequest(new ApiResponse<object>(false, null, $"Datos inválidos: {errors}"));
                }

                var userId = ObtenerUsuarioId();
                var resp = await _service.SolicitarAsync(request, userId);
                if (!resp.Success) return BadRequest(resp);
                return Ok(resp);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error solicitando reprogramación día empresa");
                return StatusCode(500, new ApiResponse<object>(false, null, ex.Message));
            }
        }

        /// <summary>Aprobar/rechazar (jefe del área).</summary>
        [HttpPost("aprobar")]
        [Authorize(Roles = "Jefe De Area,JefeArea,JefeDeArea,SuperUsuario,Super Usuario")]
        public async Task<IActionResult> AprobarRechazar([FromBody] AprobarReprogramacionDiaEmpresaRequest request)
        {
            try
            {
                if (!ModelState.IsValid)
                    return BadRequest(new ApiResponse<object>(false, null, "Datos inválidos."));

                var userId = ObtenerUsuarioId();
                var resp = await _service.AprobarRechazarAsync(request, userId);
                if (!resp.Success) return BadRequest(resp);
                return Ok(resp);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error aprobando/rechazando reprogramación día empresa");
                return StatusCode(500, new ApiResponse<object>(false, null, ex.Message));
            }
        }

        /// <summary>Pendientes para el jefe autenticado.</summary>
        [HttpGet("pendientes")]
        [Authorize(Roles = "Jefe De Area,JefeArea,JefeDeArea,SuperUsuario,Super Usuario")]
        public async Task<IActionResult> ObtenerPendientes()
        {
            try
            {
                var jefeId = ObtenerUsuarioId();
                var data = await _service.ObtenerPorJefeAsync(jefeId, "Pendiente");
                return Ok(new ApiResponse<object>(true, data));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error obteniendo pendientes");
                return StatusCode(500, new ApiResponse<object>(false, null, ex.Message));
            }
        }

        /// <summary>Solicitudes del área del jefe (historial).</summary>
        [HttpGet("solicitudes-area")]
        [Authorize(Roles = "Jefe De Area,JefeArea,JefeDeArea,SuperUsuario,Super Usuario")]
        public async Task<IActionResult> ObtenerSolicitudesArea([FromQuery] string? estado = null)
        {
            try
            {
                var jefeId = ObtenerUsuarioId();
                var data = await _service.ObtenerPorJefeAsync(jefeId, estado);
                return Ok(new ApiResponse<object>(true, data));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error obteniendo solicitudes-area");
                return StatusCode(500, new ApiResponse<object>(false, null, ex.Message));
            }
        }

        /// <summary>Todas las solicitudes (SuperUsuario).</summary>
        [HttpGet("todas")]
        [Authorize(Roles = "SuperUsuario,Super Usuario")]
        public async Task<IActionResult> ObtenerTodas([FromQuery] string? estado = null)
        {
            try
            {
                var data = await _service.ObtenerTodasAsync(estado);
                return Ok(new ApiResponse<object>(true, data));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error obteniendo todas");
                return StatusCode(500, new ApiResponse<object>(false, null, ex.Message));
            }
        }
    }
}
