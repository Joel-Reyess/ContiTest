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
    public class ReprogramacionService
    {
        private readonly FreeTimeDbContext _db;
        private readonly ValidadorPorcentajeService _validadorPorcentaje;
        private readonly NotificacionesService _notificacionesService;
        private readonly AusenciaService _ausenciaService;
        private readonly ILogger<ReprogramacionService> _logger;

        public ReprogramacionService(
            FreeTimeDbContext db,
            ValidadorPorcentajeService validadorPorcentaje,
            NotificacionesService notificacionesService,
            AusenciaService ausenciaService,
            ILogger<ReprogramacionService> logger)
        {
            _db = db;
            _validadorPorcentaje = validadorPorcentaje;
            _notificacionesService = notificacionesService;
            _ausenciaService = ausenciaService;
            _logger = logger;
        }

        /// <summary>
        /// Solicitar una reprogramaciA3n de vacaciones (siempre queda pendiente de aprobaciA3n del jefe de A­rea).
        /// </summary>
        public async Task<ApiResponse<SolicitudReprogramacionResponse>> SolicitarReprogramacionAsync(
            SolicitudReprogramacionRequest request, int usuarioSolicitanteId)
        {
            using var transaction = await _db.Database.BeginTransactionAsync();

            try
            {
                // 1. Validar periodo activo de reprogramaciA3n
                var configuracion = await _db.ConfiguracionVacaciones
                    .OrderByDescending(c => c.CreatedAt)
                    .FirstOrDefaultAsync();

                if (configuracion == null || configuracion.PeriodoActual != "Reprogramacion")
                {
                    return new ApiResponse<SolicitudReprogramacionResponse>(false, null,
                        "Solo se pueden solicitar reprogramaciones durante el periodo de reprogramaciA3n");
                }

                // 2. Validar roles del solicitante
                var usuarioSolicitante = await _db.Users
                    .Include(u => u.Roles)
                    .Include(u => u.Grupo)
                        .ThenInclude(g => g.Area)
                    .FirstOrDefaultAsync(u => u.Id == usuarioSolicitanteId);

                if (usuarioSolicitante == null)
                {
                    return new ApiResponse<SolicitudReprogramacionResponse>(false, null, "Usuario solicitante no encontrado");
                }

                var esJefeArea = usuarioSolicitante.Roles.Any(r => r.Name == "JefeArea" || r.Name == "Jefe De Area");
                var esDelegadoSindical = usuarioSolicitante.Roles.Any(r => r.Name == "DelegadoSindical" || r.Name == "Delegado Sindical") ||
                                         usuarioSolicitante.Grupo?.Area?.NombreGeneral?.ToLower() == "sindicato";
                var esSuperUsuario = usuarioSolicitante.Roles.Any(r => r.Name == "SuperUsuario");

                if (!esJefeArea && !esDelegadoSindical && !esSuperUsuario)
                {
                    return new ApiResponse<SolicitudReprogramacionResponse>(false, null,
                        "Solo los Jefes de A­rea, Delegados Sindicales y SuperUsuarios pueden solicitar reprogramaciones");
                }

                // 3. Obtener informaciA3n del empleado
                var empleado = await _db.Users
                    .Include(u => u.Area)
                    .Include(u => u.Grupo)
                        .ThenInclude(g => g.Area)
                    .FirstOrDefaultAsync(u => u.Id == request.EmpleadoId);

                if (empleado == null)
                {
                    return new ApiResponse<SolicitudReprogramacionResponse>(false, null, "Empleado no encontrado");
                }

                // 4. Validar que la vacaciA3n original existe y pertenece al empleado
                var vacacionOriginal = await _db.VacacionesProgramadas
                    .FirstOrDefaultAsync(v => v.Id == request.VacacionOriginalId);

                if (vacacionOriginal == null)
                {
                    return new ApiResponse<SolicitudReprogramacionResponse>(false, null, "VacaciA3n original no encontrada");
                }

                if (vacacionOriginal.EmpleadoId != request.EmpleadoId)
                {
                    return new ApiResponse<SolicitudReprogramacionResponse>(false, null,
                        "La vacaciA3n original no pertenece al empleado especificado");
                }

                if (vacacionOriginal.TipoVacacion != "Anual")
                {
                    return new ApiResponse<SolicitudReprogramacionResponse>(false, null,
                        $"Solo se pueden reprogramar vacaciones de tipo 'Anual'. Esta vacaciA3n es de tipo '{vacacionOriginal.TipoVacacion}'");
                }

                if (vacacionOriginal.EstadoVacacion != "Activa")
                {
                    return new ApiResponse<SolicitudReprogramacionResponse>(false, null,
                        $"Solo se pueden reprogramar vacaciones activas. Esta vacaciA3n estA­ '{vacacionOriginal.EstadoVacacion}'");
                }

                // 5. Validar fechas
                //if (vacacionOriginal.FechaVacacion <= DateOnly.FromDateTime(DateTime.Today))
                //{
                //    return new ApiResponse<SolicitudReprogramacionResponse>(false, null,
                //        "No se pueden reprogramar vacaciones de fechas pasadas o del dA-a actual");
                //}

                //if (request.FechaNueva <= DateOnly.FromDateTime(DateTime.Today))
                //{
                //    return new ApiResponse<SolicitudReprogramacionResponse>(false, null,
                //        "La fecha nueva no puede ser en el pasado o el dA-a actual");
                //}
                if (request.FechaNueva.Year < 2025)
                {
                    return new ApiResponse<SolicitudReprogramacionResponse>(false, null,
                        "La fecha debe ser del año 2020 en adelante");
                }

                // 6. Validar dA-as inhA-biles
                var esDiaInhabil = await _db.DiasInhabiles
                    .AnyAsync(d => d.Fecha == request.FechaNueva);

                if (esDiaInhabil)
                {
                    return new ApiResponse<SolicitudReprogramacionResponse>(false, null,
                        "No se puede reprogramar una vacaciA3n a un dA-a inhA­bil o festivo");
                }

                // 7. Validar que no exista ya una vacaciA3n programada en la fecha nueva
                var vacacionExistente = await _db.VacacionesProgramadas
                    .AnyAsync(v => v.EmpleadoId == request.EmpleadoId &&
                                   v.FechaVacacion == request.FechaNueva &&
                                   v.EstadoVacacion == "Activa");

                if (vacacionExistente)
                {
                    return new ApiResponse<SolicitudReprogramacionResponse>(false, null,
                        "El empleado ya tiene una vacaciA3n programada para la fecha nueva solicitada");
                }

                // 8. Verificar que no haya una solicitud pendiente para la misma vacaciA3n
                var solicitudPendiente = await _db.SolicitudesReprogramacion
                    .AnyAsync(s => s.VacacionOriginalId == request.VacacionOriginalId &&
                                   s.EstadoSolicitud == "Pendiente");

                if (solicitudPendiente)
                {
                    return new ApiResponse<SolicitudReprogramacionResponse>(false, null,
                        "Ya existe una solicitud de reprogramaciA3n pendiente para esta vacaciA3n");
                }

                // 9. Calcular porcentaje de ausencia (solo para auditorA-a, la aprobaciA3n siempre es manual)
                decimal? porcentajeCalculado = null;
                var validacionRequest = new ValidacionDisponibilidadRequest
                {
                    EmpleadoId = request.EmpleadoId,
                    Fecha = request.FechaNueva
                };

                var validacionResponse = await _ausenciaService.ValidarDisponibilidadDiaAsync(validacionRequest);
                string mensajeValidacion = "La solicitud requiere aprobaciA3n del jefe de A­rea.";

                if (validacionResponse.Success && validacionResponse.Data != null)
                {
                    porcentajeCalculado = validacionResponse.Data.PorcentajeAusenciaConEmpleado;
                    if (!validacionResponse.Data.DiaDisponible)
                    {
                        mensajeValidacion += " El dA-a excede el porcentaje permitido.";
                    }
                }

                // 10. Obtener el jefe del A­rea (para notificar y asignar aprobador)
                User? jefeArea = null;
                if (empleado.AreaId.HasValue)
                {
                    jefeArea = await _db.Users
                        .Include(u => u.Roles)
                        .FirstOrDefaultAsync(u =>
                            u.AreaId == empleado.AreaId &&
                            u.Roles.Any(r => r.Name == "JefeArea" || r.Name == "Jefe De Area"));
                }

                // 11. Crear solicitud siempre en estado Pendiente
                var solicitud = new SolicitudesReprogramacion
                {
                    EmpleadoId = request.EmpleadoId,
                    VacacionOriginalId = request.VacacionOriginalId,
                    FechaNuevaSolicitada = request.FechaNueva,
                    FechaOriginalGuardada = vacacionOriginal.FechaVacacion,
                    EstadoSolicitud = "Pendiente",
                    PorcentajeCalculado = porcentajeCalculado,
                    ObservacionesEmpleado = request.Motivo,
                    JefeAreaId = jefeArea?.Id,
                    SolicitadoPorId = usuarioSolicitanteId,
                    FechaSolicitud = DateTime.Now
                };

                _db.SolicitudesReprogramacion.Add(solicitud);
                await _db.SaveChangesAsync();

                // 12. Notificar a jefe de A­rea y al empleado
                await _notificacionesService.NotificarSolicitudReprogramacionAsync(
                    usuarioSolicitanteId,
                    empleado.FullName ?? string.Empty,
                    usuarioSolicitante.FullName ?? string.Empty,
                    solicitud.FechaOriginalGuardada,
                    solicitud.FechaNuevaSolicitada,
                    empleado.AreaId,
                    empleado.GrupoId,
                    solicitud.Id);

                await _notificacionesService.CrearNotificacionAsync(
                    TiposDeNotificacionEnum.SolicitudReprogramacion,
                    "Solicitud de reprogramaciA3n pendiente",
                    $"Tu solicitud para cambiar la vacaciA3n del {solicitud.FechaOriginalGuardada:dd/MM/yyyy} al {solicitud.FechaNuevaSolicitada:dd/MM/yyyy} estA­ pendiente de aprobaciA3n",
                    usuarioSolicitante.FullName ?? string.Empty,
                    idUsuarioReceptor: request.EmpleadoId,
                    idUsuarioEmisor: usuarioSolicitanteId,
                    areaId: empleado.AreaId,
                    grupoId: empleado.GrupoId,
                    idSolicitud: solicitud.Id);

                await transaction.CommitAsync();

                var response = new SolicitudReprogramacionResponse
                {
                    SolicitudId = solicitud.Id,
                    EmpleadoId = empleado.Id,
                    NombreEmpleado = empleado.FullName ?? string.Empty,
                    NominaEmpleado = empleado.Nomina?.ToString() ?? empleado.Username ?? string.Empty,
                    FechaOriginal = solicitud.FechaOriginalGuardada,
                    FechaNueva = solicitud.FechaNuevaSolicitada,
                    Motivo = solicitud.ObservacionesEmpleado ?? string.Empty,
                    EstadoSolicitud = solicitud.EstadoSolicitud,
                    RequiereAprobacion = true,
                    PorcentajeCalculado = porcentajeCalculado,
                    MensajeValidacion = mensajeValidacion,
                    FechaSolicitud = solicitud.FechaSolicitud,
                    SolicitadoPor = usuarioSolicitante.FullName ?? string.Empty,
                    JefeAreaId = jefeArea?.Id,
                    NombreJefeArea = jefeArea?.FullName
                };

                _logger.LogInformation(
                    "Solicitud de reprogramaciA3n creada para empleado {EmpleadoId}: {FechaOriginal} -> {FechaNueva}. Estado: Pendiente",
                    empleado.Id, solicitud.FechaOriginalGuardada, solicitud.FechaNuevaSolicitada);

                return new ApiResponse<SolicitudReprogramacionResponse>(true, response,
                    "Solicitud de reprogramaciA3n creada y pendiente de aprobaciA3n");
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                _logger.LogError(ex, "Error al solicitar reprogramaciA3n");
                return new ApiResponse<SolicitudReprogramacionResponse>(false, null,
                    $"Error inesperado: {ex.Message}");
            }
        }

        /// <summary>
        /// Aprobar o rechazar una solicitud de reprogramaciA3n.
        /// </summary>
        public async Task<ApiResponse<AprobarReprogramacionResponse>> AprobarRechazarSolicitudAsync(
            AprobarReprogramacionRequest request, int usuarioAprobadorId)
        {
            using var transaction = await _db.Database.BeginTransactionAsync();

            try
            {
                var solicitud = await _db.SolicitudesReprogramacion
                    .Include(s => s.Empleado)
                        .ThenInclude(e => e.Area)
                    .Include(s => s.Empleado)
                        .ThenInclude(e => e.Grupo)
                            .ThenInclude(g => g.Area)
                    .Include(s => s.VacacionOriginal)
                    .FirstOrDefaultAsync(s => s.Id == request.SolicitudId);

                if (solicitud == null)
                {
                    return new ApiResponse<AprobarReprogramacionResponse>(false, null, "Solicitud no encontrada");
                }

                if (solicitud.EstadoSolicitud != "Pendiente")
                {
                    return new ApiResponse<AprobarReprogramacionResponse>(false, null,
                        $"La solicitud ya fue {solicitud.EstadoSolicitud.ToLower()}");
                }

                var usuarioAprobador = await _db.Users
                    .Include(u => u.Roles)
                    .FirstOrDefaultAsync(u => u.Id == usuarioAprobadorId);

                if (usuarioAprobador == null)
                {
                    return new ApiResponse<AprobarReprogramacionResponse>(false, null, "Usuario aprobador no encontrado");
                }

                var esSuperUsuario = usuarioAprobador.Roles.Any(r => r.Name == "SuperUsuario");
                var esJefeArea = usuarioAprobador.Roles.Any(r => r.Name == "JefeArea" || r.Name == "Jefe De Area");

                if (!esSuperUsuario)
                {
                    var areaEmpleado = solicitud.Empleado?.Grupo?.Area?.AreaId ?? solicitud.Empleado?.AreaId;

                    // 1) Si está asignado como jefe en la propia solicitud
                    var aprobadorEsJefeAsignado = solicitud.JefeAreaId.HasValue &&
                                                  solicitud.JefeAreaId.Value == usuarioAprobadorId;

                    // 2) Si es jefe y su AreaId coincide con la del empleado
                    var aprobadorMismaArea = usuarioAprobador.AreaId.HasValue &&
                                             areaEmpleado.HasValue &&
                                             usuarioAprobador.AreaId.Value == areaEmpleado.Value;

                    // 3) Si es jefe registrado en el catálogo de áreas (Area.JefeId)
                    var jefeDeAreaMatch = false;
                    if (areaEmpleado.HasValue)
                    {
                        jefeDeAreaMatch = await _db.Areas
                            .AnyAsync(a => a.AreaId == areaEmpleado.Value && a.JefeId == usuarioAprobadorId);
                    }

                    if (!esJefeArea || (!aprobadorEsJefeAsignado && !aprobadorMismaArea && !jefeDeAreaMatch))
                    {
                        return new ApiResponse<AprobarReprogramacionResponse>(false, null,
                            "El usuario no tiene permisos para aprobar esta solicitud");
                    }
                }

                if (request.Aprobada)
                {
                    var conflicto = await _db.VacacionesProgramadas
                        .AnyAsync(v => v.EmpleadoId == solicitud.EmpleadoId &&
                                       v.FechaVacacion == solicitud.FechaNuevaSolicitada &&
                                       v.EstadoVacacion == "Activa" &&
                                       v.Id != solicitud.VacacionOriginalId);

                    if (conflicto)
                    {
                        return new ApiResponse<AprobarReprogramacionResponse>(false, null,
                            "Ya existe una vacaciA3n activa para la fecha solicitada");
                    }
                }

                solicitud.EstadoSolicitud = request.Aprobada ? "Aprobada" : "Rechazada";
                solicitud.MotivoRechazo = request.Aprobada ? null : (request.MotivoRechazo ?? "No especificado");
                solicitud.ObservacionesJefe = request.MotivoRechazo;
                solicitud.FechaRespuesta = DateTime.Now;
                solicitud.UpdatedAt = DateTime.Now;
                if (!solicitud.JefeAreaId.HasValue)
                {
                    solicitud.JefeAreaId = usuarioAprobadorId;
                }

                var vacacionActualizada = false;
                if (request.Aprobada)
                {
                    var vacacion = solicitud.VacacionOriginal
                        ?? await _db.VacacionesProgramadas.FindAsync(solicitud.VacacionOriginalId);

                    if (vacacion == null)
                    {
                        return new ApiResponse<AprobarReprogramacionResponse>(false, null,
                            "No se encontró la vacación original para cancelar");
                    }

                    // Cancelar la vacación original en la fecha original
                    vacacion.EstadoVacacion = "Cancelada";
                    vacacion.UpdatedAt = DateTime.Now;
                    vacacion.UpdatedBy = usuarioAprobadorId;

                    // Crear nueva vacación en la fecha nueva
                    var nuevaVacacion = new VacacionesProgramadas
                    {
                        EmpleadoId = solicitud.EmpleadoId,
                        FechaVacacion = solicitud.FechaNuevaSolicitada,
                        TipoVacacion = vacacion.TipoVacacion,
                        OrigenAsignacion = vacacion.OrigenAsignacion,
                        EstadoVacacion = "Activa",
                        PeriodoProgramacion = "Reprogramacion",
                        FechaProgramacion = vacacion.FechaProgramacion,
                        PuedeSerIntercambiada = vacacion.PuedeSerIntercambiada,
                        Observaciones = $"Reprogramada via solicitud {solicitud.Id}. Motivo: {solicitud.ObservacionesEmpleado}",
                        CreatedAt = DateTime.Now,
                        CreatedBy = usuarioAprobadorId,
                        UpdatedAt = DateTime.Now,
                        UpdatedBy = usuarioAprobadorId
                    };

                    _db.VacacionesProgramadas.Add(nuevaVacacion);
                    vacacionActualizada = true;
                }
                await _db.SaveChangesAsync();

                await _notificacionesService.NotificarRespuestaReprogramacionAsync(
                    request.Aprobada,
                    solicitud.EmpleadoId,
                    usuarioAprobador.FullName ?? "Sistema",
                    solicitud.FechaOriginalGuardada,
                    solicitud.FechaNuevaSolicitada,
                    solicitud.MotivoRechazo,
                    solicitud.Id);

                await transaction.CommitAsync();

                var response = new AprobarReprogramacionResponse
                {
                    SolicitudId = solicitud.Id,
                    Aprobada = request.Aprobada,
                    EstadoFinal = solicitud.EstadoSolicitud,
                    EmpleadoId = solicitud.EmpleadoId,
                    NombreEmpleado = solicitud.Empleado?.FullName ?? string.Empty,
                    FechaOriginal = solicitud.FechaOriginalGuardada,
                    FechaNueva = solicitud.FechaNuevaSolicitada,
                    MotivoRechazo = solicitud.MotivoRechazo,
                    FechaAprobacion = solicitud.FechaRespuesta ?? DateTime.Now,
                    AprobadoPor = usuarioAprobador.FullName ?? string.Empty,
                    VacacionActualizada = vacacionActualizada
                };

                return new ApiResponse<AprobarReprogramacionResponse>(true, response,
                    request.Aprobada ? "Solicitud aprobada exitosamente" : "Solicitud rechazada");
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                _logger.LogError(ex, "Error al aprobar/rechazar solicitud de reprogramaciA3n");
                return new ApiResponse<AprobarReprogramacionResponse>(false, null,
                    $"Error inesperado: {ex.Message}");
            }
        }

        /// <summary>
        /// Consultar solicitudes de reprogramaciA3n con filtros.
        /// </summary>
        public async Task<ApiResponse<ListaSolicitudesReprogramacionResponse>> ConsultarSolicitudesAsync(
    ConsultaSolicitudesRequest request, int usuarioConsultaId)
        {
            try
            {
                _db.Database.SetCommandTimeout(60);
                var usuarioConsulta = await _db.Users
                    .Include(u => u.Roles)
                    .FirstOrDefaultAsync(u => u.Id == usuarioConsultaId);

                if (usuarioConsulta == null)
                {
                    return new ApiResponse<ListaSolicitudesReprogramacionResponse>(false, null, "Usuario no encontrado");
                }

                var esSuperUsuario = usuarioConsulta.Roles.Any(r => r.Name == "SuperUsuario");
                var esJefeArea = usuarioConsulta.Roles.Any(r => r.Name == "JefeArea" || r.Name == "Jefe De Area");
                var esDelegadoSindical = usuarioConsulta.Roles.Any(r =>
                    r.Name == "DelegadoSindical" ||
                    r.Name == "Delegado Sindical" ||
                    r.Name == "EmpleadoSindicalizado" ||
                    r.Name == "Empleado Sindicalizado");

                _logger.LogInformation(
                    "Usuario {UserId} consultando solicitudes. Roles: SuperUsuario={Super}, JefeArea={Jefe}, Delegado={Delegado}",
                    usuarioConsultaId, esSuperUsuario, esJefeArea, esDelegadoSindical);

                var query = _db.SolicitudesReprogramacion
                    .Include(s => s.Empleado)
                        .ThenInclude(e => e.Area)
                    .Include(s => s.Empleado.Grupo)
                        .ThenInclude(g => g.Area)
                    .Include(s => s.VacacionOriginal)
                    .Include(s => s.JefeArea)
                    .Include(s => s.SolicitadoPor)
                    .AsQueryable();

                // FILTROS DE ROL
                if (esSuperUsuario)
                {
                    _logger.LogInformation("SuperUsuario - sin filtros de rol");
                }
                else if (esJefeArea && usuarioConsulta.AreaId.HasValue)
                {
                    query = query.Where(s => s.Empleado.Grupo.Area.AreaId == usuarioConsulta.AreaId.Value);
                    _logger.LogInformation("Jefe de Área - filtrando por área {AreaId}", usuarioConsulta.AreaId.Value);
                }
                else if (esDelegadoSindical)
                {
                    // FIX: Delegado ve sus solicitudes + sin solicitante + misma área
                    var areaIdDelegado = usuarioConsulta.AreaId;
                    query = query.Where(s =>
                        s.SolicitadoPorId == usuarioConsultaId ||
                        !s.SolicitadoPorId.HasValue ||
                        (areaIdDelegado.HasValue && s.Empleado.AreaId == areaIdDelegado.Value)
                    );

                    _logger.LogInformation(
                        "Delegado Sindical {UserId} (AreaId={AreaId}) - filtrando por SolicitadoPorId = {UserId} OR NULL OR misma área",
                        usuarioConsultaId, areaIdDelegado, usuarioConsultaId);
                }

                if (!string.IsNullOrEmpty(request.Estado))
                {
                    query = query.Where(s => s.EstadoSolicitud == request.Estado);
                }

                if (request.EmpleadoId.HasValue)
                {
                    query = query.Where(s => s.EmpleadoId == request.EmpleadoId.Value);
                }

                if (request.SolicitadoPorId.HasValue && !esDelegadoSindical)
                {
                    query = query.Where(s => s.SolicitadoPorId == request.SolicitadoPorId.Value);
                }
                else if (request.SolicitadoPorId.HasValue && esDelegadoSindical && request.SolicitadoPorId.Value != usuarioConsultaId)
                {
                    query = query.Where(s => s.SolicitadoPorId == request.SolicitadoPorId.Value);
                }

                if (request.JefeAreaId.HasValue)
                {
                    query = query.Where(s => s.JefeAreaId == request.JefeAreaId.Value);
                }

                if (request.FechaDesde.HasValue)
                {
                    query = query.Where(s => s.FechaSolicitud >= request.FechaDesde.Value);
                }

                if (request.FechaHasta.HasValue)
                {
                    var fechaHastaFinal = request.FechaHasta.Value.Date.AddDays(1);
                    query = query.Where(s => s.FechaSolicitud < fechaHastaFinal);
                }

                if (request.AreaId.HasValue)
                {
                    query = query.Where(s => s.Empleado.Grupo.Area.AreaId == request.AreaId.Value);
                }

                if (request.FechaNuevaDesde.HasValue)
                {
                    query = query.Where(s => s.FechaNuevaSolicitada >= request.FechaNuevaDesde.Value);
                }

                if (request.FechaNuevaHasta.HasValue)
                {
                    query = query.Where(s => s.FechaNuevaSolicitada <= request.FechaNuevaHasta.Value);
                }

                var solicitudes = await query
                    .OrderByDescending(s => s.FechaSolicitud)
                    .ToListAsync();

                _logger.LogInformation(
                    "Total solicitudes encontradas: {Total} (ConID: {ConID}, SinID: {SinID})",
                    solicitudes.Count,
                    solicitudes.Count(s => s.SolicitadoPorId.HasValue),
                    solicitudes.Count(s => !s.SolicitadoPorId.HasValue)
                );

                // Precalcular porcentajes del día para cada solicitud
                // (no se puede hacer await dentro del .Select() de LINQ)
                var porcentajesDelDia = new Dictionary<int, decimal>();

                // Obtener todas las fechas únicas y áreas únicas de una sola vez
                var solicitudInfos = solicitudes
                    .Select(s => new {
                        s.Id,
                        FechaNueva = s.FechaNuevaSolicitada,
                        AreaId = s.Empleado?.Grupo?.Area?.AreaId ?? s.Empleado?.AreaId
                    })
                    .Where(x => x.AreaId.HasValue)
                    .ToList();

                var areasUnicas = solicitudInfos.Select(x => x.AreaId!.Value).Distinct().ToList();
                var fechasUnicas = solicitudInfos.Select(x => x.FechaNueva).Distinct().ToList();

                // Una sola query: grupos por área
                var gruposPorArea = await _db.Grupos
                    .Where(g => areasUnicas.Contains(g.AreaId))
                    .Select(g => new { g.GrupoId, g.AreaId })
                    .ToListAsync();

                var grupoIdsPorArea = gruposPorArea
                    .GroupBy(g => g.AreaId)
                    .ToDictionary(g => g.Key, g => g.Select(x => x.GrupoId).ToList());

                var todosGrupoIds = gruposPorArea.Select(g => g.GrupoId).Distinct().ToList();

                // Una sola query: empleados activos con su grupo y nómina
                var empleadosActivos = await _db.Users
                    .Where(u => todosGrupoIds.Contains(u.GrupoId ?? 0) && u.Status == UserStatus.Activo)
                    .Select(u => new { u.Id, u.GrupoId, u.Nomina, u.AreaId })
                    .ToListAsync();

                // Una sola query: vacaciones activas en fechas relevantes
                var ausentesVacacionesBatch = await _db.VacacionesProgramadas
                    .Where(v => fechasUnicas.Contains(v.FechaVacacion)
                             && v.EstadoVacacion == "Activa"
                             && todosGrupoIds.Contains(
                                    _db.Users.Where(u => u.Id == v.EmpleadoId)
                                              .Select(u => u.GrupoId ?? 0)
                                              .FirstOrDefault()))
                    .Select(v => new { v.EmpleadoId, v.FechaVacacion })
                    .Distinct()
                    .ToListAsync();

                // Una sola query: permisos/incapacidades SAP
                var nominasActivas = empleadosActivos.Select(e => e.Nomina).Distinct().ToList();
                var permisosRaw = await _db.PermisosEIncapacidadesSAP
                    .Where(p => nominasActivas.Contains(p.Nomina)
                             && fechasUnicas.Any(f => p.Desde <= f && p.Hasta >= f))
                    .Select(p => new { p.Nomina, p.Desde, p.Hasta })
                    .ToListAsync();

                // Una sola query: festivos trabajados aprobados
                var festivosRaw = await _db.SolicitudesFestivosTrabajados
                    .Where(f => fechasUnicas.Contains(f.FechaNuevaSolicitada)
                             && f.EstadoSolicitud == "Aprobada"
                             && nominasActivas.Contains(f.Nomina))
                    .Select(f => new { f.EmpleadoId, f.FechaNuevaSolicitada, f.Nomina })
                    .Distinct()
                    .ToListAsync();

                // Mapeo nómina -> empleadoId para permisos
                var nominaToEmpleadoId = empleadosActivos
                    .Where(e => e.Nomina.HasValue)
                    .GroupBy(e => e.Nomina!.Value)
                    .ToDictionary(g => g.Key, g => g.First().Id);

                // Calcular porcentajes en memoria
                foreach (var info in solicitudInfos)
                {
                    if (!grupoIdsPorArea.TryGetValue(info.AreaId!.Value, out var gruposDelArea)) continue;

                    var empleadosDelArea = empleadosActivos
                        .Where(e => gruposDelArea.Contains(e.GrupoId ?? 0))
                        .ToList();

                    var totalEmpleados = empleadosDelArea.Count;
                    if (totalEmpleados == 0) continue;

                    var idsDelArea = empleadosDelArea.Select(e => e.Id).ToHashSet();
                    var nominasDelArea = empleadosDelArea
                        .Where(e => e.Nomina.HasValue)
                        .Select(e => e.Nomina!.Value)
                        .ToHashSet();

                    var ausentesVac = ausentesVacacionesBatch
                        .Where(v => v.FechaVacacion == info.FechaNueva && idsDelArea.Contains(v.EmpleadoId))
                        .Select(v => v.EmpleadoId).ToHashSet();

                    var ausentesPermisos = permisosRaw
                        .Where(p => nominasDelArea.Contains(p.Nomina)
                                 && p.Desde <= info.FechaNueva
                                 && p.Hasta >= info.FechaNueva
                                 && nominaToEmpleadoId.TryGetValue(p.Nomina, out _))
                        .Select(p => nominaToEmpleadoId[p.Nomina]).ToHashSet();

                    var ausentesFestivos = festivosRaw
                        .Where(f => f.FechaNuevaSolicitada == info.FechaNueva
                                 && nominasDelArea.Contains(f.Nomina)
                                 && nominaToEmpleadoId.TryGetValue(f.Nomina, out _))
                        .Select(f => nominaToEmpleadoId[f.Nomina]).ToHashSet();

                    var totalAusentes = ausentesVac
                        .Union(ausentesPermisos)
                        .Union(ausentesFestivos)
                        .Count();

                    porcentajesDelDia[info.Id] = Math.Round(((decimal)totalAusentes / totalEmpleados) * 100m, 2);
                }

                var solicitudesDto = solicitudes.Select(s => new SolicitudReprogramacionDto
                {
                    Id = s.Id,
                    EmpleadoId = s.EmpleadoId,
                    NombreEmpleado = s.Empleado.FullName,
                    NominaEmpleado = s.Empleado.Username ?? "",
                    AreaEmpleado = s.Empleado.Area != null
                        ? s.Empleado.Area.NombreGeneral ?? ""
                        : "",
                    GrupoEmpleado = s.Empleado.Grupo != null ? s.Empleado.Grupo.Rol ?? "" : "",
                    VacacionOriginalId = s.VacacionOriginalId,
                    FechaOriginal = s.FechaOriginalGuardada,
                    FechaNueva = s.FechaNuevaSolicitada,
                    Motivo = s.ObservacionesEmpleado ?? "",
                    EstadoSolicitud = s.EstadoSolicitud,
                    RequiereAprobacion = s.EstadoSolicitud == "Pendiente",
                    PorcentajeCalculado = s.PorcentajeCalculado,
                    PorcentajeDelDia = porcentajesDelDia.TryGetValue(s.Id, out var pctDia) ? pctDia : null,
                    FechaSolicitud = s.FechaSolicitud,
                    SolicitadoPor = s.SolicitadoPor?.FullName ?? "Sistema",
                    FechaAprobacion = s.FechaRespuesta,
                    AprobadoPor = s.JefeArea != null && s.FechaRespuesta != null
                        ? s.JefeArea.FullName
                        : null,
                    MotivoRechazo = s.MotivoRechazo,
                    PuedeAprobar = esJefeArea &&
                                   s.EstadoSolicitud == "Pendiente" &&
                                   s.Empleado.Grupo?.Area?.AreaId == usuarioConsulta.AreaId
                }).ToList();

                var response = new ListaSolicitudesReprogramacionResponse
                {
                    TotalSolicitudes = solicitudesDto.Count,
                    Pendientes = solicitudesDto.Count(s => s.EstadoSolicitud == "Pendiente"),
                    Aprobadas = solicitudesDto.Count(s => s.EstadoSolicitud == "Aprobada"),
                    Rechazadas = solicitudesDto.Count(s => s.EstadoSolicitud == "Rechazada"),
                    Solicitudes = solicitudesDto
                };

                return new ApiResponse<ListaSolicitudesReprogramacionResponse>(true, response, null);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al consultar solicitudes de reprogramación");
                return new ApiResponse<ListaSolicitudesReprogramacionResponse>(false, null,
                    $"Error inesperado: {ex.Message}");
            }
        }

        /// <summary>
        /// Validar si una reprogramaciA3n es posible antes de solicitarla.
        /// </summary>
        public async Task<ApiResponse<ValidarReprogramacionResponse>> ValidarReprogramacionAsync(
            ValidarReprogramacionRequest request)
        {
            try
            {
                var response = new ValidarReprogramacionResponse
                {
                    FechaNueva = request.FechaNueva,
                    EsValida = true,
                    RequiereAprobacion = true
                };

                var vacacionOriginal = await _db.VacacionesProgramadas
                    .FirstOrDefaultAsync(v => v.Id == request.VacacionOriginalId);

                if (vacacionOriginal == null)
                {
                    response.EsValida = false;
                    response.MotivoInvalidez = "VacaciA3n original no encontrada";
                    return new ApiResponse<ValidarReprogramacionResponse>(true, response, null);
                }

                response.FechaOriginal = vacacionOriginal.FechaVacacion;
                response.TipoVacacionOriginal = vacacionOriginal.TipoVacacion;

                if (vacacionOriginal.TipoVacacion != "Anual")
                {
                    response.EsValida = false;
                    response.MotivoInvalidez = "Solo se pueden reprogramar vacaciones anuales";
                    return new ApiResponse<ValidarReprogramacionResponse>(true, response, null);
                }

                if (vacacionOriginal.EstadoVacacion != "Activa")
                {
                    response.EsValida = false;
                    response.MotivoInvalidez = "La vacaciA3n no estA­ activa";
                    return new ApiResponse<ValidarReprogramacionResponse>(true, response, null);
                }

                //if (vacacionOriginal.FechaVacacion <= DateOnly.FromDateTime(DateTime.Today))
                //{
                //    response.EsValida = false;
                //    response.MotivoInvalidez = "No se pueden reprogramar vacaciones pasadas";
                //    return new ApiResponse<ValidarReprogramacionResponse>(true, response, null);
                //}

                //if (request.FechaNueva <= DateOnly.FromDateTime(DateTime.Today))
                //{
                //    response.EsValida = false;
                //    response.MotivoInvalidez = "La fecha nueva no puede ser en el pasado";
                //    return new ApiResponse<ValidarReprogramacionResponse>(true, response, null);
                //}

                var esDiaInhabil = await _db.DiasInhabiles
                    .AnyAsync(d => d.Fecha == request.FechaNueva);

                if (esDiaInhabil)
                {
                    response.EsValida = false;
                    response.MotivoInvalidez = "No se puede reprogramar una vacaciA3n a un dA-a inhA­bil o festivo";
                    return new ApiResponse<ValidarReprogramacionResponse>(true, response, null);
                }

                var conflicto = await _db.VacacionesProgramadas
                    .AnyAsync(v => v.EmpleadoId == request.EmpleadoId &&
                                   v.FechaVacacion == request.FechaNueva &&
                                   v.EstadoVacacion == "Activa");

                if (conflicto)
                {
                    response.EsValida = false;
                    response.MotivoInvalidez = "Ya existe una vacaciA3n programada para esa fecha";
                    return new ApiResponse<ValidarReprogramacionResponse>(true, response, null);
                }

                var validacionRequest = new ValidacionDisponibilidadRequest
                {
                    EmpleadoId = request.EmpleadoId,
                    Fecha = request.FechaNueva
                };

                var validacionResponse = await _ausenciaService.ValidarDisponibilidadDiaAsync(validacionRequest);

                if (validacionResponse.Success && validacionResponse.Data != null)
                {
                    response.PorcentajeCalculado = validacionResponse.Data.PorcentajeAusenciaConEmpleado;
                    response.PorcentajeMaximo = validacionResponse.Data.PorcentajeMaximoPermitido;

                    if (!validacionResponse.Data.DiaDisponible)
                    {
                        response.Advertencias.Add($"El dA-a excede el porcentaje de ausencia permitido ({response.PorcentajeMaximo}%). RequerirA­ aprobaciA3n del jefe de A­rea.");
                    }
                }

                var configuracion = await _db.ConfiguracionVacaciones
                    .OrderByDescending(c => c.CreatedAt)
                    .FirstOrDefaultAsync();

                if (configuracion?.PeriodoActual != "Reprogramacion")
                {
                    response.Advertencias.Add("Actualmente no estamos en periodo de reprogramaciA3n");
                }

                return new ApiResponse<ValidarReprogramacionResponse>(true, response, null);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al validar reprogramaciA3n");
                return new ApiResponse<ValidarReprogramacionResponse>(false, null,
                    $"Error inesperado: {ex.Message}");
            }
        }

        public async Task<ApiResponse<object>> CancelarSolicitudAsync(int solicitudId, int usuarioId)
        {
            var solicitud = await _db.SolicitudesReprogramacion
                .FirstOrDefaultAsync(s => s.Id == solicitudId);

            if (solicitud == null)
                return new ApiResponse<object>(false, null, "Solicitud no encontrada");

            if (solicitud.EstadoSolicitud != "Pendiente")
                return new ApiResponse<object>(false, null, "Solo se pueden cancelar solicitudes pendientes");

            if (solicitud.SolicitadoPorId != usuarioId)
            {
                var usuario = await _db.Users.Include(u => u.Roles).FirstOrDefaultAsync(u => u.Id == usuarioId);
                bool esSuperUsuario = usuario?.Roles.Any(r => r.Name == "SuperUsuario") ?? false;
                if (!esSuperUsuario)
                    return new ApiResponse<object>(false, null, "No tienes permiso para cancelar esta solicitud");
            }

            solicitud.EstadoSolicitud = "Cancelada";
            solicitud.FechaRespuesta = DateTime.Now;
            solicitud.UpdatedAt = DateTime.Now;
            await _db.SaveChangesAsync();

            return new ApiResponse<object>(true, null, "Solicitud cancelada correctamente");
        }
    }
}