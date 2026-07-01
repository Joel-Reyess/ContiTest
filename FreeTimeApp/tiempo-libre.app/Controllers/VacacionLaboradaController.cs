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
    [Route("api/vacacion-laborada")]
    [Authorize]
    public class VacacionLaboradaController : ControllerBase
    {
        private readonly VacacionLaboradaService _service;
        private readonly ILogger<VacacionLaboradaController> _logger;

        public VacacionLaboradaController(
            VacacionLaboradaService service,
            ILogger<VacacionLaboradaController> logger)
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

        [HttpGet("vacaciones-laborables/{empleadoId:int}")]
        public async Task<IActionResult> ObtenerVacacionesLaborables(int empleadoId)
        {
            try
            {
                var data = await _service.ObtenerVacacionesLaborablesAsync(empleadoId);
                return Ok(new ApiResponse<object>(true, data));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error consultando vacaciones laborables de {EmpleadoId}", empleadoId);
                return StatusCode(500, new ApiResponse<object>(false, null, ex.Message));
            }
        }

        [HttpPost("solicitar")]
        [Authorize(Roles = "DelegadoSindical,Delegado Sindical,JefeArea,Jefe De Area,SuperUsuario")]
        public async Task<IActionResult> Solicitar([FromBody] SolicitarVacacionLaboradaRequest request)
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
                _logger.LogError(ex, "Error al crear solicitud de vacación laborada");
                return StatusCode(500, new ApiResponse<object>(false, null, ex.Message));
            }
        }

        [HttpPost("aprobar")]
        [Authorize(Roles = "JefeArea,Jefe De Area,SuperUsuario")]
        public async Task<IActionResult> AprobarRechazar([FromBody] AprobarVacacionLaboradaRequest request)
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
                _logger.LogError(ex, "Error aprobando/rechazando vacación laborada");
                return StatusCode(500, new ApiResponse<object>(false, null, ex.Message));
            }
        }

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
                _logger.LogError(ex, "Error consultando vacaciones laboradas del empleado {Id}", empleadoId);
                return StatusCode(500, new ApiResponse<object>(false, null, ex.Message));
            }
        }

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
                _logger.LogError(ex, "Error consultando pendientes vacación laborada");
                return StatusCode(500, new ApiResponse<object>(false, null, ex.Message));
            }
        }

        [HttpGet("creadas-por-mi")]
        public async Task<IActionResult> ObtenerCreadasPorMi([FromQuery] int? anio = null)
        {
            try
            {
                var usuarioId = ObtenerUsuarioId();
                var data = await _service.ObtenerCreadasPorUsuarioAsync(usuarioId, anio);
                return Ok(new ApiResponse<object>(true, data));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error consultando vacaciones laboradas creadas por el usuario");
                return StatusCode(500, new ApiResponse<object>(false, null, ex.Message));
            }
        }

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
                _logger.LogError(ex, "Error consultando solicitudes-area vacación laborada");
                return StatusCode(500, new ApiResponse<object>(false, null, ex.Message));
            }
        }
    }
}
