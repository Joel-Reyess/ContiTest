using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using System;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using tiempo_libre.Services;
using tiempo_libre.DTOs;
using tiempo_libre.Models;

namespace tiempo_libre.Controllers
{
    [ApiController]
    [Route("api/festivos-trabajados")]
    [Authorize]
    public class FestivoTrabajadoController : ControllerBase
    {
        private readonly FestivoTrabajadoService _festivoService;
        private readonly ILogger<FestivoTrabajadoController> _logger;

        public FestivoTrabajadoController(
            FestivoTrabajadoService festivoService,
            ILogger<FestivoTrabajadoController> logger)
        {
            _festivoService = festivoService;
            _logger = logger;
        }

        /// <summary>
        /// Solicitar el intercambio de un festivo trabajado por un día de vacaciones
        /// </summary>
        /// <param name="request">Datos de la solicitud de intercambio</param>
        /// <returns>Resultado del intercambio</returns>
        [HttpPost("intercambiar")]
        [Authorize(Roles = "EmpleadoSindicalizado,Empleado Sindicalizado,DelegadoSindical,Delegado Sindical,JefeArea,Jefe De Area,SuperUsuario")]
        public async Task<IActionResult> SolicitarIntercambioFestivo([FromBody] SolicitudFestivoTrabajadoRequest request)
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
                    "Usuario {UsuarioId} solicitando intercambio de festivo {FestivoId} para empleado {EmpleadoId}, nueva fecha {FechaNueva}",
                    usuarioId, request.FestivoTrabajadoId, request.EmpleadoId, request.FechaNueva);

                var response = await _festivoService.SolicitarIntercambioFestivoAsync(request, usuarioId);

                if (!response.Success)
                {
                    return BadRequest(response);
                }

                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al solicitar intercambio de festivo trabajado");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>
        /// Consultar festivos trabajados disponibles para intercambio
        /// </summary>
        /// <param name="empleadoId">ID del empleado (opcional)</param>
        /// <param name="nomina">Número de nómina (opcional)</param>
        /// <param name="anio">Año de los festivos (opcional)</param>
        /// <param name="soloDisponibles">Si true, solo muestra los no intercambiados (default: true)</param>
        /// <returns>Lista de festivos trabajados</returns>
        [HttpGet("disponibles")]
        public async Task<IActionResult> ConsultarFestivosTrabajados(
            [FromQuery] int? empleadoId = null,
            [FromQuery] int? nomina = null,
            [FromQuery] int? anio = null,
            [FromQuery] bool soloDisponibles = true)
        {
            try
            {
                var request = new ConsultaFestivosTrabajadosRequest
                {
                    EmpleadoId = empleadoId,
                    Nomina = nomina,
                    Anio = anio,
                    SoloDisponibles = soloDisponibles
                };

                _logger.LogInformation(
                    "Consultando festivos trabajados: EmpleadoId={EmpleadoId}, Nomina={Nomina}, Año={Anio}, SoloDisponibles={SoloDisponibles}",
                    empleadoId, nomina, anio, soloDisponibles);

                var response = await _festivoService.ConsultarFestivosTrabajadosAsync(request);

                if (!response.Success)
                {
                    return BadRequest(response);
                }

                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al consultar festivos trabajados");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>
        /// Diagnóstico para SuperUsuario: muestra por qué un FT no aparece disponible
        /// para una nómina (no existe upload, no parsea, expirado, ya solicitado).
        /// </summary>
        [HttpGet("diagnostico")]
        [Authorize(Roles = "Super Usuario,SuperUsuario")]
        public async Task<IActionResult> DiagnosticarFestivosTrabajados([FromQuery] string nomina)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(nomina))
                    return BadRequest(new ApiResponse<object>(false, null, "Falta el parámetro nomina."));

                var response = await _festivoService.DiagnosticarFestivosTrabajadosAsync(nomina);
                if (!response.Success) return BadRequest(response);
                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error en diagnóstico de festivos trabajados");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>
        /// Validar si un intercambio de festivo es posible antes de solicitarlo
        /// </summary>
        /// <param name="request">Datos para validar el intercambio</param>
        /// <returns>Información sobre la viabilidad del intercambio</returns>
        [HttpPost("validar")]
        public async Task<IActionResult> ValidarIntercambioFestivo([FromBody] ValidarFestivoTrabajadoRequest request)
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
                    "Validando intercambio de festivo {FestivoId} para empleado {EmpleadoId} a fecha {FechaNueva}",
                    request.FestivoTrabajadoId, request.EmpleadoId, request.FechaNueva);

                var response = await _festivoService.ValidarIntercambioFestivoAsync(request);

                if (!response.Success)
                {
                    return BadRequest(response);
                }

                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al validar intercambio de festivo trabajado");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>
        /// Obtener el historial de festivos intercambiados de un empleado
        /// </summary>
        /// <param name="empleadoId">ID del empleado</param>
        /// <param name="anio">Año de los intercambios (opcional)</param>
        /// <returns>Historial de festivos intercambiados</returns>
        [HttpGet("historial/{empleadoId}")]
        public async Task<IActionResult> ObtenerHistorialFestivos(
            [FromRoute] int empleadoId,
            [FromQuery] int? anio = null)
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

                // FIX privacidad: un sindicalizado (u otro rol no privilegiado) solo puede
                // consultar su propio historial. Roles que sí pueden consultar cualquier empleado:
                // SuperUsuario, Jefe de Área, Ingeniero Industrial, Delegado Sindical, Gerente BT, RH.
                var puedeConsultarOtros = User.IsInRole("SuperUsuario")
                    || User.IsInRole("JefeArea") || User.IsInRole("Jefe De Area")
                    || User.IsInRole("IngenieroIndustrial") || User.IsInRole("Ingeniero Industrial")
                    || User.IsInRole("DelegadoSindical") || User.IsInRole("Delegado Sindical")
                    || User.IsInRole("Gerente BT") || User.IsInRole("GerenteBT")
                    || User.IsInRole("RH");
                if (!puedeConsultarOtros && empleadoId != usuarioId)
                {
                    _logger.LogWarning(
                        "Usuario sindicalizado {UsuarioId} intentó consultar historial de festivos del empleado {EmpleadoId} - bloqueado",
                        usuarioId, empleadoId);
                    return Forbid();
                }

                _logger.LogInformation(
                    "Usuario {UsuarioId} consultando historial de festivos intercambiados del empleado {EmpleadoId}, año {Anio}",
                    usuarioId, empleadoId, anio);

                var response = await _festivoService.ObtenerHistorialFestivosIntercambiadosAsync(empleadoId, anio);

                if (!response.Success)
                {
                    return BadRequest(response);
                }

                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener historial de festivos intercambiados del empleado {EmpleadoId}", empleadoId);
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>
        /// Aprobar o rechazar una solicitud de intercambio de festivo (solo jefes de área)
        /// </summary>
        /// <param name="request">Datos de aprobación/rechazo</param>
        /// <returns>Resultado de la aprobación</returns>
        [HttpPost("aprobar")]
        [Authorize(Roles = "JefeArea,Jefe De Area,SuperUsuario")]
        public async Task<IActionResult> AprobarRechazarSolicitud([FromBody] AprobarFestivoTrabajadoRequest request)
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
                    "Usuario {UsuarioId} {Accion} solicitud de festivo {SolicitudId}",
                    usuarioId, request.Aprobada ? "aprobando" : "rechazando", request.SolicitudId);

                var response = await _festivoService.AprobarRechazarSolicitudAsync(request, usuarioId);

                if (!response.Success)
                {
                    return BadRequest(response);
                }

                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al aprobar/rechazar solicitud de festivo trabajado");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>
        /// Consultar solicitudes de intercambio de festivos con filtros opcionales
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

                var request = new ConsultaSolicitudesFestivoRequest
                {
                    Estado = estado,
                    EmpleadoId = empleadoId,
                    AreaId = areaId,
                    FechaDesde = fechaDesde,
                    FechaHasta = fechaHasta
                };

                _logger.LogInformation(
                    "Usuario {UsuarioId} consultando solicitudes de festivos con filtros: Estado={Estado}, EmpleadoId={EmpleadoId}, AreaId={AreaId}",
                    usuarioId, estado, empleadoId, areaId);

                var response = await _festivoService.ConsultarSolicitudesAsync(request, usuarioId);

                if (!response.Success)
                {
                    return BadRequest(response);
                }

                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al consultar solicitudes de festivos trabajados");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>
        /// Obtener solicitudes de festivos creadas por el usuario autenticado
        /// (típicamente delegado sindical o jefe de área).
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

                var request = new ConsultaSolicitudesFestivoRequest
                {
                    SolicitadoPorId = usuarioId
                };

                if (anio.HasValue)
                {
                    request.FechaDesde = new DateTime(anio.Value, 1, 1);
                    request.FechaHasta = new DateTime(anio.Value, 12, 31, 23, 59, 59);
                }

                _logger.LogInformation("Usuario {UserId} consultando solicitudes de festivos que creó (año: {Anio})",
                    usuarioId, anio);

                var response = await _festivoService.ConsultarSolicitudesAsync(request, usuarioId);

                if (!response.Success)
                {
                    return BadRequest(response);
                }

                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener solicitudes de festivos creadas por el usuario");
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

                // NO se pasa JefeAreaId aquí. Ese filtro es un match estricto contra
                // el JefeAreaId clavado en cada solicitud y ocultaría las de la(s)
                // otra(s) área(s) del jefe cuando la solicitud quedó clavada a un
                // compañero (multi-jefes por área). Dejamos que ConsultarSolicitudes
                // aplique el scope de áreas visibles.
                var request = new ConsultaSolicitudesFestivoRequest
                {
                    Estado = "Pendiente"
                };

                _logger.LogInformation("Jefe {UsuarioId} consultando sus solicitudes pendientes de festivos", usuarioId);

                var response = await _festivoService.ConsultarSolicitudesAsync(request, usuarioId);

                if (!response.Success)
                {
                    return BadRequest(response);
                }

                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener solicitudes pendientes de festivos");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>
        /// Obtener festivos trabajados por empleado usando su nómina
        /// </summary>
        /// <param name="nomina">Número de nómina del empleado</param>
        /// <param name="anio">Año de los festivos (opcional)</param>
        /// <returns>Lista de festivos trabajados del empleado</returns>
        [HttpGet("por-nomina/{nomina}")]
        public async Task<IActionResult> ConsultarFestivosPorNomina(
            [FromRoute] int nomina,
            [FromQuery] int? anio = null)
        {
            try
            {
                var request = new ConsultaFestivosTrabajadosRequest
                {
                    Nomina = nomina,
                    Anio = anio,
                    SoloDisponibles = false // Mostrar todos
                };

                _logger.LogInformation(
                    "Consultando festivos trabajados para nómina {Nomina}, año {Anio}",
                    nomina, anio);

                var response = await _festivoService.ConsultarFestivosTrabajadosAsync(request);

                if (!response.Success)
                {
                    return BadRequest(response);
                }

                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al consultar festivos trabajados para nómina {Nomina}", nomina);
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }
    }
}