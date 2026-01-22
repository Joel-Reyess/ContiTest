using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using tiempo_libre.DTOs;
using tiempo_libre.Models;

namespace tiempo_libre.Services
{
	public class SincronizacionRolesService
	{
		private readonly FreeTimeDbContext _context;
		private readonly ILogger<SincronizacionRolesService> _logger;

		public SincronizacionRolesService(FreeTimeDbContext context, ILogger<SincronizacionRolesService> logger)
		{
			_context = context;
			_logger = logger;
		}

        public async Task<int> SincronizarRolesDesdeRegla()
        {
            int registrosActualizados = 0;
            var empleadosCambiaronGrupo = new List<(User user, int grupoAnterior, int grupoNuevo)>();

            var rolesEmpleadosSAP = await _context.RolesEmpleadosSAP
                .Where(r => !string.IsNullOrEmpty(r.Regla))
                .ToListAsync();

            foreach (var rolSAP in rolesEmpleadosSAP)
            {
                // Actualizar Empleados
                var empleado = await _context.Empleados
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
                var user = await _context.Users
                    .FirstOrDefaultAsync(u => u.Nomina == rolSAP.Nomina);

                if (user != null && !string.IsNullOrEmpty(rolSAP.Regla))
                {
                    // ✅ PASO 1: Buscar el área correcta por UnidadOrganizativa
                    Area areaCorrecta = null;
                    if (!string.IsNullOrEmpty(rolSAP.UnidadOrganizativa))
                    {
                        areaCorrecta = await _context.Areas
                            .FirstOrDefaultAsync(a => a.UnidadOrganizativaSap == rolSAP.UnidadOrganizativa);
                    }

                    // ✅ PASO 2: Buscar el grupo que coincida con Regla Y pertenezca al área correcta
                    Grupo grupoCorrect = null;
                    if (areaCorrecta != null)
                    {
                        grupoCorrect = await _context.Grupos
                            .FirstOrDefaultAsync(g => g.Rol == rolSAP.Regla && g.AreaId == areaCorrecta.AreaId);
                    }
                    else
                    {
                        // Fallback: buscar grupo solo por Rol (si no hay área)
                        grupoCorrect = await _context.Grupos
                            .FirstOrDefaultAsync(g => g.Rol == rolSAP.Regla);
                    }

                    // ✅ PASO 3: Actualizar SOLO si encontramos grupo válido
                    if (grupoCorrect != null && (user.GrupoId != grupoCorrect.GrupoId || user.AreaId != grupoCorrect.AreaId))
                    {
                        var grupoAnterior = user.GrupoId ?? 0;
                        user.GrupoId = grupoCorrect.GrupoId;
                        user.AreaId = grupoCorrect.AreaId;
                        user.UpdatedAt = DateTime.UtcNow;
                        registrosActualizados++;

                        _logger.LogInformation($"Usuario {user.Nomina} actualizado: Area={grupoCorrect.AreaId}, Grupo={grupoCorrect.GrupoId}");

                        // Guardar para regenerar calendario después
                        empleadosCambiaronGrupo.Add((user, grupoAnterior, grupoCorrect.GrupoId));
                    }
                    else if (grupoCorrect == null)
                    {
                        _logger.LogWarning($"No se encontró grupo válido para Nomina={rolSAP.Nomina}, Regla={rolSAP.Regla}, UnidadOrg={rolSAP.UnidadOrganizativa}");
                    }
                }
            }

            await _context.SaveChangesAsync();

            // REGENERAR CALENDARIOS FUTUROS para empleados que cambiaron de grupo
            foreach (var (user, grupoAnterior, grupoNuevo) in empleadosCambiaronGrupo)
            {
                await RegenerarCalendarioFuturo(user.Id);
            }

            _logger.LogInformation($"Sincronización completada. {registrosActualizados} registros actualizados. {empleadosCambiaronGrupo.Count} calendarios regenerados.");
            return registrosActualizados;
        }

        private async Task RegenerarCalendarioFuturo(int userId)
        {
            try
            {
                var fechaHoy = DateOnly.FromDateTime(DateTime.Today);

                // Eliminar solo registros FUTUROS del calendario viejo
                var diasFuturos = await _context.DiasCalendarioEmpleado
                    .Where(d => d.IdUsuarioEmpleadoSindicalizado == userId && d.FechaDelDia >= fechaHoy)
                    .ToListAsync();

                if (diasFuturos.Any())
                {
                    _context.DiasCalendarioEmpleado.RemoveRange(diasFuturos);
                    await _context.SaveChangesAsync();

                    _logger.LogInformation($"Eliminados {diasFuturos.Count} días futuros para usuario {userId}");
                }

                // NOTA: Aquí podrías llamar a EmployeesCalendarsGenerator si necesitas regenerar
                // O esperar a que el proceso de generación automática lo haga
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error al regenerar calendario para usuario {userId}");
            }
        }
    }
}