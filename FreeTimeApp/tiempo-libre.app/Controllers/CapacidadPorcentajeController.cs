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
    /// Capacidad adicional de ausencia por periodo (día, semana o mes; planta, área
    /// o grupo). La configuran el superusuario e Ingeniería Industrial.
    /// </summary>
    [ApiController]
    [Route("api/capacidad-porcentaje")]
    [Authorize]
    public class CapacidadPorcentajeController : ControllerBase
    {
        private const string RolesEdicion = "SuperUsuario,Super Usuario,Ingeniero Industrial,IngenieroIndustrial";
        private const string RolesConsulta = RolesEdicion + ",JefeArea,Jefe De Area,JefeDeArea,Gerente BT,GerenteBT,RH";

        private readonly CapacidadPorcentajeService _service;
        private readonly ILogger<CapacidadPorcentajeController> _logger;

        public CapacidadPorcentajeController(CapacidadPorcentajeService service, ILogger<CapacidadPorcentajeController> logger)
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

        [HttpGet]
        [Authorize(Roles = RolesConsulta)]
        public Task<IActionResult> Listar([FromQuery] int? anio = null, [FromQuery] bool incluirInactivas = false) =>
            Ejecutar(() => _service.ListarAsync(anio, incluirInactivas), "listar capacidades por periodo");

        [HttpPost]
        [Authorize(Roles = RolesEdicion)]
        public Task<IActionResult> Crear([FromBody] CrearCapacidadPorcentajeRequest request) =>
            Ejecutar(() => _service.CrearAsync(request, UsuarioId()), "crear capacidad por periodo");

        [HttpPost("{id:int}/desactivar")]
        [Authorize(Roles = RolesEdicion)]
        public Task<IActionResult> Desactivar(int id) =>
            Ejecutar(() => _service.DesactivarAsync(id, UsuarioId()), "desactivar capacidad por periodo");

        [HttpPost("{id:int}/reactivar")]
        [Authorize(Roles = RolesEdicion)]
        public Task<IActionResult> Reactivar(int id) =>
            Ejecutar(() => _service.ReactivarAsync(id, UsuarioId()), "reactivar capacidad por periodo");

        /// <summary>Límite de un grupo día por día y de dónde sale (rol semanal y vistas).</summary>
        [HttpGet("limites")]
        public Task<IActionResult> Limites([FromQuery] int grupoId, [FromQuery] DateOnly desde, [FromQuery] DateOnly hasta) =>
            Ejecutar(() => _service.LimitesAsync(grupoId, desde, hasta), "consultar límites por día");
    }
}
