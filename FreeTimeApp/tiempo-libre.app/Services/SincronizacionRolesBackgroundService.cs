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

                    _logger.LogInformation($"📊 Total registros SAP a procesar: {rolesEmpleadosSAP.Count}");

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

                        // ✅ ACTUALIZAR USERS - NUEVA LÓGICA
                        var user = await context.Users
                            .FirstOrDefaultAsync(u => u.Nomina == rolSAP.Nomina);

                        if (user != null && !string.IsNullOrEmpty(rolSAP.Regla))
                        {
                            // PASO 1: Buscar el grupo por Rol/Regla (normalizado)
                            var reglaLimpia = rolSAP.Regla.Replace("_", "").Replace("-", "").Replace(" ", "").ToUpper();

                            var todosGrupos = await context.Grupos.Include(g => g.Area).ToListAsync();
                            var gruposPosibles = todosGrupos
                                .Where(g => g.Rol.Replace("_", "").Replace("-", "").Replace(" ", "").ToUpper() == reglaLimpia)
                                .ToList();

                            if (!gruposPosibles.Any())
                            {
                                _logger.LogWarning($"   ❌ NO existe grupo con Rol={rolSAP.Regla} para Nomina={rolSAP.Nomina}");
                                continue;
                            }

                            Grupo grupoCorrect = null;

                            // PASO 2: Si hay múltiples grupos con el mismo Rol, filtrar por UnidadOrganizativa + EncargadoRegistro
                            if (gruposPosibles.Count > 1 && !string.IsNullOrEmpty(rolSAP.UnidadOrganizativa))
                            {
                                // Filtrar por UnidadOrganizativa
                                var gruposMismaUnidad = gruposPosibles
                                    .Where(g => g.Area.UnidadOrganizativaSap == rolSAP.UnidadOrganizativa)
                                    .ToList();

                                if (gruposMismaUnidad.Count == 1)
                                {
                                    grupoCorrect = gruposMismaUnidad.First();
                                    //_logger.LogInformation($"   ✅ Grupo único en UnidadOrg: GrupoId={grupoCorrect.GrupoId}, Area={grupoCorrect.AreaId}");
                                }
                                else if (gruposMismaUnidad.Count > 1 && !string.IsNullOrEmpty(rolSAP.EncargadoRegistro))
                                {
                                    // PASO 3: Validar por EncargadoRegistro del área
                                    var nombreEncargado = RemoverAcentos(rolSAP.EncargadoRegistro.Trim()).ToLower();

                                    grupoCorrect = gruposMismaUnidad.FirstOrDefault(g =>
                                    {
                                        if (string.IsNullOrEmpty(g.Area.EncargadoRegistro))
                                            return false;

                                        var encargadoArea = RemoverAcentos(g.Area.EncargadoRegistro.Trim()).ToLower();
                                        return encargadoArea == nombreEncargado;
                                    });

                                    if (grupoCorrect != null)
                                    {
                                        //_logger.LogInformation($"   ✅ Grupo encontrado por EncargadoRegistro: GrupoId={grupoCorrect.GrupoId}, Area={grupoCorrect.AreaId}");
                                    }
                                    else
                                    {
                                        // Fallback: tomar el primero de la misma unidad
                                        grupoCorrect = gruposMismaUnidad.First();
                                        _logger.LogWarning($"   ⚠️ EncargadoRegistro no coincide, usando primer grupo: GrupoId={grupoCorrect.GrupoId}");
                                    }
                                }
                                else if (gruposMismaUnidad.Any())
                                {
                                    grupoCorrect = gruposMismaUnidad.First();
                                    _logger.LogWarning($"   ⚠️ Múltiples grupos, usando primero: GrupoId={grupoCorrect.GrupoId}");
                                }
                                else
                                {
                                    // No hay grupos en esa UnidadOrganizativa, tomar el primero disponible
                                    grupoCorrect = gruposPosibles.First();
                                    _logger.LogWarning($"   ⚠️ UnidadOrg no coincide, usando primer grupo disponible: GrupoId={grupoCorrect.GrupoId}, Area={grupoCorrect.AreaId}");
                                }
                            }
                            else
                            {
                                // Solo hay un grupo con ese Rol
                                grupoCorrect = gruposPosibles.First();
                                //_logger.LogInformation($"   ✅ Grupo único encontrado: GrupoId={grupoCorrect.GrupoId}, Area={grupoCorrect.AreaId}");
                            }

                            // PASO 4: Actualizar usuario
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
                                    _logger.LogInformation($"   ✅ Usuario {user.Nomina} actualizado: Area={grupoCorrect.AreaId}, Grupo={grupoCorrect.GrupoId}");
                                }
                            }
                        }
                    }

                    if (registrosActualizados > 0)
                    {
                        await context.SaveChangesAsync();
                        _logger.LogInformation($" Sincronización completada. {registrosActualizados} roles actualizados.");
                    }
                    else
                    {
                        _logger.LogInformation($" Sincronización completada. No hay cambios que aplicar.");
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