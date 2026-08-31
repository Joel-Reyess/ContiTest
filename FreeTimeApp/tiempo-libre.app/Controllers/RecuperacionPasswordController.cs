using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using System;
using System.Threading.Tasks;
using tiempo_libre.DTOs;
using tiempo_libre.Services;

namespace tiempo_libre.Controllers
{
    [ApiController]
    [Route("api/recuperacion-password")]
    // Los tres pasos de recuperación son públicos (van con [AllowAnonymous]
    // cada uno). No se pone a nivel de clase: un [AllowAnonymous] de clase
    // anula el [Authorize] de limpiar-expirados y lo deja abierto (ASP0026).
    public class RecuperacionPasswordController : ControllerBase
    {
        private readonly IRecuperacionPasswordService _recuperacionService;
        private readonly ILogger<RecuperacionPasswordController> _logger;

        public RecuperacionPasswordController(
            IRecuperacionPasswordService recuperacionService,
            ILogger<RecuperacionPasswordController> logger)
        {
            _recuperacionService = recuperacionService;
            _logger = logger;
        }

        /// <summary>
        /// Solicita un código de verificación para cambio de contraseña
        /// </summary>
        /// <param name="request">Email del usuario</param>
        /// <returns>Confirmación del envío del código</returns>
        [HttpPost("solicitar-codigo")]
        [AllowAnonymous]
        public async Task<IActionResult> SolicitarCodigo([FromBody] SolicitarCodigoRequest request)
        {
            try
            {
                if (!ModelState.IsValid)
                {
                    return BadRequest(new { success = false, message = "Datos inválidos" });
                }

                var ipAddress = HttpContext.Connection.RemoteIpAddress?.ToString();
                var userAgent = Request.Headers["User-Agent"].ToString();

                _logger.LogInformation("Solicitud de código de recuperación para email: {Email} desde IP: {IP}",
                    request.Email, ipAddress);

                var response = await _recuperacionService.GenerarCodigoRecuperacionAsync(
                    request.Email,
                    ipAddress,
                    userAgent);

                if (response.Success)
                {
                    return Ok(response);
                }

                return BadRequest(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al solicitar código de recuperación");
                return StatusCode(500, new SolicitarCodigoResponse
                {
                    Success = false,
                    Message = "Error interno del servidor"
                });
            }
        }

        /// <summary>
        /// Valida un código de verificación
        /// </summary>
        /// <param name="request">Email y código a validar</param>
        /// <returns>Resultado de la validación</returns>
        [HttpPost("validar-codigo")]
        [AllowAnonymous]
        public async Task<IActionResult> ValidarCodigo([FromBody] ValidarCodigoRequest request)
        {
            try
            {
                if (!ModelState.IsValid)
                {
                    return BadRequest(new { success = false, message = "Datos inválidos" });
                }

                _logger.LogInformation("Validación de código para email: {Email}", request.Email);

                var response = await _recuperacionService.ValidarCodigoAsync(
                    request.Email,
                    request.CodigoVerificacion);

                if (response.Valido)
                {
                    return Ok(response);
                }

                return BadRequest(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al validar código");
                return StatusCode(500, new ValidarCodigoResponse
                {
                    Valido = false,
                    Message = "Error interno del servidor"
                });
            }
        }

        /// <summary>
        /// Cambia la contraseña usando un código de verificación
        /// </summary>
        /// <param name="request">Datos para el cambio de contraseña</param>
        /// <returns>Resultado del cambio de contraseña</returns>
        [HttpPost("cambiar-password")]
        [AllowAnonymous]
        public async Task<IActionResult> CambiarPassword([FromBody] CambiarPasswordRequest request)
        {
            try
            {
                if (!ModelState.IsValid)
                {
                    return BadRequest(new { success = false, message = "Datos inválidos" });
                }

                _logger.LogInformation("Intento de cambio de contraseña para email: {Email}", request.Email);

                var response = await _recuperacionService.CambiarPasswordConCodigoAsync(request);

                if (response.Success)
                {
                    _logger.LogInformation("Contraseña cambiada exitosamente para: {Email}", request.Email);
                    return Ok(response);
                }

                _logger.LogWarning("Fallo en cambio de contraseña para: {Email}. Razón: {Reason}",
                    request.Email, response.Message);
                return BadRequest(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al cambiar contraseña");
                return StatusCode(500, new CambiarPasswordResponse
                {
                    Success = false,
                    Message = "Error interno del servidor"
                });
            }
        }

        /// <summary>
        /// Limpia códigos de verificación expirados (endpoint administrativo)
        /// </summary>
        /// <returns>Confirmación de limpieza</returns>
        [HttpDelete("limpiar-expirados")]
        [Authorize(Roles = "Super Usuario,SuperUsuario")]
        public async Task<IActionResult> LimpiarCodigosExpirados()
        {
            try
            {
                _logger.LogInformation("Limpieza de códigos expirados iniciada");

                await _recuperacionService.LimpiarCodigosExpiradosAsync();

                return Ok(new { success = true, message = "Códigos expirados eliminados" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al limpiar códigos expirados");
                return StatusCode(500, new { success = false, message = "Error interno del servidor" });
            }
        }
    }
}