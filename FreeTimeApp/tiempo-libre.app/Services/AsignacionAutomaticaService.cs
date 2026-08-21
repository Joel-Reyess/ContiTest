using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using tiempo_libre.Models;
using tiempo_libre.DTOs;
using tiempo_libre.Helpers;

namespace tiempo_libre.Services
{
    public class AsignacionAutomaticaService
    {
        private readonly FreeTimeDbContext _db;
        private readonly VacacionesService _vacacionesService;
        private readonly CalendarioGrupoService _calendarioService;
        private readonly AusenciaService _ausenciaService;
        private readonly ValidadorPorcentajeService _validadorPorcentaje;
        private readonly ILogger<AsignacionAutomaticaService> _logger;

        /// <summary>
        /// Memoria de "¿este grupo admite otra ausencia este día?" durante la
        /// corrida. El servicio es scoped: vive lo que dura la petición.
        /// </summary>
        private readonly Dictionary<(int GrupoId, DateOnly Fecha), bool> _disponibilidadPorGrupoYFecha = new();

        // Semanas excluidas por defecto (Navidad y Año Nuevo)
        private static readonly List<int> SEMANAS_EXCLUIDAS_DEFAULT = new() { 51, 52, 1, 2 };
        
        // Máximo de días que se pueden asignar automáticamente
        private const int MAX_DIAS_AUTOMATICOS = 5;

        public AsignacionAutomaticaService(
            FreeTimeDbContext db,
            VacacionesService vacacionesService,
            CalendarioGrupoService calendarioService,
            AusenciaService ausenciaService,
            ValidadorPorcentajeService validadorPorcentaje,
            ILogger<AsignacionAutomaticaService> logger)
        {
            _db = db;
            _vacacionesService = vacacionesService;
            _calendarioService = calendarioService;
            _ausenciaService = ausenciaService;
            _validadorPorcentaje = validadorPorcentaje;
            _logger = logger;
        }

        public async Task<ApiResponse<AsignacionAutomaticaResponse>> EjecutarAsignacionAutomaticaAsync(
            AsignacionAutomaticaRequest request,
            CancellationToken ct = default)
        {
            try
            {
                _logger.LogInformation("Iniciando asignación automática para año {Anio}", request.Anio);

                var response = new AsignacionAutomaticaResponse
                {
                    AnioAsignacion = request.Anio
                };

                // Obtener empleados sindicalizados (con nómina)
                var empleados = await ObtenerEmpleadosSindicalizadosAsync(request.GrupoIds, ct);
                response.TotalEmpleadosProcesados = empleados.Count;

                if (!empleados.Any())
                {
                    return new ApiResponse<AsignacionAutomaticaResponse>(false, response,
                        "No se encontraron empleados sindicalizados para procesar.");
                }

                // Empleados que ya tienen asignación automática activa para este año.
                // Sin este filtro, re-ejecutar el proceso (p. ej. tras un intento que
                // murió a medias) duplicaba los días: no hay índice único en BD que
                // frene la segunda inserción.
                var empleadosYaAsignados = (await _db.VacacionesProgramadas
                    .Where(v => v.FechaVacacion.Year == request.Anio
                        && v.OrigenAsignacion == "Automatica"
                        && v.TipoVacacion == "Automatica"
                        && v.EstadoVacacion == "Activa")
                    .Select(v => v.EmpleadoId)
                    .Distinct()
                    .ToListAsync(ct)).ToHashSet();

                // Obtener semanas excluidas
                var semanasExcluidas = request.SemanasExcluidas?.Any() == true
                    ? request.SemanasExcluidas
                    : SEMANAS_EXCLUIDAS_DEFAULT;

                // Obtener días inhábiles del año
                var diasInhabiles = await ObtenerDiasInhabilesAsync(request.Anio, ct);

                // Último día de Semana Santa: es el mismo para toda la corrida.
                // Estaba dentro del ciclo por empleado —una consulta y una línea de
                // log por cada uno— aunque el resultado nunca cambia.
                var semanaSantaFechaFinal = await _db.DiasInhabiles
                    .Where(d => d.Detalles.Contains("Semana Santa") && d.FechaFinal.Year == request.Anio)
                    .OrderByDescending(d => d.FechaFinal)
                    .Select(d => (DateOnly?)d.FechaFinal)
                    .FirstOrDefaultAsync(ct);

                _logger.LogInformation("Semana Santa para año {Anio}: {Fecha}", request.Anio,
                    semanaSantaFechaFinal?.ToString() ?? "No encontrada");

                var reloj = System.Diagnostics.Stopwatch.StartNew();
                var procesados = 0;

                // Procesar cada empleado
                foreach (var empleado in empleados)
                {
                    // Si el navegador abortó el request (timeout del cliente), parar aquí:
                    // antes el bucle seguía corriendo horas contra SQL después del abort,
                    // saturando la instancia y tirando el resto de la aplicación.
                    ct.ThrowIfCancellationRequested();

                    if (empleadosYaAsignados.Contains(empleado.Id))
                    {
                        response.TotalEmpleadosAsignados++;
                        response.Advertencias.Add(
                            $"Empleado {empleado.FullName} ({empleado.Nomina}): ya tenía asignación automática para {request.Anio}; se omitió.");
                        continue;
                    }

                    var resultado = await ProcesarEmpleadoAsync(
                        empleado, request.Anio, semanasExcluidas, diasInhabiles, semanaSantaFechaFinal);
                    response.ResultadosPorEmpleado.Add(resultado);

                    // Traza de avance: sin esto, una corrida larga se ve idéntica a
                    // un proceso colgado. Cada 25 empleados se puede estimar cuánto
                    // falta mirando el log.
                    procesados++;
                    if (procesados % 25 == 0)
                    {
                        _logger.LogInformation(
                            "Asignación automática {Anio}: {Procesados}/{Total} empleados en {Segundos:F0} s ({PorEmpleado:F1} s/empleado)",
                            request.Anio, procesados, empleados.Count,
                            reloj.Elapsed.TotalSeconds,
                            reloj.Elapsed.TotalSeconds / procesados);
                    }

                    if (resultado.AsignacionExitosa)
                    {
                        response.TotalEmpleadosAsignados++;
                        response.TotalDiasAsignados += resultado.DiasAsignados;

                        // Guardar en base de datos si no es simulación
                        if (!request.SoloSimulacion)
                        {
                            await GuardarVacacionesAsignadasAsync(resultado);
                            // Sin esto el ChangeTracker acumula todo lo consultado durante
                            // la corrida y cada SaveChanges es más lento que el anterior.
                            _db.ChangeTracker.Clear();
                        }
                    }
                    else
                    {
                        response.Advertencias.Add($"Empleado {empleado.FullName} ({empleado.Nomina}): {resultado.MotivoFallo}");
                    }
                }

                var mensaje = request.SoloSimulacion 
                    ? "Simulación completada exitosamente" 
                    : "Asignación automática completada exitosamente";

                _logger.LogInformation("Asignación automática completada. Empleados procesados: {Total}, Asignados: {Asignados}", 
                    response.TotalEmpleadosProcesados, response.TotalEmpleadosAsignados);

                return new ApiResponse<AsignacionAutomaticaResponse>(true, response, mensaje);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                // El cliente abortó: no hay a quién responderle. Se relanza para que
                // el pipeline registre el request como cancelado, no como error 400.
                _logger.LogWarning(
                    "Asignación automática para año {Anio} cancelada por el cliente; lo guardado hasta ahora se conserva y la re-ejecución omite a los ya asignados",
                    request.Anio);
                throw;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error durante la asignación automática");
                return new ApiResponse<AsignacionAutomaticaResponse>(false, null, $"Error inesperado: {ex.Message}");
            }
        }

        private async Task<List<User>> ObtenerEmpleadosSindicalizadosAsync(List<int>? grupoIds, CancellationToken ct = default)
        {
            var query = _db.Users
                .AsNoTracking()
                .Include(u => u.Grupo)
                .ThenInclude(g => g.Area)
                .Where(u => u.Nomina.HasValue && u.GrupoId.HasValue && u.GrupoId > 0);

            if (grupoIds?.Any() == true)
            {
                query = query.Where(u => u.GrupoId.HasValue && grupoIds.Contains(u.GrupoId.Value));
            }

            return await query.ToListAsync(ct);
        }

        private async Task<List<DateOnly>> ObtenerDiasInhabilesAsync(int anio, CancellationToken ct = default)
        {
            return await _db.DiasInhabiles
                .Where(d => d.Fecha.Year == anio)
                .Select(d => d.Fecha)
                .ToListAsync(ct);
        }

        private async Task<AsignacionEmpleadoResult> ProcesarEmpleadoAsync(
            User empleado, 
            int anio, 
            List<int> semanasExcluidas, 
            List<DateOnly> diasInhabiles,
            DateOnly? semanaSantaFechaFinal)
        {
            var resultado = new AsignacionEmpleadoResult
            {
                EmpleadoId = empleado.Id,
                NombreCompleto = empleado.FullName ?? "",
                Nomina = empleado.Nomina?.ToString() ?? "",
                GrupoId = empleado.GrupoId ?? 0,
                NombreGrupo = empleado.Grupo?.Rol ?? $"Grupo {empleado.GrupoId ?? 0}"
            };

            try
            {
                // Obtener días que le corresponden automáticamente
                var vacacionesResponse = await _vacacionesService.CalcularVacacionesPorEmpleadoAsync(empleado.Id, anio);
                if (!vacacionesResponse.Success || vacacionesResponse.Data == null)
                {
                    resultado.MotivoFallo = "No se pudieron calcular las vacaciones del empleado";
                    return resultado;
                }

                resultado.DiasCorrespondientes = vacacionesResponse.Data.DiasAsignadosAutomaticamente;

                // Si no tiene días automáticos, saltar
                if (resultado.DiasCorrespondientes <= 0)
                {
                    resultado.MotivoFallo = "El empleado no tiene días de asignación automática";
                    return resultado;
                }

                // Limitar a máximo permitido
                var diasAAsignar = Math.Min(resultado.DiasCorrespondientes, MAX_DIAS_AUTOMATICOS);

                // Buscar semana disponible
                var semanaEncontrada = await BuscarSemanaDisponibleAsync(
                    empleado, anio, diasAAsignar, semanasExcluidas, diasInhabiles, semanaSantaFechaFinal);

                if (semanaEncontrada == null)
                {
                    resultado.MotivoFallo = "No se encontró una semana disponible que cumpla con los criterios";
                    return resultado;
                }

                // Asignar días en la semana encontrada
                var diasAsignados = await AsignarDiasEnSemanaAsync(
                    empleado, semanaEncontrada, diasAAsignar, diasInhabiles, semanaSantaFechaFinal);

                resultado.SemanaAsignada = semanaEncontrada.NumeroSemana;
                resultado.DiasVacaciones = diasAsignados;
                resultado.DiasAsignados = diasAsignados.Count;
                resultado.AsignacionExitosa = diasAsignados.Count > 0;

                if (!resultado.AsignacionExitosa)
                {
                    resultado.MotivoFallo = "No se pudieron asignar días en la semana seleccionada";
                }

                return resultado;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error procesando empleado {EmpleadoId}", empleado.Id);
                resultado.MotivoFallo = $"Error interno: {ex.Message}";
                return resultado;
            }
        }

        private async Task<SemanaCalendario?> BuscarSemanaDisponibleAsync(
            User empleado,
            int anio,
            int diasAAsignar,
            List<int> semanasExcluidas,
            List<DateOnly> diasInhabiles,
            DateOnly? semanaSantaFechaFinal)
        {
            var random = new Random();
            var semanasDelAnio = Enumerable.Range(1, 52).ToList();
            
            // Remover semanas excluidas
            semanasDelAnio = semanasDelAnio.Except(semanasExcluidas).ToList();
            
            // Mezclar aleatoriamente
            semanasDelAnio = semanasDelAnio.OrderBy(x => random.Next()).ToList();

            foreach (var numeroSemana in semanasDelAnio)
            {
                var semana = ObtenerRangoSemana(anio, numeroSemana);

                // El lunes de la semana 1 puede caer en diciembre del año anterior y
                // la semana 52 puede terminar en enero del siguiente. Sin este recorte,
                // la asignación escribía días de vacaciones con FechaVacacion fuera del
                // año objetivo: invisibles para todas las consultas del año programado
                // pero contando como ausencia en el año equivocado.
                if (semana.FechaInicio.Year < anio)
                    semana.FechaInicio = new DateOnly(anio, 1, 1);
                if (semana.FechaFin.Year > anio)
                    semana.FechaFin = new DateOnly(anio, 12, 31);
                if (semana.FechaInicio > semana.FechaFin)
                    continue;

                // Antes se pedía aquí el calendario completo del grupo para la
                // semana y el resultado se tiraba: solo se miraba si la llamada
                // había tenido éxito. Era una consulta pesada por cada semana
                // candidata y por cada empleado (hasta 52 por persona) que no
                // aportaba nada a la decisión: quien decide es EsSemanaViableAsync.

                // Validar si la semana es viable
                if (await EsSemanaViableAsync(empleado, semana, diasAAsignar, diasInhabiles, semanaSantaFechaFinal))
                {
                    return semana;
                }
            }

            return null;
        }

        /// <summary>
        /// ¿El grupo admite una ausencia más ese día?
        ///
        /// Se memoriza por (grupo, fecha) durante la corrida. La respuesta que usa
        /// la búsqueda de semana —DiaDisponible— sale de
        /// PuedeGrupoTenerAusencias(grupoId, 1, null, fecha), que depende del grupo
        /// y del día, no del empleado; y cada validación cuesta media docena de
        /// consultas. Sin memoria, los 30 o 40 empleados de un mismo grupo
        /// recalculaban exactamente lo mismo para las mismas fechas, hasta 52
        /// semanas por persona.
        ///
        /// La entrada se borra en cuanto se guardan días de ese grupo en esa fecha
        /// (ver GuardarVacacionesAsignadasAsync): ahí sí cambió la ocupación.
        /// </summary>
        private async Task<bool> DiaDisponibleParaGrupoAsync(User empleado, DateOnly fecha)
        {
            var grupoId = empleado.GrupoId ?? 0;
            var clave = (grupoId, fecha);

            if (_disponibilidadPorGrupoYFecha.TryGetValue(clave, out var cacheado))
                return cacheado;

            // Se llama al validador directo y no a ValidarDisponibilidadDiaAsync:
            // ese envoltorio calcula además el porcentaje del grupo dos veces y su
            // estado detallado —cuatro consultas pesadas— y de todo eso aquí solo
            // se ocupa DiaDisponible, que es exactamente este booleano.
            var disponible = await _validadorPorcentaje.PuedeGrupoTenerAusencias(grupoId, 1, null, fecha);

            _disponibilidadPorGrupoYFecha[clave] = disponible;
            return disponible;
        }

        private async Task<bool> EsSemanaViableAsync(
            User empleado,
            SemanaCalendario semana,
            int diasAAsignar,
            List<DateOnly> diasInhabiles,
            DateOnly? semanaSantaFechaFinal)
        {
            var diasDisponibles = 0;
            var fechaActual = semana.FechaInicio;

            while (fechaActual <= semana.FechaFin && diasDisponibles < diasAAsignar)
            {
                // Si ni contando todos los días que quedan se alcanza la meta, la
                // semana ya no puede salir: seguir validándola son consultas tiradas.
                var diasQueRestan = fechaActual > semana.FechaFin
                    ? 0
                    : semana.FechaFin.DayNumber - fechaActual.DayNumber + 1;
                if (diasDisponibles + diasQueRestan < diasAAsignar)
                    return false;

                // Verificar si es día inhábil
                if (diasInhabiles.Contains(fechaActual))
                {
                    fechaActual = fechaActual.AddDays(1);
                    continue;
                }

                // Obtener turno del empleado para este día
                var turno = ObtenerTurnoEmpleado(empleado.Grupo?.Rol, fechaActual, semanaSantaFechaFinal);
                
                // Si no es descanso, verificar porcentaje de ausencia
                if (!TurnosHelper.EsDescanso(turno))
                {
                    if (await DiaDisponibleParaGrupoAsync(empleado, fechaActual))
                    {
                        diasDisponibles++;
                    }
                }

                fechaActual = fechaActual.AddDays(1);
            }

            return diasDisponibles >= diasAAsignar;
        }

        private async Task<List<DiaVacacionAsignado>> AsignarDiasEnSemanaAsync(
            User empleado,
            SemanaCalendario semana,
            int diasAAsignar,
            List<DateOnly> diasInhabiles,
            DateOnly? semanaSantaFechaFinal)
        {
            var diasAsignados = new List<DiaVacacionAsignado>();
            var fechaActual = semana.FechaInicio;
            var diasAsignadosCount = 0;

            while (fechaActual <= semana.FechaFin && diasAsignadosCount < diasAAsignar)
            {
                // Saltar días inhábiles
                if (diasInhabiles.Contains(fechaActual))
                {
                    fechaActual = fechaActual.AddDays(1);
                    continue;
                }

                var turno = ObtenerTurnoEmpleado(empleado.Grupo?.Rol, fechaActual, semanaSantaFechaFinal);

                // Solo asignar si no es descanso
                if (!TurnosHelper.EsDescanso(turno))
                {
                    // Validar porcentaje una vez más
                    var validacionResponse = await _ausenciaService.ValidarDisponibilidadDiaAsync(
                        new ValidacionDisponibilidadRequest
                        {
                            EmpleadoId = empleado.Id,
                            Fecha = fechaActual
                        });

                    if (validacionResponse.Success && validacionResponse.Data?.DiaDisponible == true)
                    {
                        diasAsignados.Add(new DiaVacacionAsignado
                        {
                            Fecha = fechaActual,
                            TurnoOriginal = turno,
                            TipoVacacion = "Automatica",
                            PorcentajeAusenciaCalculado = validacionResponse.Data.PorcentajeAusenciaConEmpleado
                        });
                        
                        diasAsignadosCount++;
                    }
                }

                fechaActual = fechaActual.AddDays(1);
            }

            return diasAsignados;
        }

        private string ObtenerTurnoEmpleado(string rolGrupo, DateOnly fecha, DateOnly? semanaSantaFechaFinal)
        {
            // Usar TurnosHelper centralizado con Semana Santa
            if (string.IsNullOrEmpty(rolGrupo))
                return "1";

            return TurnosHelper.ObtenerTurnoParaFecha(rolGrupo, fecha, semanaSantaFechaFinal);
        }


        private SemanaCalendario ObtenerRangoSemana(int anio, int numeroSemana)
        {
            var calendar = CultureInfo.CurrentCulture.Calendar;
            var primerDiaAnio = new DateTime(anio, 1, 1);
            var diasParaSemana = (numeroSemana - 1) * 7;
            var fechaInicio = primerDiaAnio.AddDays(diasParaSemana);
            
            // Ajustar al lunes de la semana
            var diasHastaLunes = ((int)fechaInicio.DayOfWeek - 1 + 7) % 7;
            fechaInicio = fechaInicio.AddDays(-diasHastaLunes);
            
            var fechaFin = fechaInicio.AddDays(6);

            return new SemanaCalendario
            {
                NumeroSemana = numeroSemana,
                FechaInicio = DateOnly.FromDateTime(fechaInicio),
                FechaFin = DateOnly.FromDateTime(fechaFin)
            };
        }

        private async Task GuardarVacacionesAsignadasAsync(AsignacionEmpleadoResult resultado)
        {
            foreach (var dia in resultado.DiasVacaciones)
            {
                var vacacion = new VacacionesProgramadas
                {
                    EmpleadoId = resultado.EmpleadoId,
                    FechaVacacion = dia.Fecha,
                    TipoVacacion = dia.TipoVacacion,
                    OrigenAsignacion = "Automatica",
                    EstadoVacacion = "Activa",
                    PeriodoProgramacion = "ProgramacionAnual",
                    PuedeSerIntercambiada = false,
                    Observaciones = $"Asignación automática - Semana {resultado.SemanaAsignada}"
                };

                _db.VacacionesProgramadas.Add(vacacion);

                // Ese día del grupo acaba de ocuparse un lugar más: lo memorizado
                // dejó de ser cierto.
                _disponibilidadPorGrupoYFecha.Remove((resultado.GrupoId, dia.Fecha));
            }

            // CancellationToken.None a propósito: si el cliente aborta justo aquí, es
            // preferible terminar de escribir los días completos de este empleado a
            // dejarlo con la semana a medias.
            await _db.SaveChangesAsync(CancellationToken.None);
        }

        public async Task<ApiResponse<VacacionesEmpleadoListResponse>> ObtenerVacacionesEmpleadoAsync(
            int empleadoId,
            VacacionesAsignadasRequest request)
        {
            try
            {
                // Obtener el empleado
                var empleado = await _db.Users
                    .Include(u => u.VacacionesPorAntiguedad)
                    .FirstOrDefaultAsync(u => u.Id == empleadoId);

                if (empleado == null)
                    return new ApiResponse<VacacionesEmpleadoListResponse>(false, null, "El empleado especificado no existe.");

                if (!empleado.Nomina.HasValue)
                    return new ApiResponse<VacacionesEmpleadoListResponse>(false, null, "El empleado no es un empleado sindicalizado.");

                // Determinar el año a consultar: usar AnioVigente de configuración si no se especifica
                int anio;
                if (request.Anio.HasValue)
                {
                    anio = request.Anio.Value;
                }
                else
                {
                    var configuracion = await _db.ConfiguracionVacaciones.FirstOrDefaultAsync();
                    anio = configuracion?.AnioVigente ?? DateTime.Now.Year;
                }

                // Construir query base para las vacaciones
                var query = _db.VacacionesProgramadas
                    .Where(v => v.EmpleadoId == empleadoId);

                // Filtrar por año si se especifica
                if (request.Anio.HasValue)
                {
                    query = query.Where(v => v.FechaVacacion.Year == anio);
                }

                // Filtrar por tipo de vacación
                if (!string.IsNullOrEmpty(request.TipoVacacion))
                {
                    query = query.Where(v => v.TipoVacacion == request.TipoVacacion);
                }

                // Filtrar por estado
                if (!string.IsNullOrEmpty(request.EstadoVacacion))
                {
                    query = query.Where(v => v.EstadoVacacion == request.EstadoVacacion);
                }

                var vacaciones = await query
                    .OrderBy(v => v.FechaVacacion)
                    .ToListAsync();

                // Calcular días disponibles usando el servicio de vacaciones
                var vacacionesCalculadas = await _vacacionesService.CalcularVacacionesPorEmpleadoAsync(empleadoId, anio);
                int diasDisponibles = 0;
                int diasAsignados = vacaciones.Count(v => v.EstadoVacacion == "Activa");

                if (vacacionesCalculadas.Success && vacacionesCalculadas.Data != null)
                {
                    diasDisponibles = vacacionesCalculadas.Data.TotalDias;
                }

                // Construir el resumen con la división de días según antigüedad
                var resumen = new VacacionesResumen
                {
                    // División de días disponibles según cálculo por antigüedad
                    DiasEmpresa = vacacionesCalculadas.Data?.DiasEmpresa ?? 0,
                    DiasAsignadosAutomaticamente = vacacionesCalculadas.Data?.DiasAsignadosAutomaticamente ?? 0,
                    DiasProgramables = vacacionesCalculadas.Data?.DiasProgramables ?? 0,
                    TotalDisponibles = diasDisponibles,

                    // Días ya asignados por tipo
                    AsignadasAutomaticamente = vacaciones.Count(v => v.TipoVacacion == "Automatica" && v.EstadoVacacion == "Activa"),
                    Anuales = vacaciones.Count(v => v.TipoVacacion == "Anual" && v.EstadoVacacion == "Activa"),
                    Reprogramaciones = vacaciones.Count(v => v.TipoVacacion == "Reprogramacion" && v.EstadoVacacion == "Activa"),
                    FestivosTrabajados = vacaciones.Count(v => v.TipoVacacion == "FestivoTrabajado" && v.EstadoVacacion == "Activa")
                };

                // PorAsignar excluye los 12 días de empresa (que son asignados automáticamente por la empresa)
                // Solo incluye días asignados automáticamente + días programables - días ya asignados
                int diasDisponiblesParaEmpleado = resumen.DiasAsignadosAutomaticamente + resumen.DiasProgramables;
                resumen.PorAsignar = Math.Max(0, diasDisponiblesParaEmpleado - diasAsignados);

                // Construir la lista detallada
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
                    NumeroSemana = GetWeekNumber(v.FechaVacacion),
                    DiaSemana = v.FechaVacacion.DayOfWeek.ToString()
                }).ToList();

                var response = new VacacionesEmpleadoListResponse
                {
                    EmpleadoId = empleadoId,
                    NombreCompleto = empleado.FullName ?? "",
                    Nomina = empleado.Nomina?.ToString() ?? "",
                    Anio = anio,
                    TotalVacaciones = vacaciones.Count,
                    Resumen = resumen,
                    Vacaciones = detalles
                };

                return new ApiResponse<VacacionesEmpleadoListResponse>(true, response,
                    $"Se encontraron {vacaciones.Count} vacaciones para el empleado.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener vacaciones del empleado {EmpleadoId}", empleadoId);
                return new ApiResponse<VacacionesEmpleadoListResponse>(false, null, $"Error inesperado: {ex.Message}");
            }
        }

        private static int GetWeekNumber(DateOnly date)
        {
            var culture = System.Globalization.CultureInfo.CurrentCulture;
            var calendar = culture.Calendar;
            var calendarWeekRule = culture.DateTimeFormat.CalendarWeekRule;
            var firstDayOfWeek = culture.DateTimeFormat.FirstDayOfWeek;

            return calendar.GetWeekOfYear(date.ToDateTime(TimeOnly.MinValue), calendarWeekRule, firstDayOfWeek);
        }

        public async Task<ApiResponse<ResumenAsignacionAutomaticaResponse>> ObtenerResumenAsignacionAutomaticaAsync(
            int anio,
            List<int>? grupoIds = null)
        {
            try
            {
                _logger.LogInformation("Obteniendo resumen de asignación automática para año {Anio}", anio);

                var response = new ResumenAsignacionAutomaticaResponse
                {
                    Anio = anio
                };

                // Construir query base para vacaciones automáticas
                var queryVacaciones = _db.VacacionesProgramadas
                    .Include(v => v.Empleado)
                    .ThenInclude(e => e.Grupo)
                    .Where(v => v.FechaVacacion.Year == anio
                        && v.OrigenAsignacion == "Automatica"
                        && v.TipoVacacion == "Automatica"
                        && v.EstadoVacacion == "Activa");

                // Si se especifican grupos, filtrar
                if (grupoIds?.Any() == true)
                {
                    var empleadosDeGrupos = await _db.Users
                        .Where(u => u.GrupoId.HasValue && grupoIds.Contains(u.GrupoId.Value))
                        .Select(u => u.Id)
                        .ToListAsync();

                    queryVacaciones = queryVacaciones.Where(v => empleadosDeGrupos.Contains(v.EmpleadoId));
                }

                // Obtener todas las vacaciones asignadas automáticamente
                var vacacionesAsignadas = await queryVacaciones.ToListAsync();

                response.AsignacionRealizada = vacacionesAsignadas.Any();
                response.TotalVacacionesAsignadas = vacacionesAsignadas.Count;

                if (!response.AsignacionRealizada)
                {
                    // Si no hay asignación, obtener estadísticas de empleados elegibles
                    var empleadosElegibles = await ObtenerEmpleadosSindicalizadosAsync(grupoIds);
                    response.Estadisticas.TotalEmpleadosSindicalizados = empleadosElegibles.Count;
                    response.Estadisticas.EmpleadosSinAsignacion = empleadosElegibles.Count;

                    return new ApiResponse<ResumenAsignacionAutomaticaResponse>(true, response,
                        "No se ha realizado asignación automática para este año.");
                }

                // Obtener fecha de la última asignación (basándose en FechaProgramacion)
                var fechaAsignacion = vacacionesAsignadas
                    .OrderByDescending(v => v.FechaProgramacion)
                    .FirstOrDefault()?.FechaProgramacion;

                response.FechaUltimaAsignacion = fechaAsignacion;

                // Agrupar por empleado
                var empleadosConAsignacion = vacacionesAsignadas
                    .GroupBy(v => v.EmpleadoId)
                    .ToList();

                response.EmpleadosConAsignacion = empleadosConAsignacion.Count;

                // Resumen por grupos
                var resumenPorGrupos = vacacionesAsignadas
                    .Where(v => v.Empleado?.GrupoId != null && v.Empleado.Grupo != null)
                    .GroupBy(v => new { v.Empleado.GrupoId, v.Empleado.Grupo.Rol })
                    .Select(g => new ResumenAsignacionPorGrupo
                    {
                        GrupoId = g.Key.GrupoId ?? 0,
                        NombreGrupo = g.Key.Rol ?? $"Grupo {g.Key.GrupoId}",
                        EmpleadosAsignados = g.Select(v => v.EmpleadoId).Distinct().Count(),
                        TotalDiasAsignados = g.Count(),
                        PromedioDisPorEmpleado = (decimal)g.Count() / g.Select(v => v.EmpleadoId).Distinct().Count()
                    })
                    .OrderBy(r => r.GrupoId)
                    .ToList();

                response.ResumenPorGrupos = resumenPorGrupos;

                // Distribución por semanas
                var distribucionPorSemanas = vacacionesAsignadas
                    .GroupBy(v => GetWeekNumber(v.FechaVacacion))
                    .Select(g =>
                    {
                        var semana = ObtenerRangoSemana(anio, g.Key);
                        return new ResumenPorSemana
                        {
                            NumeroSemana = g.Key,
                            FechaInicio = semana.FechaInicio,
                            FechaFin = semana.FechaFin,
                            EmpleadosAsignados = g.Select(v => v.EmpleadoId).Distinct().Count(),
                            TotalDiasAsignados = g.Count()
                        };
                    })
                    .OrderBy(s => s.NumeroSemana)
                    .ToList();

                response.DistribucionPorSemanas = distribucionPorSemanas;

                // Estadísticas generales
                var totalEmpleadosSindicalizados = await _db.Users
                    .Where(u => u.Nomina.HasValue && u.GrupoId.HasValue && u.GrupoId > 0)
                    .CountAsync();

                if (grupoIds?.Any() == true)
                {
                    totalEmpleadosSindicalizados = await _db.Users
                        .Where(u => u.Nomina.HasValue && u.GrupoId.HasValue && grupoIds.Contains(u.GrupoId.Value))
                        .CountAsync();
                }

                response.Estadisticas = new EstadisticasGenerales
                {
                    TotalEmpleadosSindicalizados = totalEmpleadosSindicalizados,
                    EmpleadosConAsignacion = response.EmpleadosConAsignacion,
                    EmpleadosSinAsignacion = totalEmpleadosSindicalizados - response.EmpleadosConAsignacion,
                    PorcentajeCobertura = totalEmpleadosSindicalizados > 0
                        ? Math.Round((decimal)response.EmpleadosConAsignacion * 100 / totalEmpleadosSindicalizados, 2)
                        : 0,
                    PromedioDisPorEmpleado = response.EmpleadosConAsignacion > 0
                        ? response.TotalVacacionesAsignadas / response.EmpleadosConAsignacion
                        : 0
                };

                // Calcular días disponibles no asignados (esto requeriría más lógica compleja)
                // Por ahora lo dejamos en 0
                response.Estadisticas.TotalDiasDisponiblesNoAsignados = 0;

                _logger.LogInformation(
                    "Resumen obtenido. Año: {Anio}, Empleados asignados: {Empleados}, Total días: {Dias}",
                    anio, response.EmpleadosConAsignacion, response.TotalVacacionesAsignadas);

                return new ApiResponse<ResumenAsignacionAutomaticaResponse>(true, response,
                    $"Asignación automática encontrada: {response.TotalVacacionesAsignadas} días asignados a {response.EmpleadosConAsignacion} empleados.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener resumen de asignación automática");
                return new ApiResponse<ResumenAsignacionAutomaticaResponse>(false, null, $"Error inesperado: {ex.Message}");
            }
        }


        public async Task<ApiResponse<EmpleadosSinAsignacionResponse>> ObtenerEmpleadosSinAsignacionAsync(
            int anio,
            List<int>? grupoIds = null,
            int? areaId = null)
        {
            try
            {
                _logger.LogInformation("Obteniendo empleados sin asignación automática para año {Anio}", anio);

                // Obtener empleados sindicalizados (con nómina y grupo)
                var empleadosQuery = _db.Users
                    .Include(u => u.Grupo)
                    .ThenInclude(g => g!.Area)
                    .Where(u => u.Nomina.HasValue && u.GrupoId.HasValue && u.GrupoId > 0);

                // Filtrar por área si se especifica
                if (areaId.HasValue)
                {
                    empleadosQuery = empleadosQuery.Where(u => u.Grupo!.AreaId == areaId.Value);
                }

                // Filtrar por grupos si se especifican
                if (grupoIds?.Any() == true)
                {
                    empleadosQuery = empleadosQuery.Where(u => u.GrupoId.HasValue && grupoIds.Contains(u.GrupoId.Value));
                }

                var empleadosSindicalizados = await empleadosQuery.ToListAsync();

                // Obtener vacaciones automáticas asignadas para el año
                var vacacionesAutomaticas = await _db.VacacionesProgramadas
                    .Where(v => v.FechaVacacion.Year == anio
                        && v.OrigenAsignacion == "Automatica"
                        && v.TipoVacacion == "Automatica"
                        && v.EstadoVacacion == "Activa")
                    .Select(v => v.EmpleadoId)
                    .Distinct()
                    .ToListAsync();

                // Identificar empleados sin asignación
                var empleadosSinAsignacion = empleadosSindicalizados
                    .Where(e => !vacacionesAutomaticas.Contains(e.Id))
                    .ToList();

                var empleadosSinAsignacionDto = new List<EmpleadoSinAsignacionDto>();
                var resumenMotivos = new ResumenPorMotivo();

                foreach (var empleado in empleadosSinAsignacion)
                {
                    // Obtener días que le corresponden
                    var vacacionesResponse = await _vacacionesService.CalcularVacacionesPorEmpleadoAsync(empleado.Id, anio);

                    var diasCorrespondientes = 0;
                    var diasAutomaticos = 0;
                    var diasProgramables = 0;

                    if (vacacionesResponse.Success && vacacionesResponse.Data != null)
                    {
                        diasCorrespondientes = vacacionesResponse.Data.DiasEmpresa;
                        diasAutomaticos = vacacionesResponse.Data.DiasAsignadosAutomaticamente;
                        diasProgramables = vacacionesResponse.Data.DiasProgramables;
                    }

                    var diasAsignados = await _db.VacacionesProgramadas
                        .CountAsync(v => v.EmpleadoId == empleado.Id
                            && v.FechaVacacion.Year == anio
                            && v.EstadoVacacion == "Activa");

                    // Determinar motivo de no asignación
                    var motivo = "Sin asignación automática";
                    if (!empleado.FechaIngreso.HasValue)
                        motivo = "Sin fecha de ingreso registrada";
                    else if (empleado.FechaIngreso.Value.Year == anio)
                        motivo = "Empleado nuevo (ingresó en el año actual)";
                    else if (!empleado.GrupoId.HasValue)
                        motivo = "Sin grupo asignado";
                    else if (diasAutomaticos <= 0)
                        motivo = "Sin días automáticos correspondientes";
                    else
                        motivo = "Pendiente de asignación";

                    // Contar motivos para el resumen
                    if (motivo.Contains("Sin fecha de ingreso") || motivo.Contains("nuevo"))
                        resumenMotivos.DiasInsuficientes++;
                    else if (motivo.Contains("Sin grupo"))
                        resumenMotivos.OtrosMotivos++;
                    else
                        resumenMotivos.SinTurnosDisponibles++;

                    var fechaIngreso = empleado.FechaIngreso?.ToDateTime(TimeOnly.MinValue);
                    var antiguedad = fechaIngreso.HasValue ? anio - fechaIngreso.Value.Year : 0;

                    empleadosSinAsignacionDto.Add(new EmpleadoSinAsignacionDto
                    {
                        EmpleadoId = empleado.Id,
                        NombreCompleto = empleado.FullName,
                        Nomina = empleado.Nomina?.ToString() ?? "",
                        Maquina = empleado.Maquina,
                        GrupoId = empleado.GrupoId ?? 0,
                        NombreGrupo = empleado.Grupo?.IdentificadorSAP ?? "Sin grupo",
                        AreaId = empleado.Grupo?.AreaId ?? 0,
                        NombreArea = empleado.Grupo?.Area?.NombreGeneral ?? "Sin área",
                        DiasCorrespondientes = diasCorrespondientes,
                        DiasAsignadosAutomaticamente = diasAutomaticos,
                        DiasProgramablesAnual = diasProgramables,
                        DiasYaAsignados = diasAsignados,
                        MotivoNoAsignacion = motivo,
                        TieneTurnosDisponibles = empleado.GrupoId.HasValue,
                        FechaIngreso = fechaIngreso,
                        AntiguedadAnios = antiguedad
                    });
                }

                var response = new EmpleadosSinAsignacionResponse
                {
                    Anio = anio,
                    TotalEmpleadosSinAsignacion = empleadosSinAsignacionDto.Count,
                    Empleados = empleadosSinAsignacionDto.OrderBy(e => e.NombreArea)
                        .ThenBy(e => e.NombreGrupo)
                        .ThenBy(e => e.NombreCompleto)
                        .ToList(),
                    ResumenMotivos = resumenMotivos,
                    FechaReporte = DateTime.Now
                };

                return new ApiResponse<EmpleadosSinAsignacionResponse>(true, response,
                    $"Se encontraron {response.TotalEmpleadosSinAsignacion} empleados sin asignación automática");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener empleados sin asignación para año {Anio}", anio);
                return new ApiResponse<EmpleadosSinAsignacionResponse>(false, null, $"Error inesperado: {ex.Message}");
            }
        }

        public async Task<ApiResponse<ReversionAsignacionResponse>> RevertirAsignacionAutomaticaAsync(
            int anio,
            List<int>? grupoIds = null)
        {
            try
            {
                _logger.LogInformation("Iniciando reversión de asignación automática para año {Anio}", anio);

                var response = new ReversionAsignacionResponse
                {
                    Anio = anio,
                    GruposAfectados = grupoIds ?? new List<int>()
                };

                // Construir query base
                var query = _db.VacacionesProgramadas
                    .Where(v => v.FechaVacacion.Year == anio
                        && v.OrigenAsignacion == "Automatica"
                        && v.TipoVacacion == "Automatica");

                // Si se especifican grupos, filtrar por empleados de esos grupos
                if (grupoIds?.Any() == true)
                {
                    var empleadosDeGrupos = await _db.Users
                        .Where(u => u.GrupoId.HasValue && grupoIds.Contains(u.GrupoId.Value))
                        .Select(u => u.Id)
                        .ToListAsync();

                    query = query.Where(v => empleadosDeGrupos.Contains(v.EmpleadoId));
                }

                // Obtener las vacaciones a eliminar para el conteo
                var vacacionesAEliminar = await query.ToListAsync();
                response.TotalVacacionesEliminadas = vacacionesAEliminar.Count;

                if (vacacionesAEliminar.Count == 0)
                {
                    return new ApiResponse<ReversionAsignacionResponse>(false, response,
                        "No se encontraron vacaciones automáticas para revertir con los criterios especificados.");
                }

                // Agrupar por empleado para el resumen
                var resumenPorEmpleado = vacacionesAEliminar
                    .GroupBy(v => v.EmpleadoId)
                    .Select(g => new
                    {
                        EmpleadoId = g.Key,
                        CantidadDias = g.Count()
                    })
                    .ToList();

                response.EmpleadosAfectados = resumenPorEmpleado.Count;

                // Obtener información de los empleados para el detalle
                var empleadosIds = resumenPorEmpleado.Select(r => r.EmpleadoId).ToList();
                var empleados = await _db.Users
                    .Where(u => empleadosIds.Contains(u.Id))
                    .Select(u => new { u.Id, u.FullName, u.Nomina })
                    .ToListAsync();

                response.DetalleEmpleados = resumenPorEmpleado.Select(r =>
                {
                    var empleado = empleados.FirstOrDefault(e => e.Id == r.EmpleadoId);
                    return new EmpleadoReversionDetalle
                    {
                        EmpleadoId = r.EmpleadoId,
                        NombreCompleto = empleado?.FullName ?? "Desconocido",
                        Nomina = empleado?.Nomina?.ToString() ?? "",
                        DiasEliminados = r.CantidadDias
                    };
                }).ToList();

                // Eliminar las vacaciones
                _db.VacacionesProgramadas.RemoveRange(vacacionesAEliminar);
                await _db.SaveChangesAsync();

                _logger.LogWarning(
                    "Reversión completada. Año: {Anio}, Vacaciones eliminadas: {Total}, Empleados afectados: {Empleados}",
                    anio, response.TotalVacacionesEliminadas, response.EmpleadosAfectados);

                return new ApiResponse<ReversionAsignacionResponse>(true, response,
                    $"Se eliminaron {response.TotalVacacionesEliminadas} vacaciones automáticas de {response.EmpleadosAfectados} empleados.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error durante la reversión de asignación automática");
                return new ApiResponse<ReversionAsignacionResponse>(false, null, $"Error inesperado: {ex.Message}");
            }
        }

        public async Task<ApiResponse<VacacionesAsignadasMultipleResponse>> ObtenerVacacionesConFiltrosAsync(
            VacacionesAsignadasFiltroRequest request)
        {
            try
            {
                // Determinar año: usar AnioVigente de configuración si no se especifica
                int anio;
                if (request.Anio.HasValue)
                {
                    anio = request.Anio.Value;
                }
                else
                {
                    var configuracion = await _db.ConfiguracionVacaciones.FirstOrDefaultAsync();
                    anio = configuracion?.AnioVigente ?? DateTime.Now.Year;
                }

                var response = new VacacionesAsignadasMultipleResponse
                {
                    Anio = anio
                };

                // Construir query base
                var query = _db.Users
                    .Include(u => u.Area)
                    .Include(u => u.Grupo)
                    .Where(u => u.Nomina.HasValue && u.Status == tiempo_libre.Models.Enums.UserStatus.Activo);

                // Aplicar filtros
                if (request.EmpleadoId.HasValue)
                {
                    query = query.Where(u => u.Id == request.EmpleadoId.Value);
                }

                if (request.AreaId.HasValue)
                {
                    query = query.Where(u => u.AreaId == request.AreaId.Value);
                    var area = await _db.Areas.FirstOrDefaultAsync(a => a.AreaId == request.AreaId.Value);
                    response.AreaId = request.AreaId.Value;
                    response.NombreArea = area?.NombreGeneral;
                }

                if (request.GrupoId.HasValue)
                {
                    query = query.Where(u => u.GrupoId == request.GrupoId.Value);
                    var grupo = await _db.Grupos.FirstOrDefaultAsync(g => g.GrupoId == request.GrupoId.Value);
                    response.GrupoId = request.GrupoId.Value;
                    response.NombreGrupo = grupo != null ? $"{grupo.Rol} - {grupo.IdentificadorSAP}" : null;
                }

                var empleados = await query.ToListAsync();
                response.TotalEmpleados = empleados.Count;

                // Recopilar información detallada si se solicita
                if (request.IncluirDetalleEmpleado)
                {
                    foreach (var empleado in empleados)
                    {
                        var vacacionesEmpleado = await ObtenerVacacionesEmpleadoAsync(
                            empleado.Id,
                            new VacacionesAsignadasRequest
                            {
                                Anio = request.Anio,
                                TipoVacacion = request.TipoVacacion,
                                EstadoVacacion = request.EstadoVacacion
                            });

                        if (vacacionesEmpleado.Success && vacacionesEmpleado.Data != null)
                        {
                            response.EmpleadosDetalle.Add(vacacionesEmpleado.Data);
                        }
                    }
                }

                // Calcular resumen general
                var todasLasVacaciones = await _db.VacacionesProgramadas
                    .Where(v => empleados.Select(e => e.Id).Contains(v.EmpleadoId))
                    .Where(v => !request.Anio.HasValue || v.FechaVacacion.Year == request.Anio.Value)
                    .Where(v => string.IsNullOrEmpty(request.TipoVacacion) || v.TipoVacacion == request.TipoVacacion)
                    .Where(v => string.IsNullOrEmpty(request.EstadoVacacion) || v.EstadoVacacion == request.EstadoVacacion)
                    .ToListAsync();

                // Agrupar por tipo
                response.ResumenGeneral.AsignadasPorTipo = todasLasVacaciones
                    .GroupBy(v => v.TipoVacacion)
                    .ToDictionary(g => g.Key, g => g.Count());

                // Agrupar por estado
                response.ResumenGeneral.AsignadasPorEstado = todasLasVacaciones
                    .GroupBy(v => v.EstadoVacacion)
                    .ToDictionary(g => g.Key, g => g.Count());

                response.ResumenGeneral.TotalDiasAsignados = todasLasVacaciones.Count;

                // Calcular días disponibles totales
                int totalDisponibles = 0;
                foreach (var empleado in empleados)
                {
                    var calculo = await _vacacionesService.CalcularVacacionesPorEmpleadoAsync(
                        empleado.Id, anio);
                    if (calculo.Success && calculo.Data != null)
                    {
                        totalDisponibles += calculo.Data.TotalDias;
                    }
                }
                response.ResumenGeneral.TotalDiasDisponibles = totalDisponibles;
                response.ResumenGeneral.TotalDiasPendientes = totalDisponibles - response.ResumenGeneral.TotalDiasAsignados;

                // Resumen por área si se solicita
                if (request.IncluirResumenPorArea)
                {
                    response.ResumenAreas = await ObtenerResumenPorAreaAsync(empleados, todasLasVacaciones, anio);
                }

                // Resumen por grupo si se solicita
                if (request.IncluirResumenPorGrupo)
                {
                    response.ResumenGrupos = await ObtenerResumenPorGrupoAsync(empleados, todasLasVacaciones, anio);
                }

                return new ApiResponse<VacacionesAsignadasMultipleResponse>(true, response, null);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener vacaciones con filtros");
                return new ApiResponse<VacacionesAsignadasMultipleResponse>(false, null, $"Error inesperado: {ex.Message}");
            }
        }

        private async Task<List<ResumenVacacionesPorArea>> ObtenerResumenPorAreaAsync(
            List<User> empleados, List<VacacionesProgramadas> vacaciones, int anio)
        {
            var resumenPorArea = new List<ResumenVacacionesPorArea>();

            var empleadosPorArea = empleados.GroupBy(e => e.AreaId);
            foreach (var grupo in empleadosPorArea)
            {
                if (!grupo.Key.HasValue) continue;

                var area = await _db.Areas.FirstOrDefaultAsync(a => a.AreaId == grupo.Key.Value);
                if (area == null) continue;

                var empleadosArea = grupo.ToList();
                var idsEmpleados = empleadosArea.Select(e => e.Id).ToList();
                var vacacionesArea = vacaciones.Where(v => idsEmpleados.Contains(v.EmpleadoId)).ToList();

                int totalDisponibles = 0;
                foreach (var empleado in empleadosArea)
                {
                    var calculo = await _vacacionesService.CalcularVacacionesPorEmpleadoAsync(empleado.Id, anio);
                    if (calculo.Success && calculo.Data != null)
                    {
                        totalDisponibles += calculo.Data.TotalDias;
                    }
                }

                resumenPorArea.Add(new ResumenVacacionesPorArea
                {
                    AreaId = area.AreaId,
                    NombreArea = area.NombreGeneral,
                    TotalEmpleados = empleadosArea.Count,
                    TotalDiasAsignados = vacacionesArea.Count,
                    TotalDiasPendientes = totalDisponibles - vacacionesArea.Count
                });
            }

            return resumenPorArea;
        }

        private async Task<List<ResumenVacacionesPorGrupo>> ObtenerResumenPorGrupoAsync(
            List<User> empleados, List<VacacionesProgramadas> vacaciones, int anio)
        {
            var resumenPorGrupo = new List<ResumenVacacionesPorGrupo>();

            var empleadosPorGrupo = empleados.GroupBy(e => e.GrupoId);
            foreach (var grupo in empleadosPorGrupo)
            {
                if (!grupo.Key.HasValue) continue;

                var grupoInfo = await _db.Grupos.FirstOrDefaultAsync(g => g.GrupoId == grupo.Key.Value);
                if (grupoInfo == null) continue;

                var empleadosGrupo = grupo.ToList();
                var idsEmpleados = empleadosGrupo.Select(e => e.Id).ToList();
                var vacacionesGrupo = vacaciones.Where(v => idsEmpleados.Contains(v.EmpleadoId)).ToList();

                int totalDisponibles = 0;
                foreach (var empleado in empleadosGrupo)
                {
                    var calculo = await _vacacionesService.CalcularVacacionesPorEmpleadoAsync(empleado.Id, anio);
                    if (calculo.Success && calculo.Data != null)
                    {
                        totalDisponibles += calculo.Data.TotalDias;
                    }
                }

                resumenPorGrupo.Add(new ResumenVacacionesPorGrupo
                {
                    GrupoId = grupoInfo.GrupoId,
                    NombreGrupo = $"{grupoInfo.Rol} - {grupoInfo.IdentificadorSAP}",
                    TotalEmpleados = empleadosGrupo.Count,
                    TotalDiasAsignados = vacacionesGrupo.Count,
                    TotalDiasPendientes = totalDisponibles - vacacionesGrupo.Count
                });
            }

            return resumenPorGrupo;
        }
    }
}
