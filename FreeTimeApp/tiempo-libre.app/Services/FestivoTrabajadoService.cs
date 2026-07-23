using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading.Tasks;
using tiempo_libre.DTOs;
using tiempo_libre.Models;
using tiempo_libre.Models.Enums;

namespace tiempo_libre.Services
{
    public class FestivoTrabajadoService
    {
        private readonly FreeTimeDbContext _db;
        private readonly ILogger<FestivoTrabajadoService> _logger;
        private readonly NotificacionesService _notificacionesService;
        private readonly ValidadorPorcentajeService _validadorPorcentaje;

        public FestivoTrabajadoService(
            FreeTimeDbContext db,
            ILogger<FestivoTrabajadoService> logger,
            NotificacionesService notificacionesService,
            ValidadorPorcentajeService validadorPorcentaje)
        {
            _db = db;
            _logger = logger;
            _notificacionesService = notificacionesService;
            _validadorPorcentaje = validadorPorcentaje;
        }

        /// <summary>
        /// Match tolerante entre la nómina del empleado y el valor tal como
        /// vino del Excel (con espacios, ceros a la izquierda, ".00", comas…).
        /// </summary>
        private static bool NominaCoincide(string? uploadNomina, int? empNomina, string empNominaStr)
        {
            if (string.IsNullOrWhiteSpace(uploadNomina)) return false;
            var t = uploadNomina.Trim();
            if (string.Equals(t, empNominaStr, StringComparison.OrdinalIgnoreCase))
                return true;
            if (!empNomina.HasValue) return false;
            if (int.TryParse(t, NumberStyles.Integer, CultureInfo.InvariantCulture, out var i)
                && i == empNomina.Value)
                return true;
            if (decimal.TryParse(t, NumberStyles.Any, CultureInfo.InvariantCulture, out var d)
                && d == empNomina.Value)
                return true;
            // Último recurso: comparar sólo dígitos (elimina puntos, comas, guiones).
            var digitos = new string(t.Where(char.IsDigit).ToArray()).TrimStart('0');
            var target = empNomina.Value.ToString(CultureInfo.InvariantCulture);
            return digitos.Length > 0 && digitos == target;
        }

        /// <summary>
        /// Solicitar el intercambio de un festivo trabajado por un día de vacaciones
        /// Similar a reprogramación: auto-aprueba si no excede porcentaje, sino crea solicitud pendiente
        /// </summary>
        public async Task<ApiResponse<SolicitudFestivoTrabajadoResponse>> SolicitarIntercambioFestivoAsync(
    SolicitudFestivoTrabajadoRequest request, int usuarioSolicitanteId)
        {
            using var transaction = await _db.Database.BeginTransactionAsync();

            try
            {
                // Reconstruir la fecha desde DayNumber (el Id que ahora enviamos)
                var fechaFestivo = DateOnly.FromDayNumber(request.FestivoTrabajadoId);

                var empleado = await _db.Users
                    .Include(u => u.Area)
                    .Include(u => u.Grupo)
                    .FirstOrDefaultAsync(u => u.Id == request.EmpleadoId && u.Status == UserStatus.Activo);

                if (empleado == null)
                    return new ApiResponse<SolicitudFestivoTrabajadoResponse>(false, null, "Empleado no encontrado o inactivo");

                var nominaStr = empleado.Nomina?.ToString() ?? empleado.Username;
                var nominaInt = empleado.Nomina;
                var fechaStr1 = fechaFestivo.ToString("yyyy-MM-dd");
                var fechaStr2 = fechaFestivo.ToString("dd-MM-yyyy");
                var fechaStr3 = fechaFestivo.ToString("dd/MM/yyyy");

                // Match tolerante: el Excel puede traer ".00", ceros a la izquierda,
                // espacios o comas. Filtramos por fecha en SQL y por nómina en memoria.
                var candidatos = await _db.FestivosEmpleadosTrabajadosUpload
                    .Where(f => f.Nomina != null &&
                                (f.FechaTrabajada == fechaStr1 ||
                                 f.FechaTrabajada == fechaStr2 ||
                                 f.FechaTrabajada == fechaStr3) &&
                                (f.Nomina == nominaStr || f.Nomina.Contains(nominaStr)))
                    .Select(f => new { f.Nomina, f.FechaTrabajada })
                    .ToListAsync();

                var registroUpload = candidatos
                    .FirstOrDefault(c => NominaCoincide(c.Nomina, nominaInt, nominaStr));

                if (registroUpload == null)
                    return new ApiResponse<SolicitudFestivoTrabajadoResponse>(false, null,
                        $"El empleado no tiene registrado haber trabajado el {fechaFestivo:dd/MM/yyyy}");

                var fechaLimiteSolicitud = fechaFestivo.AddYears(1);
                if (DateOnly.FromDateTime(DateTime.Today) > fechaLimiteSolicitud)
                    return new ApiResponse<SolicitudFestivoTrabajadoResponse>(false, null,
                        "Ya venció el plazo para solicitar intercambio de este festivo");

                var fechaMaximaNueva = fechaLimiteSolicitud.AddMonths(1);
                if (request.FechaNueva > fechaMaximaNueva)
                    return new ApiResponse<SolicitudFestivoTrabajadoResponse>(false, null,
                        $"La fecha nueva debe ser antes del {fechaMaximaNueva:dd/MM/yyyy}");

                var yaIntercambiado = await _db.SolicitudesFestivosTrabajados
                    .AnyAsync(s => s.EmpleadoId == request.EmpleadoId &&
                                  s.FestivoOriginal == fechaFestivo &&
                                  (s.EstadoSolicitud == "Pendiente" || s.EstadoSolicitud == "Aprobada"));

                if (yaIntercambiado)
                    return new ApiResponse<SolicitudFestivoTrabajadoResponse>(false, null, "Ya existe una solicitud para este día festivo");
                // Validar que la fecha nueva no sea un día inhábil
                var esDiaInhabil = await _db.DiasInhabiles.AnyAsync(d => d.Fecha == request.FechaNueva);
                if (esDiaInhabil)
                    return new ApiResponse<SolicitudFestivoTrabajadoResponse>(false, null,
                        "No se puede programar una vacación en un día inhábil o festivo");

                var conflictoVacaciones = await _db.VacacionesProgramadas
                    .AnyAsync(v => v.EmpleadoId == request.EmpleadoId &&
                                  v.FechaVacacion == request.FechaNueva &&
                                  v.EstadoVacacion == "Activa");
                if (conflictoVacaciones)
                    return new ApiResponse<SolicitudFestivoTrabajadoResponse>(false, null,
                        $"Ya existe una vacación programada para el {request.FechaNueva:dd/MM/yyyy}");

                // Calcular porcentaje
                decimal porcentaje = 0;
                var requiereAprobacion = false;
                var configuracion = await _db.ConfiguracionVacaciones
                    .OrderByDescending(c => c.CreatedAt).FirstOrDefaultAsync();
                var porcentajeMaximo = configuracion?.PorcentajeAusenciaMaximo ?? 4.5m;

                if (empleado.GrupoId.HasValue)
                {
                    var totalEmpleados = await _db.Users
                        .CountAsync(u => u.GrupoId == empleado.GrupoId.Value && u.Status == UserStatus.Activo);
                    var vacacionesEnFecha = await _db.VacacionesProgramadas
                        .CountAsync(v => v.Empleado.GrupoId == empleado.GrupoId.Value &&
                                        v.FechaVacacion == request.FechaNueva && v.EstadoVacacion == "Activa");
                    if (totalEmpleados > 0)
                        porcentaje = ((decimal)(vacacionesEnFecha + 1) / totalEmpleados) * 100;
                    requiereAprobacion = true;
                }

                // Obtener jefe de área
                User? jefeArea = null;
                if (empleado.AreaId.HasValue)
                {
                    jefeArea = await _db.Users.FirstOrDefaultAsync(u =>
                        u.AreaId == empleado.AreaId &&
                        u.Roles.Any(r => r.Name == "JefeArea" || r.Name == "Jefe De Area"));
                }
                // ✅ CAMBIO: Crear solicitud con referencia al día inhábil
                var solicitud = new SolicitudesFestivosTrabajados
                {
                    EmpleadoId = request.EmpleadoId,
                    FestivoTrabajadoOriginalId = null, // Ya no viene de DiasInhabiles
                    FechaNuevaSolicitada = request.FechaNueva,
                    Motivo = request.Motivo,
                    EstadoSolicitud = requiereAprobacion ? "Pendiente" : "Aprobada",
                    PorcentajeCalculado = porcentaje,
                    FechaSolicitud = DateTime.Now,
                    SolicitadoPorId = usuarioSolicitanteId,
                    JefeAreaId = jefeArea?.Id,
                    FestivoOriginal = fechaFestivo,
                    Nomina = empleado.Nomina ?? 0
                };

                // Auto-aprobar si no requiere aprobación
                //if (!requiereAprobacion)
                //{
                //    solicitud.FechaRespuesta = DateTime.Now;
                //    solicitud.AprobadoPorId = usuarioSolicitanteId;
                //}

                _db.SolicitudesFestivosTrabajados.Add(solicitud);
                await _db.SaveChangesAsync();

                // Crear vacación si se auto-aprobó
                int? vacacionId = null;
                //if (!requiereAprobacion)
                //{
                //    var nuevaVacacion = new VacacionesProgramadas
                //    {
                //        EmpleadoId = request.EmpleadoId,
                //        FechaVacacion = request.FechaNueva,
                //        TipoVacacion = "FestivoTrabajado",
                //        OrigenAsignacion = "Manual",
                //        EstadoVacacion = "Activa",
                //        PeriodoProgramacion = "IntercambioFestivo",
                //        FechaProgramacion = DateTime.Now,
                //        PuedeSerIntercambiada = false,
                //        CreatedAt = DateTime.Now,
                //        CreatedBy = usuarioSolicitanteId,
                //        Observaciones = $"Intercambio de festivo {diaInhabil.Detalles} del {diaInhabil.Fecha:dd/MM/yyyy}. " +
                //                       $"DiaInhabilId:{request.FestivoTrabajadoId}. SolicitudId:{solicitud.Id}. Motivo: {request.Motivo}"
                //    };

                //    _db.VacacionesProgramadas.Add(nuevaVacacion);
                //    await _db.SaveChangesAsync();

                //    solicitud.VacacionCreadaId = nuevaVacacion.Id;
                //    vacacionId = nuevaVacacion.Id;
                //    await _db.SaveChangesAsync();

                //    await _notificacionesService.NotificarIntercambioFestivoAsync(
                //        empleado.Id,
                //        diaInhabil.Fecha,
                //        request.FechaNueva,
                //        usuarioSolicitanteId);
                //}
                //else
                {
                    if (jefeArea != null)
                    {
                        await _notificacionesService.NotificarSolicitudFestivoTrabajadoAsync(
                            empleado.Id,
                            empleado.FullName,
                            empleado.FullName,
                            request.FechaNueva,
                            request.Motivo,
                            empleado.AreaId,
                            empleado.GrupoId);
                    }
                }

                await transaction.CommitAsync();

                var response = new SolicitudFestivoTrabajadoResponse
                {
                    SolicitudId = solicitud.Id,
                    EmpleadoId = empleado.Id,
                    NombreEmpleado = empleado.FullName,
                    NominaEmpleado = empleado.Nomina?.ToString() ?? empleado.Username,
                    FestivoOriginal = fechaFestivo,
                    FechaNueva = request.FechaNueva,
                    Motivo = request.Motivo,
                    EstadoSolicitud = solicitud.EstadoSolicitud,
                    RequiereAprobacion = requiereAprobacion,
                    PorcentajeCalculado = porcentaje,
                    MensajeValidacion = requiereAprobacion
                        ? $"Solicitud creada. Requiere aprobación del jefe de área (porcentaje: {porcentaje:F2}%)"
                        : "Intercambio aprobado automáticamente",
                    FechaSolicitud = DateTime.Now,
                    SolicitadoPor = empleado.FullName,
                    JefeAreaId = jefeArea?.Id,
                    NombreJefeArea = jefeArea?.FullName,
                    VacacionId = vacacionId
                };

                return new ApiResponse<SolicitudFestivoTrabajadoResponse>(true, response, null);
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                _logger.LogError(ex, "Error al solicitar intercambio de festivo trabajado");
                return new ApiResponse<SolicitudFestivoTrabajadoResponse>(false, null,
                    $"Error inesperado: {ex.Message}");
            }
        }

        /// <summary>
        /// Aprobar o rechazar una solicitud de intercambio de festivo (solo jefes de área)
        /// </summary>
        public async Task<ApiResponse<AprobarFestivoTrabajadoResponse>> AprobarRechazarSolicitudAsync(
            AprobarFestivoTrabajadoRequest request, int usuarioAprobadorId)
        {
            using var transaction = await _db.Database.BeginTransactionAsync();

            try
            {
                // 1. Obtener la solicitud
                var solicitud = await _db.SolicitudesFestivosTrabajados
                    .Include(s => s.Empleado)
                    .FirstOrDefaultAsync(s => s.Id == request.SolicitudId);

                if (solicitud == null)
                {
                    return new ApiResponse<AprobarFestivoTrabajadoResponse>(false, null,
                        "Solicitud no encontrada");
                }

                if (solicitud.EstadoSolicitud != "Pendiente")
                {
                    return new ApiResponse<AprobarFestivoTrabajadoResponse>(false, null,
                        $"La solicitud ya fue {solicitud.EstadoSolicitud.ToLower()}");
                }

                // 2. Actualizar el estado de la solicitud
                solicitud.EstadoSolicitud = request.Aprobada ? "Aprobada" : "Rechazada";
                solicitud.FechaRespuesta = DateTime.Now;
                solicitud.AprobadoPorId = usuarioAprobadorId;
                solicitud.MotivoRechazo = request.Aprobada ? null : request.MotivoRechazo;

                // 3. Si se aprueba, crear la vacación
                bool vacacionCreada = false;
                if (request.Aprobada)
                {
                    // Verificar nuevamente que no haya conflictos
                    var conflicto = await _db.VacacionesProgramadas
                        .AnyAsync(v => v.EmpleadoId == solicitud.EmpleadoId &&
                                      v.FechaVacacion == solicitud.FechaNuevaSolicitada &&
                                      v.EstadoVacacion == "Activa");

                    if (!conflicto)
                    {
                        var nuevaVacacion = new VacacionesProgramadas
                        {
                            EmpleadoId = solicitud.EmpleadoId,
                            FechaVacacion = solicitud.FechaNuevaSolicitada,
                            TipoVacacion = "FestivoTrabajado",
                            OrigenAsignacion = "Manual",
                            EstadoVacacion = "Activa",
                            PeriodoProgramacion = "IntercambioFestivo",
                            FechaProgramacion = DateTime.Now,
                            PuedeSerIntercambiada = false,
                            CreatedAt = DateTime.Now,
                            CreatedBy = usuarioAprobadorId,
                            Observaciones = $"Intercambio de festivo trabajado del {solicitud.FestivoOriginal:dd/MM/yyyy}. " +
                                           $"FestivoId:{solicitud.FestivoTrabajadoOriginalId}. SolicitudId:{solicitud.Id}. " +
                                           $"Aprobado por jefe de área. Motivo: {solicitud.Motivo}"
                        };

                        _db.VacacionesProgramadas.Add(nuevaVacacion);
                        await _db.SaveChangesAsync();

                        solicitud.VacacionCreadaId = nuevaVacacion.Id;
                        vacacionCreada = true;
                    }
                    else
                    {
                        return new ApiResponse<AprobarFestivoTrabajadoResponse>(false, null,
                            "No se pudo aprobar: ya existe una vacación en esa fecha");
                    }
                }

                await _db.SaveChangesAsync();

                // 4. Notificar al empleado sobre la decisión
                var aprobador = await _db.Users.FindAsync(usuarioAprobadorId);

                if (request.Aprobada)
                {
                    await _notificacionesService.NotificarIntercambioFestivoAsync(
                        solicitud.EmpleadoId,
                        solicitud.FestivoOriginal,
                        solicitud.FechaNuevaSolicitada,
                        usuarioAprobadorId);
                }
                else
                {
                    // Notificar rechazo (reutilizamos el método de reprogramación)
                    await _notificacionesService.NotificarRespuestaReprogramacionAsync(
                        false,
                        solicitud.EmpleadoId,
                        aprobador?.FullName ?? "Sistema",
                        solicitud.FestivoOriginal,
                        solicitud.FechaNuevaSolicitada,
                        request.MotivoRechazo ?? "No especificado");
                }

                // 5. Confirmar transacción
                await transaction.CommitAsync();

                var response = new AprobarFestivoTrabajadoResponse
                {
                    SolicitudId = solicitud.Id,
                    Aprobada = request.Aprobada,
                    EstadoFinal = solicitud.EstadoSolicitud,
                    EmpleadoId = solicitud.EmpleadoId,
                    NombreEmpleado = solicitud.Empleado.FullName,
                    FestivoOriginal = solicitud.FestivoOriginal,
                    FechaNueva = solicitud.FechaNuevaSolicitada,
                    MotivoRechazo = request.MotivoRechazo,
                    FechaAprobacion = DateTime.Now,
                    AprobadoPor = aprobador?.FullName ?? "Sistema",
                    VacacionCreada = vacacionCreada
                };

                _logger.LogInformation(
                    "Solicitud de festivo {SolicitudId} {Estado} por usuario {UsuarioId}",
                    solicitud.Id, solicitud.EstadoSolicitud, usuarioAprobadorId);

                return new ApiResponse<AprobarFestivoTrabajadoResponse>(true, response, null);
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                _logger.LogError(ex, "Error al aprobar/rechazar solicitud de festivo trabajado");
                return new ApiResponse<AprobarFestivoTrabajadoResponse>(false, null,
                    $"Error inesperado: {ex.Message}");
            }
        }

        /// <summary>
        /// Consultar solicitudes de festivos trabajados con filtros
        /// </summary>
        public async Task<ApiResponse<ListaSolicitudesFestivoResponse>> ConsultarSolicitudesAsync(
            ConsultaSolicitudesFestivoRequest request, int usuarioConsultaId)
        {
            try
            {
                var usuarioConsulta = await _db.Users
                    .Include(u => u.Roles)
                    .FirstOrDefaultAsync(u => u.Id == usuarioConsultaId);

                if (usuarioConsulta == null)
                {
                    return new ApiResponse<ListaSolicitudesFestivoResponse>(false, null,
                        "Usuario no encontrado");
                }

                var esSuperUsuario = usuarioConsulta.Roles.Any(r => r.Name == "SuperUsuario");
                var esJefeArea = usuarioConsulta.Roles.Any(r => r.Name == "JefeArea" ||
                                                                r.Name == "Jefe De Area");
                var esGerenteOrRH = usuarioConsulta.Roles.Any(r => r.Name == "Gerente BT" ||
                                                                    r.Name == "GerenteBT" ||
                                                                    r.Name == "RH");
                var tieneAreaScope = esJefeArea || esGerenteOrRH;

                // Áreas visibles para el usuario: AreaJefes (Jefe de Área) ∪
                // AreaAsignaciones (Gerente BT / RH). SuperUsuario no aplica scope.
                var areasJefeIds = (tieneAreaScope && !esSuperUsuario)
                    ? await _db.Areas
                        .Where(a => a.Jefes.Any(aj => aj.UserId == usuarioConsultaId) ||
                                    a.Asignaciones.Any(aa => aa.UserId == usuarioConsultaId))
                        .Select(a => a.AreaId)
                        .ToListAsync()
                    : new List<int>();

                // Construir query base
                var query = _db.SolicitudesFestivosTrabajados
                    .Include(s => s.Empleado)
                        .ThenInclude(e => e.Area)
                    .Include(s => s.Empleado)
                        .ThenInclude(e => e.Grupo)
                    .Include(s => s.JefeArea)
                    .Include(s => s.AprobadoPor)
                    .Include(s => s.SolicitadoPor)
                    .AsQueryable();

                // Aplicar filtros
                if (!string.IsNullOrEmpty(request.Estado))
                {
                    query = query.Where(s => s.EstadoSolicitud == request.Estado);
                }

                if (request.EmpleadoId.HasValue)
                {
                    query = query.Where(s => s.EmpleadoId == request.EmpleadoId.Value);
                }

                if (request.SolicitadoPorId.HasValue)
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
                    // Defensivo: para jefes de área, también incluir solicitudes donde
                    // ellos quedaron asignados como JefeAreaId al momento de crearla,
                    // por si el empleado se movió de área después.
                    var jefeIdParaFiltro = usuarioConsultaId;
                    query = query.Where(s =>
                        s.Empleado.AreaId == request.AreaId.Value ||
                        s.Empleado.Grupo.Area.AreaId == request.AreaId.Value ||
                        (esJefeArea && s.JefeAreaId == jefeIdParaFiltro));
                }
                else if (tieneAreaScope && !esSuperUsuario)
                {
                    // Si el usuario con scope de área no manda areaId, restringimos a
                    // sus áreas permitidas (jefe o asignación) o a las solicitudes
                    // que quedaron enlazadas a él como JefeAreaId.
                    var jefeIdParaFiltro = usuarioConsultaId;
                    query = query.Where(s =>
                        (s.Empleado.AreaId.HasValue && areasJefeIds.Contains(s.Empleado.AreaId.Value)) ||
                        (s.Empleado.Grupo != null && areasJefeIds.Contains(s.Empleado.Grupo.AreaId)) ||
                        (esJefeArea && s.JefeAreaId == jefeIdParaFiltro));
                }

                var solicitudes = await query
                    .OrderByDescending(s => s.FechaSolicitud)
                    .ToListAsync();

                // Precalcular porcentajes del día (igual que ReprogramacionService)
                var porcentajesDelDia = new Dictionary<int, decimal>();

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

                var gruposPorArea = await _db.Grupos
                    .Where(g => areasUnicas.Contains(g.AreaId))
                    .Select(g => new { g.GrupoId, g.AreaId })
                    .ToListAsync();

                var grupoIdsPorArea = gruposPorArea
                    .GroupBy(g => g.AreaId)
                    .ToDictionary(g => g.Key, g => g.Select(x => x.GrupoId).ToList());

                var todosGrupoIds = gruposPorArea.Select(g => g.GrupoId).Distinct().ToList();

                var empleadosActivos = await _db.Users
                    .Where(u => todosGrupoIds.Contains(u.GrupoId ?? 0) && u.Status == UserStatus.Activo)
                    .Select(u => new { u.Id, u.GrupoId, u.Nomina, u.AreaId })
                    .ToListAsync();

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

                var nominasActivas = empleadosActivos.Select(e => e.Nomina).Distinct().ToList();

                var permisosRaw = await _db.PermisosEIncapacidadesSAP
                    .Where(p => nominasActivas.Contains(p.Nomina)
                             && fechasUnicas.Any(f => p.Desde <= f && p.Hasta >= f))
                    .Select(p => new { p.Nomina, p.Desde, p.Hasta })
                    .ToListAsync();

                var festivosRaw = await _db.SolicitudesFestivosTrabajados
                    .Where(f => fechasUnicas.Contains(f.FechaNuevaSolicitada)
                             && f.EstadoSolicitud == "Aprobada"
                             && nominasActivas.Contains(f.Nomina))
                    .Select(f => new { f.EmpleadoId, f.FechaNuevaSolicitada, f.Nomina })
                    .Distinct()
                    .ToListAsync();

                var nominaToEmpleadoId = empleadosActivos
                    .Where(e => e.Nomina.HasValue)
                    .GroupBy(e => e.Nomina!.Value)
                    .ToDictionary(g => g.Key, g => g.First().Id);

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

                // Mapear a DTOs
                var solicitudesDto = solicitudes.Select(s => new SolicitudFestivoDto
                {
                    Id = s.Id,
                    EmpleadoId = s.EmpleadoId,
                    NombreEmpleado = s.Empleado.FullName,
                    NominaEmpleado = s.Nomina.ToString(),
                    AreaEmpleado = s.Empleado.Area?.NombreGeneral ?? "",
                    GrupoEmpleado = s.Empleado.Grupo?.Rol ?? "",
                    FestivoTrabajadoOriginalId = s.FestivoTrabajadoOriginalId ?? 0,
                    FestivoOriginal = s.FestivoOriginal,
                    FechaNueva = s.FechaNuevaSolicitada,
                    Motivo = s.Motivo,
                    EstadoSolicitud = s.EstadoSolicitud,
                    RequiereAprobacion = s.EstadoSolicitud == "Pendiente",
                    PorcentajeCalculado = s.PorcentajeCalculado,
                    PorcentajeDelDia = porcentajesDelDia.TryGetValue(s.Id, out var pctDia) ? pctDia : (decimal?)null,
                    FechaSolicitud = s.FechaSolicitud,
                    SolicitadoPor = s.SolicitadoPor?.FullName ?? "",
                    FechaAprobacion = s.FechaRespuesta,
                    AprobadoPor = s.AprobadoPor?.FullName,
                    MotivoRechazo = s.MotivoRechazo,
                    PuedeAprobar = esJefeArea &&
                                  s.EstadoSolicitud == "Pendiente" &&
                                  s.Empleado.Grupo?.Area?.AreaId == usuarioConsulta.AreaId
                }).ToList();

                var response = new ListaSolicitudesFestivoResponse
                {
                    TotalSolicitudes = solicitudesDto.Count,
                    Pendientes = solicitudesDto.Count(s => s.EstadoSolicitud == "Pendiente"),
                    Aprobadas = solicitudesDto.Count(s => s.EstadoSolicitud == "Aprobada"),
                    Rechazadas = solicitudesDto.Count(s => s.EstadoSolicitud == "Rechazada"),
                    Solicitudes = solicitudesDto
                };
                _logger.LogInformation("Festivos ConsultarSolicitudes: encontradas {Count} solicitudes para AreaId={AreaId}",
    solicitudes.Count, request.AreaId);
                return new ApiResponse<ListaSolicitudesFestivoResponse>(true, response, null);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al consultar solicitudes de festivos trabajados");
                return new ApiResponse<ListaSolicitudesFestivoResponse>(false, null,
                    $"Error inesperado: {ex.Message}");
            }
        }

        /// <summary>
        /// Consultar festivos trabajados disponibles para un empleado
        /// </summary>
        public async Task<ApiResponse<ListaFestivosTrabajadosResponse>> ConsultarFestivosTrabajadosAsync(
    ConsultaFestivosTrabajadosRequest request)
        {
            try
            {
                var culture = new CultureInfo("es-ES");
                string[] formatos = { "yyyy-MM-dd", "dd-MM-yyyy", "dd/MM/yyyy" };
                var festivosDto = new List<FestivoTrabajadoDto>();

                if (request.EmpleadoId.HasValue)
                {
                    var emp = await _db.Users
                        .Where(u => u.Id == request.EmpleadoId.Value)
                        .Select(u => new { u.Nomina, u.Username })
                        .FirstOrDefaultAsync();

                    if (emp != null)
                    {
                        // Task #73: normalizar match de nómina.
                        // El Excel puede traer "0012345", " 12345 " o "12345",
                        // mientras User.Nomina siempre es un int sin padding.
                        // Traemos filas candidatas por LIKE amplio y filtramos
                        // en memoria por igualdad numérica cuando ambos parsean.
                        var nominaStr = emp.Nomina?.ToString() ?? emp.Username;
                        var nominaInt = emp.Nomina;

                        var uploadsRaw = await _db.FestivosEmpleadosTrabajadosUpload
                            .Where(f => f.Nomina != null &&
                                        (f.Nomina == nominaStr || f.Nomina.Contains(nominaStr)))
                            .Select(f => new { f.Nomina, f.FechaTrabajada })
                            .ToListAsync();

                        var fechasUpload = uploadsRaw
                            .Where(x => NominaCoincide(x.Nomina, nominaInt, nominaStr))
                            .Select(x => x.FechaTrabajada)
                            .ToList();

                        if (fechasUpload.Count == 0 && uploadsRaw.Count > 0)
                        {
                            _logger.LogWarning(
                                "Festivos: {N} filas candidatas pero ninguna coincidió para empleadoId={Id} nomina={Nomina}. Muestras: {Muestras}",
                                uploadsRaw.Count, request.EmpleadoId, nominaStr,
                                string.Join(", ", uploadsRaw.Take(5).Select(u => $"'{u.Nomina}'")));
                        }

                        // Cargar solicitudes ya existentes
                        var solicitudesExistentes = await _db.SolicitudesFestivosTrabajados
                            .Where(s => s.EmpleadoId == request.EmpleadoId.Value &&
                                       (s.EstadoSolicitud == "Pendiente" || s.EstadoSolicitud == "Aprobada"))
                            .Select(s => s.FestivoOriginal)
                            .ToListAsync();

                        var solicitudesDict = solicitudesExistentes.ToHashSet();

                        foreach (var fechaStr in fechasUpload)
                        {
                            if (string.IsNullOrEmpty(fechaStr)) continue;
                            if (!DateOnly.TryParseExact(fechaStr, formatos, null,
                                DateTimeStyles.None, out var fechaTrabajada)) continue;

                            // Regla: solo se puede solicitar hasta 1 año después del día trabajado
                            var fechaLimiteSolicitud = fechaTrabajada.AddYears(1);
                            if (DateOnly.FromDateTime(DateTime.Today) > fechaLimiteSolicitud) continue;

                            var yaSolicitado = solicitudesDict.Contains(fechaTrabajada);

                            var dto = new FestivoTrabajadoDto
                            {
                                Id = fechaTrabajada.DayNumber, // ID único basado en la fecha
                                Nomina = request.Nomina ?? 0,
                                NombreEmpleado = fechaTrabajada.ToString("dd/MM/yyyy", culture),
                                FestivoTrabajado = fechaTrabajada.ToString("yyyy-MM-dd"),
                                DiaSemana = fechaTrabajada.ToString("dddd", culture),
                                YaIntercambiado = yaSolicitado,
                                VacacionAsignadaId = null,
                                FechaIntercambio = null
                            };

                            if (!request.SoloDisponibles || !dto.YaIntercambiado)
                                festivosDto.Add(dto);
                        }
                    }
                }

                var response = new ListaFestivosTrabajadosResponse
                {
                    TotalFestivos = festivosDto.Count,
                    FestivosDisponibles = festivosDto.Count(f => !f.YaIntercambiado),
                    FestivosIntercambiados = festivosDto.Count(f => f.YaIntercambiado),
                    Festivos = festivosDto
                };

                return new ApiResponse<ListaFestivosTrabajadosResponse>(true, response, null);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al consultar festivos trabajados");
                return new ApiResponse<ListaFestivosTrabajadosResponse>(false, null, $"Error inesperado: {ex.Message}");
            }
        }

        /// <summary>
        /// Diagnostica por qué un festivo trabajado no aparece como disponible
        /// para una nómina. Devuelve, por cada registro de upload, si parsea,
        /// si expiró, y si está bloqueado por una solicitud previa.
        /// </summary>
        public async Task<ApiResponse<DiagnosticoFestivoTrabajadoResponse>> DiagnosticarFestivosTrabajadosAsync(string nomina)
        {
            try
            {
                var resp = new DiagnosticoFestivoTrabajadoResponse { NominaConsultada = nomina ?? "" };
                if (string.IsNullOrWhiteSpace(nomina))
                {
                    resp.Notas.Add("Nómina vacía.");
                    return new ApiResponse<DiagnosticoFestivoTrabajadoResponse>(true, resp, null);
                }

                var nominaTrim = nomina.Trim();
                int.TryParse(nominaTrim, out var nominaInt);

                var emp = await _db.Users
                    .Where(u => (u.Nomina != null && u.Nomina == nominaInt) || u.Username == nominaTrim)
                    .Select(u => new
                    {
                        u.Id,
                        u.Nomina,
                        u.Username,
                        u.FullName,
                        Area = u.Area != null ? u.Area.NombreGeneral : null,
                        Grupo = u.Grupo != null ? u.Grupo.Rol : null,
                    })
                    .FirstOrDefaultAsync();

                if (emp == null)
                {
                    resp.Notas.Add($"No se encontró ningún usuario con Nomina={nominaTrim} ni Username={nominaTrim}. Verifica el alta en Users.");
                    return new ApiResponse<DiagnosticoFestivoTrabajadoResponse>(true, resp, null);
                }

                resp.Empleado = new EmpleadoDiagnosticoDto
                {
                    Id = emp.Id,
                    Nomina = emp.Nomina?.ToString(),
                    Username = emp.Username,
                    FullName = emp.FullName,
                    Area = emp.Area,
                    Grupo = emp.Grupo,
                };

                // Mismo criterio que ConsultarFestivosTrabajadosAsync (match tolerante):
                var nominaMatch = emp.Nomina?.ToString() ?? emp.Username;
                resp.NominaUsadaParaMatch = nominaMatch;

                var candidatosRaw = await _db.FestivosEmpleadosTrabajadosUpload
                    .Where(f => f.Nomina != null &&
                                (f.Nomina == nominaMatch || f.Nomina.Contains(nominaMatch)))
                    .Select(f => new { f.Nomina, f.FechaTrabajada })
                    .ToListAsync();

                var uploadRecords = candidatosRaw
                    .Where(c => NominaCoincide(c.Nomina, emp.Nomina, nominaMatch))
                    .Select(c => c.FechaTrabajada)
                    .ToList();

                if (uploadRecords.Count == 0)
                {
                    if (candidatosRaw.Count > 0)
                    {
                        var muestras = candidatosRaw.Take(5).Select(c => "'" + c.Nomina + "'");
                        resp.Notas.Add($"Se encontraron {candidatosRaw.Count} filas con nómina parecida pero ninguna coincidió con '{nominaMatch}' tras normalizar. Muestras: {string.Join(", ", muestras)}. Revisar formato en el Excel.");
                    }
                    else
                    {
                        resp.Notas.Add($"No hay registros en FestivosEmpleadosTrabajadosUpload para esta nómina. Sarahí necesita subir/insertar el Excel.");
                    }
                }

                // Solicitudes que bloquean
                var solicitudesBloqueo = await _db.SolicitudesFestivosTrabajados
                    .Where(s => s.EmpleadoId == emp.Id &&
                                (s.EstadoSolicitud == "Pendiente" || s.EstadoSolicitud == "Aprobada"))
                    .Select(s => new SolicitudBloqueoDto
                    {
                        Id = s.Id,
                        FestivoOriginal = s.FestivoOriginal.ToString("yyyy-MM-dd"),
                        FechaNuevaSolicitada = s.FechaNuevaSolicitada.ToString("yyyy-MM-dd"),
                        EstadoSolicitud = s.EstadoSolicitud,
                        FechaSolicitud = s.FechaSolicitud.ToString("yyyy-MM-dd HH:mm"),
                    })
                    .ToListAsync();
                resp.SolicitudesQueBloquean = solicitudesBloqueo;

                var fechasBloqueadas = solicitudesBloqueo
                    .Select(s => DateOnly.TryParse(s.FestivoOriginal, out var d) ? d : default)
                    .ToHashSet();

                string[] formatos = { "yyyy-MM-dd", "dd-MM-yyyy", "dd/MM/yyyy" };
                var hoy = DateOnly.FromDateTime(DateTime.Today);

                foreach (var raw in uploadRecords)
                {
                    var rec = new UploadRecordDiagnosticoDto { FechaRaw = raw ?? "" };
                    if (string.IsNullOrWhiteSpace(raw))
                    {
                        rec.Motivo = "FechaTrabajada vacía en upload.";
                        rec.Disponible = false;
                        resp.UploadRecords.Add(rec);
                        continue;
                    }
                    if (!DateOnly.TryParseExact(raw, formatos, null, System.Globalization.DateTimeStyles.None, out var fecha))
                    {
                        rec.ParseoExitoso = false;
                        rec.Motivo = $"Formato no soportado. Se esperan: {string.Join(", ", formatos)}.";
                        rec.Disponible = false;
                        resp.UploadRecords.Add(rec);
                        continue;
                    }
                    rec.ParseoExitoso = true;
                    rec.FechaParsed = fecha.ToString("yyyy-MM-dd");
                    var fechaLimite = fecha.AddYears(1);
                    rec.Expirado = hoy > fechaLimite;
                    rec.YaSolicitado = fechasBloqueadas.Contains(fecha);

                    if (rec.Expirado) rec.Motivo = $"Expiró el {fechaLimite:yyyy-MM-dd} (límite = trabajado + 1 año).";
                    else if (rec.YaSolicitado) rec.Motivo = "Ya tiene una solicitud Pendiente o Aprobada para este día.";

                    rec.Disponible = !rec.Expirado && !rec.YaSolicitado;
                    resp.UploadRecords.Add(rec);
                }

                resp.TotalDisponibles = resp.UploadRecords.Count(r => r.Disponible);
                resp.TotalNoDisponibles = resp.UploadRecords.Count(r => !r.Disponible);

                return new ApiResponse<DiagnosticoFestivoTrabajadoResponse>(true, resp, null);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error en diagnóstico de festivos trabajados para nómina {Nomina}", nomina);
                return new ApiResponse<DiagnosticoFestivoTrabajadoResponse>(false, null, $"Error inesperado: {ex.Message}");
            }
        }

        /// <summary>
        /// Validar si un intercambio de festivo es posible antes de solicitarlo
        /// </summary>
        public async Task<ApiResponse<ValidarFestivoTrabajadoResponse>> ValidarIntercambioFestivoAsync(
            ValidarFestivoTrabajadoRequest request)
        {
            try
            {
                var response = new ValidarFestivoTrabajadoResponse
                {
                    FechaNueva = request.FechaNueva
                };

                // 1. Verificar que el día inhábil existe (igual que en SolicitarIntercambioFestivoAsync)
                var diaInhabil = await _db.DiasInhabiles
                    .FirstOrDefaultAsync(d => d.Id == request.FestivoTrabajadoId);

                if (diaInhabil == null)
                {
                    response.EsValido = false;
                    response.MotivoInvalidez = "El día festivo no existe";
                    return new ApiResponse<ValidarFestivoTrabajadoResponse>(true, response, null);
                }

                if (diaInhabil.TipoActividadDelDia != TipoActividadDelDiaEnum.InhabilPorLey)
                {
                    response.EsValido = false;
                    response.MotivoInvalidez = "Solo se pueden intercambiar días inhábiles por ley (festivos oficiales)";
                    return new ApiResponse<ValidarFestivoTrabajadoResponse>(true, response, null);
                }

                response.FestivoOriginal = diaInhabil.Fecha;

                // 2. Verificar que el empleado existe
                var empleado = await _db.Users
                    .FirstOrDefaultAsync(u => u.Id == request.EmpleadoId);

                if (empleado == null)
                {
                    response.EsValido = false;
                    response.MotivoInvalidez = "Empleado no encontrado";
                    return new ApiResponse<ValidarFestivoTrabajadoResponse>(true, response, null);
                }

                response.EmpleadoCoincide = true; // Los días inhábiles son para todos

                // 3. Verificar si ya fue intercambiado o tiene solicitud pendiente
                var yaIntercambiado = await _db.SolicitudesFestivosTrabajados
                    .AnyAsync(s => s.EmpleadoId == request.EmpleadoId &&
                                  s.FestivoOriginal == diaInhabil.Fecha &&
                                  (s.EstadoSolicitud == "Pendiente" || s.EstadoSolicitud == "Aprobada"));

                response.FestivoDisponible = !yaIntercambiado;

                if (yaIntercambiado)
                {
                    response.EsValido = false;
                    response.MotivoInvalidez = "Ya existe una solicitud para este día festivo";
                    return new ApiResponse<ValidarFestivoTrabajadoResponse>(true, response, null);
                }

                // 4. Validar fecha nueva
                var esDiaInhabil = await _db.DiasInhabiles
                    .AnyAsync(d => d.Fecha == request.FechaNueva);

                if (esDiaInhabil)
                {
                    response.EsValido = false;
                    response.MotivoInvalidez = "La fecha solicitada es un día inhábil o festivo";
                    return new ApiResponse<ValidarFestivoTrabajadoResponse>(true, response, null);
                }

                // 5. Verificar conflictos con otras vacaciones
                var conflicto = await _db.VacacionesProgramadas
                    .AnyAsync(v => v.EmpleadoId == request.EmpleadoId &&
                                  v.FechaVacacion == request.FechaNueva &&
                                  v.EstadoVacacion == "Activa");

                if (conflicto)
                {
                    response.EsValido = false;
                    response.MotivoInvalidez = "Ya existe una vacación programada para esa fecha";
                    return new ApiResponse<ValidarFestivoTrabajadoResponse>(true, response, null);
                }

                // 6. Advertir sobre porcentaje de ausencia (no bloquear, solo advertir)
                if (empleado.GrupoId.HasValue)
                {
                    var grupo = await _db.Grupos
                        .Include(g => g.Area)
                        .FirstOrDefaultAsync(g => g.GrupoId == empleado.GrupoId.Value);

                    decimal porcentaje = 0;
                    if (grupo != null && grupo.Area != null)
                    {
                        var totalEmpleados = await _db.Users
                            .CountAsync(u => u.GrupoId == empleado.GrupoId.Value &&
                                           u.Status == UserStatus.Activo);

                        var vacacionesEnFecha = await _db.VacacionesProgramadas
                            .CountAsync(v => v.Empleado.GrupoId == empleado.GrupoId.Value &&
                                           v.FechaVacacion == request.FechaNueva &&
                                           v.EstadoVacacion == "Activa");

                        var empleadosAusentes = vacacionesEnFecha + 1;

                        if (totalEmpleados > 0)
                        {
                            porcentaje = ((decimal)empleadosAusentes / totalEmpleados) * 100;
                        }
                    }

                    var configuracion = await _db.ConfiguracionVacaciones
                        .OrderByDescending(c => c.CreatedAt)
                        .FirstOrDefaultAsync();

                    var porcentajeMaximo = configuracion?.PorcentajeAusenciaMaximo ?? 4.5m;

                    if (porcentaje > porcentajeMaximo)
                    {
                        response.Advertencias.Add($"El porcentaje de ausencia ({porcentaje:F2}%) excede el máximo permitido ({porcentajeMaximo:F2}%). Requerirá aprobación del jefe de área.");
                    }
                    else if (porcentaje > porcentajeMaximo * 0.8m)
                    {
                        response.Advertencias.Add($"El porcentaje de ausencia está cerca del límite: {porcentaje:F2}%");
                    }
                }

                response.EsValido = true;
                return new ApiResponse<ValidarFestivoTrabajadoResponse>(true, response, null);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al validar intercambio de festivo trabajado");
                return new ApiResponse<ValidarFestivoTrabajadoResponse>(false, null,
                    $"Error inesperado: {ex.Message}");
            }
        }

        /// <summary>
        /// Obtener el historial de festivos intercambiados de un empleado
        /// </summary>
        public async Task<ApiResponse<List<VacacionDetalle>>> ObtenerHistorialFestivosIntercambiadosAsync(
            int empleadoId, int? anio = null)
        {
            try
            {
                var query = _db.VacacionesProgramadas
                    .Where(v => v.EmpleadoId == empleadoId &&
                               v.TipoVacacion == "FestivoTrabajado" &&
                               v.EstadoVacacion == "Activa");

                if (anio.HasValue)
                {
                    query = query.Where(v => v.FechaVacacion.Year == anio.Value);
                }

                var vacaciones = await query
                    .OrderBy(v => v.FechaVacacion)
                    .ToListAsync();

                var culture = new CultureInfo("es-ES");
                var detalles = vacaciones.Select(v => new VacacionDetalle
                {
                    Id = v.Id,
                    FechaVacacion = v.FechaVacacion,
                    TipoVacacion = v.TipoVacacion,
                    OrigenAsignacion = v.OrigenAsignacion,
                    EstadoVacacion = v.EstadoVacacion,
                    PeriodoProgramacion = v.PeriodoProgramacion,
                    FechaProgramacion = v.FechaProgramacion,
                    PuedeSerIntercambiada = v.PuedeSerIntercambiada,
                    Observaciones = v.Observaciones,
                    NumeroSemana = CultureInfo.CurrentCulture.Calendar.GetWeekOfYear(
                        v.FechaVacacion.ToDateTime(TimeOnly.MinValue),
                        CalendarWeekRule.FirstDay,
                        DayOfWeek.Monday),
                    DiaSemana = v.FechaVacacion.ToString("dddd", culture)
                }).ToList();

                return new ApiResponse<List<VacacionDetalle>>(true, detalles, null);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener historial de festivos intercambiados");
                return new ApiResponse<List<VacacionDetalle>>(false, null,
                    $"Error inesperado: {ex.Message}");
            }
        }
    }
}