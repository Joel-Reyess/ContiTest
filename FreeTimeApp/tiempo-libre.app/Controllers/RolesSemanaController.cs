using System;
using System.Globalization;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using tiempo_libre.DTOs;
using tiempo_libre.Models;
using tiempo_libre.Services;
using tiempo_libre.Helpers;

namespace tiempo_libre.Controllers
{
    [ApiController]
    [Route("api/roles")]
    public class RolesSemanaController : ControllerBase
    {
        private readonly CalendariosEmpleadosService _calendariosService;
        private readonly CalendarioGrupoService _calendarioGrupoService;
        private readonly FreeTimeDbContext _db;

        public RolesSemanaController(
            CalendariosEmpleadosService calendariosService,
            CalendarioGrupoService calendarioGrupoService,
            FreeTimeDbContext db)
        {
            _calendariosService = calendariosService;
            _calendarioGrupoService = calendarioGrupoService;
            _db = db;
        }

        /// <summary>
        /// Obtiene los turnos semanales (lunes a domingo) de un grupo.
        /// </summary>
        /// <param name="grupoId">ID del grupo</param>
        /// <param name="fechaInicio">Fecha de inicio de la semana (yyyy-MM-dd). Se ajusta a lunes.</param>
        [HttpGet("grupo/{grupoId}/semana")]
        [Authorize(Roles = "EmpleadoSindicalizado,Empleado Sindicalizado,DelegadoSindical,Delegado Sindical,JefeArea,Jefe De Area,SuperUsuario, Lider De Grupo,IngenieroIndustrial, Ingeniero Industrial, Super Usuario")]
        public async Task<IActionResult> ObtenerRolesSemanales(
    [FromRoute] int grupoId,
    [FromQuery] DateTime fechaInicio)
        {
            try
            {
                // Alinear al lunes de esa semana
                var culture = CultureInfo.CurrentCulture;
                var diff = (7 + (fechaInicio.DayOfWeek - DayOfWeek.Monday)) % 7;
                var inicio = fechaInicio.AddDays(-diff).Date;
                var fin = inicio.AddDays(6).Date;

                var grupo = await _db.Grupos.FirstOrDefaultAsync(g => g.GrupoId == grupoId);
                var rolGrupo = grupo?.Rol ?? string.Empty;

                // Obtener todos los empleados activos del grupo
                var empleados = await _db.Users
                    .Where(u => u.GrupoId == grupoId && u.Status == tiempo_libre.Models.Enums.UserStatus.Activo)
                    .Select(u => new { u.Id, u.Nomina, u.FullName })
                    .ToListAsync();

                // 1) Intentar con calendario real de empleados
                var calendarioResponse = await _calendariosService.ObtenerCalendarioPorGrupoAsync(grupoId, inicio, fin);

                List<WeeklyRoleEntryDto> semana = new List<WeeklyRoleEntryDto>();

                // Crear un diccionario con los turnos reales para facilitar la búsqueda
                var turnosReales = new Dictionary<string, Dictionary<int, string>>();

                if (calendarioResponse.Success && calendarioResponse.Data != null)
                {
                    foreach (var empCalendario in calendarioResponse.Data)
                    {
                        foreach (var dia in empCalendario.Dias)
                        {
                            var fechaStr = dia.Fecha.ToString("yyyy-MM-dd");
                            if (!turnosReales.ContainsKey(fechaStr))
                            {
                                turnosReales[fechaStr] = new Dictionary<int, string>();
                            }
                            turnosReales[fechaStr][empCalendario.IdUsuarioEmpleadoSindicalizado] =
                                ResolverTurno(dia.TipoActividadDelDia, rolGrupo, DateOnly.FromDateTime(dia.Fecha));
                        }
                    }
                }

                // Generar el calendario base del grupo para usar como fallback
                var baseCalendarResponse = await _calendarioGrupoService.ObtenerCalendarioGrupoAsync(grupoId, inicio, fin);
                if (!baseCalendarResponse.Success || baseCalendarResponse.Data == null)
                {
                    return BadRequest(new ApiResponse<object>(false, null, baseCalendarResponse.ErrorMsg ?? "No se pudo obtener el calendario del grupo"));
                }

                var baseCalendar = baseCalendarResponse.Data.Calendario;

                // NUEVO: Consultar permisos e incapacidades de SAP
                var empleadosNominas = empleados
                    .Where(e => e.Nomina.HasValue)
                    .Select(e => e.Nomina!.Value)
                    .ToList();

                var permisosIncapacidades = await _db.PermisosEIncapacidadesSAP
                    .Where(p => empleadosNominas.Contains(p.Nomina) &&
                p.Hasta >= DateOnly.FromDateTime(inicio) &&
                p.Desde <= DateOnly.FromDateTime(fin) &&
                // ✅ Solo mostrar: SAP (sin FechaSolicitud) O Aprobadas
                (p.FechaSolicitud == null || p.EstadoSolicitud == "Aprobada"))
                    .ToListAsync();

                // Crear diccionario de permisos por empleado y fecha
                var permisosPorEmpleadoYFecha = new Dictionary<string, Dictionary<int, string>>();

                foreach (var permiso in permisosIncapacidades)
                {
                    var fechaActual = permiso.Desde;
                    while (fechaActual <= permiso.Hasta)
                    {
                        var fechaStr = fechaActual.ToString("yyyy-MM-dd");
                        if (!permisosPorEmpleadoYFecha.ContainsKey(fechaStr))
                        {
                            permisosPorEmpleadoYFecha[fechaStr] = new Dictionary<int, string>();
                        }

                        var claveVisualizacion = MapearClaveVisualizacion(permiso.ClAbPre.ToString(), permiso.ClaseAbsentismo ?? string.Empty);

                        if (!permisosPorEmpleadoYFecha[fechaStr].ContainsKey(permiso.Nomina))
                        {
                            permisosPorEmpleadoYFecha[fechaStr][permiso.Nomina] = claveVisualizacion;
                        }

                        fechaActual = fechaActual.AddDays(1);
                    }
                }

                // Consultar vacaciones
                var empleadosIds = empleados.Select(e => e.Id).ToList();

                // NUEVO: Consultar permutas aprobadas
                var permutasAprobadas = await _db.Permutas
                    .Where(p => empleadosIds.Contains(p.EmpleadoOrigenId) &&
                                p.FechaPermuta >= DateOnly.FromDateTime(inicio) &&
                                p.FechaPermuta <= DateOnly.FromDateTime(fin) &&
                                p.EstadoSolicitud == "Aprobada")
                    .Select(p => new {
                        p.EmpleadoOrigenId,
                        p.EmpleadoDestinoId,
                        p.FechaPermuta,
                        p.TurnoEmpleadoOrigen,
                        p.TurnoEmpleadoDestino
                    })
                    .ToListAsync();

                // Crear diccionario de permutas por empleado y fecha
                var permutasPorEmpleadoYFecha = new Dictionary<int, Dictionary<string, string>>();

                foreach (var permuta in permutasAprobadas)
                {
                    var fechaStr = permuta.FechaPermuta.ToString("yyyy-MM-dd");

                    // Asignar turno al empleado origen
                    if (!permutasPorEmpleadoYFecha.ContainsKey(permuta.EmpleadoOrigenId))
                    {
                        permutasPorEmpleadoYFecha[permuta.EmpleadoOrigenId] = new Dictionary<string, string>();
                    }

                    // El empleado origen toma el turno que originalmente tenía el destino
                    var turnoNuevoOrigen = permuta.TurnoEmpleadoDestino ?? permuta.TurnoEmpleadoOrigen;
                    permutasPorEmpleadoYFecha[permuta.EmpleadoOrigenId][fechaStr] = turnoNuevoOrigen;

                    // Si hay empleado destino (no es cambio individual), también actualizarlo
                    if (permuta.EmpleadoDestinoId.HasValue)
                    {
                        if (!permutasPorEmpleadoYFecha.ContainsKey(permuta.EmpleadoDestinoId.Value))
                        {
                            permutasPorEmpleadoYFecha[permuta.EmpleadoDestinoId.Value] = new Dictionary<string, string>();
                        }

                        // El empleado destino toma el turno que originalmente tenía el origen
                        permutasPorEmpleadoYFecha[permuta.EmpleadoDestinoId.Value][fechaStr] = permuta.TurnoEmpleadoOrigen;
                    }
                }

                // Para cada empleado y cada día de la semana, asegurar una entrada
                foreach (var emp in empleados)
                {
                    for (int i = 0; i < baseCalendar.Count; i++)
                    {
                        var dia = baseCalendar[i];
                        var fechaStr = dia.Fecha.ToString("yyyy-MM-dd");

                        string codigoTurno;

                        // PRIORIDAD 1: Verificar si hay un permiso/incapacidad
                        if (emp.Nomina.HasValue &&
                            permisosPorEmpleadoYFecha.ContainsKey(fechaStr) &&
                            permisosPorEmpleadoYFecha[fechaStr].ContainsKey(emp.Nomina.Value))
                        {
                            codigoTurno = permisosPorEmpleadoYFecha[fechaStr][emp.Nomina.Value];
                        }
                        // ✅ PRIORIDAD 2: Verificar si hay una permuta aprobada
                        else if (permutasPorEmpleadoYFecha.ContainsKey(emp.Id) &&
                                 permutasPorEmpleadoYFecha[emp.Id].ContainsKey(fechaStr))
                        {
                            codigoTurno = permutasPorEmpleadoYFecha[emp.Id][fechaStr];
                        }
                        // PRIORIDAD 3: Verificar si hay un turno real
                        else if (turnosReales.ContainsKey(fechaStr) &&
                                 turnosReales[fechaStr].ContainsKey(emp.Id))
                        {
                            codigoTurno = turnosReales[fechaStr][emp.Id];
                        }
                        // PRIORIDAD 4: Usar turno del patrón del grupo
                        else
                        {
                            codigoTurno = dia.Turno ?? string.Empty;

                            if (!string.IsNullOrEmpty(dia.Incidencia) &&
                                dia.Incidencia.StartsWith("V", StringComparison.OrdinalIgnoreCase))
                            {
                                codigoTurno = "V";
                            }
                        }

                        semana.Add(new WeeklyRoleEntryDto
                        {
                            Fecha = fechaStr,
                            CodigoTurno = codigoTurno,
                            Empleado = new WeeklyRoleEmployeeDto
                            {
                                Id = emp.Id,
                                Nomina = emp.Nomina?.ToString() ?? string.Empty,
                                FullName = emp.FullName ?? string.Empty
                            }
                        });
                    }
                }

                var vacacionesProgramadas = await _db.VacacionesProgramadas
                    .Where(v => empleadosIds.Contains(v.EmpleadoId)
                                && v.FechaVacacion >= DateOnly.FromDateTime(inicio)
                                && v.FechaVacacion <= DateOnly.FromDateTime(fin)
                                && v.EstadoVacacion != "Cancelada")
                    .Select(v => new { v.EmpleadoId, v.FechaVacacion })
                    .ToListAsync();

                var vacacionesLegacy = await _db.Vacaciones
                    .Where(v => empleadosIds.Contains(v.IdUsuarioEmpleadoSindicalizado)
                                && v.Fecha >= DateOnly.FromDateTime(inicio)
                                && v.Fecha <= DateOnly.FromDateTime(fin))
                    .Select(v => new { EmpleadoId = v.IdUsuarioEmpleadoSindicalizado, FechaVacacion = v.Fecha })
                    .ToListAsync();

                var vacacionesSet = new HashSet<(int empleadoId, string fecha)>();

                var empleadosPorId = empleados.ToDictionary(e => e.Id, e => e);
                var empleadosPorNomina = empleados
                    .Where(e => e.Nomina.HasValue)
                    .ToDictionary(e => e.Nomina!.Value.ToString(), e => e);

                foreach (var vac in vacacionesProgramadas)
                {
                    var fecha = vac.FechaVacacion.ToString("yyyy-MM-dd");
                    if (empleadosPorId.ContainsKey(vac.EmpleadoId))
                    {
                        vacacionesSet.Add((vac.EmpleadoId, fecha));
                        continue;
                    }

                    var empleadoPorNomina = empleadosPorNomina.GetValueOrDefault(vac.EmpleadoId.ToString());
                    if (empleadoPorNomina != null)
                    {
                        vacacionesSet.Add((empleadoPorNomina.Id, fecha));
                    }
                }

                foreach (var vac in vacacionesLegacy)
                {
                    var fecha = vac.FechaVacacion.ToString("yyyy-MM-dd");
                    if (empleadosPorId.ContainsKey(vac.EmpleadoId))
                    {
                        vacacionesSet.Add((vac.EmpleadoId, fecha));
                        continue;
                    }

                    var empleadoPorNomina = empleadosPorNomina.GetValueOrDefault(vac.EmpleadoId.ToString());
                    if (empleadoPorNomina != null)
                    {
                        vacacionesSet.Add((empleadoPorNomina.Id, fecha));
                    }
                }

                foreach (var entry in semana)
                {
                    if (vacacionesSet.Contains((entry.Empleado.Id, entry.Fecha)))
                    {
                        entry.CodigoTurno = "V";
                    }
                }

                var response = new WeeklyRolesResponseDto
                {
                    GrupoId = grupoId,
                    GrupoNombre = grupo?.Rol,
                    Semana = semana
                };

                return Ok(new ApiResponse<WeeklyRolesResponseDto>(true, response, null));
            }
            catch (Exception ex)
            {
                return StatusCode(500, new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}"));
            }
        }

        private string MapearClaveVisualizacion(string clAbPre, string? claseAbsentismo)
        {
            var mapeo = new Dictionary<string, string>
    {
        { "2380", "P" },
        { "1331", "P" },
        { "1100", "V" },
        { "2310", "G" },
        { "2381", "A" },
        { "2396", "M" },
        { "2394", "R" },
        { "2123", "S" },
        { "1315", "O" }
    };

            if (clAbPre == "2380")
            {
                return claseAbsentismo?.ToLower().Contains("enfermedad") == true ? "E" : "P";
            }

            if (clAbPre == "2381")
            {
                return claseAbsentismo?.ToLower().Contains("permiso") == true ? "H" : "A";
            }

            return mapeo.TryGetValue(clAbPre, out var clave) ? clave : clAbPre;
        }

        private string ResolverTurno(string? codigoActividad, string rolGrupo, DateOnly fecha)
        {
            // Códigos de turno específicos
            if (!string.IsNullOrEmpty(codigoActividad) &&
                (codigoActividad == "1" || codigoActividad == "2" || codigoActividad == "3" || codigoActividad == "D"))
            {
                return codigoActividad;
            }

            // MEJORA: Manejo de códigos de vacaciones
            if (codigoActividad == "V" || codigoActividad == "VA")
            {
                return "V";
            }

            // Fallback al patrón del grupo
            return TurnosHelper.ObtenerTurnoParaFecha(rolGrupo, fecha);
        }
    }
}