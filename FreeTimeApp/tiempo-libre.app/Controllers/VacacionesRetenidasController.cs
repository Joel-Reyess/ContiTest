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
    /// Reporte "Días de más por antigüedad" (solo superusuario): días del Excel de
    /// SAP retenidos por la sincronización y empleados que ya tienen días de más.
    /// </summary>
    [ApiController]
    [Route("api/vacaciones-retenidas")]
    [Authorize(Roles = "SuperUsuario,Super Usuario")]
    public class VacacionesRetenidasController : ControllerBase
    {
        private readonly VacacionesRetenidasService _service;
        private readonly ILogger<VacacionesRetenidasController> _logger;

        public VacacionesRetenidasController(VacacionesRetenidasService service, ILogger<VacacionesRetenidasController> logger)
        {
            _service = service;
            _logger = logger;
        }

        private int UsuarioId() =>
            int.TryParse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value, out var id) ? id : 0;

        [HttpGet]
        public async Task<IActionResult> Obtener([FromQuery] string? estado = "Pendiente", [FromQuery] int? anio = null)
        {
            try
            {
                var r = await _service.ObtenerAsync(estado, anio);
                return r.Success ? Ok(r) : BadRequest(r);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al listar días retenidos");
                return StatusCode(500, new ApiResponse<object>(false, null, ex.GetBaseException().Message));
            }
        }

        [HttpPost("{id:int}/aceptar")]
        public async Task<IActionResult> Aceptar(int id, [FromBody] ResolverRetencionRequest? request)
        {
            try
            {
                var r = await _service.AceptarAsync(id, UsuarioId(), request?.Nota);
                return r.Success ? Ok(r) : BadRequest(r);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al aceptar día retenido {Id}", id);
                return StatusCode(500, new ApiResponse<object>(false, null, ex.GetBaseException().Message));
            }
        }

        [HttpPost("{id:int}/descartar")]
        public async Task<IActionResult> Descartar(int id, [FromBody] ResolverRetencionRequest? request)
        {
            try
            {
                var r = await _service.DescartarAsync(id, UsuarioId(), request?.Nota);
                return r.Success ? Ok(r) : BadRequest(r);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al descartar día retenido {Id}", id);
                return StatusCode(500, new ApiResponse<object>(false, null, ex.GetBaseException().Message));
            }
        }

        [HttpGet("excesos")]
        public async Task<IActionResult> Excesos([FromQuery] int anio)
        {
            try
            {
                var r = await _service.ExcesosAsync(anio);
                return r.Success ? Ok(r) : BadRequest(r);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al listar excesos por antigüedad");
                return StatusCode(500, new ApiResponse<object>(false, null, ex.GetBaseException().Message));
            }
        }
    }
}
