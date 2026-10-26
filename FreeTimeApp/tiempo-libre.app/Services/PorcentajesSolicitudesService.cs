using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using tiempo_libre.DTOs;
using tiempo_libre.Models;
using tiempo_libre.Models.Enums;

namespace tiempo_libre.Services
{
    /// <summary>
    /// "% Turno" y "% Día" para las solicitudes que no los guardan (vacación
    /// laborada, post-incapacidad, día empresa, edición de días empresa), para
    /// que el jefe las vea con el mismo formato que "Solicitudes de
    /// Reprogramaciones" (oct-2026). Se calculan igual que ahí:
    /// - % Turno: ausentes del grupo del empleado ese día contándolo a él, sobre
    ///   el personal activo del grupo (lo que guarda la reprogramación al
    ///   solicitarse, vía AusenciaService). Aquí se toma del mismo cálculo que
    ///   pinta el calendario del área.
    /// - % Día: misma fórmula que ReprogramacionService/FestivoTrabajadoService
    ///   (vacaciones activas + permisos SAP + festivos trabajados aprobados del
    ///   área, sobre el personal activo del área), salvo que aquí un permiso
    ///   pedido en la app que sigue pendiente o se rechazó no cuenta como ausencia
    ///   (igual que en el calendario).
    /// No modifica nada; solo consulta.
    /// </summary>
    public class PorcentajesSolicitudesService
    {
        public const int MaximoPorConsulta = 400;

        private readonly FreeTimeDbContext _db;
        private readonly AusenciaService _ausencias;
        private readonly LimitePorcentajeService _limites;
        private readonly ILogger<PorcentajesSolicitudesService> _logger;

        public PorcentajesSolicitudesService(FreeTimeDbContext db, AusenciaService ausencias,
            LimitePorcentajeService limites, ILogger<PorcentajesSolicitudesService> logger)
        {
            _db = db;
            _ausencias = ausencias;
            _limites = limites;
            _logger = logger;
        }

        public async Task<List<PorcentajeSolicitudDto>> CalcularAsync(IEnumerable<PorcentajeSolicitudItem> entrada)
        {
            var items = (entrada ?? Enumerable.Empty<PorcentajeSolicitudItem>())
                .Where(i => i != null && (i.EmpleadoId > 0 || i.Nomina > 0) && !string.IsNullOrWhiteSpace(i.Clave))
                .Take(MaximoPorConsulta)
                .ToList();
            if (items.Count == 0) return new List<PorcentajeSolicitudDto>();

            // Permisos: solo traen la nómina.
            var nominasSinId = items.Where(i => i.EmpleadoId <= 0).Select(i => i.Nomina!.Value).Distinct().ToList();
            if (nominasSinId.Count > 0)
            {
                var idPorNomina = (await _db.Users.AsNoTracking()
                        .Where(u => u.Nomina.HasValue && nominasSinId.Contains(u.Nomina.Value))
                        .Select(u => new { Nomina = u.Nomina!.Value, u.Id })
                        .ToListAsync())
                    .GroupBy(u => u.Nomina)
                    .ToDictionary(g => g.Key, g => g.First().Id);
                foreach (var i in items.Where(i => i.EmpleadoId <= 0))
                    i.EmpleadoId = idPorNomina.TryGetValue(i.Nomina!.Value, out var id) ? id : 0;
                items = items.Where(i => i.EmpleadoId > 0).ToList();
            }

            var empleadoIds = items.Select(i => i.EmpleadoId).Distinct().ToList();
            var empleados = (await _db.Users.AsNoTracking()
                    .Where(u => empleadoIds.Contains(u.Id))
                    .Select(u => new
                    {
                        u.Id,
                        u.GrupoId,
                        AreaId = u.Grupo != null ? (int?)u.Grupo.AreaId : u.AreaId,
                        Grupo = u.Grupo != null ? u.Grupo.Rol : null,
                        Area = u.Grupo != null && u.Grupo.Area != null
                            ? u.Grupo.Area.NombreGeneral
                            : u.Area != null ? u.Area.NombreGeneral : null
                    })
                    .ToListAsync())
                .ToDictionary(e => e.Id);

            var conArea = items
                .Where(i => empleados.TryGetValue(i.EmpleadoId, out var e) && e.AreaId.HasValue)
                .ToList();

            var turno = await PorcentajeTurnoAsync(conArea, i => empleados[i.EmpleadoId].AreaId!.Value,
                i => empleados[i.EmpleadoId].GrupoId);
            var conGrupo = conArea.Where(i => empleados[i.EmpleadoId].GrupoId.HasValue).ToList();
            var limites = conGrupo.Count == 0 ? null : await _limites.PrecargarAsync(
                conGrupo.Select(i => empleados[i.EmpleadoId].GrupoId!.Value),
                conGrupo.Min(i => i.Fecha), conGrupo.Max(i => i.Fecha));

            var dia = await PorcentajeDiaAsync(conArea
                .Select(i => (AreaId: empleados[i.EmpleadoId].AreaId!.Value, i.Fecha))
                .Distinct()
                .ToList());

            return items.Select(i =>
            {
                empleados.TryGetValue(i.EmpleadoId, out var e);
                decimal? pctTurno = turno.TryGetValue((i.EmpleadoId, i.Fecha), out var t) ? t : null;
                decimal? pctDia = e?.AreaId != null && dia.TryGetValue((e.AreaId.Value, i.Fecha), out var d) ? d : null;
                return new PorcentajeSolicitudDto
                {
                    Clave = i.Clave,
                    Area = e?.Area ?? string.Empty,
                    Grupo = e?.Grupo ?? string.Empty,
                    PorcentajeTurno = pctTurno,
                    PorcentajeDia = pctDia,
                    PorcentajeMaximo = limites != null && e?.GrupoId != null ? limites.Limite(e.GrupoId.Value, i.Fecha) : null
                };
            }).ToList();
        }

        /// <summary>
        /// Ausentes distintos del grupo ese día + el empleado, sobre el personal
        /// activo del grupo. Se pide al cálculo del calendario por área y mes (una
        /// consulta por bloque, no una por solicitud).
        /// </summary>
        private async Task<Dictionary<(int EmpleadoId, DateOnly Fecha), decimal>> PorcentajeTurnoAsync(
            List<PorcentajeSolicitudItem> items, Func<PorcentajeSolicitudItem, int> areaDe,
            Func<PorcentajeSolicitudItem, int?> grupoDe)
        {
            var resultado = new Dictionary<(int, DateOnly), decimal>();
            foreach (var bloque in items.GroupBy(i => (Area: areaDe(i), i.Fecha.Year, i.Fecha.Month)))
            {
                var fechas = bloque.Select(i => i.Fecha).ToList();
                try
                {
                    var r = await _ausencias.CalcularAusenciasPorFechasAsync(new ConsultaAusenciaRequest
                    {
                        FechaInicio = fechas.Min(),
                        FechaFin = fechas.Max(),
                        AreaId = bloque.Key.Area
                    });
                    if (!r.Success || r.Data == null) continue;
                    var porFecha = r.Data.GroupBy(d => d.Fecha).ToDictionary(g => g.Key, g => g.First());

                    foreach (var i in bloque)
                    {
                        var grupoId = grupoDe(i);
                        if (grupoId == null || !porFecha.TryGetValue(i.Fecha, out var delDia)) continue;
                        var grupo = delDia.AusenciasPorGrupo.FirstOrDefault(g => g.GrupoId == grupoId.Value);
                        if (grupo == null || grupo.PersonalTotal <= 0) continue;

                        var ausentes = grupo.EmpleadosAusentes.Select(a => a.EmpleadoId).ToHashSet();
                        ausentes.Add(i.EmpleadoId);
                        var pct = Math.Round((decimal)ausentes.Count / grupo.PersonalTotal * 100m, 2);
                        resultado[(i.EmpleadoId, i.Fecha)] = Math.Clamp(pct, 0m, 100m);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "No se pudo calcular el % de turno del área {AreaId} en {Anio}-{Mes}",
                        bloque.Key.Area, bloque.Key.Year, bloque.Key.Month);
                }
            }
            return resultado;
        }

        /// <summary>Misma fórmula que el "% Día" de Solicitudes de Reprogramaciones.</summary>
        private async Task<Dictionary<(int AreaId, DateOnly Fecha), decimal>> PorcentajeDiaAsync(
            List<(int AreaId, DateOnly Fecha)> pares)
        {
            var resultado = new Dictionary<(int, DateOnly), decimal>();
            if (pares.Count == 0) return resultado;

            var areas = pares.Select(p => p.AreaId).Distinct().ToList();
            var fechas = pares.Select(p => p.Fecha).Distinct().ToList();
            var fechaMin = fechas.Min();
            var fechaMax = fechas.Max();

            var grupos = await _db.Grupos.AsNoTracking()
                .Where(g => areas.Contains(g.AreaId))
                .Select(g => new { g.GrupoId, g.AreaId })
                .ToListAsync();
            var grupoIds = grupos.Select(g => g.GrupoId).Distinct().ToList();

            var activos = await _db.Users.AsNoTracking()
                .Where(u => grupoIds.Contains(u.GrupoId ?? 0) && u.Status == UserStatus.Activo)
                .Select(u => new { u.Id, u.GrupoId, u.Nomina })
                .ToListAsync();
            var idsActivos = activos.Select(e => e.Id).ToList();
            var nominasActivas = activos.Where(e => e.Nomina.HasValue).Select(e => e.Nomina!.Value).Distinct().ToList();
            var nominaAId = activos.Where(e => e.Nomina.HasValue)
                .GroupBy(e => e.Nomina!.Value)
                .ToDictionary(g => g.Key, g => g.First().Id);

            var vacaciones = await _db.VacacionesProgramadas.AsNoTracking()
                .Where(v => fechas.Contains(v.FechaVacacion) && v.EstadoVacacion == "Activa" &&
                            idsActivos.Contains(v.EmpleadoId))
                .Select(v => new { v.EmpleadoId, v.FechaVacacion })
                .Distinct()
                .ToListAsync();

            var permisos = await _db.PermisosEIncapacidadesSAP.AsNoTracking()
                .Where(p => nominasActivas.Contains(p.Nomina) && p.Desde <= fechaMax && p.Hasta >= fechaMin &&
                            (p.FechaSolicitud == null || p.EstadoSolicitud == "Aprobada"))
                .Select(p => new { p.Nomina, p.Desde, p.Hasta })
                .ToListAsync();

            var festivos = await _db.SolicitudesFestivosTrabajados.AsNoTracking()
                .Where(f => fechas.Contains(f.FechaNuevaSolicitada) && f.EstadoSolicitud == "Aprobada" &&
                            nominasActivas.Contains(f.Nomina))
                .Select(f => new { f.Nomina, f.FechaNuevaSolicitada })
                .Distinct()
                .ToListAsync();

            foreach (var (areaId, fecha) in pares)
            {
                var gruposDelArea = grupos.Where(g => g.AreaId == areaId).Select(g => g.GrupoId).ToHashSet();
                var delArea = activos.Where(e => gruposDelArea.Contains(e.GrupoId ?? 0)).ToList();
                if (delArea.Count == 0) continue;

                var ids = delArea.Select(e => e.Id).ToHashSet();
                var nominas = delArea.Where(e => e.Nomina.HasValue).Select(e => e.Nomina!.Value).ToHashSet();

                var ausentes = vacaciones
                    .Where(v => v.FechaVacacion == fecha && ids.Contains(v.EmpleadoId))
                    .Select(v => v.EmpleadoId)
                    .ToHashSet();
                ausentes.UnionWith(permisos
                    .Where(p => nominas.Contains(p.Nomina) && p.Desde <= fecha && p.Hasta >= fecha &&
                                nominaAId.ContainsKey(p.Nomina))
                    .Select(p => nominaAId[p.Nomina]));
                ausentes.UnionWith(festivos
                    .Where(f => f.FechaNuevaSolicitada == fecha && nominas.Contains(f.Nomina) &&
                                nominaAId.ContainsKey(f.Nomina))
                    .Select(f => nominaAId[f.Nomina]));

                resultado[(areaId, fecha)] = Math.Round((decimal)ausentes.Count / delArea.Count * 100m, 2);
            }
            return resultado;
        }
    }
}
