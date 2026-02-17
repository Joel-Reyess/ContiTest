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

            await ActualizarEncargadoRegistroEnAreas();

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

                    Grupo? grupoCorrect = null;

                    // PASO 2: Filtrar por UnidadOrganizativa
                    if (gruposPosibles.Count > 1 && !string.IsNullOrEmpty(rolSAP.UnidadOrganizativa))
                    {
                        var gruposMismaUnidad = gruposPosibles
                            .Where(g => g.Area.UnidadOrganizativaSap == rolSAP.UnidadOrganizativa)
                            .ToList();

                        if (gruposMismaUnidad.Count == 1)
                        {
                            grupoCorrect = gruposMismaUnidad.First();
                        }
                        else if (gruposMismaUnidad.Count > 1 && !string.IsNullOrEmpty(rolSAP.EncargadoRegistro))
                        {
                            // PASO 3: Buscar por JefeId usando EncargadoRegistro
                            int? jefeIdBuscado = null;

                            if (int.TryParse(rolSAP.EncargadoRegistro.Trim(), out int nominaJefe))
                            {
                                jefeIdBuscado = await _context.Users
                                    .Where(u => u.Nomina == nominaJefe)
                                    .Select(u => (int?)u.Id)
                                    .FirstOrDefaultAsync();
                            }

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

                            if (jefeIdBuscado.HasValue)
                            {
                                var gruposConJefeCorrecto = gruposMismaUnidad
                                    .Where(g => g.Area.JefeId == jefeIdBuscado.Value)
                                    .ToList();

                                if (gruposConJefeCorrecto.Count == 1)
                                {
                                    grupoCorrect = gruposConJefeCorrecto.First();
                                }
                                else if (gruposConJefeCorrecto.Count > 1)
                                {
                                    var encargadoNormalizado = RemoverAcentos(rolSAP.EncargadoRegistro.Trim()).ToLower();

                                    grupoCorrect = gruposConJefeCorrecto.FirstOrDefault(g =>
                                        RemoverAcentos(g.Area.EncargadoRegistro ?? "").ToLower().Trim() == encargadoNormalizado);

                                    if (grupoCorrect != null)
                                    {
                                        _logger.LogInformation($"✅ Grupo encontrado por JefeId + EncargadoRegistro: GrupoId={grupoCorrect.GrupoId}");
                                    }
                                    else
                                    {
                                        grupoCorrect = gruposConJefeCorrecto.First();
                                        _logger.LogWarning($"⚠️ No coincide EncargadoRegistro, usando primer grupo con JefeId correcto: GrupoId={grupoCorrect.GrupoId}");
                                    }
                                }
                                else
                                {
                                    _logger.LogWarning($"⚠️ No se encontró grupo con JefeId={jefeIdBuscado.Value} en esta UnidadOrg");
                                }
                            }

                            if (grupoCorrect == null)
                            {
                                grupoCorrect = gruposMismaUnidad.First();
                                _logger.LogWarning($"⚠️ FALLBACK: usando primer grupo: GrupoId={grupoCorrect.GrupoId}");
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
            }

            await _context.SaveChangesAsync();

            foreach (var (user, grupoAnterior, grupoNuevo) in empleadosCambiaronGrupo)
            {
                await RegenerarCalendarioFuturo(user.Id);
            }

            // ✅ ELIMINAR EMPLEADOS Y USUARIOS INACTIVOS
            await EliminarEmpleadosInactivos();

            _logger.LogInformation($"✅ Sincronización completada. {registrosActualizados} registros actualizados.");
            return registrosActualizados;
        }

        public async Task<int> EliminarEmpleadosInactivos()
        {
            int empleadosEliminados = 0;
            int usuariosEliminados = 0;

            try
            {
                // Obtener nóminas activas en RolesEmpleadosSAP
                var nominasActivas = await _context.RolesEmpleadosSAP
                    .Select(r => r.Nomina)
                    .Distinct()
                    .ToListAsync();

                // Encontrar empleados que ya no están en RolesEmpleadosSAP
                var empleadosAEliminar = await _context.Empleados
                    .Where(e => !nominasActivas.Contains(e.Nomina))
                    .ToListAsync();

                if (empleadosAEliminar.Any())
                {
                    _context.Empleados.RemoveRange(empleadosAEliminar);
                    empleadosEliminados = empleadosAEliminar.Count;
                    _logger.LogInformation($"🗑️ Eliminados {empleadosEliminados} empleados inactivos");
                }

                // Buscar el rol Empleado_Sindicalizado
                var rolSindicalizado = await _context.Roles
                    .FirstOrDefaultAsync(r => r.Name == "Empleado_Sindicalizado" || r.Name == "Empleado Sindicalizado");

                if (rolSindicalizado != null)
                {
                    var usuariosAEliminar = await _context.Users
                        .Include(u => u.Roles)
                        .Where(u => u.Nomina.HasValue &&
                                   !nominasActivas.Contains(u.Nomina.Value) &&
                                   u.Roles.Any(r => r.Id == rolSindicalizado.Id))
                        .ToListAsync();

                    if (usuariosAEliminar.Any())
                    {
                        _context.Users.RemoveRange(usuariosAEliminar);
                        usuariosEliminados = usuariosAEliminar.Count;
                        _logger.LogInformation($"🗑️ Eliminados {usuariosEliminados} usuarios sindicalizados inactivos");
                    }
                }

                await _context.SaveChangesAsync();

                _logger.LogInformation($"✅ Limpieza completada. Empleados: {empleadosEliminados}, Usuarios: {usuariosEliminados}");
                return empleadosEliminados + usuariosEliminados;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "❌ Error al eliminar empleados/usuarios inactivos");
                return 0;
            }
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
        public async Task ActualizarEncargadoRegistroEnAreas()
        {
            try
            {
                _logger.LogInformation("🔄 Iniciando actualización de EncargadoRegistro en Areas basado en JefeId...");

                // Obtener todas las áreas con sus jefes
                var areas = await _context.Areas
                    .Include(a => a.Jefe)
                    .ToListAsync();

                int areasActualizadas = 0;

                foreach (var area in areas)
                {
                    string nuevoEncargado = null;

                    // PRIORIDAD 1: Si tiene JefeId asignado, usar el FullName del jefe
                    if (area.JefeId.HasValue && area.Jefe != null)
                    {
                        nuevoEncargado = area.Jefe.FullName;
                        _logger.LogInformation($"🎯 Area {area.AreaId} ({area.UnidadOrganizativaSap}): " +
                            $"Usando Jefe.FullName='{nuevoEncargado}' (JefeId={area.JefeId})");
                    }
                    // PRIORIDAD 2: Si NO tiene JefeId, buscar el encargado más frecuente en RolesEmpleadosSAP
                    else
                    {
                        var encargadosConFrecuencia = await _context.RolesEmpleadosSAP
                            .Where(r => r.UnidadOrganizativa == area.UnidadOrganizativaSap &&
                                       !string.IsNullOrEmpty(r.EncargadoRegistro))
                            .GroupBy(r => r.EncargadoRegistro)
                            .Select(g => new {
                                EncargadoRegistro = g.Key,
                                Frecuencia = g.Count()
                            })
                            .OrderByDescending(x => x.Frecuencia)
                            .ToListAsync();

                        if (encargadosConFrecuencia.Any())
                        {
                            nuevoEncargado = encargadosConFrecuencia.First().EncargadoRegistro;
                            _logger.LogInformation($"📊 Area {area.AreaId} ({area.UnidadOrganizativaSap}): " +
                                $"Sin JefeId, usando más frecuente='{nuevoEncargado}' " +
                                $"(Frecuencia: {encargadosConFrecuencia.First().Frecuencia})");
                        }
                        else
                        {
                            _logger.LogWarning($"⚠️ Area {area.AreaId} ({area.UnidadOrganizativaSap}): " +
                                $"Sin JefeId y sin EncargadoRegistro en RolesEmpleadosSAP");
                            continue;
                        }
                    }

                    // Normalizar para comparación
                    var encargadoActualNormalizado = RemoverAcentos(area.EncargadoRegistro ?? "").ToLower().Trim();
                    var encargadoNuevoNormalizado = RemoverAcentos(nuevoEncargado).ToLower().Trim();

                    // Actualizar si es diferente
                    if (encargadoActualNormalizado != encargadoNuevoNormalizado)
                    {
                        _logger.LogInformation($"📝 Actualizando Area {area.AreaId}: " +
                            $"'{area.EncargadoRegistro}' → '{nuevoEncargado}'");

                        area.EncargadoRegistro = nuevoEncargado;
                        areasActualizadas++;
                    }
                }

                if (areasActualizadas > 0)
                {
                    await _context.SaveChangesAsync();
                    _logger.LogInformation($"✅ {areasActualizadas} áreas actualizadas con nuevo EncargadoRegistro");
                }
                else
                {
                    _logger.LogInformation("✅ No hay cambios en EncargadoRegistro de Areas");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "❌ Error al actualizar EncargadoRegistro en Areas");
            }
        }

    }
}