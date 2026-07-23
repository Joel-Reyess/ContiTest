using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using System;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using tiempo_libre.Services;
using tiempo_libre.DTOs;
using tiempo_libre.Models;
using Microsoft.EntityFrameworkCore;

namespace tiempo_libre.Controllers
{
    [ApiController]
    [Route("api/solicitudes-permisos")]
    [Authorize]
    public class SolicitudesPermisosController : ControllerBase
    {
        private readonly SolicitudesPermisosService _solicitudesService;
        private readonly ILogger<SolicitudesPermisosController> _logger;
        private readonly FreeTimeDbContext _db;

        public SolicitudesPermisosController(
            SolicitudesPermisosService solicitudesService,
            ILogger<SolicitudesPermisosController> logger,
            FreeTimeDbContext db)
        {
            _solicitudesService = solicitudesService;
            _logger = logger;
            _db = db;
        }

        /// <summary>
        /// Obtiene el catálogo de permisos permitidos para delegados sindicales
        /// </summary>
        [HttpGet("catalogo-delegado")]
        [Authorize(Roles = "EmpleadoSindicalizado,Empleado Sindicalizado,DelegadoSindical,Delegado Sindical")]
        public IActionResult ObtenerCatalogoDelegado()
        {
            try
            {
                var catalogo = _solicitudesService.ObtenerCatalogoParaDelegado();
                return Ok(new ApiResponse<CatalogoPermisosDelegadoResponse>(true, catalogo, null));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener catálogo para delegado");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>
        /// Crea una nueva solicitud de permiso (solo delegados sindicales)
        /// </summary>
        [HttpPost("crear")]
        [Authorize(Roles = "EmpleadoSindicalizado,Empleado Sindicalizado,DelegadoSindical,Delegado Sindical")]
        public async Task<IActionResult> CrearSolicitud([FromBody] CrearSolicitudPermisoRequest request)
        {
            try
            {
                if (!ModelState.IsValid)
                {
                    var errors = string.Join("; ", ModelState
                        .SelectMany(x => x.Value?.Errors ?? Enumerable.Empty<Microsoft.AspNetCore.Mvc.ModelBinding.ModelError>())
                        .Select(x => x.ErrorMessage));
                    _logger.LogError("Error de validación al crear solicitud: {Errors}", errors);
                    return BadRequest(new ApiResponse<object>(false, null, $"Datos inválidos: {errors}"));
                }

                var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(userIdClaim) || !int.TryParse(userIdClaim, out var delegadoId))
                {
                    return Unauthorized(new ApiResponse<object>(false, null, "Usuario no identificado"));
                }

                _logger.LogInformation(
                    "Delegado {DelegadoId} creando solicitud para nómina {Nomina}, tipo {ClAbPre}",
                    delegadoId, request.Nomina, request.ClAbPre);

                _logger.LogInformation(
    "Request completo - Nomina: {Nomina}, ClAbPre: '{ClAbPre}', FechaInicio: '{FechaInicio}', FechaFin: '{FechaFin}', Observaciones: '{Obs}'",
    request.Nomina,
    request.ClAbPre ?? "NULL",
    request.FechaInicio ?? "NULL",
    request.FechaFin ?? "NULL",
    request.Observaciones ?? "NULL"
);

                var response = await _solicitudesService.CrearSolicitudAsync(request, delegadoId);

                if (!response.Success)
                {
                    return BadRequest(response);
                }

                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al crear solicitud de permiso");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>
        /// Consulta solicitudes de permisos
        /// </summary>
        [HttpPost("consultar")]
        [Authorize(Roles = "EmpleadoSindicalizado,Empleado Sindicalizado,DelegadoSindical,Delegado Sindical,Jefe De Area,SuperUsuario,Gerente BT,GerenteBT,RH")]
        public async Task<IActionResult> ConsultarSolicitudes([FromBody] ConsultarSolicitudesRequest request)
        {
            try
            {
                // Si el caller es Jefe de Área (no SuperUsuario/Gerente/RH),
                // auto-restringimos las solicitudes a las asignadas a él vía
                // JefeAprobadorId.
                //
                // Si el caller es Gerente BT o RH (ya no ven planta completa),
                // se restringen las solicitudes a las de empleados de las áreas
                // asignadas al usuario en AreaAsignaciones.
                //
                // SuperUsuario sigue viendo todo.
                int? jefeIdAutoFiltro = null;
                List<int>? areaIdsFiltro = null;

                var esSuperUsuario = User.IsInRole("SuperUsuario") || User.IsInRole("Super Usuario");
                var esGerenteORH = User.IsInRole("Gerente BT") || User.IsInRole("GerenteBT") || User.IsInRole("RH");

                int? callerId = null;
                {
                    var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                    if (!string.IsNullOrEmpty(userIdClaim) && int.TryParse(userIdClaim, out var uidTmp))
                        callerId = uidTmp;
                }

                if (!esSuperUsuario && esGerenteORH && callerId.HasValue)
                {
                    areaIdsFiltro = await _db.AreaAsignaciones
                        .Where(aa => aa.UserId == callerId.Value)
                        .Select(aa => aa.AreaId)
                        .Distinct()
                        .ToListAsync();
                }
                else if (User.IsInRole("Jefe De Area") && !esSuperUsuario && !esGerenteORH && callerId.HasValue)
                {
                    jefeIdAutoFiltro = callerId.Value;
                }

                var response = await _solicitudesService.ConsultarSolicitudesAsync(request, jefeIdAutoFiltro, areaIdsFiltro);

                if (!response.Success)
                {
                    return BadRequest(response);
                }

                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al consultar solicitudes");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>
        /// Obtiene solicitudes del delegado actual
        /// </summary>
        [HttpGet("mis-solicitudes")]
        [Authorize(Roles = "EmpleadoSindicalizado,Empleado Sindicalizado,DelegadoSindical,Delegado Sindical")]
        public async Task<IActionResult> ObtenerMisSolicitudes(
            [FromQuery] string? estado = null,
            [FromQuery] int? nomina = null)
        {
            try
            {
                var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(userIdClaim) || !int.TryParse(userIdClaim, out var delegadoId))
                {
                    return Unauthorized(new ApiResponse<object>(false, null, "Usuario no identificado"));
                }

                var request = new ConsultarSolicitudesRequest
                {
                    DelegadoId = delegadoId,
                    Estado = estado,
                    NominaEmpleado = nomina
                };

                var response = await _solicitudesService.ConsultarSolicitudesAsync(request);

                if (!response.Success)
                {
                    return BadRequest(response);
                }

                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener solicitudes del delegado");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        [HttpGet("pendientes")]
        [Authorize(Roles = "Jefe De Area,SuperUsuario,Gerente BT,GerenteBT,RH")]
        public async Task<IActionResult> ObtenerSolicitudesPendientes()
        {
            try
            {
                var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(userIdClaim) || !int.TryParse(userIdClaim, out var jefeId))
                {
                    return Unauthorized(new ApiResponse<object>(false, null, "Usuario no identificado"));
                }

                // ✅ Llama al método del servicio
                var response = await _solicitudesService.ObtenerSolicitudesPendientesParaJefeAsync(jefeId);

                if (!response.Success)
                {
                    return BadRequest(response);
                }

                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener solicitudes pendientes");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }


        /// <summary>
        /// Obtiene una solicitud específica por ID
        /// </summary>
        [HttpGet("{id}")]
        [Authorize(Roles = "Jefe De Area,SuperUsuario,Gerente BT,GerenteBT,RH")]
        public async Task<IActionResult> ObtenerSolicitudPorId(int id)
        {
            try
            {
                var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(userIdClaim) || !int.TryParse(userIdClaim, out var userId))
                {
                    return Unauthorized(new ApiResponse<object>(false, null, "Usuario no identificado"));
                }

                var solicitud = await _db.PermisosEIncapacidadesSAP
                    .Where(p => p.Id == id && p.EstadoSolicitud != null)
                    .FirstOrDefaultAsync();

                if (solicitud == null)
                {
                    return NotFound(new ApiResponse<object>(false, null, "Solicitud no encontrada"));
                }

                // Obtener nombres de delegado y jefe
                var delegadoNombre = solicitud.DelegadoSolicitanteId.HasValue
                    ? await _db.Users
                        .Where(u => u.Id == solicitud.DelegadoSolicitanteId.Value)
                        .Select(u => u.FullName)
                        .FirstOrDefaultAsync()
                    : null;

                var jefeNombre = solicitud.JefeAprobadorId.HasValue
                    ? await _db.Users
                        .Where(u => u.Id == solicitud.JefeAprobadorId.Value)
                        .Select(u => u.FullName)
                        .FirstOrDefaultAsync()
                    : null;

                var catalogoCompleto = _solicitudesService.ObtenerCatalogoParaDelegado();
                var tipoPermiso = catalogoCompleto.TiposPermisosPermitidos
                    .FirstOrDefault(t => t.ClAbPre == solicitud.ClAbPre.ToString());

                var dto = new SolicitudPermisoDto
                {
                    Id = solicitud.Id,
                    NominaEmpleado = solicitud.Nomina,
                    NombreEmpleado = solicitud.Nombre ?? string.Empty,
                    ClAbPre = solicitud.ClAbPre.ToString(),
                    ClaveVisualizacion = tipoPermiso?.ClaveVisualizacion ?? solicitud.ClAbPre.ToString(),
                    DescripcionPermiso = tipoPermiso?.Concepto ?? solicitud.ClaseAbsentismo,
                    FechaInicio = solicitud.Desde.ToString("yyyy-MM-dd"),
                    FechaFin = solicitud.Hasta.ToString("yyyy-MM-dd"),
                    Observaciones = solicitud.Observaciones,
                    Estado = solicitud.EstadoSolicitud ?? "Pendiente",
                    MotivoRechazo = solicitud.MotivoRechazo,
                    FechaSolicitud = solicitud.FechaSolicitud ?? DateTime.Now,
                    FechaRespuesta = solicitud.FechaRespuesta,
                    DelegadoNombre = delegadoNombre ?? "N/A",
                    JefeAreaNombre = jefeNombre
                };

                return Ok(new ApiResponse<SolicitudPermisoDto>(true, dto, null));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener solicitud {Id}", id);
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        /// <summary>
        /// Aprueba o rechaza una solicitud de permiso (solo jefes de área)
        /// </summary>
        [HttpPost("responder")]
        [Authorize(Roles = "Jefe De Area,SuperUsuario,Gerente BT,GerenteBT")]
        public async Task<IActionResult> ResponderSolicitud([FromBody] ResponderSolicitudPermisoRequest request)
        {
            try
            {
                if (!ModelState.IsValid)
                {
                    var errors = string.Join("; ", ModelState
                        .SelectMany(x => x.Value?.Errors ?? Enumerable.Empty<Microsoft.AspNetCore.Mvc.ModelBinding.ModelError>())
                        .Select(x => x.ErrorMessage));
                    return BadRequest(new ApiResponse<object>(false, null, $"Datos inválidos: {errors}"));
                }

                var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(userIdClaim) || !int.TryParse(userIdClaim, out var jefeId))
                {
                    return Unauthorized(new ApiResponse<object>(false, null, "Usuario no identificado"));
                }

                _logger.LogInformation(
                    "Jefe {JefeId} respondiendo solicitud {SolicitudId}: {Accion}",
                    jefeId, request.SolicitudId, request.Aprobar ? "Aprobar" : "Rechazar");

                var response = await _solicitudesService.ResponderSolicitudAsync(request, jefeId);

                if (!response.Success)
                {
                    return BadRequest(response);
                }

                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al responder solicitud");
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        [HttpGet("historial/{nomina}")]
        [Authorize]
        public async Task<IActionResult> ObtenerHistorialEmpleado(
        [FromRoute] int nomina,
        [FromQuery] int? anio = null)
        {
            try
            {
                // FIX privacidad: un sindicalizado (u otro rol no privilegiado) solo puede
                // consultar su propio historial de permisos. Se compara contra la Nomina
                // del usuario autenticado. Roles que sí pueden consultar cualquier empleado:
                // SuperUsuario, Jefe de Área, Ingeniero Industrial, Delegado Sindical, Gerente BT, RH.
                var puedeConsultarOtros = User.IsInRole("SuperUsuario")
                    || User.IsInRole("JefeArea") || User.IsInRole("Jefe De Area")
                    || User.IsInRole("IngenieroIndustrial") || User.IsInRole("Ingeniero Industrial")
                    || User.IsInRole("DelegadoSindical") || User.IsInRole("Delegado Sindical")
                    || User.IsInRole("Gerente BT") || User.IsInRole("GerenteBT")
                    || User.IsInRole("RH");
                if (!puedeConsultarOtros)
                {
                    var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                    if (!int.TryParse(userIdClaim, out var usuarioId))
                    {
                        return Unauthorized(new ApiResponse<object>(false, null, "No se pudo identificar el usuario"));
                    }
                    var nominaUsuario = await _db.Users
                        .Where(u => u.Id == usuarioId)
                        .Select(u => u.Nomina)
                        .FirstOrDefaultAsync();
                    if (nominaUsuario == null || nominaUsuario.Value != nomina)
                    {
                        _logger.LogWarning(
                            "Usuario {UsuarioId} (Nomina={NominaUser}) intentó consultar historial de permisos de nomina {NominaSolicitada} - bloqueado",
                            usuarioId, nominaUsuario, nomina);
                        return Forbid();
                    }
                }

                var response = await _solicitudesService.ObtenerHistorialPorEmpleadoAsync(nomina, anio);

                if (!response.Success)
                {
                    return BadRequest(response);
                }

                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener historial de nómina {Nomina}", nomina);
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }
    }
}