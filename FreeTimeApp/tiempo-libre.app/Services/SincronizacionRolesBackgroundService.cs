using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using tiempo_libre.DTOs;
using tiempo_libre.Models;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace tiempo_libre.Services
{
    public class SincronizacionRolesBackgroundService : BackgroundService
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly ILogger<SincronizacionRolesBackgroundService> _logger;
        private readonly TimeSpan _intervalo = TimeSpan.FromMinutes(6);

        public SincronizacionRolesBackgroundService(
            IServiceProvider serviceProvider,
            ILogger<SincronizacionRolesBackgroundService> logger)
        {
            _serviceProvider = serviceProvider;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("Servicio de sincronización de roles iniciado");

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    await SincronizarRoles();
                    _logger.LogInformation($"Próxima sincronización en {_intervalo.TotalHours} horas");

                    try
                    {
                        await Task.Delay(_intervalo, stoppingToken);
                    }
                    catch (TaskCanceledException)
                    {
                        // Cancelación normal durante el shutdown
                        break;
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error en el servicio de sincronización de roles");

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

            _logger.LogInformation("Servicio de sincronización de roles detenido");
        }

        private async Task SincronizarRoles()
        {
            using (var scope = _serviceProvider.CreateScope())
            {
                var sincronizacionService = scope.ServiceProvider.GetRequiredService<SincronizacionRolesService>();

                try
                {
                    var registrosActualizados = await sincronizacionService.SincronizarRolesDesdeRegla();

                    if (registrosActualizados > 0)
                    {
                        _logger.LogInformation($"✅ Sincronización completada. {registrosActualizados} roles actualizados.");
                    }
                    else
                    {
                        _logger.LogInformation($"✅ Sincronización completada. No hay cambios que aplicar.");
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "❌ Error al sincronizar roles desde RolesEmpleadosSAP");
                }
            }
        }

        private string RemoverAcentos(string texto)
        {
            if (string.IsNullOrEmpty(texto))
                return texto;

            var normalized = texto.Normalize(System.Text.NormalizationForm.FormD);
            var sb = new System.Text.StringBuilder();

            foreach (var c in normalized)
            {
                if (System.Globalization.CharUnicodeInfo.GetUnicodeCategory(c) != System.Globalization.UnicodeCategory.NonSpacingMark)
                {
                    sb.Append(c);
                }
            }

            return sb.ToString().Normalize(System.Text.NormalizationForm.FormC);
        }

    }
}