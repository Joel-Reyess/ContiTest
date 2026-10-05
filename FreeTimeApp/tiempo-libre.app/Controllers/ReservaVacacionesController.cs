using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using System;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using tiempo_libre.Services;
using tiempo_libre.Models;
using tiempo_libre.DTOs;

namespace tiempo_libre.Controllers
{
    [ApiController]
    [Route("api/vacaciones")]
    [Authorize]
    public class ReservaVacacionesController : ControllerBase
    {
        private readonly ReservaVacacionesService _reservaService;
        private readonly ILogger<ReservaVacacionesController> _logger;

        public ReservaVacacionesController(
            ReservaVacacionesService reservaService,
            ILogger<ReservaVacacionesController> logger)
        {
            _reservaService = reservaService;
            _logger = logger;
        }

        /// <summary>
        /// Obtener disponibilidad de días para reservar vacaciones por año
        /// </summary>
        /// <param name="anio">Año a consultar</param>
        /// <param name="grupoId">ID del grupo (requerido)</param>
        /// <returns>Resumen de días disponibles por cada mes del año para el grupo específico</returns>
        [HttpGet("disponibilidad")]
        public async Task<IActionResult> ObtenerDisponibilidadPorAnio(
            [FromQuery] int anio,
            [FromQuery] int grupoId)
        {
            try
            {
                if (anio < 2020 || anio > 2030)
                {
                    return BadRequest(new ApiResponse<object>(false, null, "Año debe estar entre 2020 y 2030"));
                }

                if (grupoId <= 0)
                {
                    return BadRequest(new ApiResponse<object>(false, null, "Debe especificar un ID de grupo válido"));
                }

                _logger.LogInformation("Consultando disponibilidad para año: {Anio}, Grupo: {GrupoId}",
                    anio, grupoId);

                var request = new DisponibilidadVacacionesRequest
                {
                    Anio = anio,
                    GrupoId = grupoId
                };

                var response = await _reservaService.ObtenerDisponibilidadPorAnioAsync(request);

                if (!response.Success)
                {
                    if (response.ErrorMsg?.Contains("No se encontró el grupo") == true)
                        return NotFound(response);
                    return BadRequest(response);
                }

                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener disponibilidad de vacaciones para año: {Anio}, grupo: {GrupoId}",
                    anio, grupoId);
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>
        /// Validar si un día específico está disponible para un empleado
        /// </summary>
        /// <param name="empleadoId">ID del empleado</param>
        /// <param name="fecha">Fecha a validar</param>
        /// <returns>Información detallada sobre la disponibilidad del día</returns>
        [HttpGet("validar-disponibilidad/{empleadoId}")]
        public async Task<IActionResult> ValidarDisponibilidadDia(
            int empleadoId,
            [FromQuery] DateOnly fecha)
        {
            try
            {
                _logger.LogInformation("Validando disponibilidad para empleado {EmpleadoId} en fecha {Fecha}",
                    empleadoId, fecha);

                var response = await _reservaService.ValidarDisponibilidadDiaAsync(empleadoId, fecha);

                if (!response.Success)
                {
                    if (response.ErrorMsg?.Contains("no encontrado") == true)
                        return NotFound(response);
                    return BadRequest(response);
                }

                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al validar disponibilidad para empleado {EmpleadoId} en fecha {Fecha}",
                    empleadoId, fecha);
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>
        /// Obtener el estado actual del periodo de vacaciones
        /// </summary>
        /// <returns>Información sobre el periodo actual y configuración</returns>
        [HttpGet("estado-periodo")]
        public async Task<IActionResult> ObtenerEstadoPeriodo()
        {
            try
            {
                var response = await _reservaService.ObtenerEstadoPeriodoAsync();

                if (!response.Success)
                    return BadRequest(response);

                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener estado del periodo de vacaciones");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>
        /// ¿Le toca capturar al usuario que llama, para ese año? Misma regla que
        /// reservar-anual (bloque abierto y orden por antigüedad dentro del
        /// bloque). La pantalla de captura la consulta para no dejar empezar a
        /// elegir días fuera de turno.
        /// </summary>
        [HttpGet("mi-turno-captura")]
        public async Task<IActionResult> ConsultarMiTurnoDeCaptura([FromQuery] int anio)
        {
            try
            {
                var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (!int.TryParse(userIdClaim, out var empleadoId))
                    return Unauthorized(new ApiResponse<object>(false, null, "No se pudo identificar el usuario"));

                var response = await _reservaService.ConsultarTurnoDeCapturaAsync(empleadoId, anio);
                if (!response.Success)
                    return BadRequest(response);

                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al consultar el turno de captura para {Anio}", anio);
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>
        /// Procesar reserva anual de vacaciones para un empleado sindicalizado
        /// </summary>
        /// <param name="request">Datos de la reserva incluyendo empleado, año y fechas seleccionadas</param>
        /// <returns>Resultado de la reserva con validaciones completas</returns>
        [HttpPost("reservar-anual")]
        public async Task<IActionResult> ProcesarReservaAnual([FromBody] ReservaAnualRequest request)
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

                _logger.LogInformation("Procesando reserva anual para empleado {EmpleadoId}, año {Anio}, {CantidadFechas} fechas",
                    request.EmpleadoId, request.AnioVacaciones, request.FechasSeleccionadas.Count);

                var response = await _reservaService.ProcesarReservaAnualAsync(request);

                if (!response.Success)
                {
                    // Si la respuesta contiene datos (fechas no disponibles), retornar BadRequest con los detalles
                    if (response.Data != null && response.Data.FechasNoDisponibles.Any())
                    {
                        return BadRequest(response);
                    }

                    // Si es un error de validación básica, también BadRequest
                    return BadRequest(response);
                }

                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al procesar reserva anual para empleado {EmpleadoId}",
                    request.EmpleadoId);
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }
    }
}