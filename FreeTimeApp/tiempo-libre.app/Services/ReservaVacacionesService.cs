using Microsoft.EntityFrameworkCore;
using tiempo_libre.Models;
using tiempo_libre.DTOs;
using Microsoft.Extensions.Logging;

namespace tiempo_libre.Services
{
    public class ReservaVacacionesService
    {
        private readonly FreeTimeDbContext _context;
        private readonly AusenciaService _ausenciaService;
        private readonly NotificacionesService _notificacionesService;
        private readonly CalendarioGrupoService _calendarioGrupoService;
        private readonly VacacionesService _vacacionesService;
        private readonly ILogger<ReservaVacacionesService> _logger;

        public ReservaVacacionesService(
            FreeTimeDbContext context,
            AusenciaService ausenciaService,
            NotificacionesService notificacionesService,
            CalendarioGrupoService calendarioGrupoService,
            VacacionesService vacacionesService,
            ILogger<ReservaVacacionesService> logger)
        {
            _context = context;
            _ausenciaService = ausenciaService;
            _notificacionesService = notificacionesService;
            _calendarioGrupoService = calendarioGrupoService;
            _vacacionesService = vacacionesService;
            _logger = logger;
        }

        /// <summary>
        /// Obtener disponibilidad de días para reservar vacaciones por año
        /// </summary>
        public async Task<ApiResponse<DisponibilidadVacacionesResponse>> ObtenerDisponibilidadPorAnioAsync(
            DisponibilidadVacacionesRequest request)
        {
            try
            {
                // Obtener el grupo específico
                var grupo = await _context.Grupos
                    .Include(g => g.Area)
                    .FirstOrDefaultAsync(g => g.GrupoId == request.GrupoId);

                if (grupo == null)
                {
                    return new ApiResponse<DisponibilidadVacacionesResponse>(false, null,
                        $"No se encontró el grupo con ID {request.GrupoId}");
                }

                _logger.LogInformation("Procesando disponibilidad para grupo {GrupoId} en año {Anio}",
                    request.GrupoId, request.Anio);

                var mesesResumen = new List<DisponibilidadMesResumenDto>();

                // Procesar todos los meses del año
                for (int mes = 1; mes <= 12; mes++)
                {
                    var resumenMes = await ProcesarResumenMesAsync(request.Anio, mes, grupo);
                    mesesResumen.Add(resumenMes);
                }

                // Obtener configuración actual
                var configuracion = await ObtenerConfiguracionVacacionesAsync();

                var response = new DisponibilidadVacacionesResponse
                {
                    Anio = request.Anio,
                    GrupoId = grupo.GrupoId,
                    NombreGrupo = grupo.Rol,
                    NombreArea = grupo.Area?.NombreGeneral ?? "",
                    MesesDelAnio = mesesResumen,
                    ConfiguracionActual = configuracion,
                    FechaConsulta = DateTime.UtcNow
                };

                return new ApiResponse<DisponibilidadVacacionesResponse>(true, response, null);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener disponibilidad de vacaciones para año {Anio}, grupo {GrupoId}",
                    request.Anio, request.GrupoId);
                return new ApiResponse<DisponibilidadVacacionesResponse>(false, null, $"Error interno: {ex.Message}");
            }
        }

        /// <summary>
        /// Validar si un día específico está disponible para un empleado
        /// </summary>
        public async Task<ApiResponse<ValidacionDisponibilidadResponse>> ValidarDisponibilidadDiaAsync(
            int empleadoId, DateOnly fecha)
        {
            try
            {
                var request = new ValidacionDisponibilidadRequest
                {
                    EmpleadoId = empleadoId,
                    Fecha = fecha
                };

                return await _ausenciaService.ValidarDisponibilidadDiaAsync(request);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al validar disponibilidad para empleado {EmpleadoId} en fecha {Fecha}",
                    empleadoId, fecha);
                return new ApiResponse<ValidacionDisponibilidadResponse>(false, null, $"Error interno: {ex.Message}");
            }
        }

        /// <summary>
        /// Obtener estado actual del periodo de vacaciones
        /// </summary>
        public async Task<ApiResponse<EstadoPeriodoVacacionesDto>> ObtenerEstadoPeriodoAsync()
        {
            try
            {
                var configuracion = await _context.ConfiguracionVacaciones
                    .OrderByDescending(c => c.Id)
                    .FirstOrDefaultAsync();

                if (configuracion == null)
                {
                    return new ApiResponse<EstadoPeriodoVacacionesDto>(false, null,
                        "No se encontró configuración de vacaciones");
                }

                var estadoPeriodo = new EstadoPeriodoVacacionesDto
                {
                    PeriodoActual = configuracion.PeriodoActual,
                    AnioVigente = configuracion.AnioVigente,
                    AnioProgramacionAnual = configuracion.AnioProgramacionAnual,
                    PorcentajeAusenciaMaximo = configuracion.PorcentajeAusenciaMaximo,
                    // La programación anual también está permitida cuando hay un año
                    // en preparación (coexistiendo con la reprogramación del vigente).
                    PermiteProgramacionAnual = configuracion.PeriodoActual == "ProgramacionAnual"
                        || configuracion.AnioProgramacionAnual.HasValue,
                    // La reprogramación del año vigente sigue abierta mientras se
                    // prepara el año siguiente: solo "Cerrado" la apaga.
                    PermiteReprogramacion = configuracion.PeriodoActual != "Cerrado",
                    EstaCerrado = configuracion.PeriodoActual == "Cerrado"
                };

                return new ApiResponse<EstadoPeriodoVacacionesDto>(true, estadoPeriodo, null);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener estado del periodo");
                return new ApiResponse<EstadoPeriodoVacacionesDto>(false, null, $"Error interno: {ex.Message}");
            }
        }

        #region Métodos privados

        private async Task<DisponibilidadMesResumenDto> ProcesarResumenMesAsync(
            int anio, int mes, Grupo grupo)
        {
            var diasDelMes = DateTime.DaysInMonth(anio, mes);
            int diasDisponibles = 0;
            int diasNoDisponibles = 0;
            int totalDiasProcesados = 0;

            // Obtener calendario del grupo para el mes
            var inicioMes = new DateTime(anio, mes, 1);
            var finMes = new DateTime(anio, mes, diasDelMes, 23, 59, 59);
            var calendarioResponse = await _calendarioGrupoService.ObtenerCalendarioGrupoAsync(grupo.GrupoId, inicioMes, finMes);

            var diasDescanso = new HashSet<DateOnly>();
            if (calendarioResponse.Success && calendarioResponse.Data != null)
            {
                // Extraer días marcados como 'D' (Descanso)
                diasDescanso = calendarioResponse.Data.Calendario
                    .Where(c => c.Turno == "D")
                    .Select(c => DateOnly.FromDateTime(c.Fecha))
                    .ToHashSet();
            }

            // Procesar cada día del mes
            for (int dia = 1; dia <= diasDelMes; dia++)
            {
                var fecha = new DateOnly(anio, mes, dia);

                // Verificar si es día inhábil
                var esDiaInhabil = await _context.DiasInhabiles
                    .AnyAsync(d => d.Fecha == fecha);

                if (esDiaInhabil)
                    continue;

                // Verificar si es día de descanso según calendario del grupo
                if (diasDescanso.Contains(fecha))
                    continue;

                totalDiasProcesados++;

                try
                {
                    // Calcular ausencia para este grupo específico
                    var request = new ConsultaAusenciaRequest
                    {
                        FechaInicio = fecha,
                        FechaFin = null, // Solo un día
                        GrupoId = grupo.GrupoId
                    };

                    var ausenciaResponse = await _ausenciaService.CalcularAusenciasPorFechasAsync(request);

                    if (ausenciaResponse.Success && ausenciaResponse.Data?.Any() == true)
                    {
                        var ausenciaDia = ausenciaResponse.Data.First();
                        var ausenciaGrupo = ausenciaDia.AusenciasPorGrupo?.FirstOrDefault();

                        if (ausenciaGrupo != null && !ausenciaGrupo.ExcedeLimite)
                        {
                            diasDisponibles++;
                        }
                        else
                        {
                            diasNoDisponibles++;
                        }
                    }
                    else
                    {
                        diasNoDisponibles++;
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Error al procesar fecha {Fecha} para grupo {GrupoId}",
                        fecha, grupo.GrupoId);
                    diasNoDisponibles++;
                }
            }

            var porcentajeDisponibilidad = totalDiasProcesados > 0
                ? Math.Round((decimal)diasDisponibles / totalDiasProcesados * 100, 2)
                : 0;

            return new DisponibilidadMesResumenDto
            {
                Mes = mes,
                NombreMes = new DateTime(anio, mes, 1).ToString("MMMM"),
                DiasDisponibles = diasDisponibles,
                DiasNoDisponibles = diasNoDisponibles,
                TotalDiasProcesados = totalDiasProcesados,
                PorcentajeDisponibilidad = porcentajeDisponibilidad
            };
        }

        private async Task<List<Grupo>> ObtenerGruposParaProcesarAsync(int? areaId, int? grupoId)
        {
            var query = _context.Grupos
                .Include(g => g.Area)
                .AsQueryable();

            if (grupoId.HasValue)
                query = query.Where(g => g.GrupoId == grupoId.Value);
            else if (areaId.HasValue)
                query = query.Where(g => g.AreaId == areaId.Value);

            return await query.ToListAsync();
        }

        private async Task<DisponibilidadMesDto> ProcesarDisponibilidadMesAsync(
            int anio, int mes, List<Grupo> grupos)
        {
            var diasDelMes = DateTime.DaysInMonth(anio, mes);
            var diasDisponibles = new List<DisponibilidadDiaDto>();

            // Procesar cada día del mes
            for (int dia = 1; dia <= diasDelMes; dia++)
            {
                var fecha = new DateOnly(anio, mes, dia);

                // Saltear fines de semana (opcional - puede configurarse)
                if (fecha.DayOfWeek == DayOfWeek.Saturday || fecha.DayOfWeek == DayOfWeek.Sunday)
                    continue;

                // Verificar si es día inhábil
                var esDiaInhabil = await _context.DiasInhabiles
                    .AnyAsync(d => d.Fecha == fecha);

                if (esDiaInhabil)
                    continue;

                var disponibilidadDia = await ProcesarDisponibilidadDiaAsync(fecha, grupos);
                diasDisponibles.Add(disponibilidadDia);
            }

            return new DisponibilidadMesDto
            {
                Anio = anio,
                Mes = mes,
                NombreMes = new DateTime(anio, mes, 1).ToString("MMMM yyyy"),
                TotalDiasProcesados = diasDisponibles.Count,
                DiasDisponibles = diasDisponibles.Count(d => d.TieneDisponibilidad),
                DiasNoDisponibles = diasDisponibles.Count(d => !d.TieneDisponibilidad),
                Dias = diasDisponibles
            };
        }

        private async Task<DisponibilidadDiaDto> ProcesarDisponibilidadDiaAsync(
            DateOnly fecha, List<Grupo> grupos)
        {
            var disponibilidadPorGrupo = new List<DisponibilidadGrupoDto>();
            bool tieneDisponibilidadGeneral = false;

            foreach (var grupo in grupos)
            {
                try
                {
                    // Calcular ausencia actual del grupo
                    var request = new ConsultaAusenciaRequest
                    {
                        FechaInicio = fecha,
                        FechaFin = null, // Solo un día
                        GrupoId = grupo.GrupoId
                    };

                    var ausenciaResponse = await _ausenciaService.CalcularAusenciasPorFechasAsync(request);

                    if (ausenciaResponse.Success && ausenciaResponse.Data?.Any() == true)
                    {
                        var ausenciaDia = ausenciaResponse.Data.First();
                        var ausenciaGrupo = ausenciaDia.AusenciasPorGrupo?.FirstOrDefault();

                        if (ausenciaGrupo != null)
                        {
                            var tieneDisponibilidad = !ausenciaGrupo.ExcedeLimite;

                            if (tieneDisponibilidad)
                                tieneDisponibilidadGeneral = true;

                            disponibilidadPorGrupo.Add(new DisponibilidadGrupoDto
                            {
                                GrupoId = grupo.GrupoId,
                                NombreGrupo = grupo.Rol,
                                AreaId = grupo.AreaId,
                                NombreArea = grupo.Area?.NombreGeneral ?? "",
                                TieneDisponibilidad = tieneDisponibilidad,
                                PorcentajeAusenciaActual = ausenciaGrupo.PorcentajeAusencia,
                                PorcentajeMaximoPermitido = ausenciaGrupo.PorcentajeMaximoPermitido,
                                ManningRequerido = ausenciaGrupo.ManningRequerido,
                                PersonalDisponible = ausenciaGrupo.PersonalDisponible,
                                PersonalTotal = ausenciaGrupo.PersonalTotal,
                                MotivoNoDisponible = tieneDisponibilidad ? null :
                                    $"Excede límite permitido ({ausenciaGrupo.PorcentajeMaximoPermitido}%)"
                            });
                        }
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Error al procesar disponibilidad para grupo {GrupoId} en fecha {Fecha}",
                        grupo.GrupoId, fecha);

                    // Agregar grupo con error
                    disponibilidadPorGrupo.Add(new DisponibilidadGrupoDto
                    {
                        GrupoId = grupo.GrupoId,
                        NombreGrupo = grupo.Rol,
                        AreaId = grupo.AreaId,
                        NombreArea = grupo.Area?.NombreGeneral ?? "",
                        TieneDisponibilidad = false,
                        MotivoNoDisponible = "Error al calcular disponibilidad"
                    });
                }
            }

            return new DisponibilidadDiaDto
            {
                Fecha = fecha,
                DiaSemana = fecha.ToString("dddd"),
                TieneDisponibilidad = tieneDisponibilidadGeneral,
                TotalGrupos = disponibilidadPorGrupo.Count,
                GruposDisponibles = disponibilidadPorGrupo.Count(g => g.TieneDisponibilidad),
                GruposNoDisponibles = disponibilidadPorGrupo.Count(g => !g.TieneDisponibilidad),
                DisponibilidadPorGrupo = disponibilidadPorGrupo
            };
        }

        private async Task<ConfiguracionVacacionesDto> ObtenerConfiguracionVacacionesAsync()
        {
            var config = await _context.ConfiguracionVacaciones
                .OrderByDescending(c => c.Id)
                .FirstOrDefaultAsync();

            return new ConfiguracionVacacionesDto
            {
                PeriodoActual = config?.PeriodoActual ?? "Cerrado",
                AnioVigente = config?.AnioVigente ?? DateTime.Now.Year,
                PorcentajeAusenciaMaximo = config?.PorcentajeAusenciaMaximo ?? 4.5m,
                FechaActualizacion = config?.UpdatedAt ?? config?.CreatedAt ?? DateTime.Now
            };
        }

        /// <summary>
        /// Procesar reserva anual de vacaciones con todas las validaciones
        /// </summary>
        public async Task<ApiResponse<ReservaAnualResponse>> ProcesarReservaAnualAsync(ReservaAnualRequest request)
        {
            try
            {
                _logger.LogInformation("Iniciando reserva anual para empleado {EmpleadoId}, año {Anio}",
                    request.EmpleadoId, request.AnioVacaciones);

                // 1. Validar empleado existe
                var empleado = await _context.Users
                    .Include(u => u.Grupo)
                    .FirstOrDefaultAsync(u => u.Id == request.EmpleadoId);

                if (empleado == null)
                {
                    return new ApiResponse<ReservaAnualResponse>(false, null,
                        $"Empleado con ID {request.EmpleadoId} no encontrado");
                }

                // 2. Calcular días programables disponibles
                var vacacionesResponse = await _vacacionesService.CalcularVacacionesPorEmpleadoAsync(
                    request.EmpleadoId, request.AnioVacaciones);

                if (!vacacionesResponse.Success)
                {
                    return new ApiResponse<ReservaAnualResponse>(false, null, vacacionesResponse.ErrorMsg);
                }

                var vacacionesData = vacacionesResponse.Data!;

                // 2.b Candado de turno. Hasta ahora el orden por antigüedad se
                // respetaba SOLO en el frontend (LoginEmployee): cualquier
                // llamada que no pasara por esa pantalla dejaba capturar fuera
                // de turno. Es el punto 1 de "errores durante la captura del
                // 2026". El jefe y el superusuario NO pasan por aquí: capturan
                // por /api/vacaciones/asignacion-manual.
                var turno = await ValidarTurnoDeCapturaAsync(empleado, request.AnioVacaciones);
                if (!turno.Permitido)
                {
                    _logger.LogWarning("Captura fuera de turno del empleado {EmpleadoId} para {Anio}: {Motivo}",
                        empleado.Id, request.AnioVacaciones, turno.Motivo);
                    return new ApiResponse<ReservaAnualResponse>(false, null, turno.Motivo);
                }

                // 3. Verificar días programables disponibles vs solicitados
                int diasSolicitados = request.FechasSeleccionadas.Count;
                if (diasSolicitados > vacacionesData.DiasProgramables)
                {
                    return new ApiResponse<ReservaAnualResponse>(false, null,
                        $"El empleado solo tiene {vacacionesData.DiasProgramables} días programables disponibles, pero solicitó {diasSolicitados} días");
                }

                // 4. Validar que no exceda el total permitido (incluir ya programadas)
                var diasYaProgramados = await _context.VacacionesProgramadas
                    .CountAsync(v => v.EmpleadoId == request.EmpleadoId
                                  && v.FechaVacacion.Year == request.AnioVacaciones
                                  && v.TipoVacacion == "Anual"
                                  && v.EstadoVacacion == "Activa");

                if (diasYaProgramados + diasSolicitados > vacacionesData.DiasProgramables)
                {
                    return new ApiResponse<ReservaAnualResponse>(false, null,
                        $"El empleado ya tiene {diasYaProgramados} días programados. Solo puede programar {vacacionesData.DiasProgramables - diasYaProgramados} días más");
                }

                // 5. Validar fechas individualmente
                var fechasNoDisponibles = new List<FechaNoDisponibleDto>();
                var advertencias = new List<string>();

                foreach (var fecha in request.FechasSeleccionadas)
                {
                    var validacion = await ValidarFechaParaReservaAsync(fecha, empleado);
                    if (!validacion.EsValida)
                    {
                        fechasNoDisponibles.Add(new FechaNoDisponibleDto
                        {
                            Fecha = fecha,
                            Motivo = validacion.Motivo,
                            Detalle = validacion.Detalle
                        });
                    }

                    if (!string.IsNullOrEmpty(validacion.Advertencia))
                    {
                        advertencias.Add(validacion.Advertencia);
                    }
                }

                // Si hay fechas no disponibles, retornar error
                if (fechasNoDisponibles.Any())
                {
                    var response = new ReservaAnualResponse
                    {
                        EmpleadoId = request.EmpleadoId,
                        NombreEmpleado = empleado.FullName,
                        AnioVacaciones = request.AnioVacaciones,
                        DiasProgramablesDisponibles = vacacionesData.DiasProgramables - diasYaProgramados,
                        DiasProgramados = 0,
                        FechasNoDisponibles = fechasNoDisponibles,
                        Advertencias = advertencias,
                        ReservaExitosa = false,
                        MotivoFallo = $"Se encontraron {fechasNoDisponibles.Count} fechas no disponibles"
                    };

                    return new ApiResponse<ReservaAnualResponse>(false, response,
                        "Algunas fechas seleccionadas no están disponibles para reserva");
                }

                // 6. Guardar las reservas
                var vacacionesProgramadas = new List<VacacionProgramadaDto>();
                using var transaction = await _context.Database.BeginTransactionAsync();

                try
                {
                    foreach (var fecha in request.FechasSeleccionadas)
                    {
                        var nuevaVacacion = new VacacionesProgramadas
                        {
                            EmpleadoId = request.EmpleadoId,
                            FechaVacacion = fecha,
                            TipoVacacion = "Anual",
                            OrigenAsignacion = "Manual",
                            EstadoVacacion = "Activa",
                            PeriodoProgramacion = "ProgramacionAnual",
                            FechaProgramacion = DateTime.UtcNow,
                            PuedeSerIntercambiada = true,
                            CreatedAt = DateTime.UtcNow,
                            Observaciones = request.Observaciones
                        };

                        _context.VacacionesProgramadas.Add(nuevaVacacion);

                        vacacionesProgramadas.Add(new VacacionProgramadaDto
                        {
                            Fecha = fecha,
                            DiaSemana = fecha.ToString("dddd", new System.Globalization.CultureInfo("es-ES")),
                            TipoVacacion = "Anual",
                            FueProgramada = true
                        });
                    }

                    await _context.SaveChangesAsync();

                    // 6.5. Actualizar estado de AsignacionesBloque a "Reservado".
                    // "Saltado" también aplica: el saltado conserva el derecho de
                    // capturar mientras su bloque siga abierto y al hacerlo su
                    // asignación se normaliza.
                    var asignacionBloque = await _context.AsignacionesBloque
                        .FirstOrDefaultAsync(a => a.EmpleadoId == request.EmpleadoId &&
                                                 (a.Estado == "Asignado" || a.Estado == "Saltado") &&
                                                 a.Bloque.AnioGeneracion == request.AnioVacaciones);

                    if (asignacionBloque != null)
                    {
                        asignacionBloque.Estado = "Reservado";
                        asignacionBloque.FechaCompletado = DateTime.UtcNow;
                        await _context.SaveChangesAsync();

                        _logger.LogInformation("Actualizado estado de AsignacionBloque {AsignacionId} a 'Reservado' para empleado {EmpleadoId}",
                            asignacionBloque.Id, request.EmpleadoId);
                    }

                    // 7. Crear notificación de reserva exitosa
                    try
                    {
                        var fechasTexto = string.Join(", ", request.FechasSeleccionadas.Select(f => f.ToString("dd/MM/yyyy")));
                        await _notificacionesService.CrearNotificacionAsync(
                            tipo: Models.Enums.TiposDeNotificacionEnum.RegistroVacaciones,
                            titulo: "Vacaciones Programadas - Programación Anual",
                            mensaje: $"El empleado {empleado.FullName} ha programado {diasSolicitados} días de vacaciones para el año {request.AnioVacaciones}. Fechas: {fechasTexto}",
                            nombreEmisor: empleado.FullName,
                            idUsuarioEmisor: request.EmpleadoId,
                            areaId: empleado.Grupo?.AreaId,
                            grupoId: empleado.GrupoId,
                            tipoMovimiento: "ProgramacionAnual"
                        );
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Error al crear notificación para reserva anual del empleado {EmpleadoId}",
                            request.EmpleadoId);
                        // No fallar la transacción por error en notificación
                    }

                    await transaction.CommitAsync();

                    _logger.LogInformation("Reserva anual exitosa para empleado {EmpleadoId}: {CantidadDias} días programados",
                        request.EmpleadoId, diasSolicitados);

                    var responseExitosa = new ReservaAnualResponse
                    {
                        EmpleadoId = request.EmpleadoId,
                        NombreEmpleado = empleado.FullName,
                        AnioVacaciones = request.AnioVacaciones,
                        DiasProgramablesDisponibles = vacacionesData.DiasProgramables - diasYaProgramados - diasSolicitados,
                        DiasProgramados = diasSolicitados,
                        VacacionesProgramadas = vacacionesProgramadas,
                        FechasNoDisponibles = new List<FechaNoDisponibleDto>(),
                        Advertencias = advertencias,
                        ReservaExitosa = true,
                        MotivoFallo = null
                    };

                    return new ApiResponse<ReservaAnualResponse>(true, responseExitosa, null);
                }
                catch (Exception ex)
                {
                    await transaction.RollbackAsync();
                    _logger.LogError(ex, "Error al guardar reservas de vacaciones para empleado {EmpleadoId}",
                        request.EmpleadoId);
                    throw;
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al procesar reserva anual para empleado {EmpleadoId}",
                    request.EmpleadoId);
                return new ApiResponse<ReservaAnualResponse>(false, null, $"Error interno: {ex.Message}");
            }
        }

        /// <summary>
        /// Validar una fecha individual para reserva
        /// </summary>
        private async Task<ValidacionFechaResult> ValidarFechaParaReservaAsync(DateOnly fecha, User empleado)
        {
            var result = new ValidacionFechaResult { EsValida = true };

            // 1. Validar que no sea día inhábil
            var esDiaInhabil = await _context.DiasInhabiles.AnyAsync(d => d.Fecha == fecha);
            if (esDiaInhabil)
            {
                result.EsValida = false;
                result.Motivo = "Día inhábil";
                result.Detalle = "Es un día festivo o inhábil";
                return result;
            }

            // 2. Validar que no sea día de descanso según calendario del empleado
            var esDescanso = await ValidarDiaDescansoEmpleadoAsync(fecha, empleado);
            if (esDescanso)
            {
                result.EsValida = false;
                result.Motivo = "Día de descanso";
                result.Detalle = "Corresponde a un día de descanso según su calendario de turnos";
                return result;
            }

            // 3. Validar disponibilidad por porcentajes de ausencia del grupo
            if (empleado.GrupoId.HasValue)
            {
                var disponibilidadResponse = await ValidarDisponibilidadDiaAsync(empleado.Id, fecha);
                if (disponibilidadResponse.Success && disponibilidadResponse.Data != null)
                {
                    if (!disponibilidadResponse.Data.DiaDisponible)
                    {
                        result.EsValida = false;
                        result.Motivo = "Límite de ausencias excedido";
                        result.Detalle = disponibilidadResponse.Data.Motivo;
                        return result;
                    }

                    // Agregar advertencia si está cerca del límite
                    if (disponibilidadResponse.Data.PorcentajeAusenciaConEmpleado >=
                        disponibilidadResponse.Data.PorcentajeMaximoPermitido * 0.8m)
                    {
                        result.Advertencia = $"Este día está cerca del límite de ausencias ({disponibilidadResponse.Data.PorcentajeAusenciaConEmpleado:F1}% de {disponibilidadResponse.Data.PorcentajeMaximoPermitido}%)";
                    }
                }
            }

            // 4. Validar que no tenga ya una vacación programada ese día
            var yaExisteVacacion = await _context.VacacionesProgramadas
                .AnyAsync(v => v.EmpleadoId == empleado.Id
                            && v.FechaVacacion == fecha
                            && v.EstadoVacacion == "Activa");

            if (yaExisteVacacion)
            {
                result.EsValida = false;
                result.Motivo = "Vacación duplicada";
                result.Detalle = "Ya tiene una vacación programada para esta fecha";
                return result;
            }

            return result;
        }

        /// <summary>
        /// Validar si una fecha es día de descanso para el empleado según el calendario del grupo
        /// </summary>
        private async Task<bool> ValidarDiaDescansoEmpleadoAsync(DateOnly fecha, User empleado)
        {
            // Si no tiene grupo asignado, no es día de descanso
            if (!empleado.GrupoId.HasValue)
                return false;

            // Obtener calendario del grupo para esa fecha específica
            var fechaDateTime = fecha.ToDateTime(TimeOnly.MinValue);
            var calendarioResponse = await _calendarioGrupoService.ObtenerCalendarioGrupoAsync(
                empleado.GrupoId.Value,
                fechaDateTime,
                fechaDateTime.AddDays(1).AddSeconds(-1)
            );

            if (calendarioResponse.Success && calendarioResponse.Data != null)
            {
                // Verificar si ese día está marcado como 'D' (Descanso) en el calendario del grupo
                var diaCalendario = calendarioResponse.Data.Calendario
                    .FirstOrDefault(c => DateOnly.FromDateTime(c.Fecha) == fecha);

                return diaCalendario?.Turno == "D";
            }

            // Si no se puede obtener el calendario, asumir que no es descanso
            return false;
        }

        #endregion

        #region Clases auxiliares

        private class ValidacionFechaResult
        {
            public bool EsValida { get; set; }
            public string Motivo { get; set; } = string.Empty;
            public string Detalle { get; set; } = string.Empty;
            public string? Advertencia { get; set; }
        }

        #endregion
    
        /// <summary>
        /// ¿Le toca capturar a este empleado ahora mismo?
        ///
        /// Reglas, las mismas que pinta la pantalla de turno del operador:
        ///   * Si el año no tiene bloques generados para su grupo, no hay turnos
        ///     que respetar (reprogramación normal) y se deja pasar.
        ///   * Debe tener una asignación vigente en un bloque de ese año.
        ///   * Ese bloque tiene que estar abierto (entre su inicio y su fin).
        ///   * Dentro del bloque manda la antigüedad: nadie captura antes que
        ///     alguien con más antigüedad que sigue pendiente. "Saltado" no
        ///     bloquea, que es justo para lo que el jefe lo salta.
        /// </summary>
        private async Task<(bool Permitido, string Motivo)> ValidarTurnoDeCapturaAsync(User empleado, int anio)
        {
            if (empleado.GrupoId == null)
                return (true, string.Empty);

            var ultimoFin = await _context.BloquesReservacion
                .Where(b => b.AnioGeneracion == anio && b.GrupoId == empleado.GrupoId.Value)
                .MaxAsync(b => (DateTime?)b.FechaHoraFin);

            // Sin bloques para ese año y grupo no hay turnos que respetar; y si
            // el último bloque ya cerró, la captura anual terminó y lo que sigue
            // es reprogramación, que no va por turnos. En los dos casos, pasar.
            if (ultimoFin == null || DateTime.Now > ultimoFin.Value)
                return (true, string.Empty);

            var asignacion = await _context.AsignacionesBloque
                .Include(a => a.Bloque)
                .Where(a => a.EmpleadoId == empleado.Id
                            && a.Estado != "Transferido"
                            && a.Bloque.AnioGeneracion == anio)
                .OrderByDescending(a => a.Id)
                .FirstOrDefaultAsync();

            if (asignacion == null)
                return (false, $"No tienes un turno asignado para la programación de {anio}. Pide a tu jefe de área que te asigne uno.");

            var bloque = asignacion.Bloque;
            var ahora = DateTime.Now;

            if (ahora < bloque.FechaHoraInicio)
                return (false, $"Todavía no es tu turno: tu bloque inicia el {bloque.FechaHoraInicio:dd/MM/yyyy} a las {bloque.FechaHoraInicio:HH:mm}.");

            if (ahora > bloque.FechaHoraFin)
                return (false, $"Tu turno terminó el {bloque.FechaHoraFin:dd/MM/yyyy} a las {bloque.FechaHoraFin:HH:mm}. Pide a tu jefe de área que te reasigne un turno.");

            var companeros = await _context.AsignacionesBloque
                .Include(a => a.Empleado)
                .Where(a => a.BloqueId == bloque.Id && a.Estado != "Transferido")
                .ToListAsync();

            var ordenados = companeros
                .OrderBy(a => a.Empleado.FechaIngreso ?? DateOnly.MaxValue)
                .ThenBy(a => a.Empleado.Nomina ?? int.MaxValue)
                .ToList();

            var miPosicion = ordenados.FindIndex(a => a.EmpleadoId == empleado.Id);
            if (miPosicion <= 0)
                return (true, string.Empty);

            var pendientes = ordenados
                .Take(miPosicion)
                .Where(a => a.Estado != "Reservado" && a.Estado != "Completado" && a.Estado != "Saltado")
                .Select(a => a.Empleado.FullName ?? a.Empleado.Nomina?.ToString() ?? "compañero")
                .ToList();

            if (pendientes.Count > 0)
                return (false,
                    $"Aún no es tu turno: falta(n) por capturar {string.Join(", ", pendientes)} " +
                    "(tienen más antigüedad). En cuanto capturen —o tu jefe los salte— podrás continuar.");

            return (true, string.Empty);
        }
    }
}
