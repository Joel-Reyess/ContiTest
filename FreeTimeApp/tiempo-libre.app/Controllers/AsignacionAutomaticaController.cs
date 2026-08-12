using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using tiempo_libre.DTOs;
using tiempo_libre.Services;
using tiempo_libre.Models;

namespace tiempo_libre.Controllers
{
    [ApiController]
    [Route("api/asignacion-automatica")]
    [Authorize(Roles = "Super Usuario,SuperUsuario,Jefe De Area,Ingeniero Industrial")]
    public class AsignacionAutomaticaController : ControllerBase
    {
        private readonly AsignacionAutomaticaService _asignacionService;
        private readonly ILogger<AsignacionAutomaticaController> _logger;

        public AsignacionAutomaticaController(
            AsignacionAutomaticaService asignacionService,
            ILogger<AsignacionAutomaticaController> logger)
        {
            _asignacionService = asignacionService;
            _logger = logger;
        }

        /// <summary>
        /// Ejecutar asignación automática de vacaciones para empleados sindicalizados
        /// </summary>
        /// <param name="request">Parámetros de la asignación automática</param>
        /// <returns>Resultado detallado de la asignación por empleado</returns>
        [HttpPost("ejecutar")]
        public async Task<IActionResult> EjecutarAsignacionAutomatica(
            [FromBody] AsignacionAutomaticaRequest request,
            CancellationToken ct = default)
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

                _logger.LogInformation("Iniciando asignación automática para año {Anio} por usuario {Usuario}",
                    request.Anio, User.Identity?.Name);

                var response = await _asignacionService.EjecutarAsignacionAutomaticaAsync(request, ct);

                if (!response.Success)
                    return BadRequest(response);

                return Ok(response);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                // El navegador abortó (timeout del cliente): dejar que el pipeline lo
                // registre como request cancelado en lugar de fabricar un 500.
                throw;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al ejecutar asignación automática para año {Anio}", request.Anio);
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>
        /// Simular asignación automática sin guardar en base de datos
        /// </summary>
        /// <param name="request">Parámetros de la simulación</param>
        /// <returns>Resultado simulado de la asignación</returns>
        [HttpPost("simular")]
        [Authorize(Roles = "Super Usuario,SuperUsuario")]
        public async Task<IActionResult> SimularAsignacionAutomatica(
            [FromBody] AsignacionAutomaticaRequest request,
            CancellationToken ct = default)
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

                // Forzar simulación
                request.SoloSimulacion = true;

                _logger.LogInformation("Simulando asignación automática para año {Anio}", request.Anio);

                var response = await _asignacionService.EjecutarAsignacionAutomaticaAsync(request, ct);

                if (!response.Success)
                    return BadRequest(response);

                return Ok(response);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al simular asignación automática para año {Anio}", request.Anio);
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>
        /// Obtener información sobre empleados elegibles para asignación automática
        /// </summary>
        /// <param name="grupoIds">IDs de grupos a consultar (opcional)</param>
        /// <returns>Lista de empleados sindicalizados y sus días correspondientes</returns>
        [HttpGet("empleados-elegibles")]
        public async Task<IActionResult> ObtenerEmpleadosElegibles([FromQuery] List<int>? grupoIds = null)
        {
            try
            {
                // Crear request de simulación para obtener información
                var request = new AsignacionAutomaticaRequest
                {
                    Anio = DateTime.Now.Year,
                    GrupoIds = grupoIds,
                    SoloSimulacion = true
                };

                var response = await _asignacionService.EjecutarAsignacionAutomaticaAsync(request);
                
                if (!response.Success)
                    return BadRequest(response);

                // Extraer solo la información relevante
                var empleadosElegibles = response.Data?.ResultadosPorEmpleado
                    .Select(r => new
                    {
                        r.EmpleadoId,
                        r.NombreCompleto,
                        r.Nomina,
                        r.GrupoId,
                        r.NombreGrupo,
                        r.DiasCorrespondientes,
                        EsElegible = r.DiasCorrespondientes > 0
                    })
                    .ToList();

                return Ok(new ApiResponse<object>(true, empleadosElegibles, 
                    $"Se encontraron {empleadosElegibles?.Count} empleados sindicalizados"));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener empleados elegibles");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>
        /// Obtener resumen de asignación automática para un año específico
        /// </summary>
        /// <param name="anio">Año a consultar</param>
        /// <param name="grupoIds">IDs de grupos específicos (opcional)</param>
        /// <returns>Resumen de la asignación automática del año</returns>
        [HttpGet("resumen/{anio}")]
        public async Task<IActionResult> ObtenerResumenAsignacionAutomatica(
            int anio,
            [FromQuery] List<int>? grupoIds = null)
        {
            try
            {
                if (anio < 2020 || anio > 2050)
                {
                    return BadRequest(new ApiResponse<object>(false, null, "El año debe estar entre 2020 y 2050"));
                }

                _logger.LogInformation("Consultando resumen de asignación automática para año {Anio}", anio);

                var response = await _asignacionService.ObtenerResumenAsignacionAutomaticaAsync(anio, grupoIds);

                if (!response.Success)
                    return BadRequest(response);

                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener resumen de asignación automática para año {Anio}", anio);
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>
        /// Revertir asignación automática de vacaciones para un año específico
        /// </summary>
        /// <param name="anio">Año de las vacaciones a revertir</param>
        /// <param name="grupoIds">IDs de grupos específicos (opcional)</param>
        /// <returns>Resultado de la operación de reversión</returns>
        [HttpDelete("revertir")]
        [Authorize(Roles = "Super Usuario,SuperUsuario")]
        public async Task<IActionResult> RevertirAsignacionAutomatica(
            [FromQuery] int anio,
            [FromQuery] List<int>? grupoIds = null)
        {
            try
            {
                if (anio < 2020 || anio > 2050)
                {
                    return BadRequest(new ApiResponse<object>(false, null, "El año debe estar entre 2020 y 2050"));
                }

                _logger.LogWarning("Usuario {Usuario} está revirtiendo asignación automática para año {Anio}",
                    User.Identity?.Name, anio);

                var response = await _asignacionService.RevertirAsignacionAutomaticaAsync(anio, grupoIds);

                if (!response.Success)
                    return BadRequest(response);

                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al revertir asignación automática para año {Anio}", anio);
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>
        /// Obtener empleados sin asignación automática para un año específico
        /// </summary>
        /// <param name="anio">Año a consultar</param>
        /// <param name="grupoIds">IDs de grupos específicos (opcional)</param>
        /// <param name="areaId">ID del área específica (opcional)</param>
        /// <returns>Lista de empleados sin asignación automática con detalles</returns>
        [HttpGet("empleados-sin-asignacion")]
        public async Task<IActionResult> ObtenerEmpleadosSinAsignacion(
            [FromQuery] int anio,
            [FromQuery] List<int>? grupoIds = null,
            [FromQuery] int? areaId = null)
        {
            try
            {
                if (anio < 2020 || anio > 2050)
                {
                    return BadRequest(new ApiResponse<object>(false, null, "El año debe estar entre 2020 y 2050"));
                }

                _logger.LogInformation("Consultando empleados sin asignación automática para año {Anio}", anio);

                var response = await _asignacionService.ObtenerEmpleadosSinAsignacionAsync(anio, grupoIds, areaId);

                if (!response.Success)
                    return BadRequest(response);

                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener empleados sin asignación para año {Anio}", anio);
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

    }
}
