using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using tiempo_libre.DTOs;
using tiempo_libre.Helpers;
using tiempo_libre.Models;

namespace tiempo_libre.Services
{
    /// <summary>
    /// Calcula el código de turno FINAL por empleado y día para un grupo,
    /// aplicando exactamente la misma cadena de prioridades que
    /// RolesSemanaController.ObtenerRolesSemanales (el rol semanal que ve el
    /// usuario en WeeklyRoles.tsx).
    ///
    /// Esto permite que el dashboard de tiempo extra y ausencias cuente
    /// sobre la MISMA fuente que el rol, evitando divergencias por
    /// reprogramaciones, días empresa, festivos trabajados, permutas, etc.
    ///
    /// Códigos posibles: C, E, P, A, H, M, R, S, O, G, V, F, D, 1, 2, 3
    /// (o el ClAbPre crudo si no está mapeado).
    /// </summary>
    public class RolSemanalCalculoService
    {
        private readonly FreeTimeDbContext _db;
        private readonly CalendariosEmpleadosService _calendariosService;
        private readonly CalendarioGrupoService _calendarioGrupoService;

        public RolSemanalCalculoService(
            FreeTimeDbContext db,
            CalendariosEmpleadosService calendariosService,
            CalendarioGrupoService calendarioGrupoService)
        {
            _db = db;
            _calendariosService = calendariosService;
            _calendarioGrupoService = calendarioGrupoService;
        }

        /// <summary>
        /// Devuelve un diccionario (empleadoId, fecha) → CodigoTurno final para
        /// todos los empleados activos del grupo en el rango [inicio, fin].
        /// </summary>
        public async Task<Dictionary<(int empleadoId, DateOnly fecha), string>> CalcularCodigosTurnoGrupoAsync(
            int grupoId, DateOnly inicio, DateOnly fin)
        {
            var resultado = new Dictionary<(int, DateOnly), string>();

            var inicioDt = inicio.ToDateTime(TimeOnly.MinValue);
            var finDt = fin.ToDateTime(TimeOnly.MinValue);

            var grupo = await _db.Grupos.FirstOrDefaultAsync(g => g.GrupoId == grupoId);
            var rolGrupo = grupo?.Rol ?? string.Empty;

            var empleados = await _db.Users
                .Where(u => u.GrupoId == grupoId && u.Status == tiempo_libre.Models.Enums.UserStatus.Activo)
                .Select(u => new { u.Id, u.Nomina, u.FullName })
                .ToListAsync();

            if (empleados.Count == 0) return resultado;

            var empleadosIds = empleados.Select(e => e.Id).ToList();

            // 1) Calendario real de empleados → turnosReales[fecha][empId]
            var turnosReales = new Dictionary<string, Dictionary<int, string>>();
            var calendarioResponse = await _calendariosService.ObtenerCalendarioPorGrupoAsync(grupoId, inicioDt, finDt);
            if (calendarioResponse.Success && calendarioResponse.Data != null)
            {
                foreach (var empCalendario in calendarioResponse.Data)
                {
                    foreach (var dia in empCalendario.Dias)
                    {
                        var fechaStr = dia.Fecha.ToString("yyyy-MM-dd");
                        if (!turnosReales.ContainsKey(fechaStr))
                            turnosReales[fechaStr] = new Dictionary<int, string>();
                        turnosReales[fechaStr][empCalendario.IdUsuarioEmpleadoSindicalizado] =
                            ResolverTurno(dia.TipoActividadDelDia, rolGrupo, DateOnly.FromDateTime(dia.Fecha));
                    }
                }
            }

            // Calendario base del grupo (fallback)
            var baseCalendarResponse = await _calendarioGrupoService.ObtenerCalendarioGrupoAsync(grupoId, inicioDt, finDt);
            if (!baseCalendarResponse.Success || baseCalendarResponse.Data == null)
                return resultado;
            var baseCalendar = baseCalendarResponse.Data.Calendario;

            // Reprogramaciones aprobadas
            var fechasReprogramadasAprobadas = await _db.SolicitudesReprogramacion
                .Where(s => s.EstadoSolicitud == "Aprobada" && empleadosIds.Contains(s.EmpleadoId))
                .Select(s => new { s.EmpleadoId, s.FechaOriginalGuardada })
                .ToListAsync();
            var reprogramadasSet = new HashSet<(int, DateOnly)>(
                fechasReprogramadasAprobadas.Select(r => (r.EmpleadoId, r.FechaOriginalGuardada)));

            // Permisos / incapacidades SAP
            var empleadosNominas = empleados.Where(e => e.Nomina.HasValue).Select(e => e.Nomina!.Value).ToList();
            var permisosIncapacidades = await _db.PermisosEIncapacidadesSAP
                .Where(p => empleadosNominas.Contains(p.Nomina) &&
                            p.Hasta >= inicio && p.Desde <= fin &&
                            (p.FechaSolicitud == null || p.EstadoSolicitud == "Aprobada"))
                .ToListAsync();

            var permisosPorEmpleadoYFecha = new Dictionary<string, Dictionary<int, string>>();
            foreach (var permiso in permisosIncapacidades)
            {
                var fechaActual = permiso.Desde;
                while (fechaActual <= permiso.Hasta)
                {
                    if (permiso.ClAbPre == 1100)
                    {
                        var empNom = empleados.FirstOrDefault(e => e.Nomina == permiso.Nomina);
                        if (empNom != null && reprogramadasSet.Contains((empNom.Id, fechaActual)))
                        {
                            fechaActual = fechaActual.AddDays(1);
                            continue;
                        }
                    }

                    var fechaStr = fechaActual.ToString("yyyy-MM-dd");
                    if (!permisosPorEmpleadoYFecha.ContainsKey(fechaStr))
                        permisosPorEmpleadoYFecha[fechaStr] = new Dictionary<int, string>();

                    var clave = MapearClaveVisualizacion(permiso.ClAbPre.ToString(), permiso.ClaseAbsentismo ?? string.Empty);
                    if (!permisosPorEmpleadoYFecha[fechaStr].ContainsKey(permiso.Nomina))
                        permisosPorEmpleadoYFecha[fechaStr][permiso.Nomina] = clave;

                    fechaActual = fechaActual.AddDays(1);
                }
            }

            // Permutas aprobadas (ambos empleados)
            var permutasAprobadas = await _db.Permutas
                .Where(p => p.FechaPermuta >= inicio && p.FechaPermuta <= fin &&
                            p.EstadoSolicitud == "Aprobada" &&
                            (empleadosIds.Contains(p.EmpleadoOrigenId) ||
                             (p.EmpleadoDestinoId.HasValue && empleadosIds.Contains(p.EmpleadoDestinoId.Value))))
                .ToListAsync();

            var permutasPorEmpleadoYFecha = new Dictionary<int, Dictionary<string, string>>();
            foreach (var permuta in permutasAprobadas)
            {
                var fechaStr = permuta.FechaPermuta.ToString("yyyy-MM-dd");
                if (!permutasPorEmpleadoYFecha.ContainsKey(permuta.EmpleadoOrigenId))
                    permutasPorEmpleadoYFecha[permuta.EmpleadoOrigenId] = new Dictionary<string, string>();

                if (permuta.EmpleadoDestinoId.HasValue && !string.IsNullOrEmpty(permuta.TurnoEmpleadoDestino))
                    permutasPorEmpleadoYFecha[permuta.EmpleadoOrigenId][fechaStr] = permuta.TurnoEmpleadoDestino;
                else
                    permutasPorEmpleadoYFecha[permuta.EmpleadoOrigenId][fechaStr] = permuta.TurnoEmpleadoOrigen;

                if (permuta.EmpleadoDestinoId.HasValue)
                {
                    if (!permutasPorEmpleadoYFecha.ContainsKey(permuta.EmpleadoDestinoId.Value))
                        permutasPorEmpleadoYFecha[permuta.EmpleadoDestinoId.Value] = new Dictionary<string, string>();
                    permutasPorEmpleadoYFecha[permuta.EmpleadoDestinoId.Value][fechaStr] = permuta.TurnoEmpleadoOrigen;
                }
            }

            // Festivos trabajados aprobados
            var festivosAprobados = await _db.SolicitudesFestivosTrabajados
                .Where(f => f.FechaNuevaSolicitada >= inicio && f.FechaNuevaSolicitada <= fin &&
                            f.EstadoSolicitud == "Aprobada" && empleadosIds.Contains(f.EmpleadoId))
                .Select(f => new { f.EmpleadoId, f.FechaNuevaSolicitada })
                .ToListAsync();
            var festivosSet = new HashSet<(int, string)>(
                festivosAprobados.Select(f => (f.EmpleadoId, f.FechaNuevaSolicitada.ToString("yyyy-MM-dd"))));

            // Días empresa reprogramados → "C"
            var diasEmpresaReprogList = await _db.VacacionesProgramadas
                .Where(v => empleadosIds.Contains(v.EmpleadoId) &&
                            v.FechaVacacion >= inicio && v.FechaVacacion <= fin &&
                            v.EstadoVacacion == "Activa" && v.TipoVacacion == "DiaEmpresaReprogramado")
                .Select(v => new { v.EmpleadoId, v.FechaVacacion })
                .ToListAsync();
            var diasEmpresaReprogSet = new HashSet<(int, string)>(
                diasEmpresaReprogList.Select(v => (v.EmpleadoId, v.FechaVacacion.ToString("yyyy-MM-dd"))));

            // Construir el código por empleado y día (prioridades 0-4)
            foreach (var emp in empleados)
            {
                foreach (var dia in baseCalendar)
                {
                    var fechaStr = dia.Fecha.ToString("yyyy-MM-dd");
                    string codigoTurno;

                    if (diasEmpresaReprogSet.Contains((emp.Id, fechaStr)))
                    {
                        codigoTurno = "C";
                    }
                    else if (emp.Nomina.HasValue &&
                             permisosPorEmpleadoYFecha.ContainsKey(fechaStr) &&
                             permisosPorEmpleadoYFecha[fechaStr].ContainsKey(emp.Nomina.Value))
                    {
                        codigoTurno = permisosPorEmpleadoYFecha[fechaStr][emp.Nomina.Value];
                    }
                    else if (permutasPorEmpleadoYFecha.ContainsKey(emp.Id) &&
                             permutasPorEmpleadoYFecha[emp.Id].ContainsKey(fechaStr))
                    {
                        codigoTurno = permutasPorEmpleadoYFecha[emp.Id][fechaStr];
                    }
                    else if (turnosReales.ContainsKey(fechaStr) &&
                             turnosReales[fechaStr].ContainsKey(emp.Id))
                    {
                        codigoTurno = turnosReales[fechaStr][emp.Id];
                    }
                    else
                    {
                        codigoTurno = dia.Turno ?? string.Empty;
                        if (!string.IsNullOrEmpty(dia.Incidencia) &&
                            dia.Incidencia.StartsWith("V", StringComparison.OrdinalIgnoreCase))
                            codigoTurno = "V";
                    }

                    resultado[(emp.Id, DateOnly.FromDateTime(dia.Fecha))] = codigoTurno;
                }
            }

            // Vacaciones (programadas no canceladas + legacy) y festivos:
            // sobre códigos "normales" {1,2,3,D,""} aplica F (festivo) o V (vacación).
            var vacacionesProgramadas = await _db.VacacionesProgramadas
                .Where(v => empleadosIds.Contains(v.EmpleadoId) &&
                            v.FechaVacacion >= inicio && v.FechaVacacion <= fin &&
                            v.EstadoVacacion != "Cancelada")
                .Select(v => new { v.EmpleadoId, v.FechaVacacion })
                .ToListAsync();

            var vacacionesLegacy = await _db.Vacaciones
                .Where(v => empleadosIds.Contains(v.IdUsuarioEmpleadoSindicalizado) &&
                            v.Fecha >= inicio && v.Fecha <= fin)
                .Select(v => new { EmpleadoId = v.IdUsuarioEmpleadoSindicalizado, FechaVacacion = v.Fecha })
                .ToListAsync();

            var vacacionesSet = new HashSet<(int, DateOnly)>();
            foreach (var vac in vacacionesProgramadas)
                vacacionesSet.Add((vac.EmpleadoId, vac.FechaVacacion));
            foreach (var vac in vacacionesLegacy)
                vacacionesSet.Add((vac.EmpleadoId, vac.FechaVacacion));

            var turnosNormales = new HashSet<string> { "1", "2", "3", "D", "" };
            foreach (var key in resultado.Keys.ToList())
            {
                if (!turnosNormales.Contains(resultado[key])) continue;
                var fechaStr = key.fecha.ToString("yyyy-MM-dd");
                if (festivosSet.Contains((key.empleadoId, fechaStr)))
                    resultado[key] = "F";
                else if (vacacionesSet.Contains(key))
                    resultado[key] = "V";
            }

            return resultado;
        }

        private static string ResolverTurno(string? codigoActividad, string rolGrupo, DateOnly fecha)
        {
            if (!string.IsNullOrEmpty(codigoActividad) &&
                (codigoActividad == "1" || codigoActividad == "2" || codigoActividad == "3" || codigoActividad == "D"))
                return codigoActividad;

            if (codigoActividad == "V" || codigoActividad == "VA")
                return "V";

            return TurnosHelper.ObtenerTurnoParaFecha(rolGrupo, fecha);
        }

        private static string MapearClaveVisualizacion(string clAbPre, string? claseAbsentismo)
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
                return claseAbsentismo?.ToLower().Contains("enfermedad") == true ? "E" : "P";

            if (clAbPre == "2381")
                return claseAbsentismo?.ToLower().Contains("permiso") == true ? "H" : "A";

            return mapeo.TryGetValue(clAbPre, out var clave) ? clave : clAbPre;
        }
    }
}
