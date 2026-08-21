using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using tiempo_libre.Models;
using tiempo_libre.DTOs;
using tiempo_libre.Helpers;
using tiempo_libre.Services;

namespace tiempo_libre.Services
{
    public class BloquesReservacionService
    {
        private readonly FreeTimeDbContext _db;
        private readonly CalendarioGrupoService _calendarioService;
        private readonly NotificacionesService _notificacionesService;
        private readonly ILogger<BloquesReservacionService> _logger;

        public BloquesReservacionService(
            FreeTimeDbContext db,
            CalendarioGrupoService calendarioService,
            NotificacionesService notificacionesService,
            ILogger<BloquesReservacionService> logger)
        {
            _db = db;
            _calendarioService = calendarioService;
            _notificacionesService = notificacionesService;
            _logger = logger;
        }

        /// <summary>
        /// Genera los bloques de reservación para el año objetivo
        /// </summary>
        public async Task<ApiResponse<GeneracionBloquesResponse>> GenerarBloquesAsync(GeneracionBloquesRequest request, int usuarioId)
        {
            try
            {
                _logger.LogInformation("Iniciando generación de bloques para año {Anio} con fecha inicio {FechaInicio}",
                    request.AnioObjetivo, request.FechaInicioGeneracion);

                // Validaciones iniciales
                var validacionResponse = await ValidarRequerimientosGeneracionAsync(request);
                if (!validacionResponse.Success)
                    return new ApiResponse<GeneracionBloquesResponse>(false, null, validacionResponse.ErrorMsg);

                // Obtener grupos a procesar
                var grupos = await ObtenerGruposParaProcesarAsync(request.GrupoIds);

                var response = new GeneracionBloquesResponse
                {
                    AnioObjetivo = request.AnioObjetivo,
                    FechaInicioGeneracion = request.FechaInicioGeneracion,
                    TotalGruposProcesados = grupos.Count
                };

                // Procesar cada grupo
                foreach (var grupo in grupos)
                {
                    var resumenGrupo = await GenerarBloquesParaGrupoAsync(grupo, request, usuarioId);
                    response.ResumenPorGrupo.Add(resumenGrupo);

                    if (resumenGrupo.GeneracionExitosa)
                    {
                        response.TotalBloqueGenerados += resumenGrupo.TotalBloques;
                        response.TotalEmpleadosAsignados += resumenGrupo.TotalEmpleados;

                        // Si hay un mensaje de advertencia (como no hay empleados programables), agregarlo a advertencias
                        if (!string.IsNullOrEmpty(resumenGrupo.MotivoError))
                        {
                            response.Advertencias.Add(resumenGrupo.MotivoError);
                        }
                    }
                    else
                    {
                        response.Errores.Add($"Grupo {grupo.Rol}: {resumenGrupo.MotivoError}");
                    }
                }

                response.GeneracionExitosa = response.Errores.Count == 0;

                if (!request.SoloSimulacion && response.GeneracionExitosa)
                {
                    await _db.SaveChangesAsync();
                    _logger.LogInformation("Bloques guardados exitosamente en base de datos");
                }

                if (!response.GeneracionExitosa)
                {
                    // Cuando cualquier grupo falla NO se guarda nada (el SaveChanges de
                    // arriba no corre). Antes esta rama respondía success=true y el
                    // usuario veía "se generaron N bloques" con la base de datos vacía
                    // — de ahí el "no hay datos de programación anual" posterior.
                    var detalleErrores = string.Join(" | ", response.Errores);
                    _logger.LogWarning(
                        "Generación de bloques para año {Anio} falló en {Grupos} grupo(s); no se guardó nada. Errores: {Errores}",
                        request.AnioObjetivo, response.Errores.Count, detalleErrores);
                    return new ApiResponse<GeneracionBloquesResponse>(false, response,
                        $"No se guardó ningún bloque: {response.Errores.Count} grupo(s) fallaron. {detalleErrores}");
                }

                return new ApiResponse<GeneracionBloquesResponse>(true, response, null);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al generar bloques de reservación");
                return new ApiResponse<GeneracionBloquesResponse>(false, null, $"Error inesperado: {ex.Message}");
            }
        }

        /// <summary>
        /// Valida que todos los grupos tengan configuración válida para generar bloques
        /// </summary>
        private async Task<ApiResponse<object>> ValidarRequerimientosGeneracionAsync(GeneracionBloquesRequest request)
        {
            // Validar fecha inicio. El mensaje lleva las dos fechas porque el
            // error típico es teclear el año anterior (22/01/2026 cuando se está
            // generando el ciclo 2027), y "no puede ser en el pasado" a secas no
            // deja ver que el problema es el AÑO de la fecha.
            if (request.FechaInicioGeneracion < DateTime.Now.Date)
                return new ApiResponse<object>(false, null,
                    $"La fecha de inicio de generación ({request.FechaInicioGeneracion:dd/MM/yyyy}) ya pasó; " +
                    $"hoy es {DateTime.Now:dd/MM/yyyy}. Revisa el año de esa fecha: la captura de los bloques " +
                    $"de {request.AnioObjetivo} tiene que arrancar de hoy en adelante.");

            // Validar que no existan bloques para el año objetivo
            var bloquesExistentes = await _db.BloquesReservacion
                .AnyAsync(b => b.AnioGeneracion == request.AnioObjetivo);

            if (bloquesExistentes)
                return new ApiResponse<object>(false, null,
                    $"Ya existen bloques generados para el año {request.AnioObjetivo}. " +
                    $"Si quieres rehacerlos, primero elimínalos desde la misma pantalla.");

            // Validar configuración de grupos
            var gruposInvalidos = await _db.Grupos
                .Where(g => request.GrupoIds == null || request.GrupoIds.Contains(g.GrupoId))
                .Where(g => g.PersonasPorTurno <= 0 || g.DuracionDeturno <= 0)
                .Select(g => new { g.GrupoId, g.Rol })
                .ToListAsync();

            if (gruposInvalidos.Any())
            {
                var gruposTexto = string.Join(", ", gruposInvalidos.Select(g => $"{g.Rol} ({g.GrupoId})"));
                return new ApiResponse<object>(false, null,
                    $"Los siguientes grupos no tienen configuración válida (PersonasPorTurno > 0 y DuracionDeturno > 0): {gruposTexto}");
            }

            return new ApiResponse<object>(true, null, null);
        }

        /// <summary>
        /// Obtiene los grupos que se van a procesar
        /// </summary>
        private async Task<List<Grupo>> ObtenerGruposParaProcesarAsync(List<int>? grupoIds)
        {
            var query = _db.Grupos
                .Include(g => g.Area)
                .Where(g => g.PersonasPorTurno > 0 && g.DuracionDeturno > 0);

            if (grupoIds != null && grupoIds.Any())
                query = query.Where(g => grupoIds.Contains(g.GrupoId));

            return await query.OrderBy(g => g.Area.NombreGeneral)
                            .ThenBy(g => g.Rol)
                            .ToListAsync();
        }

        /// <summary>
        /// Genera los bloques para un grupo específico (basado en el algoritmo C++)
        /// </summary>
        private async Task<ResumenPorGrupo> GenerarBloquesParaGrupoAsync(Grupo grupo, GeneracionBloquesRequest request, int usuarioId)
        {
            var resumen = new ResumenPorGrupo
            {
                GrupoId = grupo.GrupoId,
                NombreGrupo = grupo.Rol,
                NombreArea = grupo.Area.NombreGeneral,
                PersonasPorTurno = grupo.PersonasPorTurno,
                DuracionHoras = grupo.DuracionDeturno
            };

            try
            {
                // Obtener empleados sindicalizados del grupo ordenados por antigüedad
                var empleados = await ObtenerEmpleadosDelGrupoOrdenadosAsync(grupo.GrupoId, request.AnioObjetivo);
                resumen.TotalEmpleados = empleados.Count;

                if (empleados.Count == 0)
                {
                    resumen.GeneracionExitosa = true; // Continúa siendo exitoso, solo es una advertencia
                    var advertencia = $"Área {grupo.Area.NombreGeneral}: Grupo {grupo.Rol}: No hay empleados con días programables disponibles en el grupo para el año {request.AnioObjetivo}";
                    resumen.MotivoError = advertencia; // Se mantiene para informar, pero no es un error fatal
                    _logger.LogWarning("Área {Area}: Grupo {GrupoId} sin empleados con días programables para año {Anio}",
                        grupo.Area.NombreGeneral, grupo.GrupoId, request.AnioObjetivo);
                    return resumen;
                }

                // Calcular cantidad de bloques necesarios (similar al C++)
                var personasPorBloque = grupo.PersonasPorTurno;
                var bloquesRegulares = empleados.Count / personasPorBloque;
                if (empleados.Count % personasPorBloque > 0)
                    bloquesRegulares++;

                var totalBloques = bloquesRegulares + 1; // +1 para el bloque cola
                resumen.BloquesRegulares = bloquesRegulares;
                resumen.BloquesCola = 1;
                resumen.TotalBloques = totalBloques;

                // Generar fechas y horarios de bloques
                var bloques = await GenerarFechasYHorariosBloquesAsync(
                    grupo, request.FechaInicioGeneracion, request.AnioObjetivo, totalBloques, usuarioId);

                // Asignar empleados a bloques
                await AsignarEmpleadosABloquesAsync(empleados, bloques, usuarioId);

                resumen.Bloques = bloques.Select(b => new BloqueGeneradoDto
                {
                    Id = b.Id,
                    NumeroBloque = b.NumeroBloque,
                    FechaHoraInicio = b.FechaHoraInicio,
                    FechaHoraFin = b.FechaHoraFin,
                    PersonasPorBloque = b.PersonasPorBloque,
                    EsBloqueCola = b.EsBloqueCola,
                    EmpleadosAsignados = b.AsignacionesBloque.Select(a => new EmpleadoAsignadoBloqueDto
                    {
                        EmpleadoId = a.EmpleadoId,
                        NombreCompleto = a.Empleado.FullName ?? "",
                        Nomina = a.Empleado.Nomina?.ToString() ?? "",
                        PosicionEnBloque = a.PosicionEnBloque,
                        FechaIngreso = a.Empleado.FechaIngreso.HasValue ? (DateTime?)a.Empleado.FechaIngreso.Value.ToDateTime(TimeOnly.MinValue) : null,
                        AntiguedadAnios = a.Empleado.FechaIngreso.HasValue
                            ? DateTime.Now.Year - a.Empleado.FechaIngreso.Value.Year
                            : null,
                        Estado = a.Estado
                    }).ToList()
                }).ToList();

                if (resumen.Bloques.Any())
                {
                    resumen.FechaInicioBloque = resumen.Bloques.Min(b => b.FechaHoraInicio);
                    resumen.FechaFinBloque = resumen.Bloques.Max(b => b.FechaHoraFin);
                }

                resumen.GeneracionExitosa = true;
                return resumen;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al generar bloques para grupo {GrupoId}", grupo.GrupoId);
                resumen.GeneracionExitosa = false;
                resumen.MotivoError = $"Error inesperado: {ex.Message}";
                return resumen;
            }
        }

        /// <summary>
        /// Obtiene empleados sindicalizados del grupo ordenados por antigüedad y nómina
        /// Solo incluye empleados con días programables disponibles
        /// </summary>
        private async Task<List<User>> ObtenerEmpleadosDelGrupoOrdenadosAsync(int grupoId, int anioObjetivo = 0)
        {
            // Primero obtener todos los empleados sindicalizados del grupo
            var todosEmpleados = await _db.Users
                .Where(u => u.GrupoId == grupoId
                         && u.Nomina.HasValue // Solo sindicalizados
                         && u.FechaIngreso.HasValue // Deben tener fecha de ingreso
                )
                .OrderBy(u => u.FechaIngreso ?? DateOnly.MaxValue) // Más antiguo primero
                .ThenBy(u => u.Nomina ?? 0) // En caso de empate, nómina menor primero
                .ToListAsync();

            // Filtrar solo empleados con días programables
            var empleadosConDiasProgramables = new List<User>();
            var anioCalcular = anioObjetivo > 0 ? anioObjetivo : DateTime.Now.Year + 1; // Usar año pasado o calcular

            foreach (var empleado in todosEmpleados)
            {
                if (empleado.FechaIngreso == null) continue;

                // Calcular antigüedad al año objetivo
                var fechaReferencia = new DateOnly(anioCalcular, 12, 31);
                var antiguedadEnAnios = CalcularAntiguedadEnAnios(empleado.FechaIngreso.Value, fechaReferencia);

                // Si tiene menos de 1 año de antigüedad, no tiene vacaciones
                if (antiguedadEnAnios < 1) continue;

                // Calcular días programables usando la lógica del servicio de vacaciones
                var diasProgramables = CalcularDiasProgramables(antiguedadEnAnios);

                // Solo incluir empleados con días programables > 0
                if (diasProgramables > 0)
                {
                    empleadosConDiasProgramables.Add(empleado);
                    _logger.LogDebug("Empleado {Nomina} - {Nombre} incluido con {Dias} días programables",
                        empleado.Nomina, empleado.FullName, diasProgramables);
                }
                else
                {
                    _logger.LogDebug("Empleado {Nomina} - {Nombre} excluido: sin días programables",
                        empleado.Nomina, empleado.FullName);
                }
            }

            _logger.LogInformation("Grupo {GrupoId}: {TotalEmpleados} empleados totales, {EmpleadosConDias} con días programables",
                grupoId, todosEmpleados.Count, empleadosConDiasProgramables.Count);

            return empleadosConDiasProgramables;
        }

        /// <summary>
        /// Calcula la antigüedad en años entre dos fechas
        /// </summary>
        private int CalcularAntiguedadEnAnios(DateOnly fechaIngreso, DateOnly fechaReferencia)
        {
            var años = fechaReferencia.Year - fechaIngreso.Year;
            if (fechaReferencia < fechaIngreso.AddYears(años))
                años--;
            return años;
        }

        /// <summary>
        /// Calcula los días programables según la antigüedad
        /// Excluye los 12 días de la empresa y los días asignados automáticamente
        /// </summary>
        private int CalcularDiasProgramables(int antiguedadEnAnios)
        {
            if (antiguedadEnAnios < 1) return 0;

            // OJO: esta tabla es una copia de VacacionesService.CalcularVacacionesPorAntiguedad.
            // Antes había además un tope de 28 días totales que recortaba los
            // programables a 11 a partir de 26 años de antigüedad; ese tope no
            // existe en la tabla de antigüedades del cliente (36-40 años = 17 días
            // de común acuerdo) y hacía que a la gente con más antigüedad se le
            // generaran menos bloques de los que le tocan.
            // Lógica basada en VacacionesService.CalcularVacacionesPorAntiguedad
            if (antiguedadEnAnios <= 5)
            {
                // Años 1-5: días programables específicos
                switch (antiguedadEnAnios)
                {
                    case 1: return 0; // Solo 12 días de empresa
                    case 2: return 2;
                    case 3: return 4;
                    case 4: return 3; // 3 programables + 3 automáticos
                    case 5: return 4; // 4 programables + 4 automáticos
                }
            }

            // Años 6 en adelante
            // Días programables: inicia con 5 en año 6, y cada 5 años se suman 2 más
            int diasProgramablesBase = 5;
            int gruposDeCincoAnios = (antiguedadEnAnios - 6) / 5;
            int diasProgramables = diasProgramablesBase + (gruposDeCincoAnios * 2);

            return Math.Max(0, diasProgramables); // Asegurar que no sea negativo
        }

        /// <summary>
        /// Genera las fechas y horarios de los bloques evitando días de descanso e incapacidades
        /// </summary>
        private async Task<List<BloquesReservacion>> GenerarFechasYHorariosBloquesAsync(
            Grupo grupo, DateTime fechaInicio, int anio, int totalBloques, int usuarioId)
        {
            var bloques = new List<BloquesReservacion>();
            // Normalize start time to 9:00 AM
            var fechaActual = new DateTime(fechaInicio.Year, fechaInicio.Month, fechaInicio.Day, 9, 0, 0);
            var numeroBloque = 1;

            // Obtener días inhábiles del año
            var diasInhabiles = await _db.DiasInhabiles
                .Where(d => d.Fecha.Year == anio)
                .Select(d => d.Fecha)
                .ToListAsync();
            var diasInhabilesSet = diasInhabiles.ToHashSet();

            while (bloques.Count < totalBloques)
            {
                // Verificar si la fecha es válida para programar un bloque
                var esFechaValida = await EsFechaValidaParaBloqueAsync(grupo, fechaActual, diasInhabilesSet);

                if (esFechaValida)
                {
                    var esBloqueCola = numeroBloque == totalBloques;
                    var fechaHoraFin = fechaActual.AddHours(grupo.DuracionDeturno);

                    var bloque = new BloquesReservacion
                    {
                        GrupoId = grupo.GrupoId,
                        AnioGeneracion = anio,
                        NumeroBloque = numeroBloque,
                        FechaHoraInicio = fechaActual,
                        FechaHoraFin = fechaHoraFin,
                        PersonasPorBloque = grupo.PersonasPorTurno,
                        DuracionHoras = grupo.DuracionDeturno,
                        EsBloqueCola = esBloqueCola,
                        GeneradoPor = usuarioId,
                        Estado = "Activo"
                    };

                    bloques.Add(bloque);
                    _db.BloquesReservacion.Add(bloque);
                    numeroBloque++;

                    // Avanzar la fecha según la duración del bloque, aplicando pausa de fin de semana
                    fechaActual = AplicarPausaFinDeSemana(fechaHoraFin);
                }
                else
                {
                    // Avanzar al siguiente día si la fecha actual no es válida
                    fechaActual = fechaActual.Date.AddDays(1).AddHours(fechaActual.Hour);
                }

                // Protección contra bucle infinito
                if (fechaActual.Year > anio + 1)
                {
                    _logger.LogError("No se pudieron generar todos los bloques para el grupo {GrupoId}", grupo.GrupoId);
                    break;
                }
            }

            return bloques;
        }

        /// <summary>
        /// Aplica la lógica de pausa de fin de semana a una fecha/hora
        /// Pausa: Sábados después de la 1:00 AM
        /// Reanuda: Lunes a las 9:00 AM
        /// </summary>
        private DateTime AplicarPausaFinDeSemana(DateTime fechaHora)
        {
            // Si es sábado después de la 1:00 AM, saltar a lunes 9:00 AM
            if (fechaHora.DayOfWeek == DayOfWeek.Saturday && fechaHora.Hour >= 1)
            {
                // Calcular el próximo lunes
                int diasHastaLunes = ((int)DayOfWeek.Monday - (int)fechaHora.DayOfWeek + 7) % 7;
                if (diasHastaLunes == 0) diasHastaLunes = 7; // Si es sábado, el siguiente lunes es en 2 días

                var proximoLunes = fechaHora.Date.AddDays(diasHastaLunes);

                _logger.LogDebug("Aplicando pausa de fin de semana: {FechaOriginal} -> {NuevaFecha}",
                    fechaHora, new DateTime(proximoLunes.Year, proximoLunes.Month, proximoLunes.Day, 9, 0, 0));

                return new DateTime(proximoLunes.Year, proximoLunes.Month, proximoLunes.Day, 9, 0, 0);
            }

            // Si es domingo (cualquier hora), saltar a lunes 9:00 AM
            if (fechaHora.DayOfWeek == DayOfWeek.Sunday)
            {
                int diasHastaLunes = 1; // Domingo + 1 día = Lunes
                var proximoLunes = fechaHora.Date.AddDays(diasHastaLunes);

                _logger.LogDebug("Aplicando pausa de fin de semana (domingo): {FechaOriginal} -> {NuevaFecha}",
                    fechaHora, new DateTime(proximoLunes.Year, proximoLunes.Month, proximoLunes.Day, 9, 0, 0));

                return new DateTime(proximoLunes.Year, proximoLunes.Month, proximoLunes.Day, 9, 0, 0);
            }

            // Si no es fin de semana, devolver la fecha tal cual
            return fechaHora;
        }

        /// <summary>
        /// Verifica si una fecha es válida para programar un bloque
        /// </summary>
        private async Task<bool> EsFechaValidaParaBloqueAsync(Grupo grupo, DateTime fecha, HashSet<DateOnly> diasInhabiles)
        {
            var fechaSoloDate = DateOnly.FromDateTime(fecha);

            // Verificar días inhábiles
            if (diasInhabiles.Contains(fechaSoloDate))
                return false;

            // Verificar calendario del grupo (días de descanso 'D').
            // OJO: el servicio de calendario exige fechaInicio < fechaFin (estricto);
            // pedir (fecha, fecha) devolvía Success=false y esta validación aprobaba
            // TODAS las fechas — los bloques caían en días de descanso del grupo.
            var calendarioResponse = await _calendarioService.ObtenerCalendarioGrupoAsync(
                grupo.GrupoId, fecha.Date, fecha.Date.AddDays(1));

            if (!calendarioResponse.Success || !calendarioResponse.Data.Calendario.Any())
                return true; // Si no hay calendario, asumir que es válido

            var diaCalendario = calendarioResponse.Data.Calendario
                .FirstOrDefault(d => d.Fecha.Date == fecha.Date);
            return diaCalendario == null || diaCalendario.Turno != "D";
        }

        /// <summary>
        /// Asigna empleados a los bloques generados
        /// </summary>
        private async Task AsignarEmpleadosABloquesAsync(List<User> empleados, List<BloquesReservacion> bloques, int usuarioId)
        {
            var empleadoIndex = 0;
            var bloquesRegulares = bloques.Where(b => !b.EsBloqueCola).OrderBy(b => b.NumeroBloque).ToList();
            var bloqueCola = bloques.FirstOrDefault(b => b.EsBloqueCola);

            // Asignar empleados a bloques regulares
            foreach (var bloque in bloquesRegulares)
            {
                var posicion = 1;
                for (int i = 0; i < bloque.PersonasPorBloque && empleadoIndex < empleados.Count; i++)
                {
                    var asignacion = new AsignacionesBloque
                    {
                        BloqueId = bloque.Id,
                        EmpleadoId = empleados[empleadoIndex].Id,
                        PosicionEnBloque = posicion,
                        AsignedoPor = usuarioId,
                        Estado = "Asignado"
                    };

                    bloque.AsignacionesBloque.Add(asignacion);
                    _db.AsignacionesBloque.Add(asignacion);

                    empleadoIndex++;
                    posicion++;
                }
            }

            // Asignar empleados restantes al bloque cola
            if (bloqueCola != null && empleadoIndex < empleados.Count)
            {
                var posicion = 1;
                while (empleadoIndex < empleados.Count)
                {
                    var asignacion = new AsignacionesBloque
                    {
                        BloqueId = bloqueCola.Id,
                        EmpleadoId = empleados[empleadoIndex].Id,
                        PosicionEnBloque = posicion,
                        AsignedoPor = usuarioId,
                        Estado = "Asignado"
                    };

                    bloqueCola.AsignacionesBloque.Add(asignacion);
                    _db.AsignacionesBloque.Add(asignacion);

                    empleadoIndex++;
                    posicion++;
                }
            }
        }

        /// <summary>
        /// Aprueba los bloques generados y los hace oficiales
        /// </summary>
        public async Task<ApiResponse<object>> AprobarBloquesAsync(AprobarBloquesRequest request, int usuarioId)
        {
            try
            {
                var bloques = await _db.BloquesReservacion
                    .Where(b => b.AnioGeneracion == request.AnioObjetivo
                             && request.GrupoIds.Contains(b.GrupoId)
                             && b.Estado == "Activo"
                             && b.FechaAprobacion == null)
                    .ToListAsync();

                if (!bloques.Any())
                    return new ApiResponse<object>(false, null, "No se encontraron bloques pendientes de aprobación");

                foreach (var bloque in bloques)
                {
                    bloque.FechaAprobacion = DateTime.UtcNow;
                    bloque.AprobadoPor = usuarioId;
                    bloque.Observaciones = request.Observaciones;
                }

                await _db.SaveChangesAsync();

                // Crear notificaciones por área
                await CrearNotificacionesAprobacionAsync(bloques, usuarioId);

                _logger.LogInformation("Aprobados {CantidadBloques} bloques para año {Anio} por usuario {UsuarioId}",
                    bloques.Count, request.AnioObjetivo, usuarioId);

                return new ApiResponse<object>(true, null, "Bloques aprobados exitosamente");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al aprobar bloques");
                return new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}");
            }
        }

        /// <summary>
        /// Cambia un empleado de un bloque a otro
        /// </summary>
        public async Task<ApiResponse<CambiarBloqueResponse>> CambiarEmpleadoDeBloqueAsync(CambiarBloqueRequest request, int usuarioId)
        {
            try
            {
                // Validar que el empleado esté asignado al bloque origen
                var asignacionOrigen = await _db.AsignacionesBloque
                    .Include(a => a.Bloque)
                    .Include(a => a.Empleado)
                    .FirstOrDefaultAsync(a => a.EmpleadoId == request.EmpleadoId
                                           && a.BloqueId == request.BloqueOrigenId
                                           && a.Estado == "Asignado");

                if (asignacionOrigen == null)
                    return new ApiResponse<CambiarBloqueResponse>(false, null,
                        "El empleado no está asignado al bloque origen especificado");

                // Validar disponibilidad en bloque destino
                var bloqueDestino = await _db.BloquesReservacion
                    .Include(b => b.AsignacionesBloque)
                    .FirstOrDefaultAsync(b => b.Id == request.BloqueDestinoId && b.Estado == "Activo");

                if (bloqueDestino == null)
                    return new ApiResponse<CambiarBloqueResponse>(false, null, "El bloque destino no existe o no está activo");

                var espaciosOcupados = bloqueDestino.AsignacionesBloque.Count(a => a.Estado == "Asignado");

                // Realizar el cambio
                asignacionOrigen.Estado = "Transferido";

                var nuevaAsignacion = new AsignacionesBloque
                {
                    BloqueId = request.BloqueDestinoId,
                    EmpleadoId = request.EmpleadoId,
                    PosicionEnBloque = espaciosOcupados + 1,
                    AsignedoPor = usuarioId,
                    Estado = "Asignado"
                };

                _db.AsignacionesBloque.Add(nuevaAsignacion);

                // Registrar el cambio en auditoría
                var cambio = new CambiosBloque
                {
                    EmpleadoId = request.EmpleadoId,
                    BloqueOrigenId = request.BloqueOrigenId,
                    BloqueDestinoId = request.BloqueDestinoId,
                    Motivo = request.Motivo,
                    AutorizadoPor = usuarioId,
                    ObservacionesAdicionales = request.ObservacionesAdicionales
                };

                _db.CambiosBloque.Add(cambio);
                await _db.SaveChangesAsync();

                var response = new CambiarBloqueResponse
                {
                    EmpleadoId = request.EmpleadoId,
                    NombreEmpleado = asignacionOrigen.Empleado.FullName ?? "",
                    NominaEmpleado = asignacionOrigen.Empleado.Nomina?.ToString() ?? "",
                    BloqueOrigen = MapearBloqueADto(asignacionOrigen.Bloque),
                    BloqueDestino = MapearBloqueADto(bloqueDestino),
                    CambioExitoso = true
                };

                return new ApiResponse<CambiarBloqueResponse>(true, response, null);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al cambiar empleado de bloque");
                return new ApiResponse<CambiarBloqueResponse>(false, null, $"Error inesperado: {ex.Message}");
            }
        }

        /// <summary>
        /// Marca la asignación como "Saltado" SIN moverla de bloque. Efectos:
        /// - El siguiente empleado por antigüedad queda desbloqueado de inmediato
        ///   (el gate de captura ignora a los saltados igual que a los que ya
        ///   reservaron).
        /// - El saltado conserva el derecho de capturar durante la ventana del
        ///   bloque (24 h); si captura, su asignación pasa a "Reservado" normal.
        /// - Si no captura antes de que venza el bloque, EstadosBloquesService lo
        ///   manda al bloque cola como cualquier no-respuesta.
        /// </summary>
        public async Task<ApiResponse<bool>> SaltarTurnoAsync(SaltarTurnoRequest request, int usuarioId)
        {
            try
            {
                var asignacion = await _db.AsignacionesBloque
                    .Include(a => a.Empleado)
                    .FirstOrDefaultAsync(a => a.EmpleadoId == request.EmpleadoId
                        && a.BloqueId == request.BloqueId
                        && a.Estado == "Asignado");

                if (asignacion == null)
                    return new ApiResponse<bool>(false, false,
                        "El empleado no tiene una asignación pendiente en ese bloque (puede que ya haya reservado o ya fue saltado)");

                asignacion.Estado = "Saltado";
                asignacion.Observaciones = string.IsNullOrWhiteSpace(request.Motivo)
                    ? "Saltado para desbloquear al siguiente empleado"
                    : $"Saltado: {request.Motivo}";

                // Auditoría en la misma tabla que los cambios de bloque; origen y
                // destino iguales porque el salto no mueve al empleado de bloque.
                _db.CambiosBloque.Add(new CambiosBloque
                {
                    EmpleadoId = request.EmpleadoId,
                    BloqueOrigenId = request.BloqueId,
                    BloqueDestinoId = request.BloqueId,
                    Motivo = string.IsNullOrWhiteSpace(request.Motivo)
                        ? "Saltar turno"
                        : request.Motivo,
                    AutorizadoPor = usuarioId
                });

                await _db.SaveChangesAsync();

                _logger.LogInformation(
                    "Turno saltado: empleado {EmpleadoId} en bloque {BloqueId} por usuario {UsuarioId}",
                    request.EmpleadoId, request.BloqueId, usuarioId);

                return new ApiResponse<bool>(true, true,
                    $"Turno de {asignacion.Empleado.FullName} saltado; el siguiente empleado quedó desbloqueado. Podrá capturar mientras el bloque siga abierto.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al saltar turno del empleado {EmpleadoId}", request.EmpleadoId);
                return new ApiResponse<bool>(false, false, $"Error inesperado: {ex.Message}");
            }
        }

        /// <summary>
        /// Consulta bloques con filtros
        /// </summary>
        public async Task<ApiResponse<ConsultaBloquesResponse>> ConsultarBloquesAsync(ConsultaBloquesRequest request)
        {
            try
            {
                var query = _db.BloquesReservacion
                    .Include(b => b.Grupo)
                    .ThenInclude(g => g.Area)
                    .Include(b => b.AsignacionesBloque.Where(a => a.Estado == "Asignado"))
                    .ThenInclude(a => a.Empleado)
                    .AsQueryable();

                if (request.AnioObjetivo.HasValue)
                    query = query.Where(b => b.AnioGeneracion == request.AnioObjetivo.Value);

                if (request.GrupoId.HasValue)
                    query = query.Where(b => b.GrupoId == request.GrupoId.Value);

                if (request.AreaId.HasValue)
                    query = query.Where(b => b.Grupo.AreaId == request.AreaId.Value);

                if (!string.IsNullOrEmpty(request.Estado))
                    query = query.Where(b => b.Estado == request.Estado);

                var bloques = await query.OrderBy(b => b.GrupoId)
                                       .ThenBy(b => b.NumeroBloque)
                                       .ToListAsync();

                var bloquesDto = bloques.Select(b => new BloqueDetalladoDto
                {
                    Id = b.Id,
                    GrupoId = b.GrupoId,
                    NombreGrupo = b.Grupo.Rol,
                    NombreArea = b.Grupo.Area.NombreGeneral,
                    NumeroBloque = b.NumeroBloque,
                    FechaHoraInicio = b.FechaHoraInicio,
                    FechaHoraFin = b.FechaHoraFin,
                    PersonasPorBloque = b.PersonasPorBloque,
                    DuracionHoras = b.DuracionHoras,
                    EsBloqueCola = b.EsBloqueCola,
                    Estado = b.Estado,
                    EspaciosDisponibles = b.PersonasPorBloque - b.AsignacionesBloque.Count(a => a.Estado == "Asignado"),
                    FechaAprobacion = b.FechaAprobacion,
                    EmpleadosAsignados = b.AsignacionesBloque
                        .Where(a => a.Estado == "Asignado")
                        .Select(a => new EmpleadoAsignadoBloqueDto
                        {
                            EmpleadoId = a.EmpleadoId,
                            NombreCompleto = a.Empleado.FullName ?? "",
                            Nomina = a.Empleado.Nomina?.ToString() ?? "",
                            PosicionEnBloque = a.PosicionEnBloque,
                            FechaIngreso = a.Empleado.FechaIngreso.HasValue ? (DateTime?)a.Empleado.FechaIngreso.Value.ToDateTime(TimeOnly.MinValue) : null,
                            AntiguedadAnios = a.Empleado.FechaIngreso.HasValue
                                ? DateTime.Now.Year - a.Empleado.FechaIngreso.Value.Year
                                : null,
                            Estado = a.Estado
                        }).ToList()
                }).ToList();

                if (request.SoloBloquesConEspacio == true)
                    bloquesDto = bloquesDto.Where(b => b.EspaciosDisponibles > 0).ToList();

                var response = new ConsultaBloquesResponse
                {
                    TotalBloques = bloquesDto.Count,
                    Bloques = bloquesDto
                };

                return new ApiResponse<ConsultaBloquesResponse>(true, response, null);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al consultar bloques");
                return new ApiResponse<ConsultaBloquesResponse>(false, null, $"Error inesperado: {ex.Message}");
            }
        }

        private async Task CrearNotificacionesAprobacionAsync(List<BloquesReservacion> bloques, int usuarioId)
        {
            var areaIds = bloques.Select(b => b.Grupo.AreaId).Distinct();

            foreach (var areaId in areaIds)
            {
                await _notificacionesService.CrearNotificacionAsync(
                    Models.Enums.TiposDeNotificacionEnum.SistemaBloques,
                    "Bloques de Reservación Aprobados",
                    $"Los bloques de reservación para el año {bloques.First().AnioGeneracion} han sido aprobados y están listos para uso.",
                    "Sistema",
                    null, // idUsuarioReceptor
                    usuarioId, // idUsuarioEmisor
                    areaId,
                    null, // grupoId
                    "AprobacionBloques",
                    null, // idSolicitud
                    new { AnioGeneracion = bloques.First().AnioGeneracion, TotalBloques = bloques.Count }
                );
            }
        }

        /// <summary>
        /// Consulta bloques por fecha específica para determinar cuál está en curso y cuál es el siguiente
        /// </summary>
        public async Task<ApiResponse<ConsultaBloquesPorFechaResponse>> ConsultarBloquesPorFechaAsync(ConsultaBloquesPorFechaRequest request)
        {
            try
            {
                // Validar y ajustar fecha si hay discrepancia con el servidor
                var fechaServidor = DateTime.Now;
                var diferenciaDias = Math.Abs((request.Fecha.Date - fechaServidor.Date).TotalDays);

                if (diferenciaDias > 1) // Si hay más de 1 día de diferencia
                {
                    _logger.LogWarning(
                        "Discrepancia de fecha detectada en consulta de bloques. Cliente: {FechaCliente}, Servidor: {FechaServidor}. Usando fecha del servidor.",
                        request.Fecha, fechaServidor);

                    // Usar la fecha y hora actual del servidor
                    request.Fecha = fechaServidor;
                }

                // Si se especifica AnioObjetivo, usar ese. Si no, buscar bloques que contengan la fecha
                var queryBloques = _db.BloquesReservacion
                    .Include(b => b.Grupo)
                    .Include(b => b.Grupo.Area)
                    .Include(b => b.AsignacionesBloque.Where(a => a.Estado != "Transferido"))
                    .ThenInclude(a => a.Empleado)
                    .Include(b => b.AprobadoPorUser)
                    .Where(b => b.Estado == "Activo");

                // Si se especifica AnioObjetivo, filtrar por año de generación
                if (request.AnioObjetivo.HasValue)
                {
                    queryBloques = queryBloques.Where(b => b.AnioGeneracion == request.AnioObjetivo.Value);
                }
                else
                {
                    // Si no, buscar bloques que puedan contener la fecha (considerando que pueden ser del año actual o siguiente)
                    var anioActual = request.Fecha.Year;
                    var anioSiguiente = anioActual + 1;
                    queryBloques = queryBloques.Where(b => b.AnioGeneracion == anioActual || b.AnioGeneracion == anioSiguiente);
                }

                // Aplicar filtros
                if (request.AreaId.HasValue)
                {
                    queryBloques = queryBloques.Where(b => b.Grupo.AreaId == request.AreaId.Value);
                }

                if (request.GrupoId.HasValue)
                {
                    queryBloques = queryBloques.Where(b => b.GrupoId == request.GrupoId.Value);
                }

                var bloques = await queryBloques
                    .OrderBy(b => b.GrupoId)
                    .ThenBy(b => b.FechaHoraInicio)
                    .ToListAsync();

                if (!bloques.Any())
                {
                    return new ApiResponse<ConsultaBloquesPorFechaResponse>(false, null,
                        "No se encontraron bloques activos para los filtros especificados");
                }

                // Agrupar por grupo para encontrar bloques actual y siguiente
                var gruposBloques = bloques
                    .GroupBy(b => b.GrupoId)
                    .Select(g => new BloquePorGrupoDto
                    {
                        GrupoId = g.Key,
                        NombreGrupo = g.First().Grupo?.Rol ?? "",
                        NombreArea = g.First().Grupo?.Area?.NombreGeneral ?? "",
                        BloqueActual = null,
                        BloqueSiguiente = null,
                        EstadoConsulta = "SinBloques"
                    })
                    .ToList();

                foreach (var grupoBloques in gruposBloques)
                {
                    var bloquesDelGrupo = bloques
                        .Where(b => b.GrupoId == grupoBloques.GrupoId)
                        .OrderBy(b => b.FechaHoraInicio)
                        .ToList();

                    // Buscar bloque actual (que contiene la fecha consultada)
                    var bloqueActual = bloquesDelGrupo
                        .FirstOrDefault(b => request.Fecha >= b.FechaHoraInicio && request.Fecha <= b.FechaHoraFin);

                    if (bloqueActual != null)
                    {
                        // Hay un bloque en curso
                        grupoBloques.BloqueActual = MapearBloqueDetalladoADto(bloqueActual);
                        grupoBloques.EstadoConsulta = "EnCurso";

                        // Buscar el siguiente bloque (incluye bloques que inician exactamente cuando termina el actual)
                        var bloqueSiguiente = bloquesDelGrupo
                            .FirstOrDefault(b => b.FechaHoraInicio >= bloqueActual.FechaHoraFin && b.Id != bloqueActual.Id);

                        if (bloqueSiguiente != null)
                        {
                            grupoBloques.BloqueSiguiente = MapearBloqueDetalladoADto(bloqueSiguiente);
                        }
                        else
                        {
                            grupoBloques.Observacion = "Es el último bloque del año";
                        }
                    }
                    else
                    {
                        // No hay bloque en curso, buscar el próximo
                        var proximoBloque = bloquesDelGrupo
                            .FirstOrDefault(b => b.FechaHoraInicio > request.Fecha);

                        if (proximoBloque != null)
                        {
                            grupoBloques.BloqueSiguiente = MapearBloqueDetalladoADto(proximoBloque);
                            grupoBloques.EstadoConsulta = "EntreBloque";

                            var diasHasta = (proximoBloque.FechaHoraInicio - request.Fecha).Days;
                            grupoBloques.Observacion = $"Próximo bloque inicia en {diasHasta} días";
                        }
                        else
                        {
                            // Verificar si hay algún bloque anterior
                            var bloqueAnterior = bloquesDelGrupo
                                .LastOrDefault(b => b.FechaHoraFin < request.Fecha);

                            if (bloqueAnterior != null)
                            {
                                grupoBloques.EstadoConsulta = "EntreBloque";
                                grupoBloques.Observacion = "Todos los bloques del año han finalizado";
                            }
                            else
                            {
                                grupoBloques.EstadoConsulta = "SinBloques";
                                grupoBloques.Observacion = "No hay bloques programados para este grupo";
                            }
                        }
                    }
                }

                // Preparar respuesta
                var response = new ConsultaBloquesPorFechaResponse
                {
                    FechaConsulta = request.Fecha,
                    AreaId = request.AreaId,
                    GrupoId = request.GrupoId,
                    BloquesPorGrupo = gruposBloques
                };

                // Obtener nombres de área/grupo si se filtró
                if (request.AreaId.HasValue)
                {
                    response.NombreArea = bloques.FirstOrDefault()?.Grupo?.Area?.NombreGeneral;
                }

                if (request.GrupoId.HasValue)
                {
                    response.NombreGrupo = bloques.FirstOrDefault()?.Grupo?.Rol;
                }

                return new ApiResponse<ConsultaBloquesPorFechaResponse>(true, response, null);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al consultar bloques por fecha {Fecha}", request.Fecha);
                return new ApiResponse<ConsultaBloquesPorFechaResponse>(false, null, $"Error interno: {ex.Message}");
            }
        }

        private static BloqueDetalladoDto MapearBloqueDetalladoADto(BloquesReservacion bloque)
        {
            return new BloqueDetalladoDto
            {
                Id = bloque.Id,
                GrupoId = bloque.GrupoId,
                NombreGrupo = bloque.Grupo?.Rol ?? "",
                NombreArea = bloque.Grupo?.Area?.NombreGeneral ?? "",
                NumeroBloque = bloque.NumeroBloque,
                FechaHoraInicio = bloque.FechaHoraInicio,
                FechaHoraFin = bloque.FechaHoraFin,
                PersonasPorBloque = bloque.PersonasPorBloque,
                EsBloqueCola = bloque.EsBloqueCola,
                Estado = bloque.Estado,
                DuracionHoras = (int)(bloque.FechaHoraFin - bloque.FechaHoraInicio).TotalHours,
                FechaAprobacion = bloque.FechaAprobacion,
                NombreAprobador = bloque.AprobadoPorUser?.FullName,
                EmpleadosAsignados = bloque.AsignacionesBloque?
                    .Where(a => a.Estado != "Transferido")
                    .Select(a => new EmpleadoAsignadoBloqueDto
                    {
                        EmpleadoId = a.EmpleadoId,
                        NombreCompleto = a.Empleado.FullName ?? "",
                        Nomina = a.Empleado.Nomina?.ToString() ?? "",
                        PosicionEnBloque = a.PosicionEnBloque,
                        FechaIngreso = a.Empleado.FechaIngreso.HasValue
                            ? (DateTime?)a.Empleado.FechaIngreso.Value.ToDateTime(TimeOnly.MinValue)
                            : null,
                        AntiguedadAnios = a.Empleado.FechaIngreso.HasValue
                            ? DateTime.Now.Year - a.Empleado.FechaIngreso.Value.Year
                            : null,
                        Estado = a.Estado
                    }).ToList() ?? new List<EmpleadoAsignadoBloqueDto>(),
                EspaciosDisponibles = Math.Max(0, bloque.PersonasPorBloque - (bloque.AsignacionesBloque?.Count(a => a.Estado != "Transferido") ?? 0))
            };
        }

        private static BloqueDto MapearBloqueADto(BloquesReservacion bloque)
        {
            return new BloqueDto
            {
                Id = bloque.Id,
                GrupoId = bloque.GrupoId,
                NombreGrupo = bloque.Grupo?.Rol ?? "",
                NumeroBloque = bloque.NumeroBloque,
                FechaHoraInicio = bloque.FechaHoraInicio,
                FechaHoraFin = bloque.FechaHoraFin,
                PersonasPorBloque = bloque.PersonasPorBloque,
                EsBloqueCola = bloque.EsBloqueCola,
                Estado = bloque.Estado,
                EmpleadosAsignados = bloque.AsignacionesBloque?.Count(a => a.Estado == "Asignado") ?? 0,
                EspaciosDisponibles = bloque.PersonasPorBloque - (bloque.AsignacionesBloque?.Count(a => a.Estado == "Asignado") ?? 0)
            };
        }
        /// <summary>
        /// Elimina bloques de reservación para un año y grupos específicos
        /// </summary>
        public async Task<ApiResponse<EliminacionBloquesResponse>> EliminarBloquesAsync(
            int anioObjetivo,
            List<int>? grupoIds,
            int usuarioId)
        {
            try
            {
                _logger.LogInformation("Iniciando eliminación de bloques para año {Anio}", anioObjetivo);

                var response = new EliminacionBloquesResponse
                {
                    AnioObjetivo = anioObjetivo,
                    GrupoIds = grupoIds ?? new List<int>()
                };

                // Obtener el usuario que ejecuta
                var usuario = await _db.Users.FindAsync(usuarioId);
                response.UsuarioEjecuto = usuario?.FullName ?? $"Usuario {usuarioId}";

                // Construir query base
                var query = _db.BloquesReservacion
                    .Include(b => b.Grupo)
                    .Include(b => b.AsignacionesBloque)
                    .Where(b => b.AnioGeneracion == anioObjetivo);

                // Si se especifican grupos, filtrar
                if (grupoIds?.Any() == true)
                {
                    query = query.Where(b => grupoIds.Contains(b.GrupoId));
                }

                // Obtener bloques a eliminar
                var bloquesAEliminar = await query.ToListAsync();

                if (!bloquesAEliminar.Any())
                {
                    return new ApiResponse<EliminacionBloquesResponse>(false, response,
                        $"No se encontraron bloques para el año {anioObjetivo}");
                }

                // Agrupar por grupo para el detalle
                var gruposAfectados = bloquesAEliminar
                    .GroupBy(b => new { b.GrupoId, b.Grupo.Rol })
                    .Select(g => new DetalleGrupoEliminado
                    {
                        GrupoId = g.Key.GrupoId,
                        NombreGrupo = g.Key.Rol ?? $"Grupo {g.Key.GrupoId}",
                        BloquesEliminados = g.Count(),
                        TeniaBloquesAprobados = g.Any(b => b.Estado == "Aprobado")
                    })
                    .ToList();

                response.DetalleGrupos = gruposAfectados;
                response.GruposAfectados = gruposAfectados.Count;
                response.TotalBloquesEliminados = bloquesAEliminar.Count;

                // Verificar si hay bloques con reservaciones activas
                var bloquesConReservaciones = bloquesAEliminar
                    .Where(b => b.AsignacionesBloque != null && b.AsignacionesBloque.Any())
                    .ToList();

                if (bloquesConReservaciones.Any())
                {
                    var totalAsignaciones = bloquesConReservaciones
                        .Sum(b => b.AsignacionesBloque?.Count ?? 0);

                    _logger.LogWarning(
                        "Se eliminarán {TotalBloques} bloques que tienen {TotalAsignaciones} asignaciones de empleados",
                        bloquesConReservaciones.Count, totalAsignaciones);
                }

                // Eliminar primero las asignaciones (por la FK)
                var asignacionesAEliminar = bloquesAEliminar
                    .Where(b => b.AsignacionesBloque != null)
                    .SelectMany(b => b.AsignacionesBloque)
                    .ToList();

                if (asignacionesAEliminar.Any())
                {
                    _db.AsignacionesBloque.RemoveRange(asignacionesAEliminar);
                }

                // Eliminar los bloques
                _db.BloquesReservacion.RemoveRange(bloquesAEliminar);
                await _db.SaveChangesAsync();

                _logger.LogWarning(
                    "Eliminación completada por usuario {Usuario}. Año: {Anio}, Bloques eliminados: {Total}, Grupos afectados: {Grupos}",
                    usuarioId, anioObjetivo, response.TotalBloquesEliminados, response.GruposAfectados);

                // Crear notificaciones para los grupos afectados
                var areaIds = bloquesAEliminar
                    .Where(b => b.Grupo != null)
                    .Select(b => b.Grupo.AreaId)
                    .Distinct();

                foreach (var areaId in areaIds)
                {
                    await _notificacionesService.CrearNotificacionAsync(
                        Models.Enums.TiposDeNotificacionEnum.SistemaBloques,
                        "Bloques de Reservación Eliminados",
                        $"Los bloques de reservación del año {anioObjetivo} han sido eliminados por {response.UsuarioEjecuto}",
                        "Sistema",
                        null,
                        usuarioId,
                        areaId,
                        null,
                        "EliminacionBloques",
                        null,
                        new { AnioEliminado = anioObjetivo, TotalEliminados = response.TotalBloquesEliminados }
                    );
                }

                return new ApiResponse<EliminacionBloquesResponse>(true, response,
                    $"Se eliminaron {response.TotalBloquesEliminados} bloques de {response.GruposAfectados} grupos");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al eliminar bloques de reservación");
                return new ApiResponse<EliminacionBloquesResponse>(false, null, $"Error inesperado: {ex.Message}");
            }
        }

        /// <summary>
        /// Obtiene reporte de empleados que no respondieron (estado NoRespondio)
        /// </summary>
        public async Task<ApiResponse<EmpleadosNoRespondioResponse>> ObtenerEmpleadosNoRespondieronAsync(
            int anioObjetivo,
            int? areaId = null,
            int? grupoId = null)
        {
            try
            {
                // Consultar asignaciones con estado NoRespondio
                var query = _db.AsignacionesBloque
                    .Include(a => a.Empleado)
                    .Include(a => a.Bloque)
                    .ThenInclude(b => b.Grupo)
                    .ThenInclude(g => g.Area)
                    .Where(a => a.Estado == "NoRespondio"
                        && a.Bloque.AnioGeneracion == anioObjetivo);

                // Aplicar filtros
                if (areaId.HasValue)
                {
                    query = query.Where(a => a.Bloque.Grupo.AreaId == areaId.Value);
                }

                if (grupoId.HasValue)
                {
                    query = query.Where(a => a.Bloque.GrupoId == grupoId.Value);
                }

                var asignaciones = await query
                    .OrderBy(a => a.Bloque.EsBloqueCola) // Primero bloques regulares, luego cola
                    .ThenBy(a => a.Bloque.NumeroBloque)
                    .ThenBy(a => a.Empleado.FullName)
                    .ToListAsync();

                var empleadosNoRespondio = asignaciones.Select(a => new EmpleadoNoRespondioDto
                {
                    EmpleadoId = a.EmpleadoId,
                    NombreCompleto = a.Empleado.FullName,
                    Nomina = a.Empleado.Nomina?.ToString() ?? "",
                    Maquina = a.Empleado.Maquina,
                    GrupoId = a.Bloque.GrupoId,
                    NombreGrupo = a.Bloque.Grupo?.Rol ?? "",
                    AreaId = a.Bloque.Grupo?.AreaId ?? 0,
                    NombreArea = a.Bloque.Grupo?.Area?.NombreGeneral ?? "",
                    BloqueId = a.BloqueId,
                    NumeroBloque = a.Bloque.NumeroBloque,
                    EsBloqueCola = a.Bloque.EsBloqueCola,
                    FechaLimiteBloque = a.Bloque.FechaHoraFin,
                    FechaAsignacion = a.FechaAsignacion,
                    Observaciones = a.Observaciones,
                    RequiereAccionUrgente = a.Bloque.EsBloqueCola // Si es del bloque cola, es urgente
                }).ToList();

                // Agrupar por tipo de bloque para el resumen
                var enBloquesRegulares = empleadosNoRespondio.Count(e => !e.EsBloqueCola);
                var enBloqueCola = empleadosNoRespondio.Count(e => e.EsBloqueCola);

                var response = new EmpleadosNoRespondioResponse
                {
                    Anio = anioObjetivo,
                    TotalEmpleadosNoRespondio = empleadosNoRespondio.Count,
                    EmpleadosEnBloquesRegulares = enBloquesRegulares,
                    EmpleadosEnBloqueCola = enBloqueCola,
                    Empleados = empleadosNoRespondio,
                    FechaReporte = DateTime.Now
                };

                return new ApiResponse<EmpleadosNoRespondioResponse>(true, response,
                    $"Se encontraron {response.TotalEmpleadosNoRespondio} empleados que no respondieron");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener empleados que no respondieron");
                return new ApiResponse<EmpleadosNoRespondioResponse>(false, null, $"Error inesperado: {ex.Message}");
            }
        }
    }
}