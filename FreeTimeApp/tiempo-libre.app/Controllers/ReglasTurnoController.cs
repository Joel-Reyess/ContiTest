using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
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
        private readonly FreeTimeDbContext _db;
        private readonly ILogger<ReglasTurnoController> _logger;

        public ReglasTurnoController(
            ReglasTurnoService service,
            RotacionesProgramadasService rotProgService,
            FreeTimeDbContext db,
            ILogger<ReglasTurnoController> logger)
        {
            _service = service;
            _rotProgService = rotProgService;
            _db = db;
            _logger = logger;
        }

        /// <summary>
        /// Códigos de regla que el usuario puede ver, o null si no tiene
        /// restricción (SuperUsuario, Ingeniero Industrial y Delegado Sindical,
        /// que trabajan sobre el catálogo completo).
        ///
        /// Para jefe de área, Gerente BT y RH se derivan de sus áreas visibles:
        /// los grupos de esas áreas llevan como Rol el código de la regla, con
        /// sufijo "_NN" en los sub-grupos derivados.
        /// </summary>
        private async Task<System.Collections.Generic.HashSet<string>?> ObtenerCodigosDeReglasVisiblesAsync()
        {
            if (User.IsInRole("SuperUsuario") || User.IsInRole("Super Usuario"))
                return null;

            var tieneAlcancePorArea =
                User.IsInRole("Jefe De Area") || User.IsInRole("JefeArea") ||
                User.IsInRole("Gerente BT") || User.IsInRole("GerenteBT") ||
                User.IsInRole("RH");

            if (!tieneAlcancePorArea) return null;

            var claim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (!int.TryParse(claim, out var userId))
                return new System.Collections.Generic.HashSet<string>();

            var areasVisibles = await Helpers.AreasVisiblesHelper.AreasVisiblesAsync(_db, userId);
            if (areasVisibles.Count == 0)
                return new System.Collections.Generic.HashSet<string>();

            var roles = await _db.Grupos
                .Where(g => areasVisibles.Contains(g.AreaId))
                .Select(g => g.Rol)
                .Distinct()
                .ToListAsync();

            // "R0144_02" (sub-grupo derivado) pertenece a la regla "R0144".
            return roles
                .Select(rol => System.Text.RegularExpressions.Regex.Replace(rol, @"_\d+$", string.Empty))
                .ToHashSet(StringComparer.OrdinalIgnoreCase);
        }

        /// <summary>Listar todas las reglas con su patrón actual.</summary>
        [HttpGet]
        [Authorize(Roles = "Super Usuario,SuperUsuario,Ingeniero Industrial,IngenieroIndustrial,Jefe De Area,JefeArea,Delegado Sindical,DelegadoSindical,Gerente BT,GerenteBT,RH")]
        public async Task<IActionResult> GetAll()
        {
            try
            {
                var reglas = await _service.GetAllAsync();

                // El calendario anual de reglas mostraba TODAS las reglas de la
                // planta a cualquiera con permiso de lectura. Una regla "vive" en
                // un área a través de los grupos que se le crearon al asignarla
                // (Grupos.Rol = codigo o codigo_NN), así que se filtra por ahí.
                var codigosVisibles = await ObtenerCodigosDeReglasVisiblesAsync();
                if (codigosVisibles != null)
                    reglas = reglas.Where(r => codigosVisibles.Contains(r.Codigo)).ToList();

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
        [Authorize(Roles = "Super Usuario,SuperUsuario,Ingeniero Industrial,IngenieroIndustrial,Jefe De Area,JefeArea,Delegado Sindical,DelegadoSindical,Gerente BT,GerenteBT,RH")]
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

        /// <summary>
        /// Fuerza al servidor a recargar el cache de reglas desde la BD.
        /// Útil cuando se ejecutó un arranque programado y los usuarios no
        /// ven aún el patrón nuevo (p.ej. IIS con múltiples workers).
        /// </summary>
        [HttpPost("reload-cache")]
        [Authorize(Roles = "Super Usuario,SuperUsuario,Ingeniero Industrial,IngenieroIndustrial,Jefe De Area,JefeArea,Delegado Sindical,DelegadoSindical,Gerente BT,GerenteBT,RH")]
        public IActionResult ReloadCache()
        {
            try
            {
                _service.ForzarRecargaCache();
                return Ok(new ApiResponse<object>(true, new { reloaded = true }, null));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al recargar cache de reglas");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>Alta manual de una regla que no llegó por SAP (solo SuperUsuario).</summary>
        [HttpPost]
        [Authorize(Roles = "Super Usuario,SuperUsuario")]
        public async Task<IActionResult> Crear([FromBody] CrearReglaTurnoRequest request)
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

                var nueva = await _service.CrearAsync(request, usuarioId.Value);
                return Ok(new ApiResponse<object>(true, nueva, null));
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new ApiResponse<object>(false, null, ex.Message));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al crear regla de turno");
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
        [Authorize(Roles = "Super Usuario,SuperUsuario,Ingeniero Industrial,IngenieroIndustrial,Jefe De Area,JefeArea,Delegado Sindical,DelegadoSindical,Gerente BT,GerenteBT,RH")]
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
