using System;
using System.Globalization;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using tiempo_libre.Models;

namespace tiempo_libre.Services
{
    public class SincronizacionPermisosBackgroundService : BackgroundService
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly ILogger<SincronizacionPermisosBackgroundService> _logger;
        private readonly TimeSpan _intervalo = TimeSpan.FromMinutes(5);

        public SincronizacionPermisosBackgroundService(
            IServiceProvider serviceProvider,
            ILogger<SincronizacionPermisosBackgroundService> logger)
        {
            _serviceProvider = serviceProvider;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("Servicio de sincronizaci�n de permisos iniciado");

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    await SincronizarPermisos();
                    _logger.LogInformation($"Pr�xima sincronizaci�n de permisos en {_intervalo.TotalMinutes} minutos");

                    try
                    {
                        await Task.Delay(_intervalo, stoppingToken);
                    }
                    catch (TaskCanceledException)
                    {
                        break;
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error en el servicio de sincronizaci�n de permisos");

                    try
                    {
                        await Task.Delay(TimeSpan.FromMinutes(5), stoppingToken);
                    }
                    catch (TaskCanceledException)
                    {
                        break;
                    }
                }
            }

            _logger.LogInformation("Servicio de sincronizaci�n de permisos detenido");
        }

        private async Task SincronizarPermisos()
        {
            using (var scope = _serviceProvider.CreateScope())
            {
                var context = scope.ServiceProvider.GetRequiredService<FreeTimeDbContext>();

                try
                {
                    int registrosInsertados = 0;
                    int registrosActualizados = 0;
                    int registrosOmitidos = 0;
                    int erroresConversion = 0;
                    int muestraParseo = 0;
                    bool huboFalloAlGuardar = false;

                    // La tabla de staging se TRUNCA al terminar, asi que una fila
                    // descartada aqui se pierde para siempre: no vuelve a llegar en
                    // el siguiente Excel si RH solo sube los movimientos nuevos.
                    // Antes solo se contaban; ahora se deja constancia de cada una
                    // con su motivo para poder recapturarlas.
                    var rechazados = new List<string>();

                    // Obtener registros con READ UNCOMMITTED para evitar bloqueos
                    var registrosActualizar = await context.PermisosEIncapacidadesSAPActualizar
                        .FromSqlRaw("SELECT * FROM PermisosEIncapacidadesSAP_Actualizar WITH (NOLOCK)")
                        .ToListAsync();

                    _logger.LogInformation($"Se encontraron {registrosActualizar.Count} registros en PermisosEIncapacidadesSAP_Actualizar");

                    if (registrosActualizar.Count == 0)
                    {
                        _logger.LogInformation("No hay registros nuevos para procesar");
                        return;
                    }

                    // Procesar en lotes para evitar problemas de memoria
                    var lotes = registrosActualizar.Chunk(100);

                    foreach (var lote in lotes)
                    {
                        foreach (var registro in lote)
                        {
                            try
                            {
                                // Validaciones
                                if (string.IsNullOrWhiteSpace(registro.Nomina) ||
                                    string.IsNullOrWhiteSpace(registro.Desde) ||
                                    string.IsNullOrWhiteSpace(registro.Hasta) ||
                                    string.IsNullOrWhiteSpace(registro.ClAbPre))
                                {
                                    rechazados.Add(
                                        $"Fila incompleta: Nomina='{registro.Nomina}' Desde='{registro.Desde}' " +
                                        $"Hasta='{registro.Hasta}' ClAbPre='{registro.ClAbPre}'");
                                    erroresConversion++;
                                    continue;
                                }

                                // Conversiones
                                if (!int.TryParse(registro.Nomina.Trim(), out int nomina))
                                {
                                    rechazados.Add($"Nomina '{registro.Nomina}' no es numerica");
                                    _logger.LogWarning($"N�mina inv�lida: {registro.Nomina}");
                                    erroresConversion++;
                                    continue;
                                }

                                if (!TryParsearFecha(registro.Desde, out DateOnly desde))
                                {
                                    rechazados.Add($"Nomina={registro.Nomina} ClAbPre={registro.ClAbPre}: fecha Desde '{registro.Desde}' no se pudo interpretar");
                                    erroresConversion++;
                                    continue;
                                }

                                if (!TryParsearFecha(registro.Hasta, out DateOnly hasta))
                                {
                                    rechazados.Add($"Nomina={registro.Nomina} ClAbPre={registro.ClAbPre}: fecha Hasta '{registro.Hasta}' no se pudo interpretar");
                                    erroresConversion++;
                                    continue;
                                }

                                if (!int.TryParse(registro.ClAbPre.Trim(), out int clAbPre))
                                {
                                    rechazados.Add($"Nomina={registro.Nomina}: ClAbPre '{registro.ClAbPre}' no es numerico");
                                    erroresConversion++;
                                    continue;
                                }

                                // Muestra de control: permite cotejar contra el Excel
                                // que el texto de SAP se esta interpretando con el
                                // orden dia-mes correcto, sin abrir la base de datos.
                                if (muestraParseo < 3)
                                {
                                    muestraParseo++;
                                    _logger.LogInformation(
                                        "Muestra de parseo #{N}: Nomina={Nomina} Desde '{DesdeRaw}' -> {Desde:yyyy-MM-dd} | Hasta '{HastaRaw}' -> {Hasta:yyyy-MM-dd}",
                                        muestraParseo, nomina, registro.Desde, desde, registro.Hasta, hasta);
                                }

                                // Registro previo del MISMO permiso. La identidad de un
                                // permiso es (Nomina, Desde, ClAbPre): un empleado no
                                // puede tener dos ausencias del mismo tipo empezando el
                                // mismo dia. Hasta NO forma parte de la llave porque es
                                // justo lo que cambia cuando SAP prolonga una incapacidad.
                                //
                                // Antes la comparacion incluia Hasta: al reexportar una
                                // incapacidad prolongada no encontraba coincidencia e
                                // insertaba una SEGUNDA fila. El calendario se queda con
                                // la primera que devuelve la consulta, asi que la app podia
                                // seguir mostrando el periodo corto indefinidamente.
                                var previo = await context.PermisosEIncapacidadesSAP
                                    .Where(p =>
                                        p.Nomina == nomina &&
                                        p.Desde == desde &&
                                        p.ClAbPre == clAbPre &&
                                        p.EsRegistroManual == false)
                                    .OrderByDescending(p => p.Hasta)
                                    .FirstOrDefaultAsync();

                                // Punto 6: si el jefe ya extendio este permiso desde la
                                // app, el Excel no lo pisa.
                                if (previo != null && previo.ProtegidoPorExtension)
                                {
                                    _logger.LogInformation(
                                        "Omitido por proteccion de extension: Nomina={Nomina} Desde={Desde} ClAbPre={ClAbPre}",
                                        nomina, desde, clAbPre);
                                    registrosOmitidos++;
                                    continue;
                                }

                                if (previo != null && previo.Hasta == hasta)
                                {
                                    registrosOmitidos++;
                                    continue;
                                }

                                // Verificar que el empleado exista
                                var empleadoExiste = await context.Users
                                    .AsNoTracking()
                                    .AnyAsync(u => u.Nomina == nomina);

                                if (!empleadoExiste)
                                {
                                    rechazados.Add(
                                        $"Nomina={nomina} ClAbPre={clAbPre} {desde:yyyy-MM-dd}..{hasta:yyyy-MM-dd}: " +
                                        "el empleado no existe en Users");
                                    erroresConversion++;
                                    continue;
                                }

                                // Convertir Dias y DiaNat
                                double? dias = null;
                                if (!string.IsNullOrWhiteSpace(registro.Dias))
                                {
                                    string diasLimpio = registro.Dias.Trim().Replace(".00", "").Replace(",00", "");
                                    if (double.TryParse(diasLimpio, NumberStyles.Any, CultureInfo.InvariantCulture, out double diasParsed))
                                    {
                                        dias = Math.Floor(diasParsed);
                                    }
                                }

                                double? diaNat = null;
                                if (!string.IsNullOrWhiteSpace(registro.DiaNat))
                                {
                                    string diaNatLimpio = registro.DiaNat.Trim().Replace(".00", "").Replace(",00", "");
                                    if (double.TryParse(diaNatLimpio, NumberStyles.Any, CultureInfo.InvariantCulture, out double diaNatParsed))
                                    {
                                        diaNat = Math.Floor(diaNatParsed);
                                    }
                                }

                                // Mismo permiso con distinto Hasta: SAP lo prolongo (o lo
                                // acorto). Se ACTUALIZA la fila existente en vez de crear
                                // una paralela que competiria con ella en el calendario.
                                if (previo != null)
                                {
                                    _logger.LogInformation(
                                        "Permiso actualizado desde SAP: Nomina={Nomina} ClAbPre={ClAbPre} Desde={Desde} Hasta {HastaAnterior} -> {HastaNuevo}",
                                        nomina, clAbPre, desde, previo.Hasta, hasta);

                                    previo.Hasta = hasta;
                                    previo.Dias = dias;
                                    previo.DiaNat = diaNat;
                                    if (!string.IsNullOrWhiteSpace(registro.ClaseAbsentismo))
                                        previo.ClaseAbsentismo = registro.ClaseAbsentismo.Trim();

                                    registrosActualizados++;
                                    continue;
                                }

                                // Crear nuevo registro
                                var nuevoPermiso = new PermisosEIncapacidadesSAP
                                {
                                    Nomina = nomina,
                                    Nombre = !string.IsNullOrWhiteSpace(registro.Nombre) ? registro.Nombre.Trim() : string.Empty,
                                    Posicion = !string.IsNullOrWhiteSpace(registro.Posicion) ? registro.Posicion.Trim() : null,
                                    Desde = desde,
                                    Hasta = hasta,
                                    ClAbPre = clAbPre,
                                    ClaseAbsentismo = !string.IsNullOrWhiteSpace(registro.ClaseAbsentismo) ? registro.ClaseAbsentismo.Trim() : null,
                                    Dias = dias,
                                    DiaNat = diaNat,
                                    Observaciones = null,
                                    EsRegistroManual = false,
                                    FechaRegistro = DateTime.Now,
                                    UsuarioRegistraId = null,
                                    // "Aprobada" con A: todos los filtros del backend
                                    // comparan contra esa forma. Escribir "Aprobado"
                                    // solo funcionaba de rebote porque estas filas
                                    // tienen FechaSolicitud nula.
                                    EstadoSolicitud = "Aprobada",
                                    DelegadoSolicitanteId = null,
                                    JefeAprobadorId = null,
                                    MotivoRechazo = null,
                                    FechaSolicitud = null,
                                    FechaRespuesta = null
                                };

                                context.PermisosEIncapacidadesSAP.Add(nuevoPermiso);
                                registrosInsertados++;
                            }
                            catch (Exception ex)
                            {
                                _logger.LogError(ex, $"Error procesando registro N�mina: {registro.Nomina ?? "NULL"}");
                                erroresConversion++;
                            }
                        }

                        // Guardar cada lote (altas y actualizaciones pendientes)
                        if (context.ChangeTracker.HasChanges())
                        {
                            try
                            {
                                var guardados = await context.SaveChangesAsync();
                                _logger.LogInformation($"Lote guardado: {guardados} filas afectadas");
                            }
                            catch (Exception ex)
                            {
                                // Un lote que truena ya no aborta la sincronizacion
                                // entera. Antes este throw dejaba sin procesar TODOS
                                // los lotes siguientes: un solo registro invalido
                                // (un nombre mas largo de lo permitido, por ejemplo)
                                // podia esconder cientos de permisos buenos, y el
                                // sintoma era justo este — incapacidades que nunca
                                // aparecen en la app aunque esten en el Excel.
                                _logger.LogError(ex,
                                    "Error al guardar lote en PermisosEIncapacidadesSAP. Nominas del lote: {Nominas}",
                                    string.Join(", ", lote.Select(r => r.Nomina)));

                                huboFalloAlGuardar = true;
                                context.ChangeTracker.Clear();
                            }
                        }
                    }

                    // Las filas descartadas se pierden al truncar. Se dejan en el log
                    // ANTES del TRUNCATE, con nomina y motivo, para poder recapturarlas.
                    if (rechazados.Count > 0)
                    {
                        _logger.LogError(
                            "SINCRONIZACION DE PERMISOS: {Total} fila(s) del Excel NO se cargaron y se perderan al limpiar el staging:\n{Detalle}",
                            rechazados.Count, string.Join("\n", rechazados));
                    }

                    // Si algun lote no se pudo guardar, NO se limpia el staging: esas
                    // filas siguen ahi para el siguiente intento en vez de perderse.
                    if (huboFalloAlGuardar)
                    {
                        _logger.LogError(
                            "SINCRONIZACION DE PERMISOS: hubo lotes que no se guardaron. " +
                            "No se limpia PermisosEIncapacidadesSAP_Actualizar para no perder esas filas.");
                    }

                    // Limpiar tabla SOLO si se proceso algo exitosamente
                    if ((registrosInsertados > 0 || registrosActualizados > 0) && !huboFalloAlGuardar)
                    {
                        try
                        {
                            var filasAfectadas = await context.Database.ExecuteSqlRawAsync("TRUNCATE TABLE PermisosEIncapacidadesSAP_Actualizar");
                            _logger.LogInformation($"Tabla PermisosEIncapacidadesSAP_Actualizar limpiada. Filas afectadas: {filasAfectadas}");
                        }
                        catch (Exception ex)
                        {
                            _logger.LogError(ex, "Error al limpiar tabla PermisosEIncapacidadesSAP_Actualizar - los registros se procesar�n nuevamente en la pr�xima ejecuci�n");
                        }
                    }

                    _logger.LogInformation(
                        $"Sincronizaci�n de permisos completada. " +
                        $"Insertados: {registrosInsertados}, " +
                        $"Actualizados: {registrosActualizados}, " +
                        $"Omitidos (sin cambios): {registrosOmitidos}, " +
                        $"Descartados: {erroresConversion}");
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error cr�tico al sincronizar permisos desde PermisosEIncapacidadesSAP_Actualizar");
                    throw;
                }
            }
        }

        // SAP entrega las fechas como texto en la tabla de staging y no siempre
        // con el mismo formato. Antes se intentaba "yyyy-MM-dd" y, si fallaba,
        // se caía a DateOnly.TryParse a secas: ese overload usa la cultura del
        // SERVIDOR. Con cultura en-US un "05/07/2026" (5 de julio) se guardaba
        // como 7 de mayo, sin error y sin aviso — el permiso aparecía en el mes
        // equivocado. Y con día > 12 ("25/07/2026") no parseaba y la fila se
        // descartaba en silencio.
        //
        // Ahora los formatos son explícitos e invariantes. Se asume orden
        // día-mes (formato SAP/México); NO se acepta MM/dd/yyyy porque es
        // indistinguible de dd/MM/yyyy y adivinar es justo lo que causó el bug.
        private static readonly string[] _formatosFecha =
        {
            "yyyy-MM-dd", "yyyy/MM/dd", "yyyyMMdd",
            "dd/MM/yyyy", "dd-MM-yyyy", "dd.MM.yyyy",
            "d/M/yyyy",   "d-M-yyyy",   "d.M.yyyy",
            "dd/MM/yy",   "d/M/yy",
        };

        private static readonly string[] _formatosFechaHora =
        {
            "yyyy-MM-dd HH:mm:ss", "yyyy-MM-ddTHH:mm:ss", "yyyy-MM-dd HH:mm",
            "dd/MM/yyyy HH:mm:ss", "dd/MM/yyyy HH:mm",
        };

        private static bool TryParsearFecha(string? valor, out DateOnly fecha)
        {
            fecha = default;
            if (string.IsNullOrWhiteSpace(valor)) return false;

            var v = valor.Trim();

            if (DateOnly.TryParseExact(v, _formatosFecha, CultureInfo.InvariantCulture, DateTimeStyles.None, out fecha))
                return true;

            if (DateTime.TryParseExact(v, _formatosFechaHora, CultureInfo.InvariantCulture, DateTimeStyles.None, out var dt))
            {
                fecha = DateOnly.FromDateTime(dt);
                return true;
            }

            // Último recurso: cultura mexicana (día-mes), explícita y estable,
            // en vez de la cultura del servidor que puede cambiar sin avisar.
            if (DateOnly.TryParse(v, CultureInfo.GetCultureInfo("es-MX"), DateTimeStyles.None, out fecha))
                return true;

            return false;
        }
    }
}