using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using System;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using tiempo_libre.Models;
using tiempo_libre.Services;
using tiempo_libre.DTOs;

namespace tiempo_libre.Controllers
{
    [ApiController]
    [Route("api/configuracion-vacaciones")]
    [Authorize]
    public class ConfiguracionVacacionesController : ControllerBase
    {
        private readonly ConfiguracionVacacionesService _configuracionService;
        private readonly ILogger<ConfiguracionVacacionesController> _logger;

        public ConfiguracionVacacionesController(
            ConfiguracionVacacionesService configuracionService, 
            ILogger<ConfiguracionVacacionesController> logger)
        {
            _configuracionService = configuracionService;
            _logger = logger;
        }

        /// <summary>
        /// Obtener la configuración actual del sistema de vacaciones
        /// </summary>
        [HttpGet]
        public async Task<IActionResult> ObtenerConfiguracion()
        {
            try
            {
                var response = await _configuracionService.ObtenerConfiguracionActualAsync();
                
                if (!response.Success)
                    return BadRequest(response);

                var configResponse = new ConfiguracionVacacionesResponse
                {
                    Id = response.Data.Id,
                    PorcentajeAusenciaMaximo = response.Data.PorcentajeAusenciaMaximo,
                    PeriodoActual = response.Data.PeriodoActual,
                    AnioVigente = response.Data.AnioVigente,
                    AnioProgramacionAnual = response.Data.AnioProgramacionAnual,
                    CreatedAt = response.Data.CreatedAt,
                    UpdatedAt = response.Data.UpdatedAt,
                    UpdatedByUser = null
                };

                return Ok(new ApiResponse<ConfiguracionVacacionesResponse>(true, configResponse, null));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener configuración de vacaciones");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>
        /// Actualizar la configuración del sistema de vacaciones
        /// </summary>
        [HttpPut]
        [Authorize(Roles = "Super Usuario,SuperUsuario,Ingeniero Industrial")]
        public async Task<IActionResult> ActualizarConfiguracion([FromBody] ConfiguracionVacacionesRequest request)
        {
            try
            {
                if (!ModelState.IsValid)
                {
                    var errors = string.Join("; ", ModelState
                        .SelectMany(x => x.Value.Errors)
                        .Select(x => x.ErrorMessage));
                    return BadRequest(new ApiResponse<object>(false, null, $"Datos inválidos: {errors}"));
                }

                var nuevaConfig = new ConfiguracionVacaciones
                {
                    PorcentajeAusenciaMaximo = request.PorcentajeAusenciaMaximo,
                    PeriodoActual = request.PeriodoActual,
                    AnioVigente = request.AnioVigente,
                    AnioProgramacionAnual = request.AnioProgramacionAnual
                };

                var response = await _configuracionService.ActualizarConfiguracionAsync(nuevaConfig);
                
                if (!response.Success)
                    return BadRequest(response);

                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al actualizar configuración de vacaciones");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>
        /// Cambiar el período actual del sistema (ProgramacionAnual, Reprogramacion, Cerrado)
        /// </summary>
        [HttpPost("cambiar-periodo")]
        [Authorize(Roles = "Super Usuario,SuperUsuario,Ingeniero Industrial")]
        public async Task<IActionResult> CambiarPeriodo([FromBody] CambioPeriodoRequest request)
        {
            try
            {
                if (!ModelState.IsValid)
                {
                    var errors = string.Join("; ", ModelState
                        .SelectMany(x => x.Value.Errors)
                        .Select(x => x.ErrorMessage));
                    return BadRequest(new ApiResponse<object>(false, null, $"Datos inválidos: {errors}"));
                }

                var response = await _configuracionService.CambiarPeriodoAsync(request.NuevoPeriodo);
                
                if (!response.Success)
                    return BadRequest(response);

                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al cambiar período del sistema");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>
        /// Obtener excepciones de porcentaje por grupo/fecha
        /// </summary>
        [HttpGet("excepciones")]
        [Authorize(Roles = "Super Usuario,SuperUsuario,Jefe De Area,Ingeniero Industrial")]
        public async Task<IActionResult> ObtenerExcepciones([FromQuery] ConsultaExcepcionesRequest request)
        {
            try
            {
                var response = await _configuracionService.ObtenerExcepcionesPorcentajeAsync(
                    request.GrupoId, request.FechaInicio, request.FechaFin);
                
                if (!response.Success)
                    return BadRequest(response);

                var excepcionesResponse = response.Data.Select(e => new ExcepcionPorcentajeResponse
                {
                    Id = e.Id,
                    GrupoId = e.GrupoId,
                    NombreGrupo = e.Grupo?.IdentificadorSAP ?? $"Grupo {e.GrupoId}",
                    NombreArea = e.Grupo?.Area?.NombreGeneral ?? "Sin área",
                    Fecha = e.Fecha,
                    PorcentajeMaximoPermitido = e.PorcentajeMaximoPermitido,
                    Motivo = e.Motivo,
                    CreatedAt = e.CreatedAt,
                    CreatedByUser = "Sistema",
                    UpdatedAt = e.UpdatedAt,
                    UpdatedByUser = null
                }).ToList();

                return Ok(new ApiResponse<List<ExcepcionPorcentajeResponse>>(true, excepcionesResponse, null));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener excepciones de porcentaje");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>
        /// Crear una excepción de porcentaje para un grupo y fecha específicos
        /// </summary>
        [HttpPost("excepciones")]
        [Authorize(Roles = "Super Usuario,SuperUsuario,Jefe De Area,Ingeniero Industrial")]
        public async Task<IActionResult> CrearExcepcion([FromBody] ExcepcionPorcentajeRequest request)
        {
            try
            {
                if (!ModelState.IsValid)
                {
                    var errors = string.Join("; ", ModelState
                        .SelectMany(x => x.Value.Errors)
                        .Select(x => x.ErrorMessage));
                    return BadRequest(new ApiResponse<object>(false, null, $"Datos inválidos: {errors}"));
                }

                var excepcion = new ExcepcionesPorcentaje
                {
                    GrupoId = request.GrupoId,
                    Fecha = request.Fecha,
                    PorcentajeMaximoPermitido = request.PorcentajeMaximoPermitido,
                    Motivo = request.Motivo
                };

                var response = await _configuracionService.CrearExcepcionPorcentajeAsync(excepcion);
                
                if (!response.Success)
                    return BadRequest(response);

                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al crear excepción de porcentaje");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>
        /// Actualizar una excepción de porcentaje existente
        /// </summary>
        [HttpPut("excepciones/{excepcionId}")]
        [Authorize(Roles = "Super Usuario,SuperUsuario,Jefe De Area,Ingeniero Industrial")]
        public async Task<IActionResult> ActualizarExcepcion(int excepcionId, [FromBody] ExcepcionPorcentajeRequest request)
        {
            try
            {
                if (!ModelState.IsValid)
                {
                    var errors = string.Join("; ", ModelState
                        .SelectMany(x => x.Value.Errors)
                        .Select(x => x.ErrorMessage));
                    return BadRequest(new ApiResponse<object>(false, null, $"Datos inválidos: {errors}"));
                }

                var datosActualizados = new ExcepcionesPorcentaje
                {
                    PorcentajeMaximoPermitido = request.PorcentajeMaximoPermitido,
                    Motivo = request.Motivo
                };

                var response = await _configuracionService.ActualizarExcepcionPorcentajeAsync(excepcionId, datosActualizados);
                
                if (!response.Success)
                {
                    if (response.ErrorMsg.Contains("no encontrada"))
                        return NotFound(response);
                    return BadRequest(response);
                }

                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al actualizar excepción de porcentaje {ExcepcionId}", excepcionId);
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>
        /// Eliminar una excepción de porcentaje
        /// </summary>
        [HttpDelete("excepciones/{excepcionId}")]
        [Authorize(Roles = "Super Usuario,SuperUsuario,Ingeniero Industrial")]
        public async Task<IActionResult> EliminarExcepcion(int excepcionId)
        {
            try
            {
                var response = await _configuracionService.EliminarExcepcionPorcentajeAsync(excepcionId);
                
                if (!response.Success)
                {
                    if (response.ErrorMsg.Contains("no encontrada"))
                        return NotFound(response);
                    return BadRequest(response);
                }

                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al eliminar excepción de porcentaje {ExcepcionId}", excepcionId);
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        #region Endpoints para ExcepcionesManning

        /// <summary>
        /// Obtener excepciones de manning por área/año/mes
        /// </summary>
        // Lectura abierta a jefes/gerentes/RH: sus vistas (roles semanales,
        // calendario) necesitan el manning efectivo del mes. Sin esto reciben
        // 403 silencioso y caen al manning base viejo, por lo que "mover el
        // manning" desde Industrial no se refleja en sus pantallas.
        // POST/PUT/DELETE siguen restringidos a SuperUsuario/Industrial.
        [HttpGet("excepciones-manning")]
        [Authorize(Roles = "Super Usuario,SuperUsuario,Ingeniero Industrial,Jefe De Area,Lider De Grupo,Gerente BT,RH")]
        public async Task<IActionResult> ObtenerExcepcionesManning([FromQuery] ConsultaExcepcionesManningRequest request)
        {
            try
            {
                var response = await _configuracionService.ObtenerExcepcionesManningAsync(
                    request.AreaId, request.Anio, request.Mes, request.SoloActivas ?? true);

                if (!response.Success)
                    return BadRequest(response);

                var excepcionesResponse = response.Data.Select(e =>
                {
                    var mesNombre = System.Globalization.CultureInfo.GetCultureInfo("es-ES")
                        .DateTimeFormat.GetMonthName(e.Mes);

                    return new ExcepcionManningResponse
                    {
                        Id = e.Id,
                        AreaId = e.AreaId,
                        NombreArea = e.Area?.NombreGeneral ?? $"Área {e.AreaId}",
                        Anio = e.Anio,
                        Mes = e.Mes,
                        MesNombre = char.ToUpper(mesNombre[0]) + mesNombre.Substring(1),
                        ManningRequeridoExcepcion = e.ManningRequeridoExcepcion,
                        ManningBase = (int)(e.Area?.Manning ?? 0),
                        Motivo = e.Motivo,
                        Activa = e.Activa,
                        CreatedAt = e.CreatedAt,
                        CreatedByUser = e.CreadoPor?.FullName ?? "Sistema",
                        UpdatedAt = e.UpdatedAt
                    };
                }).ToList();

                return Ok(new ApiResponse<List<ExcepcionManningResponse>>(true, excepcionesResponse, null));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener excepciones de manning");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>
        /// Crear una excepción de manning para un área, año y mes específicos
        /// </summary>
        [HttpPost("excepciones-manning")]
        [Authorize(Roles = "Super Usuario,SuperUsuario,Ingeniero Industrial")]
        public async Task<IActionResult> CrearExcepcionManning([FromBody] ExcepcionManningRequest request)
        {
            try
            {
                if (!ModelState.IsValid)
                {
                    var errors = string.Join("; ", ModelState
                        .SelectMany(x => x.Value.Errors)
                        .Select(x => x.ErrorMessage));
                    return BadRequest(new ApiResponse<object>(false, null, $"Datos inválidos: {errors}"));
                }

                var userIdClaim = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(userIdClaim) || !int.TryParse(userIdClaim, out var usuarioId))
                {
                    _logger.LogError("No se pudo obtener el ID del usuario del token JWT");
                    return Unauthorized(new ApiResponse<object>(false, null, "No se pudo identificar el usuario"));
                }

                var excepcion = new ExcepcionesManning
                {
                    AreaId = request.AreaId,
                    Anio = request.Anio,
                    Mes = request.Mes,
                    ManningRequeridoExcepcion = request.ManningRequeridoExcepcion,
                    Motivo = request.Motivo
                };

                var response = await _configuracionService.CrearExcepcionManningAsync(excepcion, usuarioId);

                if (!response.Success)
                    return BadRequest(response);

                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al crear excepción de manning");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>
        /// Actualizar una excepción de manning existente
        /// </summary>
        [HttpPut("excepciones-manning/{excepcionId}")]
        [Authorize(Roles = "Super Usuario,SuperUsuario,Ingeniero Industrial")]
        public async Task<IActionResult> ActualizarExcepcionManning(int excepcionId, [FromBody] ExcepcionManningRequest request)
        {
            try
            {
                if (!ModelState.IsValid)
                {
                    var errors = string.Join("; ", ModelState
                        .SelectMany(x => x.Value.Errors)
                        .Select(x => x.ErrorMessage));
                    return BadRequest(new ApiResponse<object>(false, null, $"Datos inválidos: {errors}"));
                }

                var datosActualizados = new ExcepcionesManning
                {
                    ManningRequeridoExcepcion = request.ManningRequeridoExcepcion,
                    Motivo = request.Motivo
                };

                var response = await _configuracionService.ActualizarExcepcionManningAsync(excepcionId, datosActualizados);

                if (!response.Success)
                {
                    if (response.ErrorMsg.Contains("no encontrada"))
                        return NotFound(response);
                    return BadRequest(response);
                }

                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al actualizar excepción de manning {ExcepcionId}", excepcionId);
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>
        /// Eliminar (desactivar) una excepción de manning
        /// </summary>
        [HttpDelete("excepciones-manning/{excepcionId}")]
        [Authorize(Roles = "Super Usuario,SuperUsuario,Ingeniero Industrial")]
        public async Task<IActionResult> EliminarExcepcionManning(int excepcionId)
        {
            try
            {
                var response = await _configuracionService.EliminarExcepcionManningAsync(excepcionId);

                if (!response.Success)
                {
                    if (response.ErrorMsg.Contains("no encontrada"))
                        return NotFound(response);
                    return BadRequest(response);
                }

                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al eliminar excepción de manning {ExcepcionId}", excepcionId);
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        #endregion
    }
}
