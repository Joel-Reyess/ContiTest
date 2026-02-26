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
                    // PASO 4: Actualizar usuario
                    if (grupoCorrect != null)
                    {
                        if (user.GrupoId != grupoCorrect.GrupoId || user.AreaId != grupoCorrect.AreaId)
                        {
                            _logger.LogInformation($"🔄 Usuario {user.Nomina}: GrupoId {user.GrupoId}→{grupoCorrect.GrupoId} | AreaId {user.AreaId}→{grupoCorrect.AreaId}");
                            var grupoAnterior = user.GrupoId ?? 0;
                            user.GrupoId = grupoCorrect.GrupoId;
                            user.AreaId = grupoCorrect.AreaId;
                            user.UpdatedAt = DateTime.UtcNow;
                            registrosActualizados++;
                            empleadosCambiaronGrupo.Add((user, grupoAnterior, grupoCorrect.GrupoId));
                        }
                        else
                        {
                            _logger.LogInformation($"✅ Usuario {user.Nomina}: ya está en GrupoId={grupoCorrect.GrupoId} correcto");
                        }
                    }
                    else
                    {
                        _logger.LogWarning($"❌ Usuario {user.Nomina}: grupoCorrect es null, no se actualizó. Regla={rolSAP.Regla}, UnidadOrg={rolSAP.UnidadOrganizativa}");
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
            // Sincronizar Users desde Empleados (flujo directo por UnidadOrganizativa y Rol)
            var usersActualizados = await SincronizarUsersDesdeEmpleados();
            registrosActualizados += usersActualizados;
            return registrosActualizados;
        }

        public async Task<int> SincronizarUsersDesdeEmpleados()
        {
            int actualizados = 0;

            // Traer todos los empleados con su UnidadOrganizativa y Rol
            var empleados = await _context.Empleados
                .Where(e => !string.IsNullOrEmpty(e.UnidadOrganizativa) && !string.IsNullOrEmpty(e.Rol))
                .ToListAsync();

            // Traer todas las áreas indexadas por UnidadOrganizativaSap
            var areas = await _context.Areas.ToListAsync();
            var areasPorUnidad = areas
                .GroupBy(a => a.UnidadOrganizativaSap?.Trim().ToUpper())
                .Where(g => g.Key != null)
                .ToDictionary(g => g.Key!, g => g.ToList());

            // Traer todos los grupos indexados por Rol
            var grupos = await _context.Grupos.ToListAsync();
            var gruposPorRol = grupos
                .GroupBy(g => g.Rol?.Replace("_", "").Replace("-", "").Replace(" ", "").ToUpper())
                .Where(g => g.Key != null)
                .ToDictionary(g => g.Key!, g => g.ToList());

            foreach (var empleado in empleados)
            {
                // Buscar el usuario por Username == Nomina
                var user = await _context.Users
                    .FirstOrDefaultAsync(u => u.Username == empleado.Nomina.ToString());

                if (user == null)
                {
                    _logger.LogWarning($"⚠️ No se encontró User con Username={empleado.Nomina}");
                    continue;
                }

                // Resolver AreaId desde UnidadOrganizativa
                var unidadKey = empleado.UnidadOrganizativa?.Trim().ToUpper();
                if (!areasPorUnidad.TryGetValue(unidadKey!, out var areasCandiatas) || !areasCandiatas.Any())
                {
                    _logger.LogWarning($"⚠️ Nomina={empleado.Nomina}: No se encontró Area para UnidadOrg={empleado.UnidadOrganizativa}");
                    continue;
                }

                // Si hay más de un área con esa UnidadOrg, elegir por EncargadoRegistro
                Area? areaCorrecta = null;
                if (areasCandiatas.Count == 1)
                {
                    areaCorrecta = areasCandiatas.First();
                }
                else if (!string.IsNullOrEmpty(empleado.EncargadoRegistro))
                {
                    var encNorm = RemoverAcentos(empleado.EncargadoRegistro.Trim()).ToLower();
                    areaCorrecta = areasCandiatas.FirstOrDefault(a =>
                        RemoverAcentos(a.EncargadoRegistro ?? "").ToLower().Trim() == encNorm);

                    if (areaCorrecta == null)
                        areaCorrecta = areasCandiatas.First();
                }
                else
                {
                    areaCorrecta = areasCandiatas.First();
                }

                // Resolver GrupoId desde Rol dentro del área correcta
                var rolKey = empleado.Rol?.Replace("_", "").Replace("-", "").Replace(" ", "").ToUpper();
                if (!gruposPorRol.TryGetValue(rolKey!, out var gruposCanditatos) || !gruposCanditatos.Any())
                {
                    _logger.LogWarning($"⚠️ Nomina={empleado.Nomina}: No se encontró Grupo para Rol={empleado.Rol}");
                    continue;
                }

                // Filtrar grupos que pertenezcan al área correcta
                var grupoEnArea = gruposCanditatos.FirstOrDefault(g => g.AreaId == areaCorrecta.AreaId);
                if (grupoEnArea == null)
                {
                    // Fallback: usar cualquier grupo con ese Rol
                    grupoEnArea = gruposCanditatos.First();
                    _logger.LogWarning($"⚠️ Nomina={empleado.Nomina}: Grupo Rol={empleado.Rol} no pertenece al Area={areaCorrecta.AreaId}, usando fallback GrupoId={grupoEnArea.GrupoId}");
                }

                // Actualizar solo si hay cambios
                if (user.AreaId != areaCorrecta.AreaId || user.GrupoId != grupoEnArea.GrupoId)
                {
                    _logger.LogInformation($"🔄 Nomina={empleado.Nomina}: AreaId {user.AreaId}→{areaCorrecta.AreaId} | GrupoId {user.GrupoId}→{grupoEnArea.GrupoId}");
                    user.AreaId = areaCorrecta.AreaId;
                    user.GrupoId = grupoEnArea.GrupoId;
                    user.UpdatedAt = DateTime.UtcNow;
                    actualizados++;
                }
            }

            if (actualizados > 0)
                await _context.SaveChangesAsync();

            _logger.LogInformation($"✅ SincronizarUsersDesdeEmpleados: {actualizados} usuarios actualizados.");
            return actualizados;
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
                    _logger.LogInformation($"🗑️ Marcados para eliminar {empleadosEliminados} empleados inactivos");
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
                        // ✅ PASO CRÍTICO: Eliminar primero las relaciones/datos dependientes
                        foreach (var usuario in usuariosAEliminar)
                        {

                            // 1. Eliminar Notificaciones (tanto como emisor como receptor) ⭐ NUEVO
                            var notificacionesComoEmisor = await _context.Notificaciones
                                .Where(n => n.IdUsuarioEmisor == usuario.Id)
                                .ToListAsync();
                            if (notificacionesComoEmisor.Any())
                            {
                                _context.Notificaciones.RemoveRange(notificacionesComoEmisor);
                                _logger.LogInformation($"🗑️ Eliminando {notificacionesComoEmisor.Count} notificaciones como emisor del usuario {usuario.Nomina}");
                            }

                            var notificacionesComoReceptor = await _context.Notificaciones
                                .Where(n => n.IdUsuarioReceptor == usuario.Id)
                                .ToListAsync();
                            if (notificacionesComoReceptor.Any())
                            {
                                _context.Notificaciones.RemoveRange(notificacionesComoReceptor);
                                _logger.LogInformation($"🗑️ Eliminando {notificacionesComoReceptor.Count} notificaciones como receptor del usuario {usuario.Nomina}");
                            }

                            // 1. Eliminar SolicitudesReprogramacion (PRIMERO - depende de VacacionesProgramadas)
                            var solicitudesReprogramacion = await _context.SolicitudesReprogramacion
                                .Where(sr => sr.EmpleadoId == usuario.Id)
                                .ToListAsync();
                            if (solicitudesReprogramacion.Any())
                            {
                                _context.SolicitudesReprogramacion.RemoveRange(solicitudesReprogramacion);
                                _logger.LogInformation($"🗑️ Eliminando {solicitudesReprogramacion.Count} solicitudes de reprogramación del usuario {usuario.Nomina}");
                            }

                            // 2. Eliminar SolicitudesFestivosTrabajados
                            var solicitudesFestivos = await _context.SolicitudesFestivosTrabajados
                                .Where(sf => sf.EmpleadoId == usuario.Id)
                                .ToListAsync();
                            if (solicitudesFestivos.Any())
                            {
                                _context.SolicitudesFestivosTrabajados.RemoveRange(solicitudesFestivos);
                                _logger.LogInformation($"🗑️ Eliminando {solicitudesFestivos.Count} solicitudes de festivos del usuario {usuario.Nomina}");
                            }

                            // 3. Eliminar AsignacionesBloque ⭐ NUEVO
                            var asignacionesBloque = await _context.AsignacionesBloque
                                .Where(ab => ab.EmpleadoId == usuario.Id)
                                .ToListAsync();
                            if (asignacionesBloque.Any())
                            {
                                _context.AsignacionesBloque.RemoveRange(asignacionesBloque);
                                _logger.LogInformation($"🗑️ Eliminando {asignacionesBloque.Count} asignaciones de bloque del usuario {usuario.Nomina}");
                            }

                            // 3.1 Eliminar CambiosBloque ⭐ NUEVO
                            var cambiosBloque = await _context.CambiosBloque
                                .Where(cb => cb.EmpleadoId == usuario.Id)
                                .ToListAsync();
                            if (cambiosBloque.Any())
                            {
                                _context.CambiosBloque.RemoveRange(cambiosBloque);
                                _logger.LogInformation($"🗑️ Eliminando {cambiosBloque.Count} cambios de bloque del usuario {usuario.Nomina}");
                            }

                            // 4. Eliminar VacacionesProgramadas
                            var vacaciones = await _context.VacacionesProgramadas
                                .Where(v => v.EmpleadoId == usuario.Id)
                                .ToListAsync();
                            if (vacaciones.Any())
                            {
                                _context.VacacionesProgramadas.RemoveRange(vacaciones);
                                _logger.LogInformation($"🗑️ Eliminando {vacaciones.Count} vacaciones programadas del usuario {usuario.Nomina}");
                            }

                            // 5. Eliminar DiasCalendarioEmpleado
                            var diasCalendario = await _context.DiasCalendarioEmpleado
                                .Where(d => d.IdUsuarioEmpleadoSindicalizado == usuario.Id)
                                .ToListAsync();
                            if (diasCalendario.Any())
                            {
                                _context.DiasCalendarioEmpleado.RemoveRange(diasCalendario);
                                _logger.LogInformation($"🗑️ Eliminando {diasCalendario.Count} días de calendario del usuario {usuario.Nomina}");
                            }

                            // 6. Eliminar CalendarioEmpleado
                            var calendarios = await _context.CalendarioEmpleados
                                .Where(c => c.IdUsuarioEmpleadoSindicalizado == usuario.Id)
                                .ToListAsync();
                            if (calendarios.Any())
                            {
                                _context.CalendarioEmpleados.RemoveRange(calendarios);
                                _logger.LogInformation($"🗑️ Eliminando {calendarios.Count} calendarios del usuario {usuario.Nomina}");
                            }

                            // 7. Eliminar DiasFestivosTrabajados
                            var festivosTrabajados = await _context.DiasFestivosTrabajados
                                .Where(d => d.IdUsuarioEmpleadoSindicalizado == usuario.Id)
                                .ToListAsync();
                            if (festivosTrabajados.Any())
                            {
                                _context.DiasFestivosTrabajados.RemoveRange(festivosTrabajados);
                                _logger.LogInformation($"🗑️ Eliminando {festivosTrabajados.Count} festivos trabajados del usuario {usuario.Nomina}");
                            }

                            // 8. Eliminar ReservacionesDeVacacionesPorEmpleado
                            var reservaciones = await _context.ReservacionesDeVacacionesPorEmpleado
                                .Where(r => r.IdEmpleadoSindicalizado == usuario.Id)
                                .ToListAsync();
                            if (reservaciones.Any())
                            {
                                _context.ReservacionesDeVacacionesPorEmpleado.RemoveRange(reservaciones);
                                _logger.LogInformation($"🗑️ Eliminando {reservaciones.Count} reservaciones del usuario {usuario.Nomina}");
                            }

                            // 9. Eliminar EmpleadosXBloquesDeTurnos
                            var bloquesTurnos = await _context.EmpleadosXBloquesDeTurnos
                                .Where(e => e.IdEmpleadoSindicalAgendara == usuario.Id)
                                .ToListAsync();
                            if (bloquesTurnos.Any())
                            {
                                _context.EmpleadosXBloquesDeTurnos.RemoveRange(bloquesTurnos);
                                _logger.LogInformation($"🗑️ Eliminando {bloquesTurnos.Count} bloques de turnos del usuario {usuario.Nomina}");
                            }
                        }

                        // Guardar cambios de eliminación de dependencias
                        await _context.SaveChangesAsync();

                        // Ahora sí eliminar los usuarios
                        _context.Users.RemoveRange(usuariosAEliminar);
                        usuariosEliminados = usuariosAEliminar.Count;
                        _logger.LogInformation($"🗑️ Marcados para eliminar {usuariosEliminados} usuarios sindicalizados inactivos");
                    }
                }

                // Guardar cambios finales
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