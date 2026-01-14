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

                    // Obtener todos los registros de la tabla de staging
                    var registrosActualizar = await context.PermisosEIncapacidadesSAPActualizar
                        .AsNoTracking()
                        .ToListAsync();

                    _logger.LogInformation($"Se encontraron {registrosActualizar.Count} registros en PermisosEIncapacidadesSAP_Actualizar");

                    foreach (var registro in registrosActualizar)
                    {
                        try
                        {
                            // VALIDACIÓN 1: Verificar que campos obligatorios no sean null o vacíos
                            if (string.IsNullOrWhiteSpace(registro.Nomina))
                            {
                                _logger.LogWarning($"Registro con Nómina vacía o null");
                                erroresConversion++;
                                continue;
                            }

                            if (string.IsNullOrWhiteSpace(registro.Desde))
                            {
                                _logger.LogWarning($"Fecha Desde vacía para nómina {registro.Nomina}");
                                erroresConversion++;
                                continue;
                            }

                            if (string.IsNullOrWhiteSpace(registro.Hasta))
                            {
                                _logger.LogWarning($"Fecha Hasta vacía para nómina {registro.Nomina}");
                                erroresConversion++;
                                continue;
                            }

                            if (string.IsNullOrWhiteSpace(registro.ClAbPre))
                            {
                                _logger.LogWarning($"ClAbPre vacío para nómina {registro.Nomina}");
                                erroresConversion++;
                                continue;
                            }

                            // CONVERSIÓN: Nomina a int
                            if (!int.TryParse(registro.Nomina.Trim(), out int nomina))
                            {
                                _logger.LogWarning($"Nómina inválida: {registro.Nomina}");
                                erroresConversion++;
                                continue;
                            }

                            // CONVERSIÓN: Desde a DateOnly (soportar múltiples formatos)
                            DateOnly desde;
                            if (!DateOnly.TryParseExact(registro.Desde.Trim(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out desde))
                            {
                                if (!DateOnly.TryParse(registro.Desde.Trim(), out desde))
                                {
                                    _logger.LogWarning($"Fecha Desde inválida para nómina {nomina}: {registro.Desde}");
                                    erroresConversion++;
                                    continue;
                                }
                            }

                            // CONVERSIÓN: Hasta a DateOnly (soportar múltiples formatos)
                            DateOnly hasta;
                            if (!DateOnly.TryParseExact(registro.Hasta.Trim(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out hasta))
                            {
                                if (!DateOnly.TryParse(registro.Hasta.Trim(), out hasta))
                                {
                                    _logger.LogWarning($"Fecha Hasta inválida para nómina {nomina}: {registro.Hasta}");
                                    erroresConversion++;
                                    continue;
                                }
                            }

                            // CONVERSIÓN: ClAbPre a int
                            if (!int.TryParse(registro.ClAbPre.Trim(), out int clAbPre))
                            {
                                _logger.LogWarning($"ClAbPre inválido para nómina {nomina}: {registro.ClAbPre}");
                                erroresConversion++;
                                continue;
                            }

                            // VERIFICAR DUPLICADOS: Combinación única
                            var existente = await context.PermisosEIncapacidadesSAP
                                .AsNoTracking()
                                .AnyAsync(p =>
                                    p.Nomina == nomina &&
                                    p.Desde == desde &&
                                    p.Hasta == hasta &&
                                    p.ClAbPre == clAbPre &&
                                    p.EsRegistroManual == false); // Solo verificar contra registros de SAP

                            if (existente)
                            {
                                registrosOmitidos++;
                                continue;
                            }

                            // VERIFICAR: Que el empleado exista en Users
                            var empleadoExiste = await context.Users
                                .AsNoTracking()
                                .AnyAsync(u => u.Nomina == nomina);

                            if (!empleadoExiste)
                            {
                                _logger.LogWarning($"Empleado con nómina {nomina} no encontrado en Users");
                                erroresConversion++;
                                continue;
                            }

                            // CONVERSIÓN: Dias (remover decimales, convertir a int)
                            double? dias = null;
                            if (!string.IsNullOrWhiteSpace(registro.Dias))
                            {
                                // Remover ".00" y convertir
                                string diasLimpio = registro.Dias.Trim().Replace(".00", "").Replace(",00", "");
                                if (double.TryParse(diasLimpio, NumberStyles.Any, CultureInfo.InvariantCulture, out double diasParsed))
                                {
                                    dias = Math.Floor(diasParsed); // Convertir a entero (quitar decimales)
                                }
                            }

                            // CONVERSIÓN: DiaNat (remover decimales, convertir a int)
                            double? diaNat = null;
                            if (!string.IsNullOrWhiteSpace(registro.DiaNat))
                            {
                                string diaNatLimpio = registro.DiaNat.Trim().Replace(".00", "").Replace(",00", "");
                                if (double.TryParse(diaNatLimpio, NumberStyles.Any, CultureInfo.InvariantCulture, out double diaNatParsed))
                                {
                                    diaNat = Math.Floor(diaNatParsed); // Convertir a entero
                                }
                            }

                            // CREAR NUEVO REGISTRO en PermisosEIncapacidadesSAP
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
                                EsRegistroManual = false, // Viene de SAP
                                FechaRegistro = DateTime.Now,
                                UsuarioRegistraId = null,
                                EstadoSolicitud = "Aprobado", // Pre-aprobado
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

                    // GUARDAR CAMBIOS si hay registros nuevos
                    if (registrosInsertados > 0)
                    {
                        await context.SaveChangesAsync();
                    }

                    _logger.LogInformation(
                        $"Sincronización de permisos completada. " +
                        $"Insertados: {registrosInsertados}, " +
                        $"Omitidos (duplicados): {registrosOmitidos}, " +
                        $"Errores: {erroresConversion}");
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error al sincronizar permisos desde PermisosEIncapacidadesSAP_Actualizar");
                }
            }
        }
    }
}