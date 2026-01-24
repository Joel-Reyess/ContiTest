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
                // ✅ ACTUALIZAR EMPLEADOS
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
                    if (cambios) registrosActualizados++;
                }

                // ✅ ACTUALIZAR USERS - LÓGICA COMPLETA CON MÚLTIPLES FALLBACKS
                var user = await _context.Users
                    .FirstOrDefaultAsync(u => u.Nomina == rolSAP.Nomina);

                if (user != null && !string.IsNullOrEmpty(rolSAP.Regla))
                {
                    // PASO 1: Normalizar y buscar grupos por Rol
                    var reglaLimpia = rolSAP.Regla.Replace("_", "").Replace("-", "").Replace(" ", "").ToUpper();

                    var todosGrupos = await _context.Grupos
                        .Include(g => g.Area)
                            .ThenInclude(a => a.Jefe)
                        .ToListAsync();

                    var gruposPosibles = todosGrupos
                        .Where(g => g.Rol.Replace("_", "").Replace("-", "").Replace(" ", "").ToUpper() == reglaLimpia)
                        .ToList();

                    if (!gruposPosibles.Any())
                    {
                        _logger.LogWarning($"❌ NO existe grupo con Rol={rolSAP.Regla} para Nomina={rolSAP.Nomina}");
                        continue;
                    }

                    Grupo grupoCorrect = null;

                    // PASO 2: Filtrar por UnidadOrganizativa
                    if (gruposPosibles.Count > 1 && !string.IsNullOrEmpty(rolSAP.UnidadOrganizativa))
                    {
                        var gruposMismaUnidad = gruposPosibles
                            .Where(g => g.Area.UnidadOrganizativaSap == rolSAP.UnidadOrganizativa)
                            .ToList();

                        if (gruposMismaUnidad.Count == 1)
                        {
                            grupoCorrect = gruposMismaUnidad.First();
                            _logger.LogInformation($"✅ Grupo único en UnidadOrg: GrupoId={grupoCorrect.GrupoId}");
                        }
                        else if (gruposMismaUnidad.Count > 1 && !string.IsNullOrEmpty(rolSAP.EncargadoRegistro))
                        {
                            // PASO 3: Buscar por JefeId usando EncargadoRegistro
                            int? jefeIdBuscado = null;

                            // Primero intentar parsear como nómina
                            if (int.TryParse(rolSAP.EncargadoRegistro.Trim(), out int nominaJefe))
                            {
                                jefeIdBuscado = await _context.Users
                                    .Where(u => u.Nomina == nominaJefe)
                                    .Select(u => (int?)u.Id)
                                    .FirstOrDefaultAsync();
                            }

                            // Si no es nómina, buscar por FullName en Users
                            if (!jefeIdBuscado.HasValue)
                            {
                                var nombreEncargadoSAP = RemoverAcentos(rolSAP.EncargadoRegistro.Trim()).ToLower();

                                var userEncontrado = _context.Users
                                    .Where(u => !string.IsNullOrEmpty(u.FullName))
                                    .AsEnumerable()
                                    .Where(u => RemoverAcentos(u.FullName.Trim()).ToLower() == nombreEncargadoSAP)
                                    .FirstOrDefault();

                                if (userEncontrado != null)
                                {
                                    jefeIdBuscado = userEncontrado.Id;
                                }
                            }

                            // Ahora buscar el grupo por Area.JefeId
                            if (jefeIdBuscado.HasValue)
                            {
                                grupoCorrect = gruposMismaUnidad.FirstOrDefault(g =>
                                    g.Area.JefeId == jefeIdBuscado.Value);

                                if (grupoCorrect != null)
                                {
                                    _logger.LogInformation($"✅ Grupo encontrado por Area.JefeId={jefeIdBuscado.Value}: GrupoId={grupoCorrect.GrupoId}");
                                }
                            }

                            // PASO 4: Último fallback - tomar el primero
                            if (grupoCorrect == null)
                            {
                                grupoCorrect = gruposMismaUnidad.First();
                                _logger.LogWarning($"⚠️ No se encontró coincidencia, usando primer grupo: GrupoId={grupoCorrect.GrupoId}, EncargadoSAP={rolSAP.EncargadoRegistro}");
                            }
                        }
                        else if (gruposMismaUnidad.Any())
                        {
                            grupoCorrect = gruposMismaUnidad.First();
                        }
                        else
                        {
                            grupoCorrect = gruposPosibles.First();
                            _logger.LogWarning($"⚠️ UnidadOrg no coincide, usando primer grupo: GrupoId={grupoCorrect.GrupoId}");
                        }
                    }
                    else
                    {
                        grupoCorrect = gruposPosibles.First();
                    }

                    // PASO 4: Actualizar usuario
                    if (grupoCorrect != null && (user.GrupoId != grupoCorrect.GrupoId || user.AreaId != grupoCorrect.AreaId))
                    {
                        var grupoAnterior = user.GrupoId ?? 0;
                        user.GrupoId = grupoCorrect.GrupoId;
                        user.AreaId = grupoCorrect.AreaId;
                        user.UpdatedAt = DateTime.UtcNow;
                        registrosActualizados++;

                        _logger.LogInformation($"✅ Usuario {user.Nomina} actualizado: Area={grupoCorrect.AreaId}, Grupo={grupoCorrect.GrupoId}");
                        empleadosCambiaronGrupo.Add((user, grupoAnterior, grupoCorrect.GrupoId));
                    }
                }
            } // ✅ ESTA LLAVE FALTABA - Cierra el foreach principal

            await _context.SaveChangesAsync();

            foreach (var (user, grupoAnterior, grupoNuevo) in empleadosCambiaronGrupo)
            {
                await RegenerarCalendarioFuturo(user.Id);
            }

            _logger.LogInformation($"✅ Sincronización completada. {registrosActualizados} registros actualizados.");
            return registrosActualizados;
        }
        private string RemoverAcentos(string texto)
        {
            if (string.IsNullOrEmpty(texto))
                return string.Empty;

            // Normalizar y remover acentos
            var textoNormalizado = texto.Normalize(System.Text.NormalizationForm.FormD);
            var resultado = new System.Text.StringBuilder();

            foreach (var c in textoNormalizado)
            {
                var categoriaUnicode = System.Globalization.CharUnicodeInfo.GetUnicodeCategory(c);
                if (categoriaUnicode != System.Globalization.UnicodeCategory.NonSpacingMark)
                {
                    resultado.Append(c);
                }
            }

            var limpio = resultado.ToString()
                .Normalize(System.Text.NormalizationForm.FormC)
                .Replace("é", "e")
                .Replace("É", "E")
                .Replace("á", "a")
                .Replace("Á", "A")
                .Replace("í", "i")
                .Replace("Í", "I")
                .Replace("ó", "o")
                .Replace("Ó", "O")
                .Replace("ú", "u")
                .Replace("Ú", "U")
                .Replace("\u00A0", " ")  // Non-breaking space
                .Replace("\u200B", "")   // Zero-width space
                .Replace("\u2009", " ")  // Thin space
                .Replace("\u202F", " ")  // Narrow no-break space
                .Trim();

            // Limpiar espacios múltiples
            while (limpio.Contains("  "))
            {
                limpio = limpio.Replace("  ", " ");
            }

            return limpio;
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