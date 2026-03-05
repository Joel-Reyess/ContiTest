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
                                    jefeIdBuscado = userEncontrado.Id;
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
                                        _logger.LogInformation($"✅ Grupo encontrado por JefeId + EncargadoRegistro: GrupoId={grupoCorrect.GrupoId}");
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

            // ⛔ ELIMINACIÓN DESACTIVADA TEMPORALMENTE - Reactivar solo cuando SAP sea estable
            // await EliminarEmpleadosInactivos();
            _logger.LogInformation("⏸️ EliminarEmpleadosInactivos desactivado temporalmente.");

            _logger.LogInformation($"✅ Sincronización completada. {registrosActualizados} registros actualizados.");
            var usersActualizados = await SincronizarUsersDesdeEmpleados();
            registrosActualizados += usersActualizados;
            return registrosActualizados;
        }

        public async Task<int> SincronizarUsersDesdeEmpleados()
        {
            int actualizados = 0;

            var empleados = await _context.Empleados
                .Where(e => !string.IsNullOrEmpty(e.UnidadOrganizativa) && !string.IsNullOrEmpty(e.Rol))
                .ToListAsync();

            var areas = await _context.Areas.ToListAsync();
            var areasPorUnidad = areas
                .GroupBy(a => a.UnidadOrganizativaSap?.Trim().ToUpper())
                .Where(g => g.Key != null)
                .ToDictionary(g => g.Key!, g => g.ToList());

            var grupos = await _context.Grupos.ToListAsync();
            var gruposPorRol = grupos
                .GroupBy(g => g.Rol?.Replace("_", "").Replace("-", "").Replace(" ", "").ToUpper())
                .Where(g => g.Key != null)
                .ToDictionary(g => g.Key!, g => g.ToList());

            foreach (var empleado in empleados)
            {
                var user = await _context.Users
                    .FirstOrDefaultAsync(u => u.Username == empleado.Nomina.ToString());

                if (user == null)
                {
                    _logger.LogWarning($"⚠️ No se encontró User con Username={empleado.Nomina}");
                    continue;
                }

                var unidadKey = empleado.UnidadOrganizativa?.Trim().ToUpper();
                if (!areasPorUnidad.TryGetValue(unidadKey!, out var areasCandiatas) || !areasCandiatas.Any())
                {
                    _logger.LogWarning($"⚠️ Nomina={empleado.Nomina}: No se encontró Area para UnidadOrg={empleado.UnidadOrganizativa}");
                    continue;
                }

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

                var rolKey = empleado.Rol?.Replace("_", "").Replace("-", "").Replace(" ", "").ToUpper();
                if (!gruposPorRol.TryGetValue(rolKey!, out var gruposCanditatos) || !gruposCanditatos.Any())
                {
                    _logger.LogWarning($"⚠️ Nomina={empleado.Nomina}: No se encontró Grupo para Rol={empleado.Rol}");
                    continue;
                }

                var grupoEnArea = gruposCanditatos.FirstOrDefault(g => g.AreaId == areaCorrecta.AreaId);
                if (grupoEnArea == null)
                {
                    grupoEnArea = gruposCanditatos.First();
                    _logger.LogWarning($"⚠️ Nomina={empleado.Nomina}: Grupo Rol={empleado.Rol} no pertenece al Area={areaCorrecta.AreaId}, usando fallback GrupoId={grupoEnArea.GrupoId}");
                }

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

        // ⛔ MÉTODO DESACTIVADO TEMPORALMENTE
        // Para reactivar: descomentar "await EliminarEmpleadosInactivos();" en SincronizarRolesDesdeRegla
        // IMPORTANTE: Las protecciones 1 y 2 evitan eliminación masiva si SAP está vacío o incompleto
        public async Task<int> EliminarEmpleadosInactivos()
        {
            int empleadosEliminados = 0;
            int usuariosEliminados = 0;

            try
            {
                var nominasActivas = await _context.RolesEmpleadosSAP
                    .Select(r => r.Nomina)
                    .Distinct()
                    .ToListAsync();

                // ✅ PROTECCIÓN 1: Tabla SAP vacía = SAP está actualizando, no eliminar nada
                if (!nominasActivas.Any())
                {
                    _logger.LogWarning("⚠️ PROTECCIÓN 1: RolesEmpleadosSAP está vacía. SAP posiblemente actualizando. No se elimina nada.");
                    return 0;
                }

                // ✅ PROTECCIÓN 2: Si SAP tiene menos del 10% de empleados actuales, algo está mal
                var totalEmpleadosActuales = await _context.Empleados.CountAsync();
                if (totalEmpleadosActuales > 0 && nominasActivas.Count < totalEmpleadosActuales * 0.1)
                {
                    _logger.LogWarning($"⚠️ PROTECCIÓN 2: Solo {nominasActivas.Count} nóminas en SAP vs {totalEmpleadosActuales} empleados actuales. Carga parcial detectada. No se elimina nada.");
                    return 0;
                }

                var empleadosAEliminar = await _context.Empleados
                    .Where(e => !nominasActivas.Contains(e.Nomina))
                    .ToListAsync();

                if (empleadosAEliminar.Any())
                {
                    _context.Empleados.RemoveRange(empleadosAEliminar);
                    empleadosEliminados = empleadosAEliminar.Count;
                    _logger.LogInformation($"🗑️ Marcados para eliminar {empleadosEliminados} empleados inactivos");
                }

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
                        foreach (var usuario in usuariosAEliminar)
                        {
                            var notificacionesComoEmisor = await _context.Notificaciones
                                .Where(n => n.IdUsuarioEmisor == usuario.Id).ToListAsync();
                            if (notificacionesComoEmisor.Any())
                                _context.Notificaciones.RemoveRange(notificacionesComoEmisor);

                            var notificacionesComoReceptor = await _context.Notificaciones
                                .Where(n => n.IdUsuarioReceptor == usuario.Id).ToListAsync();
                            if (notificacionesComoReceptor.Any())
                                _context.Notificaciones.RemoveRange(notificacionesComoReceptor);

                            var solicitudesReprogramacion = await _context.SolicitudesReprogramacion
                                .Where(sr => sr.EmpleadoId == usuario.Id).ToListAsync();
                            if (solicitudesReprogramacion.Any())
                                _context.SolicitudesReprogramacion.RemoveRange(solicitudesReprogramacion);

                            var solicitudesFestivos = await _context.SolicitudesFestivosTrabajados
                                .Where(sf => sf.EmpleadoId == usuario.Id).ToListAsync();
                            if (solicitudesFestivos.Any())
                                _context.SolicitudesFestivosTrabajados.RemoveRange(solicitudesFestivos);

                            var asignacionesBloque = await _context.AsignacionesBloque
                                .Where(ab => ab.EmpleadoId == usuario.Id).ToListAsync();
                            if (asignacionesBloque.Any())
                                _context.AsignacionesBloque.RemoveRange(asignacionesBloque);

                            var cambiosBloque = await _context.CambiosBloque
                                .Where(cb => cb.EmpleadoId == usuario.Id).ToListAsync();
                            if (cambiosBloque.Any())
                                _context.CambiosBloque.RemoveRange(cambiosBloque);

                            var vacaciones = await _context.VacacionesProgramadas
                                .Where(v => v.EmpleadoId == usuario.Id).ToListAsync();
                            if (vacaciones.Any())
                                _context.VacacionesProgramadas.RemoveRange(vacaciones);

                            var diasCalendario = await _context.DiasCalendarioEmpleado
                                .Where(d => d.IdUsuarioEmpleadoSindicalizado == usuario.Id).ToListAsync();
                            if (diasCalendario.Any())
                                _context.DiasCalendarioEmpleado.RemoveRange(diasCalendario);

                            var calendarios = await _context.CalendarioEmpleados
                                .Where(c => c.IdUsuarioEmpleadoSindicalizado == usuario.Id).ToListAsync();
                            if (calendarios.Any())
                                _context.CalendarioEmpleados.RemoveRange(calendarios);

                            var festivosTrabajados = await _context.DiasFestivosTrabajados
                                .Where(d => d.IdUsuarioEmpleadoSindicalizado == usuario.Id).ToListAsync();
                            if (festivosTrabajados.Any())
                                _context.DiasFestivosTrabajados.RemoveRange(festivosTrabajados);

                            var reservaciones = await _context.ReservacionesDeVacacionesPorEmpleado
                                .Where(r => r.IdEmpleadoSindicalizado == usuario.Id).ToListAsync();
                            if (reservaciones.Any())
                                _context.ReservacionesDeVacacionesPorEmpleado.RemoveRange(reservaciones);

                            var bloquesTurnos = await _context.EmpleadosXBloquesDeTurnos
                                .Where(e => e.IdEmpleadoSindicalAgendara == usuario.Id).ToListAsync();
                            if (bloquesTurnos.Any())
                                _context.EmpleadosXBloquesDeTurnos.RemoveRange(bloquesTurnos);
                        }

                        await _context.SaveChangesAsync();

                        _context.Users.RemoveRange(usuariosAEliminar);
                        usuariosEliminados = usuariosAEliminar.Count;
                        _logger.LogInformation($"🗑️ Marcados para eliminar {usuariosEliminados} usuarios sindicalizados inactivos");
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

            var textoNormalizado = texto.Normalize(System.Text.NormalizationForm.FormD);
            var resultado = new System.Text.StringBuilder();

            foreach (var c in textoNormalizado)
            {
                var categoriaUnicode = System.Globalization.CharUnicodeInfo.GetUnicodeCategory(c);
                if (categoriaUnicode != System.Globalization.UnicodeCategory.NonSpacingMark)
                    resultado.Append(c);
            }

            var limpio = resultado.ToString()
                .Normalize(System.Text.NormalizationForm.FormC)
                .Replace("é", "e").Replace("É", "E")
                .Replace("á", "a").Replace("Á", "A")
                .Replace("í", "i").Replace("Í", "I")
                .Replace("ó", "o").Replace("Ó", "O")
                .Replace("ú", "u").Replace("Ú", "U")
                .Replace("\u00A0", " ").Replace("\u200B", "")
                .Replace("\u2009", " ").Replace("\u202F", " ")
                .Trim();

            while (limpio.Contains("  "))
                limpio = limpio.Replace("  ", " ");

            return limpio;
        }

        private async Task RegenerarCalendarioFuturo(int userId)
        {
            try
            {
                var fechaHoy = DateOnly.FromDateTime(DateTime.Today);

                var diasFuturos = await _context.DiasCalendarioEmpleado
                    .Where(d => d.IdUsuarioEmpleadoSindicalizado == userId && d.FechaDelDia >= fechaHoy)
                    .ToListAsync();

                if (diasFuturos.Any())
                {
                    _context.DiasCalendarioEmpleado.RemoveRange(diasFuturos);
                    await _context.SaveChangesAsync();
                    _logger.LogInformation($"Eliminados {diasFuturos.Count} días futuros para usuario {userId}");
                }
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

                var areas = await _context.Areas
                    .Include(a => a.Jefe)
                    .ToListAsync();

                int areasActualizadas = 0;

                foreach (var area in areas)
                {
                    string nuevoEncargado = null;

                    if (area.JefeId.HasValue && area.Jefe != null)
                    {
                        nuevoEncargado = area.Jefe.FullName;
                    }
                    else
                    {
                        var encargadosConFrecuencia = await _context.RolesEmpleadosSAP
                            .Where(r => r.UnidadOrganizativa == area.UnidadOrganizativaSap &&
                                       !string.IsNullOrEmpty(r.EncargadoRegistro))
                            .GroupBy(r => r.EncargadoRegistro)
                            .Select(g => new { EncargadoRegistro = g.Key, Frecuencia = g.Count() })
                            .OrderByDescending(x => x.Frecuencia)
                            .ToListAsync();

                        if (encargadosConFrecuencia.Any())
                            nuevoEncargado = encargadosConFrecuencia.First().EncargadoRegistro;
                        else
                        {
                            _logger.LogWarning($"⚠️ Area {area.AreaId} ({area.UnidadOrganizativaSap}): Sin JefeId y sin EncargadoRegistro en RolesEmpleadosSAP");
                            continue;
                        }
                    }

                    var encargadoActualNormalizado = RemoverAcentos(area.EncargadoRegistro ?? "").ToLower().Trim();
                    var encargadoNuevoNormalizado = RemoverAcentos(nuevoEncargado).ToLower().Trim();

                    if (encargadoActualNormalizado != encargadoNuevoNormalizado)
                    {
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