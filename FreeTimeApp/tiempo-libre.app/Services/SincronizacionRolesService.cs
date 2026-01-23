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

                var user = await _context.Users
                    .FirstOrDefaultAsync(u => u.Nomina == rolSAP.Nomina);

                if (user != null && !string.IsNullOrEmpty(rolSAP.Regla))
                {
                    Area areaCorrecta = null;
                    if (!string.IsNullOrEmpty(rolSAP.UnidadOrganizativa))
                    {
                        var jefeNomina = !string.IsNullOrEmpty(rolSAP.EncargadoRegistro)
                            ? int.TryParse(rolSAP.EncargadoRegistro, out int nominaJefe) ? nominaJefe : (int?)null
                            : null;

                        if (jefeNomina.HasValue)
                        {
                            var jefeUser = await _context.Users
                                .FirstOrDefaultAsync(u => u.Nomina == jefeNomina.Value);

                            if (jefeUser != null)
                            {
                                areaCorrecta = await _context.Areas
                                    .FirstOrDefaultAsync(a => a.UnidadOrganizativaSap == rolSAP.UnidadOrganizativa
                                                            && a.JefeId == jefeUser.Id);
                            }
                        }

                        if (areaCorrecta == null)
                        {
                            areaCorrecta = await _context.Areas
                                .FirstOrDefaultAsync(a => a.UnidadOrganizativaSap == rolSAP.UnidadOrganizativa);
                        }
                    }

                    Grupo grupoCorrect = null;
                    if (areaCorrecta != null)
                    {
                        grupoCorrect = await _context.Grupos
                            .FirstOrDefaultAsync(g => g.Rol == rolSAP.Regla && g.AreaId == areaCorrecta.AreaId);
                    }
                    else
                    {
                        grupoCorrect = await _context.Grupos
                            .FirstOrDefaultAsync(g => g.Rol == rolSAP.Regla);
                    }

                    if (grupoCorrect != null && (user.GrupoId != grupoCorrect.GrupoId || user.AreaId != grupoCorrect.AreaId))
                    {
                        var grupoAnterior = user.GrupoId ?? 0;
                        user.GrupoId = grupoCorrect.GrupoId;
                        user.AreaId = grupoCorrect.AreaId;
                        user.UpdatedAt = DateTime.UtcNow;
                        registrosActualizados++;

                        _logger.LogInformation($"Usuario {user.Nomina} actualizado: Area={grupoCorrect.AreaId}, Grupo={grupoCorrect.GrupoId}, Jefe={rolSAP.EncargadoRegistro}");

                        empleadosCambiaronGrupo.Add((user, grupoAnterior, grupoCorrect.GrupoId));
                    }
                    else if (grupoCorrect == null)
                    {
                        _logger.LogWarning($"No se encontró grupo válido para Nomina={rolSAP.Nomina}, Regla={rolSAP.Regla}, UnidadOrg={rolSAP.UnidadOrganizativa}, EncargadoRegistro={rolSAP.EncargadoRegistro}");
                    }
                }
            }

            await _context.SaveChangesAsync();

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