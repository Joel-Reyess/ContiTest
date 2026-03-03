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
                    var vacacion = solicitud.VacacionOriginal;
                    vacacion.FechaVacacion = solicitud.FechaNuevaSolicitada;
                    vacacion.PeriodoProgramacion = "Reprogramacion";
                    vacacion.UpdatedAt = DateTime.Now;
                    vacacion.UpdatedBy = usuarioAprobadorId;

                    var detalleObservacion = $"Reprogramada via solicitud {solicitud.Id}. Motivo: {solicitud.ObservacionesEmpleado}";
                    vacacion.Observaciones = string.IsNullOrWhiteSpace(vacacion.Observaciones)
                        ? detalleObservacion
                        : $"{vacacion.Observaciones} | {detalleObservacion}";

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
                    // 🔥 SOLUCIÓN: Usar !HasValue en lugar de comparar con null
                    query = query.Where(s =>
                        s.SolicitadoPorId == usuarioConsultaId ||
                        !s.SolicitadoPorId.HasValue  // ← Esta es la clave
                    );

                    _logger.LogInformation(
                        "Delegado Sindical {UserId} - filtrando por SolicitadoPorId = {UserId} OR NULL",
                        usuarioConsultaId, usuarioConsultaId);
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

                foreach (var s in solicitudes)
                {
                    try
                    {
                        // Obtener todos los grupos del área del empleado
                        var areaId = s.Empleado?.Grupo?.Area?.AreaId ?? s.Empleado?.AreaId;
                        if (!areaId.HasValue) continue;

                        var gruposDelArea = await _db.Grupos
                            .Where(g => g.AreaId == areaId.Value)
                            .Select(g => g.GrupoId)
                            .ToListAsync();

                        if (gruposDelArea.Count == 0) continue;

                        // Total de empleados activos del área
                        var totalEmpleadosArea = await _db.Users
                            .CountAsync(u => gruposDelArea.Contains(u.GrupoId ?? 0)
                                          && u.Status == UserStatus.Activo);

                        if (totalEmpleadosArea == 0) continue;

                        var fechaNueva = s.FechaNuevaSolicitada;

                        // Ausentes por vacaciones activas
                        var ausentesVacaciones = await _db.VacacionesProgramadas
                            .Where(v => v.FechaVacacion == fechaNueva
                                     && v.EstadoVacacion == "Activa"
                                     && gruposDelArea.Contains(
                                            _db.Users
                                               .Where(u => u.Id == v.EmpleadoId)
                                               .Select(u => u.GrupoId ?? 0)
                                               .FirstOrDefault()))
                            .Select(v => v.EmpleadoId)
                            .Distinct()
                            .ToListAsync();

                        // Ausentes por permisos/incapacidades SAP
                        var nominasDelArea = await _db.Users
                            .Where(u => gruposDelArea.Contains(u.GrupoId ?? 0)
                                     && u.Status == UserStatus.Activo)
                            .Select(u => u.Nomina)
                            .ToListAsync();

                        var ausentesPermisos = await _db.PermisosEIncapacidadesSAP
                            .Where(p => p.Desde <= fechaNueva
                                     && p.Hasta >= fechaNueva
                                     && nominasDelArea.Contains(p.Nomina))
                            .Join(_db.Users,
                                  p => p.Nomina,
                                  u => u.Nomina,
                                  (p, u) => u.Id)
                            .Distinct()
                            .ToListAsync();

                        // Ausentes por festivos trabajados aprobados
                        var ausentesFestivos = await _db.SolicitudesFestivosTrabajados
                            .Where(f => f.FechaNuevaSolicitada == fechaNueva
                                     && f.EstadoSolicitud == "Aprobada"
                                     && nominasDelArea.Contains(f.Nomina))
                            .Select(f => f.EmpleadoId)
                            .Distinct()
                            .ToListAsync();

                        // Unión de todos los ausentes (sin duplicados)
                        var totalAusentesIds = ausentesVacaciones
                            .Union(ausentesPermisos)
                            .Union(ausentesFestivos)
                            .Distinct()
                            .Count();

                        var porcentaje = ((decimal)totalAusentesIds / totalEmpleadosArea) * 100m;
                        porcentajesDelDia[s.Id] = Math.Round(porcentaje, 2);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "No se pudo calcular porcentaje del día para solicitud {Id}", s.Id);
                    }
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
    }
}