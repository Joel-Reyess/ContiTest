using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using System;
using System.Linq;
using System.Threading.Tasks;
using tiempo_libre.Models;
using tiempo_libre.Services;
using tiempo_libre.DTOs;

namespace tiempo_libre.Controllers
{
    [ApiController]
    [Route("api/vacaciones")]
    [Authorize]
    public class VacacionesController : ControllerBase
    {
        private readonly FreeTimeDbContext _context;
        private readonly VacacionesService _vacacionesService;
        private readonly AsignacionAutomaticaService _asignacionService;
        private readonly ILogger<VacacionesController> _logger;

        public VacacionesController(
            FreeTimeDbContext context,
            VacacionesService vacacionesService,
            AsignacionAutomaticaService asignacionService,
            ILogger<VacacionesController> logger)
        {
            _context = context;
            _vacacionesService = vacacionesService;
            _asignacionService = asignacionService;
            _logger = logger;
        }

        [HttpGet("por-antiguedad")]
        public IActionResult GetVacacionesPorAntiguedad()
        {
            try
            {
                var reglas = _context.VacacionesPorAntiguedad.ToList();
                var response = new ApiResponse<List<VacacionesPorAntiguedad>>(
                    success: true,
                    data: reglas,
                    errorMsg: null
                );
                return Ok(response);
            }
            catch (Exception ex)
            {
                var response = new ApiResponse<List<VacacionesPorAntiguedad>>(
                    success: false,
                    data: null,
                    errorMsg: $"Error al obtener las reglas de vacaciones por antigüedad: {ex.Message}"
                );
                return StatusCode(500, response);
            }
        }

        /// <summary>
        /// Calcular vacaciones para un empleado específico en un año determinado
        /// </summary>
        [HttpPost("empleado/{empleadoId}")]
        public async Task<IActionResult> CalcularVacacionesEmpleado(
            [FromRoute] int empleadoId,
            [FromBody] VacacionesEmpleadoRequest request)
        {
            try
            {
                if (!ModelState.IsValid)
                {
                    var errors = string.Join("; ", ModelState
                        .SelectMany(x => x.Value.Errors)
                        .Select(x => x.ErrorMessage));
                    return BadRequest(new ApiResponse<VacacionesEmpleadoResponse>(false, null, $"Datos de entrada inválidos: {errors}"));
                }

                var response = await _vacacionesService.CalcularVacacionesPorEmpleadoAsync(empleadoId, request.Anio);
                
                if (!response.Success)
                {
                    if (response.ErrorMsg.Contains("no existe"))
                        return NotFound(response);
                    return BadRequest(response);
                }

                // Agregar descripción detallada
                response.Data.Descripcion = GenerarDescripcionVacaciones(response.Data);
                
                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al calcular vacaciones para empleado {EmpleadoId} en año {Anio}", empleadoId, request.Anio);
                var errorResponse = new ApiResponse<VacacionesEmpleadoResponse>(false, null, $"Error inesperado: {ex.Message}");
                return StatusCode(500, errorResponse);
            }
        }
        /// <summary>
        /// Se eliminan vacaciones
        /// </summary>
        [HttpPost("eliminar-por-fecha")]
        public async Task<IActionResult> EliminarVacacionesPorFecha([FromBody] EliminarVacacionesPorFechaRequest request)
        {
            var result = await _vacacionesService.EliminarVacacionesPorFechaAsync(request.EmpleadoId, request.Fechas);
            return Ok(result);
        }


        /// <summary>
        /// Obtener tabla de vacaciones por años de antigüedad
        /// </summary>
        [HttpGet("tabla-antiguedad")]
        public IActionResult ObtenerTablaVacacionesPorAntiguedad()
        {
            try
            {
                var tablaVacaciones = new List<VacacionesPorAntiguedadResponse>();

                for (int anios = 1; anios <= 10; anios++)
                {
                    var vacaciones = _vacacionesService.CalcularVacacionesPorAntiguedad(anios);
                    tablaVacaciones.Add(new VacacionesPorAntiguedadResponse
                    {
                        AntiguedadEnAnios = anios,
                        DiasEmpresa = vacaciones.DiasEmpresa,
                        DiasAsignadosAutomaticamente = vacaciones.DiasAsignadosAutomaticamente,
                        DiasProgramables = vacaciones.DiasProgramables,
                        TotalDias = vacaciones.TotalDias,
                        Descripcion = GenerarDescripcionPorAntiguedad(anios, vacaciones)
                    });
                }

                var response = new ApiResponse<List<VacacionesPorAntiguedadResponse>>(true, tablaVacaciones, null);
                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener tabla de vacaciones por antigüedad");
                var errorResponse = new ApiResponse<List<VacacionesPorAntiguedadResponse>>(false, null, $"Error inesperado: {ex.Message}");
                return StatusCode(500, errorResponse);
            }
        }

        private string GenerarDescripcionVacaciones(VacacionesEmpleadoResponse vacaciones)
        {
            var descripcion = $"Empleado con {vacaciones.AntiguedadEnAnios} años de antigüedad en {vacaciones.AnioConsulta}. ";
            descripcion += $"Total: {vacaciones.TotalDias} días ({vacaciones.DiasEmpresa} empresa";
            
            if (vacaciones.DiasAsignadosAutomaticamente > 0)
                descripcion += $" + {vacaciones.DiasAsignadosAutomaticamente} asignados automáticamente";
            
            if (vacaciones.DiasProgramables > 0)
                descripcion += $" + {vacaciones.DiasProgramables} programables";
            
            descripcion += ")";
            return descripcion;
        }

        private string GenerarDescripcionPorAntiguedad(int anios, Services.VacacionesCalculadas vacaciones)
        {
            var descripcion = $"Año {anios}: {vacaciones.TotalDias} días total ({vacaciones.DiasEmpresa} empresa";
            
            if (vacaciones.DiasAsignadosAutomaticamente > 0)
                descripcion += $" + {vacaciones.DiasAsignadosAutomaticamente} asignados";
            
            if (vacaciones.DiasProgramables > 0)
                descripcion += $" + {vacaciones.DiasProgramables} programables";
            
            descripcion += ")";
            return descripcion;
        }

        /// <summary>
        /// Obtener todas las vacaciones asignadas de un empleado específico
        /// </summary>
        /// <param name="empleadoId">ID del empleado</param>
        /// <param name="anio">Año a consultar (opcional, por defecto año actual)</param>
        /// <param name="tipoVacacion">Tipo de vacación a filtrar (opcional): Automatica, Anual, Reprogramacion, FestivoTrabajado</param>
        /// <param name="estadoVacacion">Estado de vacación a filtrar (opcional): Activa, Intercambiada, Cancelada</param>
        /// <returns>Lista detallada de vacaciones del empleado con resumen</returns>
        [HttpGet("empleado/{empleadoId}/asignadas")]
        public async Task<IActionResult> ObtenerVacacionesAsignadas(
            [FromRoute] int empleadoId,
            [FromQuery] int? anio = null,
            [FromQuery] string? tipoVacacion = null,
            [FromQuery] string? estadoVacacion = null)
        {
            try
            {
                var request = new VacacionesAsignadasRequest
                {
                    Anio = anio,
                    TipoVacacion = tipoVacacion,
                    EstadoVacacion = estadoVacacion
                };

                _logger.LogInformation("Obteniendo vacaciones asignadas del empleado {EmpleadoId} para año {Anio}",
                    empleadoId, anio ?? DateTime.Now.Year);

                var response = await _asignacionService.ObtenerVacacionesEmpleadoAsync(empleadoId, request);

                if (!response.Success)
                    return BadRequest(response);

                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener vacaciones asignadas del empleado {EmpleadoId}", empleadoId);
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>
        /// Asigna vacaciones manualmente sin restricciones (uso administrativo)
        /// </summary>
        /// <param name="request">Datos de las vacaciones a asignar</param>
        /// <returns>Resultado de la asignación</returns>
        [HttpPost("asignacion-manual")]
        [Authorize(Roles = "Super Usuario,SuperUsuario,Jefe De Area,Ingeniero Industrial")]
        public async Task<IActionResult> AsignarVacacionesManual([FromBody] AsignacionManualRequest request)
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

                // Obtener ID del usuario que hace la asignación
                var userIdClaim = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(userIdClaim) || !int.TryParse(userIdClaim, out var usuarioAsignaId))
                {
                    return Unauthorized(new ApiResponse<object>(false, null, "No se pudo identificar el usuario"));
                }

                _logger.LogInformation("Usuario {UsuarioId} asignando vacaciones manuales a empleado {EmpleadoId}",
                    usuarioAsignaId, request.EmpleadoId);

                var response = await _vacacionesService.AsignarVacacionesManualAsync(request, usuarioAsignaId);

                if (!response.Success)
                    return BadRequest(response);

                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al asignar vacaciones manuales");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>
        /// Asigna vacaciones en lote a múltiples empleados (uso administrativo)
        /// </summary>
        /// <param name="request">Datos de las asignaciones en lote</param>
        /// <returns>Resultado de las asignaciones</returns>
        /// <summary>
        /// Días capturados por encima del porcentaje permitido del grupo, con
        /// quién los capturó. Sirve para desglosar los días que se llenaron de
        /// más durante la programación.
        /// </summary>
        [HttpGet("reporte-rebase-porcentaje")]
        [Authorize(Roles = "Super Usuario,SuperUsuario,Jefe De Area,JefeArea,Ingeniero Industrial,Gerente BT,RH")]
        public async Task<IActionResult> ReporteRebasePorcentaje(
            [FromQuery] int anio,
            [FromQuery] int? areaId = null,
            [FromQuery] int? grupoId = null)
        {
            var response = await _vacacionesService.ObtenerDiasConRebaseAsync(anio, areaId, grupoId);
            if (!response.Success)
                return BadRequest(response);
            return Ok(response);
        }

        [HttpPost("asignacion-manual-lote")]
        [Authorize(Roles = "Super Usuario,SuperUsuario,Ingeniero Industrial")]
        public async Task<IActionResult> AsignarVacacionesManualLote([FromBody] AsignacionManualLoteRequest request)
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

                // Obtener ID del usuario que hace la asignación
                var userIdClaim = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(userIdClaim) || !int.TryParse(userIdClaim, out var usuarioAsignaId))
                {
                    return Unauthorized(new ApiResponse<object>(false, null, "No se pudo identificar el usuario"));
                }

                _logger.LogWarning("Usuario {UsuarioId} asignando vacaciones manuales en lote a {Cantidad} empleados",
                    usuarioAsignaId, request.EmpleadosIds.Count);

                var response = await _vacacionesService.AsignarVacacionesManualLoteAsync(request, usuarioAsignaId);

                if (!response.Success)
                    return BadRequest(response);

                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al asignar vacaciones manuales en lote");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>
        /// Obtener vacaciones asignadas con filtros por empleado, área o grupo
        /// </summary>
        /// <param name="empleadoId">ID del empleado (opcional)</param>
        /// <param name="areaId">ID del área (opcional)</param>
        /// <param name="grupoId">ID del grupo (opcional)</param>
        /// <param name="anio">Año a consultar (opcional, por defecto año actual)</param>
        /// <param name="tipoVacacion">Tipo de vacación: Automatica, Anual, Reprogramacion, FestivoTrabajado (opcional)</param>
        /// <param name="estadoVacacion">Estado: Activa, Intercambiada, Cancelada (opcional)</param>
        /// <param name="incluirDetalleEmpleado">Incluir detalle por empleado (default: true)</param>
        /// <param name="incluirResumenPorArea">Incluir resumen agrupado por área (default: false)</param>
        /// <param name="incluirResumenPorGrupo">Incluir resumen agrupado por grupo (default: false)</param>
        /// <returns>Información detallada de vacaciones con resúmenes opcionales</returns>
        [HttpGet("asignadas")]
        public async Task<IActionResult> ObtenerVacacionesAsignadasConFiltros(
            [FromQuery] int? empleadoId = null,
            [FromQuery] int? areaId = null,
            [FromQuery] int? grupoId = null,
            [FromQuery] int? anio = null,
            [FromQuery] string? tipoVacacion = null,
            [FromQuery] string? estadoVacacion = null,
            [FromQuery] bool incluirDetalleEmpleado = true,
            [FromQuery] bool incluirResumenPorArea = false,
            [FromQuery] bool incluirResumenPorGrupo = false)
        {
            try
            {
                var request = new VacacionesAsignadasFiltroRequest
                {
                    EmpleadoId = empleadoId,
                    AreaId = areaId,
                    GrupoId = grupoId,
                    Anio = anio,
                    TipoVacacion = tipoVacacion,
                    EstadoVacacion = estadoVacacion,
                    IncluirDetalleEmpleado = incluirDetalleEmpleado,
                    IncluirResumenPorArea = incluirResumenPorArea,
                    IncluirResumenPorGrupo = incluirResumenPorGrupo
                };

                _logger.LogInformation("Obteniendo vacaciones asignadas con filtros: Empleado={EmpleadoId}, Area={AreaId}, Grupo={GrupoId}, Año={Anio}",
                    empleadoId, areaId, grupoId, anio ?? DateTime.Now.Year);

                var response = await _asignacionService.ObtenerVacacionesConFiltrosAsync(request);

                if (!response.Success)
                    return BadRequest(response);

                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener vacaciones asignadas con filtros");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }
    }
}
