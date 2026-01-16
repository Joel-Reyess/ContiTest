using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using tiempo_libre.Models;
using tiempo_libre.DTOs;

namespace tiempo_libre.Services
{
    public class SolicitudesPermisosService
    {
        private readonly FreeTimeDbContext _db;
        private readonly PermisosIncapacidadesService _permisosService;
        private readonly NotificacionesService _notificacionesService;
        private readonly ILogger<SolicitudesPermisosService> _logger;

        // Códigos que NO pueden solicitar los delegados sindicales
        private readonly HashSet<string> _codigosRestringidos = new()
        {
            "2380", // Inc. Enfermedad General (cuando contexto es enfermedad)
            "2381", // Inc. Accidente de Trabajo (código A)
            "2394", // Inc. Pble. Riesgo Trabajo
            "2123"  // Suspensión
        };

        public SolicitudesPermisosService(
            FreeTimeDbContext db,
            PermisosIncapacidadesService permisosService,
            NotificacionesService notificacionesService,
            ILogger<SolicitudesPermisosService> logger)
        {
            _db = db;
            _permisosService = permisosService;
            _notificacionesService = notificacionesService;
            _logger = logger;
        }

        /// <summary>
        /// Obtiene solicitudes pendientes para un jefe de área
        /// </summary>
        public async Task<ApiResponse<ConsultarSolicitudesResponse>> ObtenerSolicitudesPendientesParaJefeAsync(int jefeId)
        {
            try
            {
                var consultaRequest = new ConsultarSolicitudesRequest
                {
                    Estado = "Pendiente"
                    // El filtro por jefe se hará en la query
                };

                return await ConsultarSolicitudesAsync(consultaRequest, jefeId);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener solicitudes pendientes para jefe {JefeId}", jefeId);
                return new ApiResponse<ConsultarSolicitudesResponse>(
                    false, null, $"Error inesperado: {ex.Message}");
            }
        }

        /// <summary>
        /// Obtiene catálogo de permisos permitidos para delegados
        /// </summary>
        public CatalogoPermisosDelegadoResponse ObtenerCatalogoParaDelegado()
        {
            var catalogoCompleto = _permisosService.ObtenerCatalogoPermisos();

            // Filtrar permisos no permitidos
            var permitidos = catalogoCompleto.TiposPermisos
                .Where(t => !EsCodigoRestringido(t.ClAbPre, t.Concepto))
                .ToList();

            return new CatalogoPermisosDelegadoResponse
            {
                TiposPermisosPermitidos = permitidos
            };
        }

        private bool EsCodigoRestringido(string clAbPre, string concepto)
        {
            // Definir los conceptos restringidos exactos
            var conceptosRestringidos = new Dictionary<string, string>
            {
                { "2380", "Inc. Enfermedad General" },
                { "2381", "Inc. Accidente de  Trabajo" }, // Nota: dos espacios como en tu lista
                { "2394", "Inc. Pble. Riesgo Trabajo" },
                { "2123", "Suspensión" }
            };

            // Verificar si el código está en la lista de restringidos
            if (conceptosRestringidos.TryGetValue(clAbPre, out var conceptoRestringido))
            {
                // Comparar concepto exacto (ignorar mayúsculas/minúsculas y espacios extra)
                return concepto.Trim().Equals(conceptoRestringido.Trim(), StringComparison.OrdinalIgnoreCase);
            }

            return false;
        }

        /// <summary>
        /// Crea una solicitud de permiso
        /// </summary>
        public async Task<ApiResponse<CrearSolicitudPermisoResponse>> CrearSolicitudAsync(
            CrearSolicitudPermisoRequest request,
            int delegadoId)
        {
            using var transaction = await _db.Database.BeginTransactionAsync();

            try
            {

                _logger.LogInformation(
            "=== INICIO CrearSolicitudAsync === Nomina: {Nomina}, ClAbPre: {ClAbPre}, FechaInicio: '{FechaInicio}', FechaFin: '{FechaFin}', Observaciones: '{Observaciones}', DelegadoId: {DelegadoId}",
            request.Nomina,
            request.ClAbPre,
            request.FechaInicio,
            request.FechaFin,
            request.Observaciones ?? "NULL",
            delegadoId
        );

                // 1. Validar que el usuario es delegado sindical
                var delegado = await _db.Users
                    .Include(u => u.Roles)
                    .Include(u => u.Area)
                    .FirstOrDefaultAsync(u => u.Id == delegadoId);

                var rolesPermitidos = new[] {
    "Delegado Sindical",
    "DelegadoSindical",
    "Empleado Sindicalizado",
    "EmpleadoSindicalizado"
};

                if (delegado == null || !delegado.Roles.Any(r => rolesPermitidos.Contains(r.Name)))
                {
                    _logger.LogWarning(
                        "Usuario {DelegadoId} no tiene rol permitido. Roles actuales: {Roles}",
                        delegadoId,
                        string.Join(", ", delegado?.Roles.Select(r => r.Name) ?? new string[] { "Sin roles" })
                    );
                    return new ApiResponse<CrearSolicitudPermisoResponse>(
                        false, null, "Solo delegados sindicales pueden crear solicitudes de permisos");
                }

                // 2. Validar que el empleado existe
                var empleado = await _db.Users
                    .Include(u => u.Grupo)
                        .ThenInclude(g => g.Area)
                    .FirstOrDefaultAsync(u => u.Nomina == request.Nomina);

                if (empleado == null)
                {
                    return new ApiResponse<CrearSolicitudPermisoResponse>(
                        false, null, $"No se encontró empleado con nómina {request.Nomina}");
                }
                //3 Parsear y validar fechas con formato específico
                if (!DateOnly.TryParseExact(request.FechaInicio, "yyyy-MM-dd",
                    System.Globalization.CultureInfo.InvariantCulture,
                    System.Globalization.DateTimeStyles.None,
                    out var fechaInicio))
                {
                    _logger.LogError("Formato de fecha inicio inválido: {FechaInicio}", request.FechaInicio);
                    return new ApiResponse<CrearSolicitudPermisoResponse>(
                        false, null, $"Formato de fecha inicio inválido: {request.FechaInicio}. Use formato yyyy-MM-dd");
                }

                if (!DateOnly.TryParseExact(request.FechaFin, "yyyy-MM-dd",
                    System.Globalization.CultureInfo.InvariantCulture,
                    System.Globalization.DateTimeStyles.None,
                    out var fechaFin))
                {
                    _logger.LogError("Formato de fecha fin inválido: {FechaFin}", request.FechaFin);
                    return new ApiResponse<CrearSolicitudPermisoResponse>(
                        false, null, $"Formato de fecha fin inválido: {request.FechaFin}. Use formato yyyy-MM-dd");
                }

                // 4. Validar fechas
                if (fechaFin < fechaInicio)
                {
                    return new ApiResponse<CrearSolicitudPermisoResponse>(
                        false, null, "La fecha fin no puede ser anterior a la fecha de inicio");
                }

                // 4. Validar que el código de permiso está permitido
                var catalogoCompleto = _permisosService.ObtenerCatalogoPermisos();
                var tipoPermiso = catalogoCompleto.TiposPermisos
                    .FirstOrDefault(t => t.ClAbPre == request.ClAbPre);

                if (tipoPermiso == null)
                {
                    return new ApiResponse<CrearSolicitudPermisoResponse>(
                        false, null, "Código de permiso no válido");
                }

                if (EsCodigoRestringido(request.ClAbPre, tipoPermiso.Concepto))
                {
                    return new ApiResponse<CrearSolicitudPermisoResponse>(
                        false, null,
                        "Este tipo de permiso no puede ser solicitado por delegados. Debe ser registrado directamente por el área de recursos humanos.");
                }


                // 5. Obtener jefe de área
                var areaId = empleado.Grupo?.AreaId ?? empleado.AreaId;
                var area = await _db.Areas.FirstOrDefaultAsync(a => a.AreaId == areaId);
                //var fechaInicio = request.FechaInicio.ToDateTime(TimeOnly.MinValue);
                //var fechaFin = request.FechaFin.ToDateTime(TimeOnly.MinValue);

                // 6. Crear solicitud
                var solicitud = new PermisosEIncapacidadesSAP
                {
                    Nomina = request.Nomina,
                    Nombre = empleado.FullName,
                    Posicion = empleado.Posicion ?? "N/A",
                    Desde = fechaInicio,
                    Hasta = fechaFin,
                    ClAbPre = int.Parse(request.ClAbPre),
                    ClaseAbsentismo = tipoPermiso.Concepto,
                    Observaciones = request.Observaciones,
                    EsRegistroManual = false, // ✅ Las solicitudes NO son manuales
                    FechaRegistro = DateTime.Now,

                    // ✅ Campos específicos para solicitudes
                    EstadoSolicitud = "Pendiente",
                    DelegadoSolicitanteId = delegadoId,
                    JefeAprobadorId = area?.JefeId,
                    FechaSolicitud = DateTime.Now
                };

                _db.PermisosEIncapacidadesSAP.Add(solicitud);
                await _db.SaveChangesAsync();


                // 7. Notificar al jefe de área
                if (area?.JefeId != null)
                {
                    await _notificacionesService.CrearNotificacionAsync(
                        Models.Enums.TiposDeNotificacionEnum.SolicitudPermiso,
                        $"Nueva solicitud de permiso - {empleado.FullName}",
                        $"El delegado sindical {delegado.FullName} ha solicitado un permiso para {empleado.FullName} " +
                        $"({tipoPermiso.Concepto}) del {fechaInicio:dd/MM/yyyy} al {fechaFin:dd/MM/yyyy}.",
                        delegado.FullName,
                        area.JefeId.Value,
                        delegadoId,
                        areaId,
                        empleado.GrupoId,
                        "SolicitudPermiso",
                        solicitud.Id,
                        new
                        {
                            SolicitudId = solicitud.Id,
                            Nomina = request.Nomina,
                            TipoPermiso = tipoPermiso.ClaveVisualizacion,
                            FechaInicio = request.FechaInicio,
                            FechaFin = request.FechaFin
                        }
                    );
                }

                await transaction.CommitAsync();

                var response = new CrearSolicitudPermisoResponse
                {
                    Exitoso = true,
                    Mensaje = "Solicitud de permiso creada exitosamente. Pendiente de aprobación.",
                    SolicitudId = solicitud.Id,
                    Estado = solicitud.EstadoSolicitud,
                    NombreEmpleado = empleado.FullName,
                    TipoPermiso = tipoPermiso.ClaveVisualizacion,
                    FechaInicio = fechaInicio.ToDateTime(TimeOnly.MinValue),
                    FechaFin = fechaFin.ToDateTime(TimeOnly.MinValue)
                };

                _logger.LogInformation(
                    "Solicitud de permiso creada. ID: {SolicitudId}, Nómina: {Nomina}, Tipo: {Tipo}",
                    solicitud.Id, request.Nomina, request.ClAbPre);

                return new ApiResponse<CrearSolicitudPermisoResponse>(true, response, null);
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                _logger.LogError(ex, "Error al crear solicitud de permiso para nómina {Nomina}", request.Nomina);
                return new ApiResponse<CrearSolicitudPermisoResponse>(
                    false, null, $"Error inesperado: {ex.Message}");
            }
        }

        /// <summary>
        /// Consulta solicitudes de permisos
        /// </summary>
        public async Task<ApiResponse<ConsultarSolicitudesResponse>> ConsultarSolicitudesAsync(
    ConsultarSolicitudesRequest request, int? jefeId = null)
        {
            try
            {
                var query = _db.PermisosEIncapacidadesSAP
                    .Where(p => p.EstadoSolicitud != null) // ✅ Solo solicitudes
                    .AsQueryable();

                if (request.NominaEmpleado.HasValue)
                    query = query.Where(s => s.Nomina == request.NominaEmpleado.Value);

                if (request.DelegadoId.HasValue)
                    query = query.Where(s => s.DelegadoSolicitanteId == request.DelegadoId.Value);

                if (jefeId.HasValue)
                    query = query.Where(s => s.JefeAprobadorId == jefeId.Value);

                if (!string.IsNullOrEmpty(request.Estado))
                    query = query.Where(s => s.EstadoSolicitud == request.Estado);

                if (!string.IsNullOrEmpty(request.FechaInicio) && DateOnly.TryParse(request.FechaInicio, out var filtroFechaInicio))
                    query = query.Where(s => s.Desde >= filtroFechaInicio);

                if (!string.IsNullOrEmpty(request.FechaFin) && DateOnly.TryParse(request.FechaFin, out var filtroFechaFin))
                    query = query.Where(s => s.Hasta <= filtroFechaFin);

                // ✅ CAMBIO IMPORTANTE: Traer SOLO los datos necesarios de la BD
                var solicitudesRaw = await query
                    .OrderByDescending(s => s.FechaSolicitud)
                    .Select(s => new
                    {
                        s.Id,
                        s.Nomina,
                        s.Nombre,
                        s.ClAbPre,
                        Desde = s.Desde,
                        Hasta = s.Hasta,
                        s.Observaciones,
                        s.EstadoSolicitud,
                        s.MotivoRechazo,
                        s.FechaSolicitud,
                        s.FechaRespuesta,
                        s.DelegadoSolicitanteId,
                        s.JefeAprobadorId
                    })
                    .ToListAsync();

                // Obtener IDs únicos de delegados y jefes
                var delegadoIds = solicitudesRaw
                    .Where(s => s.DelegadoSolicitanteId.HasValue)
                    .Select(s => s.DelegadoSolicitanteId.Value)
                    .Distinct()
                    .ToList();

                var jefeIds = solicitudesRaw
                    .Where(s => s.JefeAprobadorId.HasValue)
                    .Select(s => s.JefeAprobadorId.Value)
                    .Distinct()
                    .ToList();

                // Consultar nombres en batch
                var delegados = await _db.Users
                    .Where(u => delegadoIds.Contains(u.Id))
                    .ToDictionaryAsync(u => u.Id, u => u.FullName);

                var jefes = await _db.Users
                    .Where(u => jefeIds.Contains(u.Id))
                    .ToDictionaryAsync(u => u.Id, u => u.FullName);

                var catalogoCompleto = _permisosService.ObtenerCatalogoPermisos();

                // ✅ AHORA SÍ mapear a DTO en memoria
                var solicitudesDto = solicitudesRaw.Select(s =>
                {
                    var tipoPermiso = catalogoCompleto.TiposPermisos
                        .FirstOrDefault(t => t.ClAbPre == s.ClAbPre.ToString());

                    return new SolicitudPermisoDto
                    {
                        Id = s.Id,
                        NominaEmpleado = s.Nomina, // ✅ Ya es int
                        NombreEmpleado = s.Nombre ?? string.Empty,
                        ClAbPre = s.ClAbPre.ToString(),
                        ClaveVisualizacion = tipoPermiso?.ClaveVisualizacion ?? s.ClAbPre.ToString(),
                        DescripcionPermiso = tipoPermiso?.Concepto ?? "Permiso",
                        FechaInicio = s.Desde.ToString("yyyy-MM-dd"),
                        FechaFin = s.Hasta.ToString("yyyy-MM-dd"),
                        Observaciones = s.Observaciones,
                        Estado = s.EstadoSolicitud ?? "Pendiente",
                        MotivoRechazo = s.MotivoRechazo,
                        FechaSolicitud = s.FechaSolicitud ?? DateTime.Now,
                        FechaRespuesta = s.FechaRespuesta,
                        DelegadoNombre = s.DelegadoSolicitanteId.HasValue &&
                                         delegados.TryGetValue(s.DelegadoSolicitanteId.Value, out var delNombre)
                            ? delNombre
                            : "N/A",
                        JefeAreaNombre = s.JefeAprobadorId.HasValue &&
                                         jefes.TryGetValue(s.JefeAprobadorId.Value, out var jefeNombre)
                            ? jefeNombre
                            : null
                    };
                }).ToList();

                var response = new ConsultarSolicitudesResponse
                {
                    TotalRegistros = solicitudesDto.Count,
                    Solicitudes = solicitudesDto
                };

                return new ApiResponse<ConsultarSolicitudesResponse>(true, response, null);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al consultar solicitudes de permisos");
                return new ApiResponse<ConsultarSolicitudesResponse>(
                    false, null, $"Error inesperado: {ex.Message}");
            }
        }

        /// <summary>
        /// Aprueba o rechaza una solicitud
        /// </summary>
        public async Task<ApiResponse<object>> ResponderSolicitudAsync(
            ResponderSolicitudPermisoRequest request,
            int jefeAreaId)
        {
            using var transaction = await _db.Database.BeginTransactionAsync();

            try
            {
                // ✅ Consulta solo para validar (SIN actualizar)
                var solicitudValidacion = await _db.PermisosEIncapacidadesSAP
                    .AsNoTracking()
                    .Where(p => p.Id == request.SolicitudId && p.FechaSolicitud != null)
                    .Select(p => new
                    {
                        p.Id,
                        p.Nomina,
                        p.Nombre,
                        p.ClAbPre,
                        p.EstadoSolicitud,
                        p.DelegadoSolicitanteId,
                        p.JefeAprobadorId
                    })
                    .FirstOrDefaultAsync();

                if (solicitudValidacion == null)
                {
                    return new ApiResponse<object>(false, null, "Solicitud no encontrada");
                }

                if (solicitudValidacion.EstadoSolicitud != "Pendiente")
                {
                    return new ApiResponse<object>(false, null,
                        $"La solicitud ya fue {solicitudValidacion.EstadoSolicitud.ToLower()}");
                }

                if (solicitudValidacion.JefeAprobadorId != jefeAreaId)
                {
                    return new ApiResponse<object>(false, null,
                        "No tiene permisos para responder esta solicitud");
                }

                // ✅ Ahora SÍ actualizar el registro completo
                var registroActualizar = await _db.PermisosEIncapacidadesSAP
                    .FirstOrDefaultAsync(p => p.Id == request.SolicitudId);

                if (registroActualizar == null)
                {
                    return new ApiResponse<object>(false, null, "Error al actualizar solicitud");
                }

                if (request.Aprobar)
                {
                    registroActualizar.EstadoSolicitud = "Aprobada";
                    registroActualizar.FechaRespuesta = DateTime.Now;
                }
                else
                {
                    registroActualizar.EstadoSolicitud = "Rechazada";
                    registroActualizar.MotivoRechazo = request.MotivoRechazo;
                    registroActualizar.FechaRespuesta = DateTime.Now;
                }

                await _db.SaveChangesAsync();

                // Notificar al delegado
                var jefeArea = await _db.Users.FindAsync(jefeAreaId);
                await _notificacionesService.CrearNotificacionAsync(
                    Models.Enums.TiposDeNotificacionEnum.RespuestaSolicitud,
                    $"Solicitud de permiso {registroActualizar.EstadoSolicitud.ToLower()}",
                    $"La solicitud de permiso para {solicitudValidacion.Nombre} ha sido {registroActualizar.EstadoSolicitud.ToLower()}" +
                    (request.Aprobar ? "." : $". Motivo: {request.MotivoRechazo}"),
                    jefeArea?.FullName ?? "Jefe de Área",
                    solicitudValidacion.DelegadoSolicitanteId ?? 0,
                    jefeAreaId,
                    null,
                    null,
                    "SolicitudPermiso",
                    solicitudValidacion.Id,
                    new
                    {
                        SolicitudId = solicitudValidacion.Id,
                        Estado = registroActualizar.EstadoSolicitud,
                        MotivoRechazo = registroActualizar.MotivoRechazo
                    }
                );

                await transaction.CommitAsync();

                _logger.LogInformation(
                    "Solicitud {SolicitudId} {Estado} por jefe {JefeId}",
                    solicitudValidacion.Id, registroActualizar.EstadoSolicitud, jefeAreaId);

                return new ApiResponse<object>(true, null,
                    $"Solicitud {registroActualizar.EstadoSolicitud.ToLower()} exitosamente");
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                _logger.LogError(ex, "Error al responder solicitud {SolicitudId}", request.SolicitudId);
                return new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}");
            }
        }

        public async Task<ApiResponse<ConsultarSolicitudesResponse>> ObtenerHistorialPorEmpleadoAsync(
    int nominaEmpleado,
    int? anio = null)
        {
            try
            {
                var request = new ConsultarSolicitudesRequest
                {
                    NominaEmpleado = nominaEmpleado,
                    Estado = null // Traer todas (pendientes, aprobadas, rechazadas)
                };

                if (anio.HasValue)
                {
                    var fechaInicio = new DateOnly(anio.Value, 1, 1).ToString("yyyy-MM-dd");
                    var fechaFin = new DateOnly(anio.Value, 12, 31).ToString("yyyy-MM-dd");
                    request.FechaInicio = fechaInicio;
                    request.FechaFin = fechaFin;
                }

                return await ConsultarSolicitudesAsync(request);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener historial de permisos");
                return new ApiResponse<ConsultarSolicitudesResponse>(
                    false, null, $"Error inesperado: {ex.Message}");
            }
        }

    }
}