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
            _logger.LogInformation("Servicio de sincronización de permisos iniciado");

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    await SincronizarPermisos();
                    _logger.LogInformation($"Próxima sincronización de permisos en {_intervalo.TotalMinutes} minutos");

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
                    _logger.LogError(ex, "Error en el servicio de sincronización de permisos");

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

            _logger.LogInformation("Servicio de sincronización de permisos detenido");
        }

        private async Task SincronizarPermisos()
        {
            using (var scope = _serviceProvider.CreateScope())
            {
                var context = scope.ServiceProvider.GetRequiredService<FreeTimeDbContext>();

                try
                {
                    int registrosInsertados = 0;
                    int registrosOmitidos = 0;
                    int erroresConversion = 0;

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
                                    erroresConversion++;
                                    continue;
                                }

                                // Conversiones
                                if (!int.TryParse(registro.Nomina.Trim(), out int nomina))
                                {
                                    _logger.LogWarning($"Nómina inválida: {registro.Nomina}");
                                    erroresConversion++;
                                    continue;
                                }

                                DateOnly desde;
                                if (!DateOnly.TryParseExact(registro.Desde.Trim(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out desde))
                                {
                                    if (!DateOnly.TryParse(registro.Desde.Trim(), out desde))
                                    {
                                        erroresConversion++;
                                        continue;
                                    }
                                }

                                DateOnly hasta;
                                if (!DateOnly.TryParseExact(registro.Hasta.Trim(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out hasta))
                                {
                                    if (!DateOnly.TryParse(registro.Hasta.Trim(), out hasta))
                                    {
                                        erroresConversion++;
                                        continue;
                                    }
                                }

                                if (!int.TryParse(registro.ClAbPre.Trim(), out int clAbPre))
                                {
                                    erroresConversion++;
                                    continue;
                                }

                                // Verificar duplicado
                                var existente = await context.PermisosEIncapacidadesSAP
                                    .AsNoTracking()
                                    .AnyAsync(p =>
                                        p.Nomina == nomina &&
                                        p.Desde == desde &&
                                        p.Hasta == hasta &&
                                        p.ClAbPre == clAbPre &&
                                        p.EsRegistroManual == false);

                                if (existente)
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
                                    _logger.LogWarning($"Empleado con nómina {nomina} no encontrado en Users");
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
                                    EstadoSolicitud = "Aprobado",
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
                                _logger.LogError(ex, $"Error procesando registro Nómina: {registro.Nomina ?? "NULL"}");
                                erroresConversion++;
                            }
                        }

                        // Guardar cada lote
                        if (registrosInsertados > 0)
                        {
                            try
                            {
                                await context.SaveChangesAsync();
                                _logger.LogInformation($"Lote guardado con {registrosInsertados} registros");
                            }
                            catch (Exception ex)
                            {
                                _logger.LogError(ex, "Error al guardar lote en PermisosEIncapacidadesSAP");
                                throw;
                            }
                        }
                    }

                    // Limpiar tabla SOLO si se insertaron registros exitosamente
                    if (registrosInsertados > 0)
                    {
                        try
                        {
                            var filasAfectadas = await context.Database.ExecuteSqlRawAsync("TRUNCATE TABLE PermisosEIncapacidadesSAP_Actualizar");
                            _logger.LogInformation($"Tabla PermisosEIncapacidadesSAP_Actualizar limpiada. Filas afectadas: {filasAfectadas}");
                        }
                        catch (Exception ex)
                        {
                            _logger.LogError(ex, "Error al limpiar tabla PermisosEIncapacidadesSAP_Actualizar - los registros se procesarán nuevamente en la próxima ejecución");
                        }
                    }

                    _logger.LogInformation(
                        $"Sincronización de permisos completada. " +
                        $"Insertados: {registrosInsertados}, " +
                        $"Omitidos (duplicados): {registrosOmitidos}, " +
                        $"Errores: {erroresConversion}");
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error crítico al sincronizar permisos desde PermisosEIncapacidadesSAP_Actualizar");
                    throw;
                }
            }
        }
    }
}