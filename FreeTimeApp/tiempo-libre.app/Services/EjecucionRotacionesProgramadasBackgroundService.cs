using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace tiempo_libre.Services
{
    /// <summary>
    /// Corre cada hora buscando rotaciones agendadas cuya FechaEjecucion ya
    /// llegó y las aplica llamando a RotacionesProgramadasService.EjecutarPendientesAsync.
    /// </summary>
    public class EjecucionRotacionesProgramadasBackgroundService : BackgroundService
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly ILogger<EjecucionRotacionesProgramadasBackgroundService> _logger;
        private readonly TimeSpan _intervalo = TimeSpan.FromHours(1);

        public EjecucionRotacionesProgramadasBackgroundService(
            IServiceProvider serviceProvider,
            ILogger<EjecucionRotacionesProgramadasBackgroundService> logger)
        {
            _serviceProvider = serviceProvider;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("Ejecución de rotaciones programadas iniciada (cada {H}h)", _intervalo.TotalHours);

            // Espera corta al arranque para no colisionar con otras migraciones.
            try { await Task.Delay(TimeSpan.FromMinutes(2), stoppingToken); }
            catch (TaskCanceledException) { return; }

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    using var scope = _serviceProvider.CreateScope();
                    var service = scope.ServiceProvider.GetRequiredService<RotacionesProgramadasService>();
                    var n = await service.EjecutarPendientesAsync();
                    if (n > 0)
                        _logger.LogInformation("✅ {N} rotación(es) programada(s) aplicada(s) en este tick.", n);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "❌ Error en tick de rotaciones programadas.");
                }

                try { await Task.Delay(_intervalo, stoppingToken); }
                catch (TaskCanceledException) { break; }
            }

            _logger.LogInformation("Ejecución de rotaciones programadas detenida.");
        }
    }
}
