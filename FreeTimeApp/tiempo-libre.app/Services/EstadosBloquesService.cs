using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using tiempo_libre.Models;

namespace tiempo_libre.Services
{
    public class EstadosBloquesService
    {
        private readonly FreeTimeDbContext _context;
        private readonly ILogger<EstadosBloquesService> _logger;
        private readonly NotificacionesService _notificacionesService;

        public EstadosBloquesService(
            FreeTimeDbContext context,
            ILogger<EstadosBloquesService> logger,
            NotificacionesService notificacionesService)
        {
            _context = context;
            _logger = logger;
            _notificacionesService = notificacionesService;
        }

        /// <summary>
        /// Actualiza automáticamente los estados de bloques y asignaciones basado en fechas y completado de empleados
        /// </summary>
        public async Task ActualizarEstadosAutomaticamenteAsync()
        {
            try
            {
                _logger.LogInformation("Iniciando actualización automática de estados de bloques");

                var fechaActual = DateTime.Now; // Usar hora local del servidor
                var bloquesActualizados = 0;
                var asignacionesActualizadas = 0;
                var empleadosTransferidos = 0;

                // 1. Obtener bloques que podrían necesitar actualización (tanto Aprobado como Activo)
                var bloquesParaRevisar = await _context.BloquesReservacion
                    .Include(b => b.AsignacionesBloque.Where(a => a.Estado != "Transferido"))
                    .Include(b => b.Grupo)
                    .Where(b => b.Estado == "Aprobado" || b.Estado == "Activo")
                    .ToListAsync();

                foreach (var bloque in bloquesParaRevisar)
                {

                    // 2. Actualizar AsignacionesBloque que tienen estado "Reservado" a "Completado" cuando vence el bloque
                    if (fechaActual > bloque.FechaHoraFin)
                    {
                        var asignacionesReservadas = bloque.AsignacionesBloque
                            .Where(a => a.Estado == "Reservado")
                            .ToList();

                        foreach (var asignacion in asignacionesReservadas)
                        {
                            asignacion.Estado = "Completado";
                            asignacion.FechaCompletado = fechaActual;
                            asignacionesActualizadas++;

                            _logger.LogDebug("Asignación {AsignacionId} con estado Reservado marcada como Completada por fecha vencida",
                                asignacion.Id);
                        }
                    }

                    // 3. Verificar si el bloque debe marcarse como completado
                    var debeCompletarseBloque = false;

                    // 3a. Por fecha vencida
                    if (fechaActual > bloque.FechaHoraFin)
                    {
                        debeCompletarseBloque = true;
                        _logger.LogDebug("Bloque {BloqueId} debe completarse por fecha vencida", bloque.Id);
                    }

                    // 3b. Por todos los empleados completados/reservados
                    if (!debeCompletarseBloque)
                    {
                        var asignacionesActivas = bloque.AsignacionesBloque
                            .Where(a => a.Estado != "Transferido")
                            .ToList();

                        var todasCompletadasOReservadas = asignacionesActivas.All(a =>
                            a.Estado == "Completado" || a.Estado == "Reservado");

                        if (asignacionesActivas.Any() && todasCompletadasOReservadas)
                        {
                            debeCompletarseBloque = true;
                            _logger.LogDebug("Bloque {BloqueId} debe completarse porque todos los empleados están listos",
                                bloque.Id);
                        }
                    }

                    // 4. Actualizar el bloque si es necesario
                    if (debeCompletarseBloque)
                    {
                        bloque.Estado = "Completado";
                        bloque.FechaAprobacion = bloque.FechaAprobacion ?? fechaActual; // Preserve existing approval date
                        bloquesActualizados++;

                        _logger.LogInformation("Bloque {BloqueId} del grupo {GrupoId} marcado como completado",
                            bloque.Id, bloque.GrupoId);

                        // 4a. Procesar empleados no completados. "Saltado" cuenta igual
                        // que "Asignado": el salto solo desbloqueó al siguiente, pero si
                        // el saltado no capturó dentro de la ventana del bloque, al
                        // vencer va a la cola como cualquier no-respuesta.
                        var empleadosNoCompletados = bloque.AsignacionesBloque
                            .Where(a => a.Estado == "Asignado" || a.Estado == "Saltado")
                            .ToList();

                        if (!bloque.EsBloqueCola) // Si es un bloque regular, transferir al bloque cola
                        {

                            if (empleadosNoCompletados.Any())
                            {
                                // Buscar el bloque cola del mismo grupo y año
                                var bloqueCola = await _context.BloquesReservacion
                                    .FirstOrDefaultAsync(b =>
                                        b.GrupoId == bloque.GrupoId &&
                                        b.AnioGeneracion == bloque.AnioGeneracion &&
                                        b.EsBloqueCola &&
                                        b.Estado != "Completado");

                                if (bloqueCola != null)
                                {
                                    // Obtener la posición máxima actual en el bloque cola
                                    var maxPosicion = await _context.AsignacionesBloque
                                        .Where(a => a.BloqueId == bloqueCola.Id && a.Estado != "Transferido")
                                        .MaxAsync(a => (int?)a.PosicionEnBloque) ?? 0;

                                    foreach (var asignacion in empleadosNoCompletados)
                                    {
                                        // Marcar la asignación actual como transferida
                                        asignacion.Estado = "Transferido";
                                        asignacion.Observaciones = $"Transferido automáticamente al bloque cola el {fechaActual:yyyy-MM-dd HH:mm} - No respondió en tiempo";

                                        // Crear nueva asignación en el bloque cola con estado NoRespondio
                                        var nuevaAsignacion = new AsignacionesBloque
                                        {
                                            BloqueId = bloqueCola.Id,
                                            EmpleadoId = asignacion.EmpleadoId,
                                            PosicionEnBloque = ++maxPosicion,
                                            FechaAsignacion = fechaActual,
                                            AsignedoPor = 1, // Sistema
                                            Estado = "NoRespondio", // Nuevo estado para indicar que no respondió
                                            Observaciones = $"Transferido automáticamente desde bloque {bloque.NumeroBloque} - No reservó vacaciones en el tiempo asignado"
                                        };

                                        _context.AsignacionesBloque.Add(nuevaAsignacion);
                                        empleadosTransferidos++;

                                        _logger.LogInformation(
                                            "Empleado {EmpleadoId} transferido al bloque cola con estado NoRespondio desde bloque {BloqueOrigen}",
                                            asignacion.EmpleadoId, bloque.NumeroBloque);

                                        // Crear notificación para el empleado transferido
                                        await _notificacionesService.CrearNotificacionAsync(
                                            Models.Enums.TiposDeNotificacionEnum.SistemaBloques,
                                            "Transferido al Bloque Cola - Acción Requerida",
                                            $"No reservaste tus vacaciones en el bloque {bloque.NumeroBloque} (del {bloque.FechaHoraInicio:dd/MM/yyyy} al {bloque.FechaHoraFin:dd/MM/yyyy}). " +
                                            $"Has sido transferido automáticamente al bloque cola. Por favor, contacta a tu supervisor o al área de RH para programar tus vacaciones.",
                                            "Sistema de Bloques",
                                            asignacion.EmpleadoId, // Notificar al empleado
                                            1, // Sistema como emisor
                                            bloque.Grupo?.AreaId, // Área del grupo
                                            bloque.GrupoId, // Grupo
                                            "TransferenciaBloqueCola",
                                            null,
                                            new
                                            {
                                                BloqueOrigen = bloque.NumeroBloque,
                                                BloqueCola = bloqueCola.NumeroBloque,
                                                FechaTransferencia = fechaActual,
                                                RazonTransferencia = "No reservó vacaciones en tiempo asignado"
                                            }
                                        );

                                        // Crear notificación para el jefe del área
                                        if (bloque.Grupo?.AreaId != null)
                                        {
                                            // Obtener el empleado para tener su nombre
                                            var empleado = await _context.Users.FindAsync(asignacion.EmpleadoId);

                                            await _notificacionesService.CrearNotificacionAsync(
                                                Models.Enums.TiposDeNotificacionEnum.SistemaBloques,
                                                "Empleado No Respondió - Transferido a Bloque Cola",
                                                $"El empleado {empleado?.FullName ?? $"ID {asignacion.EmpleadoId}"} (Nómina: {empleado?.Nomina}) " +
                                                $"no reservó sus vacaciones en el bloque {bloque.NumeroBloque} y ha sido transferido automáticamente al bloque cola. " +
                                                $"Se requiere seguimiento para asegurar la programación de sus vacaciones.",
                                                "Sistema de Bloques",
                                                null, // Se enviará a todos los jefes del área
                                                1, // Sistema como emisor
                                                bloque.Grupo?.AreaId, // Área del grupo
                                                bloque.GrupoId, // Grupo
                                                "AlertaNoRespondio",
                                                null,
                                                new
                                                {
                                                    EmpleadoId = asignacion.EmpleadoId,
                                                    EmpleadoNombre = empleado?.FullName,
                                                    EmpleadoNomina = empleado?.Nomina,
                                                    BloqueOrigen = bloque.NumeroBloque,
                                                    FechaLimite = bloque.FechaHoraFin
                                                }
                                            );
                                        }
                                    }
                                }
                                else
                                {
                                    _logger.LogWarning(
                                        "No se encontró bloque cola activo para el grupo {GrupoId}, año {Anio}. " +
                                        "{CantidadEmpleados} empleados no pudieron ser transferidos",
                                        bloque.GrupoId, bloque.AnioGeneracion, empleadosNoCompletados.Count);
                                }
                            }
                        }
                        else if (bloque.EsBloqueCola && empleadosNoCompletados.Any())
                        {
                            // Si ES el bloque cola y hay empleados que no reservaron, marcarlos como NoRespondio
                            foreach (var asignacion in empleadosNoCompletados)
                            {
                                asignacion.Estado = "NoRespondio";
                                asignacion.Observaciones = $"No reservó vacaciones en el bloque cola - Requiere intervención manual. Fecha límite vencida: {bloque.FechaHoraFin:yyyy-MM-dd}";
                                asignacionesActualizadas++;

                                _logger.LogWarning(
                                    "Empleado {EmpleadoId} marcado como NoRespondio en bloque cola - Requiere intervención urgente",
                                    asignacion.EmpleadoId);
                            }

                            // Crear notificación crítica para RH y jefes de área
                            if (empleadosNoCompletados.Any() && bloque.Grupo?.AreaId != null)
                            {
                                var empleadosIds = empleadosNoCompletados.Select(a => a.EmpleadoId).ToList();
                                var empleadosInfo = await _context.Users
                                    .Where(u => empleadosIds.Contains(u.Id))
                                    .Select(u => new { u.Id, u.FullName, u.Nomina })
                                    .ToListAsync();

                                var listaEmpleados = string.Join(", ",
                                    empleadosInfo.Select(e => $"{e.FullName} (Nómina: {e.Nomina})"));

                                await _notificacionesService.CrearNotificacionAsync(
                                    Models.Enums.TiposDeNotificacionEnum.SistemaBloques,
                                    "⚠️ CRÍTICO: Empleados sin vacaciones en bloque cola",
                                    $"Los siguientes empleados NO reservaron sus vacaciones en el BLOQUE COLA del grupo {bloque.Grupo?.Rol} " +
                                    $"y requieren intervención manual URGENTE:\n\n{listaEmpleados}\n\n" +
                                    $"El bloque cola finalizó el {bloque.FechaHoraFin:dd/MM/yyyy HH:mm}. " +
                                    $"Estos empleados están en riesgo de no tener vacaciones programadas para el año {bloque.AnioGeneracion}.",
                                    "Sistema de Bloques",
                                    null, // Se enviará a todos los jefes del área
                                    1, // Sistema como emisor
                                    bloque.Grupo?.AreaId,
                                    bloque.GrupoId,
                                    "AlertaCriticaBloqueCola",
                                    null,
                                    new
                                    {
                                        BloqueColaId = bloque.Id,
                                        CantidadEmpleados = empleadosNoCompletados.Count,
                                        EmpleadosAfectados = empleadosIds,
                                        FechaVencimiento = bloque.FechaHoraFin,
                                        RequiereAccion = "URGENTE"
                                    }
                                );

                                _logger.LogCritical(
                                    "ALERTA CRÍTICA: {Cantidad} empleados no reservaron en bloque cola del grupo {GrupoId}. Notificación enviada.",
                                    empleadosNoCompletados.Count, bloque.GrupoId);
                            }
                        }
                    }
                }

                // 5. Guardar cambios
                if (bloquesActualizados > 0 || asignacionesActualizadas > 0 || empleadosTransferidos > 0)
                {
                    await _context.SaveChangesAsync();
                    _logger.LogInformation(
                        "Actualización completada: {BloquesActualizados} bloques, {AsignacionesActualizadas} asignaciones, " +
                        "{EmpleadosTransferidos} empleados transferidos al bloque cola por no responder",
                        bloquesActualizados, asignacionesActualizadas, empleadosTransferidos);
                }
                else
                {
                    _logger.LogDebug("No se encontraron bloques o asignaciones que requieran actualización");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al actualizar estados automáticamente");
                throw;
            }
        }

        /// <summary>
        /// Obtiene estadísticas de estados de bloques para monitoreo
        /// </summary>
        public async Task<EstadisticasBloquesDto> ObtenerEstadisticasAsync(
            int? anioObjetivo = null,
            int? grupoId = null,
            int? areaId = null)
        {
            try
            {
                var anio = anioObjetivo ?? DateTime.Now.Year + 1;

                // Construir query base con filtros
                var queryBloques = _context.BloquesReservacion
                    .Include(b => b.AsignacionesBloque)
                    .Include(b => b.Grupo)
                    .Where(b => b.AnioGeneracion == anio);

                // Aplicar filtros
                if (grupoId.HasValue)
                {
                    queryBloques = queryBloques.Where(b => b.GrupoId == grupoId.Value);
                }

                if (areaId.HasValue)
                {
                    queryBloques = queryBloques.Where(b => b.Grupo.AreaId == areaId.Value);
                }

                var bloquesCompletos = await queryBloques.ToListAsync();

                // Obtener estadísticas por estado de bloques
                var estadisticasPorEstado = bloquesCompletos
                    .GroupBy(b => b.Estado)
                    .Select(g => new { Estado = g.Key, Cantidad = g.Count() })
                    .ToList();

                // Obtener fechas de inicio y fin
                DateTime? fechaPrimerBloque = null;
                DateTime? fechaUltimoBloque = null;

                if (bloquesCompletos.Any())
                {
                    fechaPrimerBloque = bloquesCompletos.Min(b => b.FechaHoraInicio);
                    fechaUltimoBloque = bloquesCompletos.Max(b => b.FechaHoraFin);
                }

                // Calcular estadísticas de empleados
                var todasAsignaciones = bloquesCompletos
                    .SelectMany(b => b.AsignacionesBloque ?? new List<AsignacionesBloque>())
                    .ToList();

                var estadisticasEmpleados = new EstadisticasEmpleadosDto
                {
                    TotalEmpleadosAsignados = todasAsignaciones.Select(a => a.EmpleadoId).Distinct().Count(),
                    EmpleadosConEstadoAsignado = todasAsignaciones.Count(a => a.Estado == "Asignado"),
                    EmpleadosConEstadoReservado = todasAsignaciones.Count(a => a.Estado == "Reservado"),
                    EmpleadosConEstadoCompletado = todasAsignaciones.Count(a => a.Estado == "Completado"),
                    EmpleadosConEstadoTransferido = todasAsignaciones.Count(a => a.Estado == "Transferido"),
                    EmpleadosConEstadoNoRespondio = todasAsignaciones.Count(a => a.Estado == "NoRespondio")
                };

                // Calcular empleados en bloques regulares vs cola
                var asignacionesEnBloquesRegulares = bloquesCompletos
                    .Where(b => !b.EsBloqueCola)
                    .SelectMany(b => b.AsignacionesBloque ?? new List<AsignacionesBloque>())
                    .Where(a => a.Estado != "Transferido")
                    .Count();

                var asignacionesEnBloqueCola = bloquesCompletos
                    .Where(b => b.EsBloqueCola)
                    .SelectMany(b => b.AsignacionesBloque ?? new List<AsignacionesBloque>())
                    .Where(a => a.Estado != "Transferido")
                    .Count();

                estadisticasEmpleados.EmpleadosEnBloquesRegulares = asignacionesEnBloquesRegulares;
                estadisticasEmpleados.EmpleadosEnBloqueCola = asignacionesEnBloqueCola;

                // Calcular porcentajes
                var totalActivos = todasAsignaciones.Count(a => a.Estado != "Transferido");
                if (totalActivos > 0)
                {
                    estadisticasEmpleados.PorcentajeCompletado =
                        Math.Round((decimal)estadisticasEmpleados.EmpleadosConEstadoCompletado * 100 / totalActivos, 2);
                    estadisticasEmpleados.PorcentajeReservado =
                        Math.Round((decimal)estadisticasEmpleados.EmpleadosConEstadoReservado * 100 / totalActivos, 2);
                    estadisticasEmpleados.PorcentajeNoRespondio =
                        Math.Round((decimal)estadisticasEmpleados.EmpleadosConEstadoNoRespondio * 100 / totalActivos, 2);
                }

                // HU21: el pastel del superusuario se lee POR EMPLEADO, no por
                // asignación. Un empleado que se movió de turno tiene dos filas
                // (la vieja en Transferido y la nueva en Asignado) y contarlas por
                // separado lo duplica. Se clasifica por su asignación vigente:
                //   Completado      → ya capturó (Reservado, o Completado al cerrar el bloque)
                //   No respondió    → se le venció el turno sin capturar
                //   Recalendarizado → sigue pendiente, pero ya se le dio otro turno
                //   Pendiente       → el resto (Asignado, Saltado)
                foreach (var porEmpleado in todasAsignaciones.GroupBy(a => a.EmpleadoId))
                {
                    var vigente = porEmpleado
                        .Where(a => a.Estado != "Transferido")
                        .OrderByDescending(a => a.Id)
                        .FirstOrDefault();
                    var fueMovido = porEmpleado.Any(a => a.Estado == "Transferido");

                    if (vigente == null)
                        estadisticasEmpleados.EmpleadosRecalendarizados++;
                    else if (vigente.Estado == "Reservado" || vigente.Estado == "Completado")
                        estadisticasEmpleados.EmpleadosCompletados++;
                    else if (vigente.Estado == "NoRespondio")
                        estadisticasEmpleados.EmpleadosNoRespondieron++;
                    else if (fueMovido)
                        estadisticasEmpleados.EmpleadosRecalendarizados++;
                    else
                        estadisticasEmpleados.EmpleadosPendientes++;
                }

                var totalEmpleados = estadisticasEmpleados.TotalEmpleadosAsignados;
                if (totalEmpleados > 0)
                {
                    estadisticasEmpleados.PorcentajeEmpleadosCompletados =
                        Math.Round((decimal)estadisticasEmpleados.EmpleadosCompletados * 100 / totalEmpleados, 2);
                    estadisticasEmpleados.PorcentajeEmpleadosPendientes =
                        Math.Round((decimal)estadisticasEmpleados.EmpleadosPendientes * 100 / totalEmpleados, 2);
                    estadisticasEmpleados.PorcentajeEmpleadosNoRespondieron =
                        Math.Round((decimal)estadisticasEmpleados.EmpleadosNoRespondieron * 100 / totalEmpleados, 2);
                    estadisticasEmpleados.PorcentajeEmpleadosRecalendarizados =
                        Math.Round((decimal)estadisticasEmpleados.EmpleadosRecalendarizados * 100 / totalEmpleados, 2);
                }

                var resultado = new EstadisticasBloquesDto
                {
                    AnioConsultado = anio,
                    TotalBloques = bloquesCompletos.Count,
                    BloquesEnBorrador = estadisticasPorEstado.FirstOrDefault(e => e.Estado == "Borrador")?.Cantidad ?? 0,
                    BloquesAprobados = estadisticasPorEstado.FirstOrDefault(e => e.Estado == "Aprobado")?.Cantidad ?? 0,
                    BloquesCompletados = estadisticasPorEstado.FirstOrDefault(e => e.Estado == "Completado")?.Cantidad ?? 0,
                    FechaPrimerBloque = fechaPrimerBloque,
                    FechaUltimoBloque = fechaUltimoBloque,
                    EstadisticasEmpleados = estadisticasEmpleados,
                    GrupoIdFiltro = grupoId,
                    AreaIdFiltro = areaId,
                    FechaConsulta = DateTime.Now
                };

                return resultado;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener estadísticas de bloques");
                throw;
            }
        }
    }

    public class EstadisticasBloquesDto
    {
        public int AnioConsultado { get; set; }
        public int TotalBloques { get; set; }
        public int BloquesEnBorrador { get; set; }
        public int BloquesAprobados { get; set; }
        public int BloquesCompletados { get; set; }
        public DateTime? FechaPrimerBloque { get; set; }
        public DateTime? FechaUltimoBloque { get; set; }

        // Estadísticas de empleados
        public EstadisticasEmpleadosDto EstadisticasEmpleados { get; set; } = new();

        // Filtros aplicados
        public int? GrupoIdFiltro { get; set; }
        public int? AreaIdFiltro { get; set; }

        public DateTime FechaConsulta { get; set; }
    }

    public class EstadisticasEmpleadosDto
    {
        public int TotalEmpleadosAsignados { get; set; }
        public int EmpleadosConEstadoAsignado { get; set; }
        public int EmpleadosConEstadoReservado { get; set; }
        public int EmpleadosConEstadoCompletado { get; set; }
        public int EmpleadosConEstadoTransferido { get; set; }
        public int EmpleadosConEstadoNoRespondio { get; set; }
        public int EmpleadosEnBloquesRegulares { get; set; }
        public int EmpleadosEnBloqueCola { get; set; }
        public decimal PorcentajeCompletado { get; set; }
        public decimal PorcentajeReservado { get; set; }
        public decimal PorcentajeNoRespondio { get; set; }

        // HU21: conteo por empleado (cada uno cae en una sola categoría).
        public int EmpleadosCompletados { get; set; }
        public int EmpleadosPendientes { get; set; }
        public int EmpleadosNoRespondieron { get; set; }
        public int EmpleadosRecalendarizados { get; set; }
        public decimal PorcentajeEmpleadosCompletados { get; set; }
        public decimal PorcentajeEmpleadosPendientes { get; set; }
        public decimal PorcentajeEmpleadosNoRespondieron { get; set; }
        public decimal PorcentajeEmpleadosRecalendarizados { get; set; }
    }
}
