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
    [ApiController]
    [Route("api/reprogramacion-post-incapacidad")]
    [Authorize]
    public class ReprogramacionPostIncapacidadController : ControllerBase
    {
        private readonly ReprogramacionPostIncapacidadService _service;
        private readonly ILogger<ReprogramacionPostIncapacidadController> _logger;

        public ReprogramacionPostIncapacidadController(
            ReprogramacionPostIncapacidadService service,
            ILogger<ReprogramacionPostIncapacidadController> logger)
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

        // ─── Listas para los dropdowns del modal ─────────────────────────────

        /// <summary>Incapacidades / permisos consumidos del empleado.</summary>
        [HttpGet("incapacidades-consumidas/{empleadoId:int}")]
        public async Task<IActionResult> ObtenerIncapacidadesConsumidas(int empleadoId)
        {
            try
            {
                var data = await _service.ObtenerIncapacidadesConsumidasAsync(empleadoId);
                return Ok(new ApiResponse<object>(true, data));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error consultando incapacidades consumidas para {EmpleadoId}", empleadoId);
                return StatusCode(500, new ApiResponse<object>(false, null, ex.Message));
            }
        }

        /// <summary>Vacaciones futuras no canjeadas (Activas) del empleado.</summary>
        [HttpGet("vacaciones-no-canjeadas/{empleadoId:int}")]
        public async Task<IActionResult> ObtenerVacacionesNoCanjeadas(int empleadoId)
        {
            try
            {
                var data = await _service.ObtenerVacacionesNoCanjeadasAsync(empleadoId);
                return Ok(new ApiResponse<object>(true, data));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error consultando vacaciones no canjeadas para {EmpleadoId}", empleadoId);
                return StatusCode(500, new ApiResponse<object>(false, null, ex.Message));
            }
        }

        // ─── Solicitar ────────────────────────────────────────────────────────

        [HttpPost("solicitar")]
        [Authorize(Roles = "EmpleadoSindicalizado,Empleado Sindicalizado,DelegadoSindical,Delegado Sindical,JefeArea,Jefe De Area,SuperUsuario")]
        public async Task<IActionResult> Solicitar([FromBody] SolicitarReprogramacionPostIncapacidadRequest request)
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

                var usuarioId = ObtenerUsuarioId();
                var resp = await _service.SolicitarAsync(request, usuarioId);
                if (!resp.Success) return BadRequest(resp);
                return Ok(resp);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al crear solicitud post-incapacidad");
                return StatusCode(500, new ApiResponse<object>(false, null, ex.Message));
            }
        }

        // ─── Aprobar / rechazar ───────────────────────────────────────────────

        [HttpPost("aprobar")]
        [Authorize(Roles = "JefeArea,Jefe De Area,SuperUsuario")]
        public async Task<IActionResult> AprobarRechazar([FromBody] AprobarReprogramacionPostIncapacidadRequest request)
        {
            try
            {
                if (!ModelState.IsValid)
                    return BadRequest(new ApiResponse<object>(false, null, "Datos inválidos."));

                var jefeId = ObtenerUsuarioId();
                var resp = await _service.AprobarRechazarAsync(request, jefeId);
                if (!resp.Success) return BadRequest(resp);
                return Ok(resp);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error aprobando/rechazando solicitud post-incapacidad");
                return StatusCode(500, new ApiResponse<object>(false, null, ex.Message));
            }
        }

        // ─── Consultas ────────────────────────────────────────────────────────

        /// <summary>Solicitudes del empleado.</summary>
        [HttpGet("empleado/{empleadoId:int}")]
        public async Task<IActionResult> ObtenerPorEmpleado(int empleadoId)
        {
            try
            {
                var data = await _service.ObtenerPorEmpleadoAsync(empleadoId);
                return Ok(new ApiResponse<object>(true, data));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error consultando solicitudes del empleado {Id}", empleadoId);
                return StatusCode(500, new ApiResponse<object>(false, null, ex.Message));
            }
        }

        /// <summary>Pendientes del jefe autenticado.</summary>
        [HttpGet("pendientes")]
        [Authorize(Roles = "JefeArea,Jefe De Area,SuperUsuario")]
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
                _logger.LogError(ex, "Error consultando pendientes post-incapacidad");
                return StatusCode(500, new ApiResponse<object>(false, null, ex.Message));
            }
        }

        /// <summary>Todas las solicitudes del área del jefe (historial).</summary>
        [HttpGet("solicitudes-area")]
        [Authorize(Roles = "JefeArea,Jefe De Area,SuperUsuario")]
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
                _logger.LogError(ex, "Error consultando solicitudes-area post-incapacidad");
                return StatusCode(500, new ApiResponse<object>(false, null, ex.Message));
            }
        }
    }
}
