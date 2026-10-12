using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using tiempo_libre.DTOs;
using tiempo_libre.Helpers;
using tiempo_libre.Models;

namespace tiempo_libre.Services
{
    /// <summary>
    /// Días asignados por la empresa que caen en DESCANSO según el rol actual
    /// del grupo del empleado.
    ///
    /// Pasa sobre todo cuando un empleado cambia de grupo: sus días de empresa se
    /// asignaron con el rol del grupo anterior y en el nuevo algunos caen en su
    /// descanso (32812995, oct-2026: "coincide con su descanso por cambio de
    /// grupo"). Antes solo se notaba cuando alguien lo veía en el calendario de
    /// un empleado; esta lista revisa a todos de una vez para que el superusuario
    /// los reprograme.
    ///
    /// El turno de cada día sale de CalendarioGrupoService.ObtenerCalendarioGrupoAsync,
    /// el mismo cálculo del rol semanal y del calendario del empleado, así que la
    /// lista dice lo mismo que esas pantallas. No considera permutas individuales.
    /// </summary>
    public class DiasEmpresaEnDescansoService
    {
        private static readonly string[] TiposEmpresa = { "Automatica", "AsignadaAutomaticamente", "DiaEmpresaReprogramado" };

        private readonly FreeTimeDbContext _db;
        private readonly CalendarioGrupoService _calendario;
        private readonly ILogger<DiasEmpresaEnDescansoService> _logger;

        public DiasEmpresaEnDescansoService(
            FreeTimeDbContext db,
            CalendarioGrupoService calendario,
            ILogger<DiasEmpresaEnDescansoService> logger)
        {
            _db = db;
            _calendario = calendario;
            _logger = logger;
        }

        public async Task<ApiResponse<DiasEmpresaEnDescansoResponse>> ObtenerAsync(int anio, int? areaId = null)
        {
            if (anio < 2020 || anio > 2050)
                return new ApiResponse<DiasEmpresaEnDescansoResponse>(false, null, "El año debe estar entre 2020 y 2050.");

            var inicio = new DateOnly(anio, 1, 1);
            var fin = new DateOnly(anio, 12, 31);

            var empleadosQuery = _db.Users
                .Include(u => u.Grupo).ThenInclude(g => g!.Area)
                .Where(u => u.Status == Models.Enums.UserStatus.Activo && u.GrupoId.HasValue);
            if (areaId.HasValue)
                empleadosQuery = empleadosQuery.Where(u => u.Grupo!.AreaId == areaId.Value);

            var empleados = await empleadosQuery
                .Select(u => new
                {
                    u.Id,
                    u.Nomina,
                    u.FullName,
                    GrupoId = u.GrupoId!.Value,
                    GrupoRol = u.Grupo!.Rol,
                    AreaId = (int?)u.Grupo.AreaId,
                    Area = u.Grupo.Area != null ? u.Grupo.Area.NombreGeneral : ""
                })
                .ToListAsync();
            var empleadoPorId = empleados.ToDictionary(e => e.Id);
            var ids = empleados.Select(e => e.Id).ToList();

            var diasEmpresa = await _db.VacacionesProgramadas
                .Where(v => ids.Contains(v.EmpleadoId) &&
                            v.EstadoVacacion == "Activa" &&
                            TiposEmpresa.Contains(v.TipoVacacion) &&
                            v.FechaVacacion >= inicio && v.FechaVacacion <= fin)
                .Select(v => new { v.Id, v.EmpleadoId, v.FechaVacacion, v.TipoVacacion })
                .ToListAsync();

            var pendientes = (await _db.SolicitudesReprogramacionDiaEmpresa
                    .Where(s => s.EstadoSolicitud == "Pendiente" && ids.Contains(s.EmpleadoId))
                    .Select(s => s.VacacionOriginalId)
                    .ToListAsync())
                .ToHashSet();

            // Turno de cada día por grupo, calculado una sola vez por grupo.
            var turnoPorGrupo = new Dictionary<int, Dictionary<DateOnly, string>>();
            var gruposSinRol = new HashSet<int>();
            foreach (var grupoId in diasEmpresa.Select(d => empleadoPorId[d.EmpleadoId].GrupoId).Distinct())
            {
                var cal = await _calendario.ObtenerCalendarioGrupoAsync(
                    grupoId, inicio.ToDateTime(TimeOnly.MinValue), fin.ToDateTime(TimeOnly.MinValue));
                if (!cal.Success || cal.Data == null)
                {
                    gruposSinRol.Add(grupoId);
                    continue;
                }
                turnoPorGrupo[grupoId] = cal.Data.Calendario
                    .GroupBy(d => DateOnly.FromDateTime(d.Fecha))
                    .ToDictionary(g => g.Key, g => g.First().Turno ?? string.Empty);
            }
            if (gruposSinRol.Count > 0)
                _logger.LogWarning("Días de empresa en descanso {Anio}: {N} grupo(s) sin rol calculable: {Grupos}",
                    anio, gruposSinRol.Count, string.Join(", ", gruposSinRol));

            var hoy = DateOnly.FromDateTime(DateTime.Today);
            var resultado = new List<DiaEmpresaEnDescansoDto>();
            foreach (var d in diasEmpresa)
            {
                var emp = empleadoPorId[d.EmpleadoId];
                if (!turnoPorGrupo.TryGetValue(emp.GrupoId, out var turnos)) continue;
                if (!turnos.TryGetValue(d.FechaVacacion, out var turno) || !TurnosHelper.EsDescanso(turno)) continue;

                resultado.Add(new DiaEmpresaEnDescansoDto
                {
                    EmpleadoId = emp.Id,
                    Nomina = emp.Nomina,
                    Nombre = emp.FullName ?? string.Empty,
                    AreaId = emp.AreaId,
                    Area = emp.Area ?? string.Empty,
                    GrupoId = emp.GrupoId,
                    Grupo = emp.GrupoRol ?? string.Empty,
                    VacacionId = d.Id,
                    Fecha = d.FechaVacacion,
                    TipoVacacion = d.TipoVacacion,
                    Turno = turno,
                    YaPaso = d.FechaVacacion < hoy,
                    TieneSolicitudPendiente = pendientes.Contains(d.Id)
                });
            }

            // Primero lo que todavía se puede arreglar a tiempo, por área, grupo y nómina.
            resultado = resultado
                .OrderBy(r => r.YaPaso)
                .ThenBy(r => r.Area)
                .ThenBy(r => r.Grupo)
                .ThenBy(r => r.Nomina)
                .ThenBy(r => r.Fecha)
                .ToList();

            return new ApiResponse<DiasEmpresaEnDescansoResponse>(true, new DiasEmpresaEnDescansoResponse
            {
                Anio = anio,
                TotalDias = resultado.Count,
                TotalEmpleados = resultado.Select(r => r.EmpleadoId).Distinct().Count(),
                Dias = resultado
            }, null);
        }
    }
}
