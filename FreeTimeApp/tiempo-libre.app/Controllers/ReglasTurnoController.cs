using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using System;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using tiempo_libre.DTOs;
using tiempo_libre.Models;
using tiempo_libre.Services;

namespace tiempo_libre.Controllers
{
    [ApiController]
    [Route("api/reglas-turno")]
    [Authorize]
    public class ReglasTurnoController : ControllerBase
    {
        private readonly ReglasTurnoService _service;
        private readonly RotacionesProgramadasService _rotProgService;
        private readonly ILogger<ReglasTurnoController> _logger;

        public ReglasTurnoController(
            ReglasTurnoService service,
            RotacionesProgramadasService rotProgService,
            ILogger<ReglasTurnoController> logger)
        {
            _service = service;
            _rotProgService = rotProgService;
            _logger = logger;
        }

        /// <summary>Listar todas las reglas con su patrón actual.</summary>
        [HttpGet]
        [Authorize(Roles = "Super Usuario,SuperUsuario,Ingeniero Industrial")]
        public async Task<IActionResult> GetAll()
        {
            try
            {
                var reglas = await _service.GetAllAsync();
                return Ok(new ApiResponse<object>(true, reglas, null));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener reglas de turno");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>Obtener una regla por código.</summary>
        [HttpGet("{codigo}")]
        [Authorize(Roles = "Super Usuario,SuperUsuario,Ingeniero Industrial")]
        public async Task<IActionResult> GetByCodigo(string codigo)
        {
            try
            {
                var regla = await _service.GetByCodigoAsync(codigo);
                if (regla == null)
                    return NotFound(new ApiResponse<object>(false, null, $"No existe la regla {codigo}"));
                return Ok(new ApiResponse<object>(true, regla, null));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener regla {Codigo}", codigo);
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>Actualizar el patrón completo de una regla.</summary>
        [HttpPut("{codigo}")]
        [Authorize(Roles = "Super Usuario,SuperUsuario")]
        public async Task<IActionResult> ActualizarPatron(
            string codigo, [FromBody] ActualizarPatronReglaTurnoRequest request)
        {
            try
            {
                if (!ModelState.IsValid)
                {
                    var errors = string.Join("; ", ModelState
                        .SelectMany(x => x.Value!.Errors)
                        .Select(x => x.ErrorMessage));
                    return BadRequest(new ApiResponse<object>(false, null, $"Datos inválidos: {errors}"));
                }

                var usuarioId = GetUsuarioId();
                if (usuarioId == null)
                    return Unauthorized(new ApiResponse<object>(false, null, "No se pudo identificar el usuario"));

                var actualizada = await _service.ActualizarPatronAsync(codigo, request, usuarioId.Value);
                return Ok(new ApiResponse<object>(true, actualizada, null));
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new ApiResponse<object>(false, null, ex.Message));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al actualizar regla {Codigo}", codigo);
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>
        /// Rotar el patrón de una o varias reglas N días (Enero / Semana Santa / Fin de año).
        /// Dias positivo = R4 ← R3 (cada grupo recibe lo que tenía el grupo previo).
        /// </summary>
        [HttpPost("rotar")]
        [Authorize(Roles = "Super Usuario,SuperUsuario")]
        public async Task<IActionResult> Rotar([FromBody] RotarReglasTurnoRequest request)
        {
            try
            {
                if (!ModelState.IsValid)
                {
                    var errors = string.Join("; ", ModelState
                        .SelectMany(x => x.Value!.Errors)
                        .Select(x => x.ErrorMessage));
                    return BadRequest(new ApiResponse<object>(false, null, $"Datos inválidos: {errors}"));
                }

                var usuarioId = GetUsuarioId();
                if (usuarioId == null)
                    return Unauthorized(new ApiResponse<object>(false, null, "No se pudo identificar el usuario"));

                var afectadas = await _service.RotarAsync(request, usuarioId.Value);
                return Ok(new ApiResponse<object>(true, afectadas, null));
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new ApiResponse<object>(false, null, ex.Message));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al rotar reglas de turno");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>
        /// Asignar la regla a un área creando N sub-grupos (R0144, R0144_02, …).
        /// Solo SuperUsuario. Marca la regla como Activa si estaba PendienteConfiguracion.
        /// </summary>
        [HttpPost("{codigo}/asignar-a-area")]
        [Authorize(Roles = "Super Usuario,SuperUsuario")]
        public async Task<IActionResult> AsignarAArea(
            string codigo, [FromBody] AsignarReglaAAreaRequest request)
        {
            try
            {
                if (!ModelState.IsValid)
                {
                    var errors = string.Join("; ", ModelState
                        .SelectMany(x => x.Value!.Errors)
                        .Select(x => x.ErrorMessage));
                    return BadRequest(new ApiResponse<object>(false, null, $"Datos inválidos: {errors}"));
                }

                var resp = await _service.AsignarAAreaAsync(codigo, request);
                return Ok(new ApiResponse<object>(true, resp, null));
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new ApiResponse<object>(false, null, ex.Message));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al asignar regla {Codigo} a área", codigo);
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        // ------------------------------------------------------------------
        // Rotaciones programadas (Vacaciones → Calendario)
        // ------------------------------------------------------------------

        /// <summary>Listar rotaciones agendadas en un rango (default = año en curso).</summary>
        [HttpGet("rotaciones-programadas")]
        [Authorize(Roles = "Super Usuario,SuperUsuario,Ingeniero Industrial")]
        public async Task<IActionResult> ListarRotacionesProgramadas(
            [FromQuery] DateTime? desde, [FromQuery] DateTime? hasta)
        {
            try
            {
                var rows = await _rotProgService.ListarAsync(desde, hasta);
                return Ok(new ApiResponse<object>(true, rows, null));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al listar rotaciones programadas");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>Agendar una rotación en una o varias fechas futuras.</summary>
        [HttpPost("rotaciones-programadas")]
        [Authorize(Roles = "Super Usuario,SuperUsuario")]
        public async Task<IActionResult> CrearRotacionesProgramadas(
            [FromBody] CrearRotacionesProgramadasRequest request)
        {
            try
            {
                if (!ModelState.IsValid)
                {
                    var errors = string.Join("; ", ModelState
                        .SelectMany(x => x.Value!.Errors)
                        .Select(x => x.ErrorMessage));
                    return BadRequest(new ApiResponse<object>(false, null, $"Datos inválidos: {errors}"));
                }

                var usuarioId = GetUsuarioId();
                if (usuarioId == null)
                    return Unauthorized(new ApiResponse<object>(false, null, "No se pudo identificar el usuario"));

                var resp = await _rotProgService.CrearAsync(request, usuarioId.Value);
                return Ok(new ApiResponse<object>(true, resp, null));
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new ApiResponse<object>(false, null, ex.Message));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al agendar rotación programada");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>Cancelar una rotación agendada (solo si está Pendiente).</summary>
        [HttpDelete("rotaciones-programadas/{id:int}")]
        [Authorize(Roles = "Super Usuario,SuperUsuario")]
        public async Task<IActionResult> CancelarRotacionProgramada(int id)
        {
            try
            {
                await _rotProgService.CancelarAsync(id);
                return Ok(new ApiResponse<object>(true, new { id }, null));
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new ApiResponse<object>(false, null, ex.Message));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al cancelar rotación programada {Id}", id);
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        private int? GetUsuarioId()
        {
            var claim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            return int.TryParse(claim, out var id) ? id : null;
        }
    }
}
