using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using System;
using System.Linq;
using System.Threading.Tasks;
using System.Security.Claims;
using tiempo_libre.Services;
using tiempo_libre.Models;
using tiempo_libre.DTOs;

namespace tiempo_libre.Controllers
{
    [ApiController]
    [Route("api/bloques-reservacion")]
    [Authorize]
    public class BloquesReservacionController : ControllerBase
    {
        private readonly BloquesReservacionService _bloquesService;
        private readonly EstadosBloquesService _estadosService;
        private readonly ILogger<BloquesReservacionController> _logger;

        public BloquesReservacionController(
            BloquesReservacionService bloquesService,
            EstadosBloquesService estadosService,
            ILogger<BloquesReservacionController> logger)
        {
            _bloquesService = bloquesService;
            _estadosService = estadosService;
            _logger = logger;
        }

        /// <summary>
        /// Genera los bloques de reservación para programación anual de vacaciones
        /// </summary>
        /// <param name="request">Parámetros de generación incluyendo fecha inicio y año objetivo</param>
        /// <returns>Resumen detallado de la generación por grupo</returns>
        [HttpPost("generar")]
        [Authorize(Roles = "SuperUsuario,Administrador")]
        public async Task<IActionResult> GenerarBloques([FromBody] GeneracionBloquesRequest request)
        {
            try
            {
                if (!ModelState.IsValid)
                {
                    var errors = string.Join("; ", ModelState
                        .SelectMany(x => x.Value.Errors)
                        .Select(x => x.ErrorMessage));
                    return BadRequest(new ApiResponse<object>(false, null, $"Datos de entrada inválidos: {errors}"));
                }

                var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(userIdClaim) || !int.TryParse(userIdClaim, out var usuarioId) || usuarioId <= 0)
                {
                    _logger.LogError("No se pudo obtener el ID del usuario del token JWT");
                    return Unauthorized(new ApiResponse<object>(false, null, "No se pudo identificar el usuario"));
                }

                _logger.LogInformation("Usuario {UsuarioId} iniciando generación de bloques para año {Anio}",
                    usuarioId, request.AnioObjetivo);

                var response = await _bloquesService.GenerarBloquesAsync(request, usuarioId);

                if (!response.Success)
                    return BadRequest(response);

                if (request.SoloSimulacion)
                {
                    return Ok(response);
                }

                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al generar bloques de reservación");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>
        /// Aprueba los bloques generados y los hace oficiales para uso
        /// </summary>
        /// <param name="request">IDs de grupos a aprobar y observaciones</param>
        /// <returns>Confirmación de aprobación</returns>
        [HttpPost("aprobar")]
        [Authorize(Roles = "SuperUsuario,Administrador")]
        public async Task<IActionResult> AprobarBloques([FromBody] AprobarBloquesRequest request)
        {
            try
            {
                if (!ModelState.IsValid)
                {
                    var errors = string.Join("; ", ModelState
                        .SelectMany(x => x.Value.Errors)
                        .Select(x => x.ErrorMessage));
                    return BadRequest(new ApiResponse<object>(false, null, $"Datos de entrada inválidos: {errors}"));
                }

                var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(userIdClaim) || !int.TryParse(userIdClaim, out var usuarioId) || usuarioId <= 0)
                {
                    _logger.LogError("No se pudo obtener el ID del usuario del token JWT");
                    return Unauthorized(new ApiResponse<object>(false, null, "No se pudo identificar el usuario"));
                }

                _logger.LogInformation("Usuario {UsuarioId} aprobando bloques para año {Anio}",
                    usuarioId, request.AnioObjetivo);

                var response = await _bloquesService.AprobarBloquesAsync(request, usuarioId);

                if (!response.Success)
                    return BadRequest(response);

                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al aprobar bloques");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>
        /// Cambia un empleado de un bloque a otro (solo para jefes de área)
        /// </summary>
        /// <param name="request">Datos del cambio incluyendo empleado, bloques origen/destino y motivo</param>
        /// <returns>Confirmación del cambio realizado</returns>
        [HttpPost("cambiar-empleado")]
        [Authorize(Roles = "SuperUsuario,Administrador,JefeArea,Jefe De Area")]
        public async Task<IActionResult> CambiarEmpleadeDeBloque([FromBody] CambiarBloqueRequest request)
        {
            try
            {
                if (!ModelState.IsValid)
                {
                    var errors = string.Join("; ", ModelState
                        .SelectMany(x => x.Value.Errors)
                        .Select(x => x.ErrorMessage));
                    return BadRequest(new ApiResponse<object>(false, null, $"Datos de entrada inválidos: {errors}"));
                }

                var usuarioId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "0");

                _logger.LogInformation("Usuario {UsuarioId} cambiando empleado {EmpleadoId} de bloque {OrigenId} a {DestinoId}",
                    usuarioId, request.EmpleadoId, request.BloqueOrigenId, request.BloqueDestinoId);

                var response = await _bloquesService.CambiarEmpleadoDeBloqueAsync(request, usuarioId);

                if (!response.Success)
                    return BadRequest(response);

                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al cambiar empleado de bloque");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>
        /// Salta el turno de un empleado dentro de su bloque: desbloquea al
        /// siguiente por antigüedad sin quitarle al saltado el derecho de
        /// capturar mientras el bloque siga abierto (24 h). Si no captura,
        /// el proceso de estados lo manda al bloque cola.
        /// </summary>
        [HttpPost("saltar-turno")]
        [Authorize(Roles = "SuperUsuario,Administrador,JefeArea,Jefe De Area")]
        public async Task<IActionResult> SaltarTurno([FromBody] SaltarTurnoRequest request)
        {
            try
            {
                if (!ModelState.IsValid)
                {
                    var errors = string.Join("; ", ModelState
                        .SelectMany(x => x.Value.Errors)
                        .Select(x => x.ErrorMessage));
                    return BadRequest(new ApiResponse<object>(false, null, $"Datos de entrada inválidos: {errors}"));
                }

                var usuarioId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "0");

                _logger.LogInformation("Usuario {UsuarioId} salta turno del empleado {EmpleadoId} en bloque {BloqueId}",
                    usuarioId, request.EmpleadoId, request.BloqueId);

                var response = await _bloquesService.SaltarTurnoAsync(request, usuarioId);

                if (!response.Success)
                    return BadRequest(response);

                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al saltar turno");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>
        /// Consulta bloques de reservación con filtros opcionales
        /// </summary>
        /// <param name="anioObjetivo">Año a consultar</param>
        /// <param name="grupoId">ID del grupo (opcional)</param>
        /// <param name="areaId">ID del área (opcional)</param>
        /// <param name="estado">Estado de los bloques (opcional): Activo, Completado, Cancelado</param>
        /// <param name="soloConEspacio">Si true, solo muestra bloques con espacio disponible</param>
        /// <returns>Lista de bloques que coinciden con los filtros</returns>
        [HttpGet]
        public async Task<IActionResult> ConsultarBloques(
            [FromQuery] int? anioObjetivo = null,
            [FromQuery] int? grupoId = null,
            [FromQuery] int? areaId = null,
            [FromQuery] string? estado = null,
            [FromQuery] bool? soloConEspacio = null)
        {
            try
            {
                var request = new ConsultaBloquesRequest
                {
                    AnioObjetivo = anioObjetivo,
                    GrupoId = grupoId,
                    AreaId = areaId,
                    Estado = estado,
                    SoloBloquesConEspacio = soloConEspacio
                };

                _logger.LogInformation("Consultando bloques con filtros: Año={Anio}, Grupo={GrupoId}, Area={AreaId}",
                    anioObjetivo, grupoId, areaId);

                var response = await _bloquesService.ConsultarBloquesAsync(request);

                if (!response.Success)
                    return BadRequest(response);

                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al consultar bloques");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>
        /// Obtiene los bloques de un empleado específico
        /// </summary>
        /// <param name="empleadoId">ID del empleado</param>
        /// <param name="anioObjetivo">Año a consultar (opcional, por defecto año actual + 1)</param>
        /// <returns>Bloques asignados al empleado</returns>
        [HttpGet("empleado/{empleadoId}")]
        public async Task<IActionResult> ObtenerBloquesEmpleado(
            [FromRoute] int empleadoId,
            [FromQuery] int? anioObjetivo = null)
        {
            try
            {
                var anio = anioObjetivo ?? DateTime.Now.Year + 1;

                var request = new ConsultaBloquesRequest
                {
                    AnioObjetivo = anio
                };

                var response = await _bloquesService.ConsultarBloquesAsync(request);

                if (!response.Success)
                    return BadRequest(response);

                // Filtrar solo los bloques donde está asignado el empleado
                var bloquesEmpleado = response.Data.Bloques
                    .Where(b => b.EmpleadosAsignados.Any(e => e.EmpleadoId == empleadoId))
                    .ToList();

                var resultado = new ConsultaBloquesResponse
                {
                    TotalBloques = bloquesEmpleado.Count,
                    Bloques = bloquesEmpleado
                };

                return Ok(new ApiResponse<ConsultaBloquesResponse>(true, resultado, null));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener bloques del empleado {EmpleadoId}", empleadoId);
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>
        /// Actualiza automáticamente los estados de bloques y asignaciones basado en fechas
        /// </summary>
        /// <returns>Confirmación de actualización</returns>
        [HttpPost("actualizar-estados")]
        [Authorize(Roles = "SuperUsuario,Administrador")]
        public async Task<IActionResult> ActualizarEstados()
        {
            try
            {
                _logger.LogInformation("Usuario ejecutando actualización manual de estados de bloques");

                await _estadosService.ActualizarEstadosAutomaticamenteAsync();

                return Ok(new ApiResponse<object>(true, new { mensaje = "Estados actualizados correctamente" }, null));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al actualizar estados de bloques");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>
        /// Obtiene estadísticas de estados de bloques por año
        /// </summary>
        /// <param name="anioObjetivo">Año a consultar (opcional, por defecto próximo año)</param>
        /// <returns>Estadísticas de bloques por estado</returns>
        [HttpGet("estadisticas")]
        [Authorize(Roles = "SuperUsuario,Administrador")]
        public async Task<IActionResult> ObtenerEstadisticas(
            [FromQuery] int? anioObjetivo = null,
            [FromQuery] int? grupoId = null,
            [FromQuery] int? areaId = null)
        {
            try
            {
                var anio = anioObjetivo ?? DateTime.Now.Year + 1;

                _logger.LogInformation("Consultando estadísticas de bloques para año {Anio}, grupo {GrupoId}, área {AreaId}",
                    anio, grupoId, areaId);

                var estadisticas = await _estadosService.ObtenerEstadisticasAsync(anio, grupoId, areaId);

                return Ok(new ApiResponse<Services.EstadisticasBloquesDto>(true, estadisticas, null));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener estadísticas de bloques");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>
        /// Consulta qué bloque está en curso y cuál es el siguiente para una fecha específica
        /// </summary>
        /// <param name="fecha">Fecha a consultar (requerida)</param>
        /// <param name="areaId">ID del área para filtrar (opcional)</param>
        /// <param name="grupoId">ID del grupo para filtrar (opcional)</param>
        /// <param name="anioObjetivo">Año objetivo (opcional, por defecto el año de la fecha)</param>
        /// <returns>Información de bloques actual y siguiente por grupo</returns>
        [HttpGet("por-fecha")]
        public async Task<IActionResult> ConsultarBloquesPorFecha(
            [FromQuery] DateTime fecha,
            [FromQuery] int? areaId = null,
            [FromQuery] int? grupoId = null,
            [FromQuery] int? anioObjetivo = null)
        {
            try
            {
                var request = new ConsultaBloquesPorFechaRequest
                {
                    Fecha = fecha,
                    AreaId = areaId,
                    GrupoId = grupoId,
                    AnioObjetivo = anioObjetivo
                };

                if (!ModelState.IsValid)
                {
                    var errors = string.Join("; ", ModelState
                        .SelectMany(x => x.Value.Errors)
                        .Select(x => x.ErrorMessage));
                    return BadRequest(new ApiResponse<object>(false, null, $"Datos de entrada inválidos: {errors}"));
                }

                _logger.LogInformation("Consultando bloques para fecha {Fecha}, área {AreaId}, grupo {GrupoId}",
                    fecha, areaId, grupoId);

                var response = await _bloquesService.ConsultarBloquesPorFechaAsync(request);

                if (!response.Success)
                    return BadRequest(response);

                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al consultar bloques por fecha");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>
        /// Elimina los bloques de reservación generados para un año y grupos específicos
        /// </summary>
        /// <param name="anioObjetivo">Año de los bloques a eliminar</param>
        /// <param name="grupoIds">IDs de grupos específicos (opcional, si no se especifica elimina todos)</param>
        /// <returns>Resultado de la eliminación</returns>
        [HttpDelete("eliminar")]
        [Authorize(Roles = "SuperUsuario,Administrador")]
        public async Task<IActionResult> EliminarBloques(
            [FromQuery] int anioObjetivo,
            [FromQuery] List<int>? grupoIds = null)
        {
            try
            {
                if (anioObjetivo < 2020 || anioObjetivo > 2050)
                {
                    return BadRequest(new ApiResponse<object>(false, null, "El año debe estar entre 2020 y 2050"));
                }

                var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(userIdClaim) || !int.TryParse(userIdClaim, out var usuarioId) || usuarioId <= 0)
                {
                    _logger.LogError("No se pudo obtener el ID del usuario del token JWT");
                    return Unauthorized(new ApiResponse<object>(false, null, "No se pudo identificar el usuario"));
                }

                _logger.LogWarning("Usuario {UsuarioId} eliminando bloques de reservación para año {Anio}",
                    usuarioId, anioObjetivo);

                var response = await _bloquesService.EliminarBloquesAsync(anioObjetivo, grupoIds, usuarioId);

                if (!response.Success)
                    return BadRequest(response);

                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al eliminar bloques de reservación");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>
        /// Obtiene un reporte de todos los empleados que no respondieron (estado NoRespondio)
        /// </summary>
        /// <param name="anioObjetivo">Año a consultar</param>
        /// <param name="areaId">ID del área (opcional)</param>
        /// <param name="grupoId">ID del grupo (opcional)</param>
        /// <returns>Lista de empleados con estado NoRespondio</returns>
        [HttpGet("empleados-no-respondieron")]
        public async Task<IActionResult> ObtenerEmpleadosNoRespondieron(
            [FromQuery] int anioObjetivo,
            [FromQuery] int? areaId = null,
            [FromQuery] int? grupoId = null)
        {
            try
            {
                _logger.LogInformation("Consultando empleados que no respondieron para año {Anio}", anioObjetivo);

                var response = await _bloquesService.ObtenerEmpleadosNoRespondieronAsync(anioObjetivo, areaId, grupoId);

                if (!response.Success)
                    return BadRequest(response);

                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener reporte de empleados que no respondieron");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }
    }
}