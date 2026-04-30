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
    [Route("api/permisos-incapacidades")]
    [Authorize]
    public class PermisosIncapacidadesController : ControllerBase
    {
        private readonly PermisosIncapacidadesService _permisosService;
        private readonly ILogger<PermisosIncapacidadesController> _logger;

        public PermisosIncapacidadesController(
            PermisosIncapacidadesService permisosService,
            ILogger<PermisosIncapacidadesController> logger)
        {
            _permisosService = permisosService;
            _logger = logger;
        }

        /// <summary>
        /// Obtiene el cat�logo de tipos de permisos e incapacidades disponibles
        /// </summary>
        [HttpGet("catalogo")]
        public IActionResult ObtenerCatalogo()
        {
            try
            {
                var catalogo = _permisosService.ObtenerCatalogoPermisos();
                return Ok(new ApiResponse<CatalogoPermisosResponse>(true, catalogo, null));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener cat�logo de permisos");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>
        /// Crea un nuevo registro de permiso o incapacidad
        /// </summary>
        [HttpPost("crear")]
        [Authorize(Roles = "SuperUsuario,Jefe De Area,Lider De Grupo,Ingeniero Industrial,Delegado Sindical")]
        public async Task<IActionResult> CrearPermiso([FromBody] CrearPermisoIncapacidadRequest request)
        {
            try
            {
                if (!ModelState.IsValid)
                {
                    var errors = string.Join("; ", ModelState
                        .SelectMany(x => x.Value?.Errors ?? Enumerable.Empty<Microsoft.AspNetCore.Mvc.ModelBinding.ModelError>())
                        .Select(x => x.ErrorMessage));
                    return BadRequest(new ApiResponse<object>(false, null, $"Datos de entrada inv�lidos: {errors}"));
                }

                // Obtener el ID del usuario del token JWT
                var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(userIdClaim) || !int.TryParse(userIdClaim, out var usuarioId))
                {
                    _logger.LogError("No se pudo obtener el ID del usuario del token JWT");
                    return Unauthorized(new ApiResponse<object>(false, null, "No se pudo identificar el usuario"));
                }

                _logger.LogInformation(
                    "Usuario {UsuarioId} creando permiso/incapacidad para n�mina {Nomina}, tipo {ClAbPre}, {Desde} - {Hasta}",
                    usuarioId, request.Nomina, request.ClAbPre, request.FechaInicio, request.FechaFin);

                var response = await _permisosService.CrearPermisoIncapacidadAsync(request, usuarioId);

                if (!response.Success)
                {
                    return BadRequest(response);
                }

                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al crear permiso/incapacidad");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>
        /// Extiende la fecha "Hasta" de un permiso/incapacidad existente.
        /// Activa las nomenclaturas (E, A, M, P, etc.) en el rol semanal en los nuevos d�as.
        /// </summary>
        [HttpPost("extender")]
        [Authorize(Roles = "SuperUsuario,Jefe De Area,Lider De Grupo,Ingeniero Industrial")]
        public async Task<IActionResult> ExtenderPermiso([FromBody] ExtenderPermisoIncapacidadRequest request)
        {
            try
            {
                if (!ModelState.IsValid)
                {
                    var errors = string.Join("; ", ModelState
                        .SelectMany(x => x.Value?.Errors ?? Enumerable.Empty<Microsoft.AspNetCore.Mvc.ModelBinding.ModelError>())
                        .Select(x => x.ErrorMessage));
                    return BadRequest(new ApiResponse<object>(false, null, $"Datos inv�lidos: {errors}"));
                }

                var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(userIdClaim) || !int.TryParse(userIdClaim, out var usuarioId))
                    return Unauthorized(new ApiResponse<object>(false, null, "No se pudo identificar el usuario"));

                var response = await _permisosService.ExtenderPermisoIncapacidadAsync(request, usuarioId);
                if (!response.Success) return BadRequest(response);
                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al extender permiso/incapacidad");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>
        /// Consulta permisos e incapacidades con filtros opcionales
        /// </summary>
        [HttpPost("consultar")]
        public async Task<IActionResult> ConsultarPermisos([FromBody] ConsultarPermisosRequest request)
        {
            try
            {
                if (!ModelState.IsValid)
                {
                    var errors = string.Join("; ", ModelState
                        .SelectMany(x => x.Value?.Errors ?? Enumerable.Empty<Microsoft.AspNetCore.Mvc.ModelBinding.ModelError>())
                        .Select(x => x.ErrorMessage));
                    return BadRequest(new ApiResponse<object>(false, null, $"Datos de entrada inv�lidos: {errors}"));
                }

                _logger.LogInformation(
                    "Consultando permisos/incapacidades. N�mina: {Nomina}, EmpleadoId: {EmpleadoId}, Rango: {Desde} - {Hasta}",
                    request.Nomina, request.EmpleadoId, request.FechaInicio, request.FechaFin);

                var response = await _permisosService.ConsultarPermisosAsync(request);

                if (!response.Success)
                {
                    return BadRequest(response);
                }

                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al consultar permisos/incapacidades");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>
        /// Consulta permisos de un empleado espec�fico por n�mina
        /// </summary>
        [HttpGet("empleado/{nomina}")]
        public async Task<IActionResult> ObtenerPermisosPorNomina(
            [FromRoute] int nomina,
            [FromQuery] string? fechaInicio = null,
            [FromQuery] string? fechaFin = null)
        {
            try
            {
                var request = new ConsultarPermisosRequest
                {
                    Nomina = nomina
                };

                if (!string.IsNullOrEmpty(fechaInicio) && DateOnly.TryParse(fechaInicio, out var inicio))
                {
                    request.FechaInicio = inicio;
                }

                if (!string.IsNullOrEmpty(fechaFin) && DateOnly.TryParse(fechaFin, out var fin))
                {
                    request.FechaFin = fin;
                }

                var response = await _permisosService.ConsultarPermisosAsync(request);

                if (!response.Success)
                {
                    return BadRequest(response);
                }

                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener permisos de n�mina {Nomina}", nomina);
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>
        /// Elimina un permiso o incapacidad (solo registros manuales)
        /// </summary>
        [HttpDelete("eliminar")]
        [Authorize(Roles = "SuperUsuario,Jefe De Area,Lider De Grupo,Ingeniero Industrial")]
        public async Task<IActionResult> EliminarPermiso([FromBody] EliminarPermisoRequest request)
        {
            try
            {
                if (!ModelState.IsValid)
                {
                    var errors = string.Join("; ", ModelState
                        .SelectMany(x => x.Value?.Errors ?? Enumerable.Empty<Microsoft.AspNetCore.Mvc.ModelBinding.ModelError>())
                        .Select(x => x.ErrorMessage));
                    return BadRequest(new ApiResponse<object>(false, null, $"Datos de entrada inv�lidos: {errors}"));
                }

                // Obtener el ID del usuario del token JWT
                var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(userIdClaim) || !int.TryParse(userIdClaim, out var usuarioId))
                {
                    _logger.LogError("No se pudo obtener el ID del usuario del token JWT");
                    return Unauthorized(new ApiResponse<object>(false, null, "No se pudo identificar el usuario"));
                }

                _logger.LogInformation(
                    "Usuario {UsuarioId} eliminando permiso/incapacidad para n�mina {Nomina}, {Desde} - {Hasta}, tipo {ClAbPre}",
                    usuarioId, request.Nomina, request.Desde, request.Hasta, request.ClAbPre);

                var response = await _permisosService.EliminarPermisoAsync(request, usuarioId);

                if (!response.Success)
                {
                    return BadRequest(response);
                }

                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al eliminar permiso/incapacidad");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>
        /// Obtiene estad�sticas de permisos e incapacidades de un periodo
        /// </summary>
        [HttpGet("estadisticas")]
        [Authorize(Roles = "SuperUsuario,Jefe De Area,Ingeniero Industrial")]
        public async Task<IActionResult> ObtenerEstadisticas(
            [FromQuery] string? fechaInicio = null,
            [FromQuery] string? fechaFin = null,
            [FromQuery] int? areaId = null)
        {
            try
            {
                // Esta funcionalidad se puede implementar despu�s
                // Por ahora retornamos una respuesta b�sica
                return Ok(new ApiResponse<object>(true, new
                {
                    mensaje = "Funcionalidad de estad�sticas en desarrollo"
                }, null));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener estad�sticas");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }
    }
}