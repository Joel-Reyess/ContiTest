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
                var context = scope.ServiceProvider.GetRequiredService<FreeTimeDbContext>();

                try
                {
                    int registrosActualizados = 0;

                    var rolesEmpleadosSAP = await context.RolesEmpleadosSAP
                        .Where(r => !string.IsNullOrEmpty(r.Regla))
                        .ToListAsync();

                    foreach (var rolSAP in rolesEmpleadosSAP)
                    {
                        // Actualizar Empleados
                        var empleado = await context.Empleados
                            .FirstOrDefaultAsync(e => e.Nomina == rolSAP.Nomina);

                        if (empleado != null)
                        {
                            bool cambios = false;

                            if (!string.IsNullOrEmpty(rolSAP.Regla) && empleado.Rol != rolSAP.Regla)
                            {
                                empleado.Rol = rolSAP.Regla;
                                cambios = true;
                            }

                            if (!string.IsNullOrEmpty(rolSAP.UnidadOrganizativa) && empleado.UnidadOrganizativa != rolSAP.UnidadOrganizativa)
                            {
                                empleado.UnidadOrganizativa = rolSAP.UnidadOrganizativa;
                                cambios = true;
                            }

                            if (!string.IsNullOrEmpty(rolSAP.EncargadoRegistro) && empleado.EncargadoRegistro != rolSAP.EncargadoRegistro)
                            {
                                empleado.EncargadoRegistro = rolSAP.EncargadoRegistro;
                                cambios = true;
                            }

                            if (cambios)
                            {
                                registrosActualizados++;
                            }
                        }

                        // ✅ CRÍTICO: Actualizar Users con validación de área
                        var user = await context.Users
                            .FirstOrDefaultAsync(u => u.Nomina == rolSAP.Nomina);

                        if (user != null && !string.IsNullOrEmpty(rolSAP.Regla))
                        {
                            // ✅ PASO 1: Buscar el área correcta por UnidadOrganizativa
                            Area areaCorrecta = null;
                            if (!string.IsNullOrEmpty(rolSAP.UnidadOrganizativa))
                            {
                                areaCorrecta = await context.Areas
                                    .FirstOrDefaultAsync(a => a.UnidadOrganizativaSap == rolSAP.UnidadOrganizativa);
                            }

                            // ✅ PASO 2: Buscar el grupo que coincida con Regla Y pertenezca al área correcta
                            Grupo grupoCorrect = null;
                            if (areaCorrecta != null)
                            {
                                grupoCorrect = await context.Grupos
                                    .FirstOrDefaultAsync(g => g.Rol == rolSAP.Regla && g.AreaId == areaCorrecta.AreaId);
                            }
                            else
                            {
                                // Fallback: buscar grupo solo por Rol (si no hay área)
                                grupoCorrect = await context.Grupos
                                    .FirstOrDefaultAsync(g => g.Rol == rolSAP.Regla);
                            }

                            // ✅ PASO 3: Actualizar SOLO si encontramos grupo válido
                            if (grupoCorrect != null)
                            {
                                bool cambiosUser = false;

                                if (user.GrupoId != grupoCorrect.GrupoId)
                                {
                                    user.GrupoId = grupoCorrect.GrupoId;
                                    cambiosUser = true;
                                }

                                if (user.AreaId != grupoCorrect.AreaId)
                                {
                                    user.AreaId = grupoCorrect.AreaId;
                                    cambiosUser = true;
                                }

                                if (cambiosUser)
                                {
                                    user.UpdatedAt = DateTime.UtcNow;
                                    registrosActualizados++;
                                    _logger.LogInformation($"Usuario {user.Nomina} actualizado: Area={grupoCorrect.AreaId}, Grupo={grupoCorrect.GrupoId}");
                                }
                            }
                            else
                            {
                                _logger.LogWarning($"No se encontró grupo válido para Nomina={rolSAP.Nomina}, Regla={rolSAP.Regla}, UnidadOrg={rolSAP.UnidadOrganizativa}");
                            }
                        }
                    }

                    if (registrosActualizados > 0)
                    {
                        await context.SaveChangesAsync();
                        _logger.LogInformation($"Sincronización completada. {registrosActualizados} roles actualizados.");
                    }
                    else
                    {
                        _logger.LogInformation("Sincronización completada. No hay cambios que aplicar.");
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error al sincronizar roles desde RolesEmpleadosSAP");
                }
            }
        }
    }
}