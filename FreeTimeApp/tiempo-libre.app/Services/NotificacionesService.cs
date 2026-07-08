using Microsoft.EntityFrameworkCore;
using tiempo_libre.Models;
using tiempo_libre.Models.Enums;
using tiempo_libre.DTOs;
using System.Text.Json;

namespace tiempo_libre.Services
{
    public class NotificacionesService
    {
        private readonly FreeTimeDbContext _context;
        private readonly ILogger<NotificacionesService> _logger;

        public NotificacionesService(FreeTimeDbContext context, ILogger<NotificacionesService> logger)
        {
            _context = context;
            _logger = logger;
        }

        /// <summary>
        /// Crear una notificación básica
        /// </summary>
        public async Task<Notificaciones> CrearNotificacionAsync(
            TiposDeNotificacionEnum tipo,
            string titulo,
            string mensaje,
            string nombreEmisor,
            int? idUsuarioReceptor = null,
            int? idUsuarioEmisor = null,
            int? areaId = null,
            int? grupoId = null,
            string? tipoMovimiento = null,
            int? idSolicitud = null,
            object? metadatos = null)
        {
            var notificacion = new Notificaciones
            {
                TipoDeNotificacion = tipo,
                Titulo = titulo,
                Mensaje = mensaje,
                NombreEmisor = nombreEmisor,
                IdUsuarioReceptor = idUsuarioReceptor,
                IdUsuarioEmisor = idUsuarioEmisor,
                AreaId = areaId,
                GrupoId = grupoId,
                TipoMovimiento = tipoMovimiento,
                IdSolicitud = idSolicitud,
                FechaAccion = DateTime.UtcNow,
                Estatus = EstatusNotificacionEnum.NoLeida,
                MetadatosJson = metadatos != null ? JsonSerializer.Serialize(metadatos) : null
            };

            _context.Notificaciones.Add(notificacion);
            await _context.SaveChangesAsync();

            _logger.LogInformation("Notificación creada: {Tipo} - {Titulo} por {NombreEmisor}",
                tipo, titulo, nombreEmisor);

            return notificacion;
        }

        /// <summary>
        /// Notificar registro de vacaciones a jefes/líderes del área/grupo
        /// </summary>
        public async Task NotificarRegistroVacacionesAsync(
            int empleadoId,
            string nombreEmpleado,
            string nombreEmisor,
            DateOnly fechaVacacion,
            int? areaId = null,
            int? grupoId = null)
        {
            var titulo = "Registro de Vacaciones";
            var mensaje = $"Se registraron vacaciones para {nombreEmpleado} el {fechaVacacion:dd/MM/yyyy}";

            // Obtener jefes de área y líderes de grupo para notificar
            var receptores = await ObtenerReceptoresAreaGrupoAsync(areaId, grupoId);

            foreach (var receptor in receptores)
            {
                await CrearNotificacionAsync(
                    TiposDeNotificacionEnum.RegistroVacaciones,
                    titulo,
                    mensaje,
                    nombreEmisor,
                    idUsuarioReceptor: receptor.Id,
                    areaId: areaId,
                    grupoId: grupoId,
                    tipoMovimiento: "Vacaciones Programadas",
                    metadatos: new { EmpleadoId = empleadoId, FechaVacacion = fechaVacacion }
                );
            }
        }

        /// <summary>
        /// Notificar solicitud de suplente
        /// </summary>
        public async Task NotificarSolicitudSuplenteAsync(
            int solicitanteId,
            string nombreSolicitante,
            string nombreEmisor,
            DateTime fechaInicio,
            DateTime fechaFin,
            int? areaId = null,
            int? grupoId = null)
        {
            var titulo = "Solicitud de Suplente";
            var mensaje = $"{nombreSolicitante} solicita suplente del {fechaInicio:dd/MM/yyyy} al {fechaFin:dd/MM/yyyy}";

            var receptores = await ObtenerReceptoresAreaGrupoAsync(areaId, grupoId);

            foreach (var receptor in receptores)
            {
                await CrearNotificacionAsync(
                    TiposDeNotificacionEnum.SolicitudSuplente,
                    titulo,
                    mensaje,
                    nombreEmisor,
                    idUsuarioReceptor: receptor.Id,
                    areaId: areaId,
                    grupoId: grupoId,
                    tipoMovimiento: "Solicitud Suplencia",
                    metadatos: new { SolicitanteId = solicitanteId, FechaInicio = fechaInicio, FechaFin = fechaFin }
                );
            }
        }

        /// <summary>
        /// Notificar cambios de manning
        /// </summary>
        public async Task NotificarCambioManningAsync(
            decimal nuevoManning,
            decimal manningAnterior,
            string nombreEmisor,
            int areaId)
        {
            var titulo = "Cambio de Manning";
            var mensaje = $"El manning del área ha cambiado de {manningAnterior:F2} a {nuevoManning:F2}";

            // Notificar al jefe del área
            var jefesArea = await _context.Areas
                .Where(a => a.AreaId == areaId && a.JefeId.HasValue)
                .Select(a => a.Jefe)
                .ToListAsync();

            foreach (var jefe in jefesArea.Where(j => j != null))
            {
                await CrearNotificacionAsync(
                    TiposDeNotificacionEnum.CambioDeManning,
                    titulo,
                    mensaje,
                    nombreEmisor,
                    idUsuarioReceptor: jefe!.Id,
                    areaId: areaId,
                    tipoMovimiento: "Actualización Manning",
                    metadatos: new { ManningNuevo = nuevoManning, ManningAnterior = manningAnterior }
                );
            }
        }

        /// <summary>
        /// Notificar solicitud de reprogramación
        /// </summary>
        public async Task NotificarSolicitudReprogramacionAsync(
            int solicitanteId,
            string nombreSolicitante,
            string nombreEmisor,
            DateOnly fechaOriginal,
            DateOnly fechaNueva,
            int? areaId = null,
            int? grupoId = null,
            int? idSolicitud = null)
        {
            var titulo = "Solicitud de Reprogramación";
            var mensaje = $"{nombreSolicitante} solicita reprogramar vacaciones del {fechaOriginal:dd/MM/yyyy} al {fechaNueva:dd/MM/yyyy}";

            var receptores = await ObtenerReceptoresAreaGrupoAsync(areaId, grupoId);

            foreach (var receptor in receptores)
            {
                await CrearNotificacionAsync(
                    TiposDeNotificacionEnum.SolicitudReprogramacion,
                    titulo,
                    mensaje,
                    nombreEmisor,
                    idUsuarioReceptor: receptor.Id,
                    areaId: areaId,
                    grupoId: grupoId,
                    tipoMovimiento: "Solicitud Reprogramación",
                    idSolicitud: idSolicitud,
                    metadatos: new { SolicitanteId = solicitanteId, FechaOriginal = fechaOriginal, FechaNueva = fechaNueva }
                );
            }
        }

        /// <summary>
        /// Notificar aprobación/rechazo de reprogramación
        /// </summary>
        public async Task NotificarRespuestaReprogramacionAsync(
            bool aprobada,
            int solicitanteId,
            string nombreAprobador,
            DateOnly fechaOriginal,
            DateOnly fechaNueva,
            string? motivoRechazo = null,
            int? idSolicitud = null)
        {
            var tipoNotificacion = aprobada ? TiposDeNotificacionEnum.AprobacionReprogramacion : TiposDeNotificacionEnum.RechazoReprogramacion;
            var titulo = aprobada ? "Reprogramación Aprobada" : "Reprogramación Rechazada";
            var mensaje = aprobada
                ? $"Tu solicitud de reprogramación del {fechaOriginal:dd/MM/yyyy} al {fechaNueva:dd/MM/yyyy} ha sido aprobada"
                : $"Tu solicitud de reprogramación del {fechaOriginal:dd/MM/yyyy} al {fechaNueva:dd/MM/yyyy} ha sido rechazada";

            if (!aprobada && !string.IsNullOrEmpty(motivoRechazo))
            {
                mensaje += $". Motivo: {motivoRechazo}";
            }

            await CrearNotificacionAsync(
                tipoNotificacion,
                titulo,
                mensaje,
                nombreAprobador,
                idUsuarioReceptor: solicitanteId,
                tipoMovimiento: aprobada ? "Reprogramación Aprobada" : "Reprogramación Rechazada",
                idSolicitud: idSolicitud,
                metadatos: new { Aprobada = aprobada, FechaOriginal = fechaOriginal, FechaNueva = fechaNueva, MotivoRechazo = motivoRechazo }
            );
        }

        /// <summary>
        /// Notificar solicitud de festivo trabajado
        /// </summary>
        public async Task NotificarSolicitudFestivoTrabajadoAsync(
            int solicitanteId,
            string nombreSolicitante,
            string nombreEmisor,
            DateOnly fechaFestivo,
            string motivo,
            int? areaId = null,
            int? grupoId = null)
        {
            var titulo = "Solicitud de Festivo Trabajado";
            var mensaje = $"{nombreSolicitante} solicita trabajar el festivo del {fechaFestivo:dd/MM/yyyy}. Motivo: {motivo}";

            var receptores = await ObtenerReceptoresAreaGrupoAsync(areaId, grupoId);

            foreach (var receptor in receptores)
            {
                await CrearNotificacionAsync(
                    TiposDeNotificacionEnum.SolicitudFestivoTrabajado,
                    titulo,
                    mensaje,
                    nombreEmisor,
                    idUsuarioReceptor: receptor.Id,
                    areaId: areaId,
                    grupoId: grupoId,
                    tipoMovimiento: "Solicitud Festivo",
                    metadatos: new { SolicitanteId = solicitanteId, FechaFestivo = fechaFestivo, Motivo = motivo }
                );
            }
        }

        /// <summary>
        /// Notificar intercambio de festivo trabajado
        /// </summary>
        public async Task NotificarIntercambioFestivoAsync(
            int empleadoId,
            DateOnly festivoOriginal,
            DateOnly fechaNueva,
            int solicitanteId)
        {
            var empleado = await _context.Users.FindAsync(empleadoId);
            var solicitante = await _context.Users.FindAsync(solicitanteId);

            if (empleado == null || solicitante == null) return;

            var titulo = "Intercambio de Festivo Trabajado";
            var mensaje = $"Se ha registrado el intercambio de tu festivo trabajado del {festivoOriginal:dd/MM/yyyy} por el día {fechaNueva:dd/MM/yyyy}";

            await CrearNotificacionAsync(
                TiposDeNotificacionEnum.AprobacionReprogramacion,
                titulo,
                mensaje,
                solicitante.FullName,
                idUsuarioReceptor: empleadoId,
                areaId: empleado.AreaId,
                grupoId: empleado.GrupoId,
                tipoMovimiento: "Intercambio Festivo",
                metadatos: new {
                    FestivoOriginal = festivoOriginal,
                    FechaNueva = fechaNueva,
                    SolicitanteId = solicitanteId
                }
            );
        }

        /// <summary>
        /// Marcar notificación como leída
        /// </summary>
        public async Task<bool> MarcarComoLeidaAsync(int notificacionId, int usuarioId)
        {
            var notificacion = await _context.Notificaciones
                .FirstOrDefaultAsync(n => n.Id == notificacionId && n.IdUsuarioReceptor == usuarioId);

            if (notificacion == null)
                return false;

            notificacion.Estatus = EstatusNotificacionEnum.Leida;
            await _context.SaveChangesAsync();

            return true;
        }

        /// <summary>
        /// Obtener notificaciones de un usuario
        /// </summary>
        public async Task<List<Notificaciones>> ObtenerNotificacionesUsuarioAsync(
            int usuarioId,
            EstatusNotificacionEnum? estatus = null,
            int pageSize = 20,
            int page = 1)
        {
            var query = _context.Notificaciones
                .Include(n => n.Area)
                .Include(n => n.Grupo)
                .Where(n => n.IdUsuarioReceptor == usuarioId);

            if (estatus.HasValue)
                query = query.Where(n => n.Estatus == estatus.Value);

            return await query
                .OrderByDescending(n => n.FechaAccion)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync();
        }

        /// <summary>
        /// Obtener notificaciones según el rol del usuario
        /// </summary>
        public async Task<ApiResponse<NotificacionesResponse>> ObtenerNotificacionesPorRolAsync(
            string username, ObtenerNotificacionesRequest request)
        {
            try
            {
                // Obtener usuario actual con roles
                var usuario = await _context.Users
                    .Include(u => u.Roles)
                    .FirstOrDefaultAsync(u => u.Username == username);

                if (usuario == null)
                    return new ApiResponse<NotificacionesResponse>(false, null, "Usuario no encontrado");

                // Determinar rol principal
                var esSuperUsuario = usuario.Roles.Any(r => r.Name == "Super Usuario" || r.Name == "SuperUsuario");
                var esJefeArea = usuario.Roles.Any(r => r.Name == "Jefe De Area");
                var esLiderGrupo = usuario.Roles.Any(r => r.Name == "Lider De Grupo");
                var esIngenieroIndustrial = usuario.Roles.Any(r => r.Name == "Ingeniero Industrial");

                IQueryable<Notificaciones> query;

                // Filtrar notificaciones según el rol
                if (esSuperUsuario)
                {
                    // SuperUsuario ve TODAS las notificaciones
                    query = _context.Notificaciones.AsQueryable();
                }
                else if (esJefeArea)
                {
                    // Jefe de Área ve notificaciones de todas las áreas donde es jefe y sus grupos
                    var areasComoJefe = await _context.Areas
                        .Where(a => a.Jefes.Any(aj => aj.UserId == usuario.Id))
                        .Select(a => a.AreaId)
                        .ToListAsync();

                    var gruposDeAreas = await _context.Grupos
                        .Where(g => areasComoJefe.Contains(g.AreaId))
                        .Select(g => g.GrupoId)
                        .ToListAsync();

                    query = _context.Notificaciones
                        .Where(n => (n.AreaId.HasValue && areasComoJefe.Contains(n.AreaId.Value)) ||
                                   (n.GrupoId.HasValue && gruposDeAreas.Contains(n.GrupoId.Value)));
                }
                else if (esLiderGrupo)
                {
                    // Líder de Grupo ve notificaciones solo de los grupos que lidera y sus áreas
                    var gruposComoLider = await _context.Grupos
                        .Where(g => g.LiderId == usuario.Id)
                        .ToListAsync();

                    var gruposIds = gruposComoLider.Select(g => g.GrupoId).ToList();
                    var areasIds = gruposComoLider.Select(g => g.AreaId).Distinct().ToList();

                    query = _context.Notificaciones
                        .Where(n => (n.GrupoId.HasValue && gruposIds.Contains(n.GrupoId.Value)) ||
                                   (n.AreaId.HasValue && areasIds.Contains(n.AreaId.Value)));
                }
                else if (esIngenieroIndustrial)
                {
                    // Ingeniero Industrial ve notificaciones de las áreas donde está asignado
                    var areasAsignadas = await _context.AreaIngenieros
                        .Where(ai => ai.IngenieroId == usuario.Id && ai.Activo)
                        .Select(ai => ai.AreaId)
                        .ToListAsync();

                    query = _context.Notificaciones
                        .Where(n => n.AreaId.HasValue && areasAsignadas.Contains(n.AreaId.Value));
                }
                else
                {
                    // Otros roles (incluidos sindicalizados) ven sus propias notificaciones
                    // Y también las notificaciones de solicitudes que ellos crearon (donde son emisores)
                    var esDelegadoSindical = usuario.Roles.Any(r =>
                        r.Name == "DelegadoSindical" ||
                        r.Name == "Delegado Sindical" ||
                        r.Name == "EmpleadoSindicalizado" ||
                        r.Name == "Empleado Sindicalizado");

                    if (esDelegadoSindical)
                    {
                        // Para delegados sindicales: ver notificaciones donde son receptores O emisores
                        query = _context.Notificaciones
                        .Where(n => n.IdUsuarioReceptor == usuario.Id ||
                                   n.IdUsuarioEmisor == usuario.Id ||
                                   (n.TipoDeNotificacion == TiposDeNotificacionEnum.SolicitudReprogramacion &&
                                    n.IdUsuarioEmisor == null));
                    }
                    else
                    {
                        // Para otros roles: solo sus notificaciones como receptores
                        query = _context.Notificaciones
                            .Where(n => n.IdUsuarioReceptor == usuario.Id);
                    }
                }

                // Aplicar filtros adicionales
                if (request.TipoNotificacion.HasValue)
                    query = query.Where(n => n.TipoDeNotificacion == request.TipoNotificacion.Value);

                if (request.Estatus.HasValue)
                    query = query.Where(n => n.Estatus == request.Estatus.Value);

                if (request.AreaId.HasValue && esSuperUsuario)
                    query = query.Where(n => n.AreaId == request.AreaId.Value);

                if (request.GrupoId.HasValue && esSuperUsuario)
                    query = query.Where(n => n.GrupoId == request.GrupoId.Value);

                if (request.FechaInicio.HasValue)
                    query = query.Where(n => n.FechaAccion >= request.FechaInicio.Value);

                if (request.FechaFin.HasValue)
                    query = query.Where(n => n.FechaAccion <= request.FechaFin.Value);

                // Contar total antes de paginar
                var totalNotificaciones = await query.CountAsync();

                // Aplicar ordenamiento
                query = request.OrdenarPor.ToLower() switch
                {
                    "fechaaccion" => request.DireccionOrden.ToUpper() == "ASC"
                        ? query.OrderBy(n => n.FechaAccion)
                        : query.OrderByDescending(n => n.FechaAccion),
                    "titulo" => request.DireccionOrden.ToUpper() == "ASC"
                        ? query.OrderBy(n => n.Titulo)
                        : query.OrderByDescending(n => n.Titulo),
                    "estatus" => request.DireccionOrden.ToUpper() == "ASC"
                        ? query.OrderBy(n => n.Estatus)
                        : query.OrderByDescending(n => n.Estatus),
                    _ => query.OrderByDescending(n => n.FechaAccion)
                };

                // Aplicar paginación
                var notificaciones = await query
                    .Include(n => n.Area)
                    .Include(n => n.Grupo)
                    .Skip((request.Pagina - 1) * request.TamañoPagina)
                    .Take(request.TamañoPagina)
                    .ToListAsync();

                // Convertir a DTO
                var notificacionesDto = notificaciones.Select(n => new NotificacionResponse
                {
                    Id = n.Id,
                    TipoDeNotificacion = n.TipoDeNotificacion,
                    TipoNotificacionTexto = n.TipoDeNotificacion.ToString(),
                    Titulo = n.Titulo,
                    Mensaje = n.Mensaje,
                    NombreEmisor = n.NombreEmisor,
                    FechaAccion = n.FechaAccion,
                    Estatus = n.Estatus,
                    EstatusTexto = n.Estatus.ToString(),
                    TipoMovimiento = n.TipoMovimiento,
                    Area = n.Area != null ? new AreaNotificacionDto
                    {
                        AreaId = n.Area.AreaId,
                        NombreGeneral = n.Area.NombreGeneral
                    } : null,
                    Grupo = n.Grupo != null ? new GrupoNotificacionDto
                    {
                        GrupoId = n.Grupo.GrupoId,
                        Rol = n.Grupo.Rol
                    } : null,
                    IdSolicitud = n.IdSolicitud,
                    PuedeMarcarLeida = n.Estatus == EstatusNotificacionEnum.NoLeida,
                    PuedeArchivar = n.Estatus != EstatusNotificacionEnum.Archivada
                }).ToList();

                // Obtener estadísticas
                var estadisticas = await ObtenerEstadisticasInternaAsync(query);

                // Calcular información de paginación
                var totalPaginas = (int)Math.Ceiling(totalNotificaciones / (double)request.TamañoPagina);

                var response = new NotificacionesResponse
                {
                    Notificaciones = notificacionesDto,
                    TotalNotificaciones = totalNotificaciones,
                    PaginaActual = request.Pagina,
                    TamañoPagina = request.TamañoPagina,
                    TotalPaginas = totalPaginas,
                    TienePaginaAnterior = request.Pagina > 1,
                    TienePaginaSiguiente = request.Pagina < totalPaginas,
                    Estadisticas = estadisticas,
                    RolUsuario = esSuperUsuario ? "SuperUsuario" :
                                esJefeArea ? "Jefe De Area" :
                                esLiderGrupo ? "Lider De Grupo" :
                                esIngenieroIndustrial ? "Ingeniero Industrial" : "Usuario"
                };

                return new ApiResponse<NotificacionesResponse>(true, response, null);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener notificaciones para usuario {Username}", username);
                return new ApiResponse<NotificacionesResponse>(false, null, $"Error interno: {ex.Message}");
            }
        }

        /// <summary>
        /// Marcar notificación como leída por username
        /// </summary>
        public async Task<bool> MarcarComoLeidaPorUsernameAsync(int notificacionId, string username)
        {
            try
            {
                var usuario = await _context.Users
                    .Include(u => u.Roles)
                    .FirstOrDefaultAsync(u => u.Username == username);

                if (usuario == null) return false;

                var notificacion = await _context.Notificaciones
                    .FirstOrDefaultAsync(n => n.Id == notificacionId);

                if (notificacion == null) return false;

                // Verificar permisos según rol
                var esSuperUsuario = usuario.Roles.Any(r => r.Name == "Super Usuario" || r.Name == "SuperUsuario");
                var esJefeArea = usuario.Roles.Any(r => r.Name == "Jefe De Area");
                var esLiderGrupo = usuario.Roles.Any(r => r.Name == "Lider De Grupo");
                var esIngenieroIndustrial = usuario.Roles.Any(r => r.Name == "Ingeniero Industrial");

                bool tienePermiso = false;

                if (esSuperUsuario)
                {
                    // SuperUsuario puede marcar cualquier notificación
                    tienePermiso = true;
                }
                else if (esJefeArea && notificacion.AreaId.HasValue)
                {
                    // Verificar que sea jefe del área de la notificación
                    var esJefeDelArea = await _context.Areas
                        .AnyAsync(a => a.AreaId == notificacion.AreaId.Value
                                       && a.Jefes.Any(aj => aj.UserId == usuario.Id));
                    tienePermiso = esJefeDelArea;
                }
                else if (esLiderGrupo && notificacion.GrupoId.HasValue)
                {
                    // Verificar que sea líder del grupo de la notificación
                    var esLiderDelGrupo = await _context.Grupos
                        .AnyAsync(g => g.GrupoId == notificacion.GrupoId.Value && g.LiderId == usuario.Id);
                    tienePermiso = esLiderDelGrupo;
                }
                else if (esIngenieroIndustrial && notificacion.AreaId.HasValue)
                {
                    // Verificar que esté asignado al área
                    var estaAsignado = await _context.AreaIngenieros
                        .AnyAsync(ai => ai.AreaId == notificacion.AreaId.Value &&
                                       ai.IngenieroId == usuario.Id &&
                                       ai.Activo);
                    tienePermiso = estaAsignado;
                }
                else if (notificacion.IdUsuarioReceptor == usuario.Id)
                {
                    // Es el receptor directo
                    tienePermiso = true;
                }

                if (!tienePermiso) return false;

                notificacion.Estatus = EstatusNotificacionEnum.Leida;
                await _context.SaveChangesAsync();

                _logger.LogInformation("Notificación {Id} marcada como leída por {Username}",
                    notificacionId, username);

                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al marcar notificación {Id} como leída", notificacionId);
                return false;
            }
        }

        /// <summary>
        /// Archivar notificación por username
        /// </summary>
        public async Task<bool> ArchivarNotificacionPorUsernameAsync(int notificacionId, string username)
        {
            var usuario = await _context.Users.FirstOrDefaultAsync(u => u.Username == username);
            if (usuario == null) return false;

            var notificacion = await _context.Notificaciones
                .FirstOrDefaultAsync(n => n.Id == notificacionId && n.IdUsuarioReceptor == usuario.Id);

            if (notificacion == null)
                return false;

            notificacion.Estatus = EstatusNotificacionEnum.Archivada;
            await _context.SaveChangesAsync();

            return true;
        }

        /// <summary>
        /// Obtener estadísticas de notificaciones por username
        /// </summary>
        public async Task<ApiResponse<EstadisticasNotificacionesDto>> ObtenerEstadisticasNotificacionesAsync(string username)
        {
            try
            {
                var usuario = await _context.Users.FirstOrDefaultAsync(u => u.Username == username);
                if (usuario == null)
                    return new ApiResponse<EstadisticasNotificacionesDto>(false, null, "Usuario no encontrado");

                var query = _context.Notificaciones.Where(n => n.IdUsuarioReceptor == usuario.Id);
                var estadisticas = await ObtenerEstadisticasInternaAsync(query);

                return new ApiResponse<EstadisticasNotificacionesDto>(true, estadisticas, null);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener estadísticas para {Username}", username);
                return new ApiResponse<EstadisticasNotificacionesDto>(false, null, $"Error interno: {ex.Message}");
            }
        }

        /// <summary>
        /// Obtener estadísticas internas de un query de notificaciones
        /// </summary>
        private async Task<EstadisticasNotificacionesDto> ObtenerEstadisticasInternaAsync(IQueryable<Notificaciones> query)
        {
            var total = await query.CountAsync();
            var noLeidas = await query.CountAsync(n => n.Estatus == EstatusNotificacionEnum.NoLeida);
            var leidas = await query.CountAsync(n => n.Estatus == EstatusNotificacionEnum.Leida);
            var archivadas = await query.CountAsync(n => n.Estatus == EstatusNotificacionEnum.Archivada);

            var porTipo = await query
                .GroupBy(n => n.TipoDeNotificacion)
                .Select(g => new { Tipo = g.Key.ToString(), Count = g.Count() })
                .ToDictionaryAsync(x => x.Tipo, x => x.Count);

            var porArea = await query
                .Where(n => n.Area != null)
                .GroupBy(n => n.Area!.NombreGeneral)
                .Select(g => new { Area = g.Key, Count = g.Count() })
                .ToDictionaryAsync(x => x.Area, x => x.Count);

            var porGrupo = await query
                .Where(n => n.Grupo != null)
                .GroupBy(n => n.Grupo!.Rol)
                .Select(g => new { Grupo = g.Key, Count = g.Count() })
                .ToDictionaryAsync(x => x.Grupo, x => x.Count);

            var ultimaNotificacion = await query
                .Include(n => n.Area)
                .Include(n => n.Grupo)
                .OrderByDescending(n => n.FechaAccion)
                .FirstOrDefaultAsync();

            return new EstadisticasNotificacionesDto
            {
                TotalNotificaciones = total,
                NoLeidas = noLeidas,
                Leidas = leidas,
                Archivadas = archivadas,
                PorTipo = porTipo,
                PorArea = porArea,
                PorGrupo = porGrupo,
                UltimaNotificacion = ultimaNotificacion != null ? new NotificacionResponse
                {
                    Id = ultimaNotificacion.Id,
                    TipoDeNotificacion = ultimaNotificacion.TipoDeNotificacion,
                    TipoNotificacionTexto = ultimaNotificacion.TipoDeNotificacion.ToString(),
                    Titulo = ultimaNotificacion.Titulo,
                    Mensaje = ultimaNotificacion.Mensaje,
                    NombreEmisor = ultimaNotificacion.NombreEmisor,
                    FechaAccion = ultimaNotificacion.FechaAccion,
                    Estatus = ultimaNotificacion.Estatus,
                    EstatusTexto = ultimaNotificacion.Estatus.ToString(),
                    TipoMovimiento = ultimaNotificacion.TipoMovimiento,
                    Area = ultimaNotificacion.Area != null ? new AreaNotificacionDto
                    {
                        AreaId = ultimaNotificacion.Area.AreaId,
                        NombreGeneral = ultimaNotificacion.Area.NombreGeneral
                    } : null,
                    Grupo = ultimaNotificacion.Grupo != null ? new GrupoNotificacionDto
                    {
                        GrupoId = ultimaNotificacion.Grupo.GrupoId,
                        Rol = ultimaNotificacion.Grupo.Rol
                    } : null
                } : null
            };
        }

        /// <summary>
        /// Obtener receptores (jefes y líderes) para un área/grupo específico
        /// </summary>
        private async Task<List<User>> ObtenerReceptoresAreaGrupoAsync(int? areaId = null, int? grupoId = null)
        {
            var receptores = new List<User>();

            // Obtener jefe del área
            if (areaId.HasValue)
            {
                var jefesArea = await _context.Areas
                    .Where(a => a.AreaId == areaId.Value && a.JefeId.HasValue)
                    .Select(a => a.Jefe!)
                    .ToListAsync();

                receptores.AddRange(jefesArea);
            }

            // Obtener líder del grupo
            if (grupoId.HasValue)
            {
                var lideresGrupo = await _context.Grupos
                    .Where(g => g.GrupoId == grupoId.Value && g.LiderId.HasValue)
                    .Select(g => g.Lider!)
                    .ToListAsync();

                receptores.AddRange(lideresGrupo);
            }

            return receptores.Distinct().ToList();
        }
    }
}