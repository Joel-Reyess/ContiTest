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
    [Route("api/ausencias")]
    [Authorize]
    public class AusenciaController : ControllerBase
    {
        private readonly AusenciaService _ausenciaService;
        private readonly FreeTimeDbContext _db;
        private readonly ILogger<AusenciaController> _logger;

        public AusenciaController(
            AusenciaService ausenciaService,
            FreeTimeDbContext db,
            ILogger<AusenciaController> logger)
        {
            _ausenciaService = ausenciaService;
            _db = db;
            _logger = logger;
        }

        /// <summary>
        /// Áreas que el usuario autenticado puede consultar. null = sin
        /// restricción (SuperUsuario). Lista vacía = no tiene áreas asignadas,
        /// y entonces no debe recibir datos de ninguna.
        /// </summary>
        private async Task<System.Collections.Generic.List<int>?> ResolverAreasPermitidasAsync()
        {
            if (User.IsInRole("SuperUsuario") || User.IsInRole("Super Usuario"))
                return null;

            var claim = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
            if (!int.TryParse(claim, out var userId))
                return new System.Collections.Generic.List<int>();

            return await Helpers.AreasVisiblesHelper.AreasVisiblesAsync(_db, userId);
        }

        /// <summary>
        /// Calcular porcentajes de ausencia para una o más fechas
        /// </summary>
        [HttpPost("calcular")]
        public async Task<IActionResult> CalcularAusencias([FromBody] ConsultaAusenciaRequest request)
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

                request.AreaIdsPermitidas = await ResolverAreasPermitidasAsync();
                var response = await _ausenciaService.CalcularAusenciasPorFechasAsync(request);

                if (!response.Success)
                    return BadRequest(response);

                return Ok(response);
            }
            catch (Exception ex)
            {
                var rangoFechas = request.FechaFin.HasValue
                    ? $"{request.FechaInicio} a {request.FechaFin}"
                    : request.FechaInicio.ToString();
                _logger.LogError(ex, "Error al calcular ausencias para rango: {RangoFechas}", rangoFechas);
                var errorResponse = new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}");
                return StatusCode(500, errorResponse);
            }
        }

        /// <summary>
        /// Validar si un día está disponible para que un empleado tome vacaciones
        /// </summary>
        [HttpPost("validar-disponibilidad")]
        public async Task<IActionResult> ValidarDisponibilidad([FromBody] ValidacionDisponibilidadRequest request)
        {
            try
            {
                if (!ModelState.IsValid)
                {
                    var errors = string.Join("; ", ModelState
                        .SelectMany(x => x.Value.Errors)
                        .Select(x => x.ErrorMessage));
                    return BadRequest(new ApiResponse<ValidacionDisponibilidadResponse>(false, null, $"Datos de entrada inválidos: {errors}"));
                }

                var response = await _ausenciaService.ValidarDisponibilidadDiaAsync(request);
                
                if (!response.Success)
                    return BadRequest(response);
                
                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al validar disponibilidad para empleado {EmpleadoId} en fecha {Fecha}", 
                    request.EmpleadoId, request.Fecha);
                var errorResponse = new ApiResponse<ValidacionDisponibilidadResponse>(false, null, $"Error inesperado: {ex.Message}");
                return StatusCode(500, errorResponse);
            }
        }

        /// <summary>
        /// Obtener ausencias de un grupo específico en una fecha
        /// </summary>
        [HttpGet("grupo/{grupoId}/fecha/{fecha}")]
        public async Task<IActionResult> ObtenerAusenciaGrupo(int grupoId, DateOnly fecha)
        {
            try
            {
                var request = new ConsultaAusenciaRequest
                {
                    FechaInicio = fecha,
                    FechaFin = null, // Solo un día
                    GrupoId = grupoId,
                    AreaIdsPermitidas = await ResolverAreasPermitidasAsync()
                };

                var response = await _ausenciaService.CalcularAusenciasPorFechasAsync(request);
                
                if (!response.Success)
                    return BadRequest(response);

                var ausenciaGrupo = response.Data?.FirstOrDefault()?.AusenciasPorGrupo?.FirstOrDefault();
                if (ausenciaGrupo == null)
                    return NotFound(new ApiResponse<object>(false, null, "Grupo no encontrado o sin datos"));

                return Ok(new ApiResponse<AusenciaPorGrupoDto>(true, ausenciaGrupo, null));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener ausencia del grupo {GrupoId} en fecha {Fecha}", grupoId, fecha);
                var errorResponse = new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}");
                return StatusCode(500, errorResponse);
            }
        }

        /// <summary>
        /// Obtener ausencias de todas las áreas en una fecha específica
        /// </summary>
        [HttpGet("fecha/{fecha}")]
        public async Task<IActionResult> ObtenerAusenciasPorFecha(DateOnly fecha, [FromQuery] int? areaId = null)
        {
            try
            {
                var request = new ConsultaAusenciaRequest
                {
                    FechaInicio = fecha,
                    FechaFin = null, // Solo un día
                    AreaId = areaId,
                    AreaIdsPermitidas = await ResolverAreasPermitidasAsync()
                };

                var response = await _ausenciaService.CalcularAusenciasPorFechasAsync(request);
                
                if (!response.Success)
                    return BadRequest(response);

                var ausenciaFecha = response.Data?.FirstOrDefault();
                if (ausenciaFecha == null)
                    return NotFound(new ApiResponse<object>(false, null, "No se encontraron datos para la fecha especificada"));

                return Ok(new ApiResponse<AusenciaPorFechaResponse>(true, ausenciaFecha, null));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener ausencias para fecha {Fecha}", fecha);
                var errorResponse = new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}");
                return StatusCode(500, errorResponse);
            }
        }
    }
}
