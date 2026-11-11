using System;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using tiempo_libre.DTOs;
using tiempo_libre.Models;
using tiempo_libre.Services;

namespace tiempo_libre.Controllers
{
    /// <summary>
    /// Mover en lote días por la empresa con machote (nov-2026). Solo el
    /// superusuario: aplica directo, sin pasar por el jefe de área, y queda en el
    /// historial de reprogramaciones de día empresa.
    /// </summary>
    [ApiController]
    [Route("api/movimiento-dias-empresa")]
    [Authorize(Roles = "SuperUsuario,Super Usuario")]
    public class MovimientoMasivoDiasEmpresaController : ControllerBase
    {
        private readonly MovimientoMasivoDiasEmpresaService _service;
        private readonly ILogger<MovimientoMasivoDiasEmpresaController> _logger;

        public MovimientoMasivoDiasEmpresaController(MovimientoMasivoDiasEmpresaService service,
            ILogger<MovimientoMasivoDiasEmpresaController> logger)
        {
            _service = service;
            _logger = logger;
        }

        private int UsuarioId() =>
            int.TryParse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value, out var id) ? id : 0;

        private async Task<IActionResult> Ejecutar<T>(Func<Task<ApiResponse<T>>> accion, string que)
        {
            try
            {
                var r = await accion();
                return r.Success ? Ok(r) : BadRequest(r);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al {Que}", que);
                return StatusCode(500, new ApiResponse<object>(false, null, ex.GetBaseException().Message));
            }
        }

        /// <summary>Revisa el machote renglón por renglón sin mover nada.</summary>
        [HttpPost("validar")]
        public Task<IActionResult> Validar([FromBody] MovimientoMasivoDiasEmpresaRequest request) =>
            Ejecutar(() => _service.ValidarAsync(request), "validar machote de días por la empresa");

        /// <summary>Mueve los renglones listos (y los de advertencia si se pide).</summary>
        [HttpPost("aplicar")]
        public Task<IActionResult> Aplicar([FromBody] MovimientoMasivoDiasEmpresaRequest request) =>
            Ejecutar(() => _service.AplicarAsync(request, UsuarioId()), "aplicar machote de días por la empresa");
    }
}
