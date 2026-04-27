using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System;
using System.Security.Claims;
using System.Threading.Tasks;
using tiempo_libre.DTOs;
using tiempo_libre.Models;
using tiempo_libre.Services;

namespace tiempo_libre.Controllers
{
    [ApiController]
    [Route("api/edicion-dias-empresa")]
    [Authorize]
    public class EdicionDiasEmpresaController : ControllerBase
    {
        private readonly EdicionDiasEmpresaService _service;
        private readonly ILogger<EdicionDiasEmpresaController> _logger;

        public EdicionDiasEmpresaController(
            EdicionDiasEmpresaService service,
            ILogger<EdicionDiasEmpresaController> logger)
        {
            _service = service;
            _logger = logger;
        }

        // ─── Configuración ─────────────────────────────────────────────────────

        /// <summary>Obtiene la configuración activa (si edición está habilitada y el periodo permitido)</summary>
        [HttpGet("configuracion")]
        public async Task<IActionResult> ObtenerConfiguracion()
        {
            try
            {
                var config = await _service.ObtenerConfiguracionActivaAsync();
                return Ok(new ApiResponse<ConfiguracionEdicionDiasEmpresaDto>(true, config));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener configuración edición días empresa");
                return StatusCode(500, new ApiResponse<object>(false, null, ex.Message));
            }
        }

        /// <summary>Crea o reemplaza la configuración (SuperUsuario)</summary>
        [HttpPost("configuracion")]
        [Authorize(Roles = "SuperUsuario")]
        public async Task<IActionResult> CrearConfiguracion([FromBody] CrearConfiguracionEdicionRequest request)
        {
            try
            {
                var usuarioId = ObtenerUsuarioId();
                var resultado = await _service.CrearConfiguracionAsync(request, usuarioId);
                if (!resultado.Success) return BadRequest(resultado);
                return Ok(resultado);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al crear configuración edición días empresa");
                return StatusCode(500, new ApiResponse<object>(false, null, ex.Message));
            }
        }

        /// <summary>Habilita o deshabilita la edición (toggle) — SuperUsuario</summary>
        [HttpPut("configuracion/toggle")]
        [Authorize(Roles = "SuperUsuario")]
        public async Task<IActionResult> ToggleHabilitado()
        {
            try
            {
                var usuarioId = ObtenerUsuarioId();
                var resultado = await _service.ToggleHabilitadoAsync(usuarioId);
                if (!resultado.Success) return BadRequest(resultado);
                return Ok(resultado);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al toggle edición días empresa");
                return StatusCode(500, new ApiResponse<object>(false, null, ex.Message));
            }
        }

        // ─── Solicitudes (empleado/delegado) ───────────────────────────────────

        /// <summary>Envía solicitud de edición de día asignado por empresa</summary>
        [HttpPost("solicitar")]
        [Authorize(Roles = "EmpleadoSindicalizado,Empleado Sindicalizado,DelegadoSindical,Delegado Sindical,SuperUsuario")]
        public async Task<IActionResult> SolicitarEdicion([FromBody] SolicitarEdicionDiaEmpresaRequest request)
        {
            try
            {
                if (!ModelState.IsValid)
                    return BadRequest(new ApiResponse<object>(false, null, "Datos inválidos."));

                var usuarioId = ObtenerUsuarioId();
                var resultado = await _service.SolicitarEdicionAsync(request, usuarioId);
                if (!resultado.Success) return BadRequest(resultado);
                return Ok(resultado);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al solicitar edición día empresa");
                return StatusCode(500, new ApiResponse<object>(false, null, ex.Message));
            }
        }

        /// <summary>Consulta las solicitudes del empleado autenticado</summary>
        [HttpGet("mis-solicitudes/{empleadoId:int}")]
        public async Task<IActionResult> ObtenerMisSolicitudes(int empleadoId)
        {
            try
            {
                var solicitudes = await _service.ObtenerSolicitudesPorEmpleadoAsync(empleadoId);
                return Ok(new ApiResponse<object>(true, solicitudes));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener solicitudes edición días empresa para empleado={Id}", empleadoId);
                return StatusCode(500, new ApiResponse<object>(false, null, ex.Message));
            }
        }

        // ─── Aprobación (jefe de área) ──────────────────────────────────────────

        /// <summary>Solicitudes pendientes de aprobación del área del jefe autenticado</summary>
        [HttpGet("pendientes")]
        [Authorize(Roles = "Jefe De Area,JefeArea,SuperUsuario")]
        public async Task<IActionResult> ObtenerPendientes()
        {
            try
            {
                var jefeId = ObtenerUsuarioId();
                var solicitudes = await _service.ObtenerSolicitudesPendientesJefeAsync(jefeId);
                return Ok(new ApiResponse<object>(true, solicitudes));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener solicitudes pendientes edición días empresa");
                return StatusCode(500, new ApiResponse<object>(false, null, ex.Message));
            }
        }

        /// <summary>Todas las solicitudes del área (historial)</summary>
        [HttpGet("solicitudes-area")]
        [Authorize(Roles = "Jefe De Area,JefeArea,SuperUsuario")]
        public async Task<IActionResult> ObtenerSolicitudesArea()
        {
            try
            {
                var jefeId = ObtenerUsuarioId();
                var solicitudes = await _service.ObtenerTodasSolicitudesJefeAsync(jefeId);
                return Ok(new ApiResponse<object>(true, solicitudes));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener solicitudes área edición días empresa");
                return StatusCode(500, new ApiResponse<object>(false, null, ex.Message));
            }
        }

        /// <summary>Aprobar o rechazar una solicitud</summary>
        [HttpPost("responder")]
        [Authorize(Roles = "Jefe De Area,JefeArea,SuperUsuario")]
        public async Task<IActionResult> ResponderSolicitud([FromBody] ResponderEdicionDiaEmpresaRequest request)
        {
            try
            {
                if (!ModelState.IsValid)
                    return BadRequest(new ApiResponse<object>(false, null, "Datos inválidos."));

                var jefeId = ObtenerUsuarioId();
                var resultado = await _service.ResponderSolicitudAsync(request, jefeId);
                if (!resultado.Success) return BadRequest(resultado);
                return Ok(resultado);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al responder solicitud edición día empresa");
                return StatusCode(500, new ApiResponse<object>(false, null, ex.Message));
            }
        }

        // ─── Helper ─────────────────────────────────────────────────────────────

        private int ObtenerUsuarioId()
        {
            var claim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (!int.TryParse(claim, out var id))
                throw new UnauthorizedAccessException("No se pudo identificar el usuario.");
            return id;
        }
    }
}
