using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using tiempo_libre.DTOs;
using tiempo_libre.Models;
using tiempo_libre.Models.Enums;

namespace tiempo_libre.Services
{
    public class EdicionDiasEmpresaService
    {
        private readonly FreeTimeDbContext _db;
        private readonly NotificacionesService _notificacionesService;
        private readonly ILogger<EdicionDiasEmpresaService> _logger;

        public EdicionDiasEmpresaService(
            FreeTimeDbContext db,
            NotificacionesService notificacionesService,
            ILogger<EdicionDiasEmpresaService> logger)
        {
            _db = db;
            _notificacionesService = notificacionesService;
            _logger = logger;
        }

        // ─── Configuración ─────────────────────────────────────────────────────

        public async Task<ConfiguracionEdicionDiasEmpresaDto?> ObtenerConfiguracionActivaAsync()
        {
            var config = await _db.ConfiguracionEdicionDiasEmpresa
                .OrderByDescending(c => c.Id)
                .FirstOrDefaultAsync();

            if (config == null) return null;

            return MapearConfiguracion(config);
        }

        public async Task<ApiResponse<ConfiguracionEdicionDiasEmpresaDto>> CrearConfiguracionAsync(
            CrearConfiguracionEdicionRequest request, int usuarioId)
        {
            if (request.FechaFinPeriodo < request.FechaInicioPeriodo)
                return new ApiResponse<ConfiguracionEdicionDiasEmpresaDto>(false, null,
                    "La fecha fin del periodo debe ser posterior a la fecha inicio.");

            var config = new ConfiguracionEdicionDiasEmpresa
            {
                Habilitado = request.Habilitado,
                FechaInicioPeriodo = request.FechaInicioPeriodo,
                FechaFinPeriodo = request.FechaFinPeriodo,
                Descripcion = request.Descripcion,
                CreadoPorId = usuarioId,
                CreatedAt = DateTime.UtcNow
            };

            _db.ConfiguracionEdicionDiasEmpresa.Add(config);
            await _db.SaveChangesAsync();

            _logger.LogInformation("Configuración edición días empresa creada Id={Id} por usuario={UserId}", config.Id, usuarioId);
            return new ApiResponse<ConfiguracionEdicionDiasEmpresaDto>(true, MapearConfiguracion(config),
                "Configuración creada exitosamente.");
        }

        public async Task<ApiResponse<ConfiguracionEdicionDiasEmpresaDto>> ToggleHabilitadoAsync(int usuarioId)
        {
            var config = await _db.ConfiguracionEdicionDiasEmpresa
                .OrderByDescending(c => c.Id)
                .FirstOrDefaultAsync();

            if (config == null)
                return new ApiResponse<ConfiguracionEdicionDiasEmpresaDto>(false, null,
                    "No existe configuración. Cree una primero.");

            config.Habilitado = !config.Habilitado;
            config.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();

            var estado = config.Habilitado ? "habilitada" : "deshabilitada";
            _logger.LogInformation("Edición días empresa {Estado} por usuario={UserId}", estado, usuarioId);
            return new ApiResponse<ConfiguracionEdicionDiasEmpresaDto>(true, MapearConfiguracion(config),
                $"Edición de días {estado} exitosamente.");
        }

        // ─── Solicitudes ────────────────────────────────────────────────────────

        public async Task<ApiResponse<SolicitudEdicionDiaEmpresaDto>> SolicitarEdicionAsync(
            SolicitarEdicionDiaEmpresaRequest request, int usuarioSolicitanteId)
        {
            using var transaction = await _db.Database.BeginTransactionAsync();
            try
            {
                // Verificar que la edición esté habilitada
                var config = await _db.ConfiguracionEdicionDiasEmpresa
                    .OrderByDescending(c => c.Id)
                    .FirstOrDefaultAsync();

                if (config == null || !config.Habilitado)
                    return new ApiResponse<SolicitudEdicionDiaEmpresaDto>(false, null,
                        "La edición de días asignados por empresa no está habilitada en este momento.");

                // Validar que la fecha nueva esté dentro del periodo permitido
                if (request.FechaNueva < config.FechaInicioPeriodo || request.FechaNueva > config.FechaFinPeriodo)
                    return new ApiResponse<SolicitudEdicionDiaEmpresaDto>(false, null,
                        $"La fecha seleccionada debe estar entre {config.FechaInicioPeriodo:dd/MM/yyyy} y {config.FechaFinPeriodo:dd/MM/yyyy}.");

                // Obtener el empleado
                var empleado = await _db.Users
                    .Include(u => u.Area)
                    .Include(u => u.Grupo)
                    .FirstOrDefaultAsync(u => u.Id == request.EmpleadoId);

                if (empleado == null)
                    return new ApiResponse<SolicitudEdicionDiaEmpresaDto>(false, null, "Empleado no encontrado.");

                // Validar vacación original
                var vacacion = await _db.VacacionesProgramadas
                    .FirstOrDefaultAsync(v => v.Id == request.VacacionOriginalId && v.EmpleadoId == request.EmpleadoId);

                if (vacacion == null)
                    return new ApiResponse<SolicitudEdicionDiaEmpresaDto>(false, null,
                        "La vacación especificada no existe o no pertenece al empleado.");

                if (vacacion.EstadoVacacion == "Cancelada")
                    return new ApiResponse<SolicitudEdicionDiaEmpresaDto>(false, null,
                        "No se puede solicitar edición de una vacación cancelada.");

                // Evitar solicitud duplicada activa
                var solicitudExistente = await _db.SolicitudesEdicionDiasEmpresa
                    .AnyAsync(s => s.VacacionOriginalId == request.VacacionOriginalId
                                && s.EstadoSolicitud == "Pendiente");

                if (solicitudExistente)
                    return new ApiResponse<SolicitudEdicionDiaEmpresaDto>(false, null,
                        "Ya existe una solicitud pendiente para este día.");

                // Obtener jefe de área del empleado via Area.JefeId
                int? jefeAreaId = null;
                if (empleado.AreaId.HasValue)
                {
                    var area = await _db.Areas
                        .Where(a => a.AreaId == empleado.AreaId && a.JefeId.HasValue)
                        .FirstOrDefaultAsync();
                    jefeAreaId = area?.JefeId;
                }

                var solicitud = new SolicitudEdicionDiaEmpresa
                {
                    EmpleadoId = request.EmpleadoId,
                    VacacionOriginalId = request.VacacionOriginalId,
                    FechaOriginal = vacacion.FechaVacacion,
                    FechaNueva = request.FechaNueva,
                    EstadoSolicitud = "Pendiente",
                    JefeAreaId = jefeAreaId,
                    SolicitadoPorId = usuarioSolicitanteId,
                    ObservacionesEmpleado = request.ObservacionesEmpleado,
                    FechaSolicitud = DateTime.UtcNow,
                    CreatedAt = DateTime.UtcNow
                };

                _db.SolicitudesEdicionDiasEmpresa.Add(solicitud);
                await _db.SaveChangesAsync();

                // Notificar al jefe de área
                if (jefeAreaId.HasValue)
                {
                    var solicitante = await _db.Users.FindAsync(usuarioSolicitanteId);
                    await _notificacionesService.CrearNotificacionAsync(
                        TiposDeNotificacionEnum.SolicitudEdicionDiaEmpresa,
                        "Solicitud de edición de día empresa",
                        $"{empleado.FullName} solicita cambiar el día {vacacion.FechaVacacion:dd/MM/yyyy} por {request.FechaNueva:dd/MM/yyyy}.",
                        solicitante?.FullName ?? empleado.FullName,
                        idUsuarioReceptor: jefeAreaId,
                        idUsuarioEmisor: usuarioSolicitanteId,
                        areaId: empleado.AreaId,
                        grupoId: empleado.GrupoId,
                        tipoMovimiento: "Edición Día Empresa",
                        idSolicitud: solicitud.Id,
                        metadatos: new { SolicitudId = solicitud.Id, EmpleadoId = request.EmpleadoId }
                    );
                }

                await transaction.CommitAsync();

                var dto = await ObtenerSolicitudDtoAsync(solicitud.Id);
                return new ApiResponse<SolicitudEdicionDiaEmpresaDto>(true, dto, "Solicitud enviada exitosamente.");
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                _logger.LogError(ex, "Error al solicitar edición de día empresa");
                return new ApiResponse<SolicitudEdicionDiaEmpresaDto>(false, null, $"Error inesperado: {ex.Message}");
            }
        }

        public async Task<ApiResponse<SolicitudEdicionDiaEmpresaDto>> ResponderSolicitudAsync(
            ResponderEdicionDiaEmpresaRequest request, int jefeId)
        {
            using var transaction = await _db.Database.BeginTransactionAsync();
            try
            {
                var solicitud = await _db.SolicitudesEdicionDiasEmpresa
                    .Include(s => s.Empleado)
                    .Include(s => s.VacacionOriginal)
                    .Include(s => s.JefeArea)
                    .FirstOrDefaultAsync(s => s.Id == request.SolicitudId);

                if (solicitud == null)
                    return new ApiResponse<SolicitudEdicionDiaEmpresaDto>(false, null, "Solicitud no encontrada.");

                if (solicitud.EstadoSolicitud != "Pendiente")
                    return new ApiResponse<SolicitudEdicionDiaEmpresaDto>(false, null,
                        "Esta solicitud ya fue procesada.");

                var jefe = await _db.Users.FindAsync(jefeId);

                if (request.Aprobar)
                {
                    solicitud.EstadoSolicitud = "Aprobada";
                    solicitud.ObservacionesJefe = request.ObservacionesJefe;

                    // Actualizar la vacación programada con la nueva fecha
                    solicitud.VacacionOriginal.FechaVacacion = solicitud.FechaNueva;
                    solicitud.VacacionOriginal.UpdatedAt = DateTime.UtcNow;
                    solicitud.VacacionOriginal.UpdatedBy = jefeId;
                    solicitud.VacacionOriginal.Observaciones =
                        $"Día editado: original {solicitud.FechaOriginal:dd/MM/yyyy} → {solicitud.FechaNueva:dd/MM/yyyy}";
                }
                else
                {
                    solicitud.EstadoSolicitud = "Rechazada";
                    solicitud.MotivoRechazo = request.MotivoRechazo;
                    solicitud.ObservacionesJefe = request.ObservacionesJefe;
                }

                solicitud.JefeAreaId = jefeId;
                solicitud.FechaRespuesta = DateTime.UtcNow;
                solicitud.UpdatedAt = DateTime.UtcNow;

                await _db.SaveChangesAsync();

                // Notificar al empleado
                var tipoNotif = request.Aprobar
                    ? TiposDeNotificacionEnum.RespuestaEdicionDiaEmpresa
                    : TiposDeNotificacionEnum.RespuestaEdicionDiaEmpresa;

                var titulo = request.Aprobar ? "Solicitud aprobada" : "Solicitud rechazada";
                var mensaje = request.Aprobar
                    ? $"Tu solicitud para cambiar el día {solicitud.FechaOriginal:dd/MM/yyyy} por {solicitud.FechaNueva:dd/MM/yyyy} fue aprobada."
                    : $"Tu solicitud para cambiar el día {solicitud.FechaOriginal:dd/MM/yyyy} fue rechazada. {request.MotivoRechazo}";

                await _notificacionesService.CrearNotificacionAsync(
                    tipoNotif,
                    titulo,
                    mensaje,
                    jefe?.FullName ?? "Jefe de Área",
                    idUsuarioReceptor: solicitud.EmpleadoId,
                    idUsuarioEmisor: jefeId,
                    tipoMovimiento: "Respuesta Edición Día Empresa",
                    idSolicitud: solicitud.Id
                );

                if (solicitud.SolicitadoPorId.HasValue && solicitud.SolicitadoPorId != solicitud.EmpleadoId)
                {
                    await _notificacionesService.CrearNotificacionAsync(
                        tipoNotif,
                        titulo,
                        mensaje,
                        jefe?.FullName ?? "Jefe de Área",
                        idUsuarioReceptor: solicitud.SolicitadoPorId,
                        idUsuarioEmisor: jefeId,
                        tipoMovimiento: "Respuesta Edición Día Empresa",
                        idSolicitud: solicitud.Id
                    );
                }

                await transaction.CommitAsync();

                var dto = await ObtenerSolicitudDtoAsync(solicitud.Id);
                var mensajeResp = request.Aprobar ? "Solicitud aprobada y vacación actualizada." : "Solicitud rechazada.";
                return new ApiResponse<SolicitudEdicionDiaEmpresaDto>(true, dto, mensajeResp);
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                _logger.LogError(ex, "Error al responder solicitud edición día empresa Id={Id}", request.SolicitudId);
                return new ApiResponse<SolicitudEdicionDiaEmpresaDto>(false, null, $"Error inesperado: {ex.Message}");
            }
        }

        public async Task<List<SolicitudEdicionDiaEmpresaDto>> ObtenerSolicitudesPorEmpleadoAsync(int empleadoId)
        {
            var solicitudes = await _db.SolicitudesEdicionDiasEmpresa
                .Include(s => s.Empleado)
                .Include(s => s.JefeArea)
                .Include(s => s.SolicitadoPor)
                .Where(s => s.EmpleadoId == empleadoId || s.SolicitadoPorId == empleadoId)
                .OrderByDescending(s => s.FechaSolicitud)
                .ToListAsync();

            return solicitudes.Select(MapearSolicitud).ToList();
        }

        public async Task<List<SolicitudEdicionDiaEmpresaDto>> ObtenerSolicitudesPendientesJefeAsync(int jefeId)
        {
            var areaDelJefe = await _db.Areas.FirstOrDefaultAsync(a => a.JefeId == jefeId);
            if (areaDelJefe == null) return new List<SolicitudEdicionDiaEmpresaDto>();

            var solicitudes = await _db.SolicitudesEdicionDiasEmpresa
                .Include(s => s.Empleado)
                    .ThenInclude(e => e.Area)
                .Include(s => s.Empleado)
                    .ThenInclude(e => e.Grupo)
                .Include(s => s.JefeArea)
                .Include(s => s.SolicitadoPor)
                .Where(s => s.Empleado.AreaId == areaDelJefe.AreaId && s.EstadoSolicitud == "Pendiente")
                .OrderBy(s => s.FechaSolicitud)
                .ToListAsync();

            return solicitudes.Select(MapearSolicitud).ToList();
        }

        public async Task<List<SolicitudEdicionDiaEmpresaDto>> ObtenerTodasSolicitudesJefeAsync(int jefeId)
        {
            var areaDelJefe = await _db.Areas.FirstOrDefaultAsync(a => a.JefeId == jefeId);
            if (areaDelJefe == null) return new List<SolicitudEdicionDiaEmpresaDto>();

            var solicitudes = await _db.SolicitudesEdicionDiasEmpresa
                .Include(s => s.Empleado)
                    .ThenInclude(e => e.Area)
                .Include(s => s.Empleado)
                    .ThenInclude(e => e.Grupo)
                .Include(s => s.JefeArea)
                .Include(s => s.SolicitadoPor)
                .Where(s => s.Empleado.AreaId == areaDelJefe.AreaId)
                .OrderByDescending(s => s.FechaSolicitud)
                .ToListAsync();

            return solicitudes.Select(MapearSolicitud).ToList();
        }

        // ─── Reporte ────────────────────────────────────────────────────────────

        public async Task<List<ReporteDiasReprogramadosEmpresaDto>> GenerarReporteAsync(
            int? anio = null, int? areaId = null)
        {
            var query = _db.SolicitudesEdicionDiasEmpresa
                .Include(s => s.Empleado)
                    .ThenInclude(e => e.Area)
                .Include(s => s.Empleado)
                    .ThenInclude(e => e.Grupo)
                .Include(s => s.JefeArea)
                .Include(s => s.SolicitadoPor)
                .AsQueryable();

            if (anio.HasValue)
                query = query.Where(s => s.FechaOriginal.Year == anio.Value);

            if (areaId.HasValue)
                query = query.Where(s => s.Empleado.AreaId == areaId.Value);

            var solicitudes = await query
                .OrderBy(s => s.Empleado.FullName)
                .ThenBy(s => s.FechaOriginal)
                .ToListAsync();

            return solicitudes.Select(s => new ReporteDiasReprogramadosEmpresaDto
            {
                Id = s.Id,
                EmpleadoId = s.EmpleadoId,
                Nomina = s.Empleado?.Nomina,
                NombreEmpleado = s.Empleado?.FullName ?? string.Empty,
                Area = s.Empleado?.Area?.NombreGeneral,
                Grupo = s.Empleado?.Grupo?.Rol,
                FechaOriginal = s.FechaOriginal,
                FechaNueva = s.FechaNueva,
                EstadoSolicitud = s.EstadoSolicitud,
                FechaSolicitud = s.FechaSolicitud,
                FechaRespuesta = s.FechaRespuesta,
                NombreJefeArea = s.JefeArea?.FullName,
                NombreSolicitadoPor = s.SolicitadoPor?.FullName,
                ObservacionesEmpleado = s.ObservacionesEmpleado,
                MotivoRechazo = s.MotivoRechazo
            }).ToList();
        }

        // ─── Helpers ────────────────────────────────────────────────────────────

        private async Task<SolicitudEdicionDiaEmpresaDto?> ObtenerSolicitudDtoAsync(int id)
        {
            var s = await _db.SolicitudesEdicionDiasEmpresa
                .Include(x => x.Empleado)
                .Include(x => x.JefeArea)
                .Include(x => x.SolicitadoPor)
                .FirstOrDefaultAsync(x => x.Id == id);

            return s == null ? null : MapearSolicitud(s);
        }

        private static SolicitudEdicionDiaEmpresaDto MapearSolicitud(SolicitudEdicionDiaEmpresa s) =>
            new()
            {
                Id = s.Id,
                EmpleadoId = s.EmpleadoId,
                NombreEmpleado = s.Empleado?.FullName ?? string.Empty,
                NominaEmpleado = s.Empleado?.Nomina,
                VacacionOriginalId = s.VacacionOriginalId,
                FechaOriginal = s.FechaOriginal,
                FechaNueva = s.FechaNueva,
                EstadoSolicitud = s.EstadoSolicitud,
                MotivoRechazo = s.MotivoRechazo,
                ObservacionesEmpleado = s.ObservacionesEmpleado,
                ObservacionesJefe = s.ObservacionesJefe,
                FechaSolicitud = s.FechaSolicitud,
                FechaRespuesta = s.FechaRespuesta,
                NombreJefeArea = s.JefeArea?.FullName,
                NombreSolicitadoPor = s.SolicitadoPor?.FullName
            };

        private static ConfiguracionEdicionDiasEmpresaDto MapearConfiguracion(ConfiguracionEdicionDiasEmpresa c) =>
            new()
            {
                Id = c.Id,
                Habilitado = c.Habilitado,
                FechaInicioPeriodo = c.FechaInicioPeriodo,
                FechaFinPeriodo = c.FechaFinPeriodo,
                Descripcion = c.Descripcion,
                CreatedAt = c.CreatedAt,
                UpdatedAt = c.UpdatedAt
            };
    }
}
