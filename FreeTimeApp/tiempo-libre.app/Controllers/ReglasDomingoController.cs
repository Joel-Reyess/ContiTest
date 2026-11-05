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
    /// Reglas dominicales por unidad organizativa y periodo. Las configura el
    /// superusuario; el aviso del calendario lo ve cualquiera.
    /// </summary>
    [ApiController]
    [Route("api/reglas-domingo")]
    [Authorize]
    public class ReglasDomingoController : ControllerBase
    {
        private const string RolesEdicion = "SuperUsuario,Super Usuario";
        private const string RolesConsulta = RolesEdicion + ",Ingeniero Industrial,IngenieroIndustrial,JefeArea,Jefe De Area,JefeDeArea,Gerente BT,GerenteBT,RH";

        private readonly ReglasDomingoService _service;
        private readonly ILogger<ReglasDomingoController> _logger;

        public ReglasDomingoController(ReglasDomingoService service, ILogger<ReglasDomingoController> logger)
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
        public Task<IActionResult> Listar([FromQuery] int? anio = null, [FromQuery] int? areaId = null, [FromQuery] bool incluirInactivas = false) =>
            Ejecutar(() => _service.ListarAsync(anio, areaId, incluirInactivas), "listar reglas dominicales");

        [HttpPost]
        [Authorize(Roles = RolesEdicion)]
        public Task<IActionResult> Crear([FromBody] CrearReglaDomingoRequest request) =>
            Ejecutar(() => _service.CrearAsync(request, UsuarioId()), "crear regla dominical");

        [HttpPost("{id:int}/desactivar")]
        [Authorize(Roles = RolesEdicion)]
        public Task<IActionResult> Desactivar(int id) =>
            Ejecutar(() => _service.DesactivarAsync(id, UsuarioId()), "desactivar regla dominical");

        [HttpPost("{id:int}/reactivar")]
        [Authorize(Roles = RolesEdicion)]
        public Task<IActionResult> Reactivar(int id) =>
            Ejecutar(() => _service.ReactivarAsync(id, UsuarioId()), "reactivar regla dominical");

        /// <summary>Reglas que tocan a un empleado en el año (aviso del calendario).</summary>
        [HttpGet("empleado/{empleadoId:int}")]
        public Task<IActionResult> DelEmpleado(int empleadoId, [FromQuery] int anio) =>
            Ejecutar(() => _service.DelEmpleadoAsync(empleadoId, anio), "consultar reglas del empleado");

        /// <summary>Vacaciones que quedaron en un día que una regla dejó no laborable.</summary>
        [HttpGet("vacaciones-afectadas")]
        [Authorize(Roles = RolesConsulta)]
        public Task<IActionResult> VacacionesAfectadas([FromQuery] int anio) =>
            Ejecutar(() => _service.VacacionesEnNoLaborablesAsync(anio), "listar vacaciones en días no laborables");
    }
}
