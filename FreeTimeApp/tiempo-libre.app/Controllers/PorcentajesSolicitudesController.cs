using System;
using System.Collections.Generic;
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
    /// % Turno y % Día de las solicitudes que no los guardan, para mostrarlas con el
    /// formato de "Solicitudes de Reprogramaciones". Solo consulta.
    /// </summary>
    [ApiController]
    [Route("api/solicitudes-porcentajes")]
    [Authorize(Roles = "JefeArea,Jefe De Area,JefeDeArea,SuperUsuario,Super Usuario,Gerente BT,GerenteBT,RH,Ingeniero Industrial,IngenieroIndustrial")]
    public class PorcentajesSolicitudesController : ControllerBase
    {
        private readonly PorcentajesSolicitudesService _service;
        private readonly ILogger<PorcentajesSolicitudesController> _logger;

        public PorcentajesSolicitudesController(PorcentajesSolicitudesService service,
            ILogger<PorcentajesSolicitudesController> logger)
        {
            _service = service;
            _logger = logger;
        }

        [HttpPost]
        public async Task<IActionResult> Calcular([FromBody] PorcentajesSolicitudesRequest request)
        {
            try
            {
                var data = await _service.CalcularAsync(request?.Items ?? new List<PorcentajeSolicitudItem>());
                return Ok(new ApiResponse<List<PorcentajeSolicitudDto>>(true, data, null));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al calcular % de turno/día de solicitudes");
                return StatusCode(500, new ApiResponse<object>(false, null, ex.GetBaseException().Message));
            }
        }
    }
}
