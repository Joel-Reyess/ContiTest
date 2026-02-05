using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using System;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using tiempo_libre.DTOs;
using tiempo_libre.Models;
using tiempo_libre.Models.Enums;
using tiempo_libre.Services;

namespace tiempo_libre.Controllers
{
    [ApiController]
    [Route("api/reprogramacion")]
    [Authorize]
    public class ReprogramacionController : ControllerBase
    {
        private readonly ReprogramacionService _reprogramacionService;
        private readonly ILogger<ReprogramacionController> _logger;

        public ReprogramacionController(
            ReprogramacionService reprogramacionService,
            ILogger<ReprogramacionController> logger)
        {
            _reprogramacionService = reprogramacionService;
            _logger = logger;
        }

        /// <summary>
        /// Solicitar una reprogramación de vacaciones
        /// </summary>
        /// <param name="request">Datos de la solicitud de reprogramación</param>
        /// <returns>Resultado de la solicitud con información de aprobación</returns>
        [HttpPost("solicitar")]
        [Authorize(Roles = "EmpleadoSindicalizado,Empleado Sindicalizado,DelegadoSindical,Delegado Sindical,JefeArea,Jefe De Area,SuperUsuario")]
        public async Task<IActionResult> SolicitarReprogramacion([FromBody] SolicitudReprogramacionRequest request)
        {
            try
            {
                if (!ModelState.IsValid)
                {
                    var errors = string.Join("; ", ModelState
                        .SelectMany(x => x.Value?.Errors ?? Enumerable.Empty<Microsoft.AspNetCore.Mvc.ModelBinding.ModelError>())
                        .Select(x => x.ErrorMessage));
                    return BadRequest(new ApiResponse<object>(false, null, $"Datos de entrada inválidos: {errors}"));
                }

                // Obtener el ID del usuario del token JWT
                var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(userIdClaim) || !int.TryParse(userIdClaim, out var usuarioId))
                {
                    _logger.LogError("No se pudo obtener el ID del usuario del token JWT");
                    return Unauthorized(new ApiResponse<object>(false, null, "No se pudo identificar el usuario"));
                }

                _logger.LogInformation(
                    "Usuario {UsuarioId} solicitando reprogramación para empleado {EmpleadoId}, de vacación {VacacionId} a fecha {FechaNueva}",
                    usuarioId, request.EmpleadoId, request.VacacionOriginalId, request.FechaNueva);

                var response = await _reprogramacionService.SolicitarReprogramacionAsync(request, usuarioId);

                if (!response.Success)
                {
                    return BadRequest(response);
                }

                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al solicitar reprogramación");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>
        /// Aprobar o rechazar una solicitud de reprogramación (solo jefes de área)
        /// </summary>
        /// <param name="request">Datos de aprobación/rechazo</param>
        /// <returns>Resultado de la aprobación</returns>
        [HttpPost("aprobar")]
        [Authorize(Roles = "JefeArea,Jefe De Area,SuperUsuario")]
        public async Task<IActionResult> AprobarRechazarSolicitud([FromBody] AprobarReprogramacionRequest request)
        {
            try
            {
                if (!ModelState.IsValid)
                {
                    var errors = string.Join("; ", ModelState
                        .SelectMany(x => x.Value?.Errors ?? Enumerable.Empty<Microsoft.AspNetCore.Mvc.ModelBinding.ModelError>())
                        .Select(x => x.ErrorMessage));
                    return BadRequest(new ApiResponse<object>(false, null, $"Datos de entrada inválidos: {errors}"));
                }

                // Obtener el ID del usuario del token JWT
                var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(userIdClaim) || !int.TryParse(userIdClaim, out var usuarioId))
                {
                    _logger.LogError("No se pudo obtener el ID del usuario del token JWT");
                    return Unauthorized(new ApiResponse<object>(false, null, "No se pudo identificar el usuario"));
                }

                _logger.LogInformation(
                    "Usuario {UsuarioId} {Accion} solicitud {SolicitudId}",
                    usuarioId, request.Aprobada ? "aprobando" : "rechazando", request.SolicitudId);

                var response = await _reprogramacionService.AprobarRechazarSolicitudAsync(request, usuarioId);

                if (!response.Success)
                {
                    return BadRequest(response);
                }

                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al aprobar/rechazar solicitud");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>
        /// Consultar solicitudes de reprogramación con filtros opcionales
        /// </summary>
        /// <param name="estado">Estado de la solicitud (Pendiente, Aprobada, Rechazada)</param>
        /// <param name="empleadoId">ID del empleado</param>
        /// <param name="areaId">ID del área</param>
        /// <param name="fechaDesde">Fecha inicio del rango de búsqueda</param>
        /// <param name="fechaHasta">Fecha fin del rango de búsqueda</param>
        /// <returns>Lista de solicitudes que cumplen con los filtros</returns>
        [HttpGet("solicitudes")]
        public async Task<IActionResult> ConsultarSolicitudes(
            [FromQuery] string? estado = null,
            [FromQuery] int? empleadoId = null,
            [FromQuery] int? areaId = null,
            [FromQuery] DateTime? fechaDesde = null,
            [FromQuery] DateTime? fechaHasta = null)
        {
            try
            {
                // Obtener el ID del usuario del token JWT
                var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(userIdClaim) || !int.TryParse(userIdClaim, out var usuarioId))
                {
                    _logger.LogError("No se pudo obtener el ID del usuario del token JWT");
                    return Unauthorized(new ApiResponse<object>(false, null, "No se pudo identificar el usuario"));
                }

                var request = new ConsultaSolicitudesRequest
                {
                    Estado = estado,
                    EmpleadoId = empleadoId,
                    AreaId = areaId,
                    FechaDesde = fechaDesde,
                    FechaHasta = fechaHasta
                };

                _logger.LogInformation(
                    "Usuario {UsuarioId} consultando solicitudes con filtros: Estado={Estado}, EmpleadoId={EmpleadoId}, AreaId={AreaId}",
                    usuarioId, estado, empleadoId, areaId);

                var response = await _reprogramacionService.ConsultarSolicitudesAsync(request, usuarioId);

                if (!response.Success)
                {
                    return BadRequest(response);
                }

                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al consultar solicitudes");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>
        /// Obtener solicitudes pendientes de aprobación para el jefe de área actual
        /// </summary>
        /// <returns>Lista de solicitudes pendientes del área del jefe</returns>
        [HttpGet("pendientes")]
        [Authorize(Roles = "JefeArea,Jefe De Area,SuperUsuario")]
        public async Task<IActionResult> ObtenerSolicitudesPendientes()
        {
            try
            {
                // Obtener el ID del usuario del token JWT
                var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(userIdClaim) || !int.TryParse(userIdClaim, out var usuarioId))
                {
                    _logger.LogError("No se pudo obtener el ID del usuario del token JWT");
                    return Unauthorized(new ApiResponse<object>(false, null, "No se pudo identificar el usuario"));
                }

                var request = new ConsultaSolicitudesRequest
                {
                    Estado = "Pendiente",
                    JefeAreaId = usuarioId
                };

                _logger.LogInformation("Jefe {UsuarioId} consultando sus solicitudes pendientes", usuarioId);

                var response = await _reprogramacionService.ConsultarSolicitudesAsync(request, usuarioId);

                if (!response.Success)
                {
                    return BadRequest(response);
                }

                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener solicitudes pendientes");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>
        /// Validar si una reprogramación es posible antes de solicitarla
        /// </summary>
        /// <param name="request">Datos para validar la reprogramación</param>
        /// <returns>Información sobre la viabilidad de la reprogramación</returns>
        [HttpPost("validar")]
        public async Task<IActionResult> ValidarReprogramacion([FromBody] ValidarReprogramacionRequest request)
        {
            try
            {
                if (!ModelState.IsValid)
                {
                    var errors = string.Join("; ", ModelState
                        .SelectMany(x => x.Value?.Errors ?? Enumerable.Empty<Microsoft.AspNetCore.Mvc.ModelBinding.ModelError>())
                        .Select(x => x.ErrorMessage));
                    return BadRequest(new ApiResponse<object>(false, null, $"Datos de entrada inválidos: {errors}"));
                }

                _logger.LogInformation(
                    "Validando reprogramación para empleado {EmpleadoId}, vacación {VacacionId} a fecha {FechaNueva}",
                    request.EmpleadoId, request.VacacionOriginalId, request.FechaNueva);

                var response = await _reprogramacionService.ValidarReprogramacionAsync(request);

                if (!response.Success)
                {
                    return BadRequest(response);
                }

                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al validar reprogramación");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>
        /// Obtener el historial de reprogramaciones de un empleado específico
        /// </summary>
        /// <param name="empleadoId">ID del empleado</param>
        /// <param name="anio">Año de la solicitud (opcional)</param>
        /// <param name="anioVacaciones">Año de la fecha nueva de vacaciones (opcional)</param>
        /// <returns>Historial de reprogramaciones del empleado</returns>
        [HttpGet("historial/{empleadoId}")]
        public async Task<IActionResult> ObtenerHistorialEmpleado(
            [FromRoute] int empleadoId,
            [FromQuery] int? anio = null,
            [FromQuery] int? anioVacaciones = null)
        {
            try
            {
                // Obtener el ID del usuario del token JWT
                var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(userIdClaim) || !int.TryParse(userIdClaim, out var usuarioId))
                {
                    _logger.LogError("No se pudo obtener el ID del usuario del token JWT");
                    return Unauthorized(new ApiResponse<object>(false, null, "No se pudo identificar el usuario"));
                }

                DateTime? fechaDesde = null;
                DateTime? fechaHasta = null;
                DateOnly? fechaNuevaDesde = null;
                DateOnly? fechaNuevaHasta = null;

                // Filtrar por año de solicitud
                if (anio.HasValue)
                {
                    fechaDesde = new DateTime(anio.Value, 1, 1);
                    fechaHasta = new DateTime(anio.Value, 12, 31, 23, 59, 59);
                }

                // Filtrar por año de las vacaciones (fecha nueva)
                if (anioVacaciones.HasValue)
                {
                    fechaNuevaDesde = new DateOnly(anioVacaciones.Value, 1, 1);
                    fechaNuevaHasta = new DateOnly(anioVacaciones.Value, 12, 31);
                }

                var request = new ConsultaSolicitudesRequest
                {
                    EmpleadoId = empleadoId,
                    FechaDesde = fechaDesde,
                    FechaHasta = fechaHasta,
                    FechaNuevaDesde = fechaNuevaDesde,
                    FechaNuevaHasta = fechaNuevaHasta
                };

                _logger.LogInformation(
                    "Usuario {UsuarioId} consultando historial del empleado {EmpleadoId}, año solicitud: {Anio}, año vacaciones: {AnioVacaciones}",
                    usuarioId, empleadoId, anio, anioVacaciones);

                var response = await _reprogramacionService.ConsultarSolicitudesAsync(request, usuarioId);

                if (!response.Success)
                {
                    return BadRequest(response);
                }

                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener historial del empleado {EmpleadoId}", empleadoId);
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>
        /// Obtener el historial de solicitudes creadas por el usuario autenticado (delegado/jefe)
        /// </summary>
        [HttpGet("creadas-por-mi")]
        public async Task<IActionResult> ObtenerSolicitudesCreadasPorMi([FromQuery] int? anio = null)
        {
            try
            {
                var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(userIdClaim) || !int.TryParse(userIdClaim, out var usuarioId))
                {
                    return Unauthorized(new ApiResponse<object>(false, null, "No se pudo identificar el usuario"));
                }

                var request = new ConsultaSolicitudesRequest
                {
                    SolicitadoPorId = usuarioId,
                    FechaNuevaDesde = anio.HasValue ? new DateOnly(anio.Value, 1, 1) : null,
                    FechaNuevaHasta = anio.HasValue ? new DateOnly(anio.Value, 12, 31) : null
                };

                if (anio.HasValue)
                {
                    request.FechaNuevaDesde = new DateOnly(anio.Value, 1, 1);
                    request.FechaNuevaHasta = new DateOnly(anio.Value, 12, 31);
                }

                _logger.LogInformation("Usuario {UsuarioId} consultando solicitudes que creó", usuarioId);

                var response = await _reprogramacionService.ConsultarSolicitudesAsync(request, usuarioId);

                if (!response.Success)
                {
                    return BadRequest(response);
                }

                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener solicitudes creadas por el usuario");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>
        /// Obtener detalles de una solicitud específica
        /// <summary>
        /// Obtener solicitud individual por ID
        /// </summary>
        [HttpGet("solicitud/{id}")]
        public async Task<IActionResult> ObtenerSolicitudPorId(int id)
        {
            try
            {
                // Obtener el ID del usuario del token JWT
                var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(userIdClaim) || !int.TryParse(userIdClaim, out var usuarioId))
                {
                    _logger.LogError("No se pudo obtener el ID del usuario del token JWT");
                    return Unauthorized(new ApiResponse<object>(false, null, "No se pudo identificar el usuario"));
                }

                // Crear un request para buscar solo esta solicitud
                var request = new ConsultaSolicitudesRequest();

                _logger.LogInformation("Usuario {UsuarioId} consultando solicitud {SolicitudId}", usuarioId, id);

                var response = await _reprogramacionService.ConsultarSolicitudesAsync(request, usuarioId);

                if (!response.Success || response.Data == null)
                {
                    return BadRequest(response);
                }

                // Buscar la solicitud específica en los resultados
                var solicitud = response.Data.Solicitudes.FirstOrDefault(s => s.Id == id);

                if (solicitud == null)
                {
                    return NotFound(new ApiResponse<object>(false, null, "Solicitud no encontrada"));
                }

                return Ok(new ApiResponse<SolicitudReprogramacionDto>(true, solicitud, null));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener solicitud {SolicitudId}", id);
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }
    }
}