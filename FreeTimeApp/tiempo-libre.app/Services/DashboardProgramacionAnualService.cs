using System;
using System.Collections.Generic;
using System.Globalization;
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
    /// Arma la foto del año: cómo quedaron repartidos los días que asignó la
    /// empresa y qué porcentaje de ausencia produce cada día.
    ///
    /// El cálculo del porcentaje es el mismo de ValidadorPorcentajeService —se
    /// reutiliza EvaluarRegla para que el tablero y el candado nunca contesten
    /// cosas distintas— pero la lectura NO va día por día: consultar 365 días ×
    /// N grupos con el servicio de a uno son decenas de miles de viajes a la
    /// base. Aquí se traen los datos del año completo en cinco consultas y el
    /// cruce se hace en memoria.
    /// </summary>
    public class DashboardProgramacionAnualService
    {
        private readonly FreeTimeDbContext _db;
        private readonly ValidadorPorcentajeService _validador;
        private readonly ILogger<DashboardProgramacionAnualService> _logger;

        public DashboardProgramacionAnualService(
            FreeTimeDbContext db,
            ValidadorPorcentajeService validador,
            ILogger<DashboardProgramacionAnualService> logger)
        {
            _db = db;
            _validador = validador;
            _logger = logger;
        }

        public async Task<ApiResponse<DashboardProgramacionAnualResponse>> ObtenerAsync(
            int anio, int? areaId = null, int? grupoId = null)
        {
            try
            {
                var config = await _db.ConfiguracionVacaciones
                    .OrderByDescending(c => c.CreatedAt)
                    .FirstOrDefaultAsync();

                if (config == null)
                    return new ApiResponse<DashboardProgramacionAnualResponse>(false, null,
                        "No hay configuración de vacaciones cargada");

                var porcentajeGlobal = config.PorcentajeAusenciaMaximo;

                // ── Grupos incluidos ────────────────────────────────────────
                var queryGrupos = _db.Grupos.Include(g => g.Area).AsQueryable();
                if (grupoId.HasValue) queryGrupos = queryGrupos.Where(g => g.GrupoId == grupoId.Value);
                else if (areaId.HasValue) queryGrupos = queryGrupos.Where(g => g.AreaId == areaId.Value);

                var grupos = await queryGrupos.ToListAsync();
                if (grupos.Count == 0)
                    return new ApiResponse<DashboardProgramacionAnualResponse>(false, null,
                        "No hay grupos para los filtros seleccionados");

                var grupoIds = grupos.Select(g => g.GrupoId).ToList();

                // ── Plantilla activa ────────────────────────────────────────
                var usuarios = await _db.Users
                    .Where(u => u.GrupoId.HasValue && grupoIds.Contains(u.GrupoId.Value)
                                && u.Status == UserStatus.Activo)
                    .Select(u => new { u.Id, GrupoId = u.GrupoId!.Value, u.Nomina })
                    .ToListAsync();

                var grupoDeUsuario = usuarios.ToDictionary(u => u.Id, u => u.GrupoId);
                var plantillaPorGrupo = usuarios
                    .GroupBy(u => u.GrupoId)
                    .ToDictionary(g => g.Key, g => g.Count());

                // Nomina -> empleadoId, para cruzar los permisos, que vienen del
                // Excel de SAP identificados por nómina y no por Id.
                var usuarioPorNomina = usuarios
                    .Where(u => u.Nomina.HasValue)
                    .GroupBy(u => u.Nomina!.Value)
                    .ToDictionary(g => g.Key, g => g.First().Id);

                var inicio = new DateOnly(anio, 1, 1);
                var fin = new DateOnly(anio, 12, 31);

                // Subconsulta en vez de una lista de ids en memoria: la plantilla
                // completa son miles de empleados y un IN con esa cantidad de
                // parametros no lo aguanta SQL Server (tope de 2100).
                var usuariosDeLosGrupos = _db.Users
                    .Where(u => u.GrupoId.HasValue && grupoIds.Contains(u.GrupoId.Value)
                                && u.Status == UserStatus.Activo);

                // ── Ausencias del año, en tres consultas ────────────────────
                var vacaciones = await _db.VacacionesProgramadas
                    .Where(v => v.EstadoVacacion == "Activa"
                                && v.FechaVacacion >= inicio && v.FechaVacacion <= fin
                                && usuariosDeLosGrupos.Any(u => u.Id == v.EmpleadoId))
                    .Select(v => new { v.EmpleadoId, v.FechaVacacion, v.TipoVacacion })
                    .ToListAsync();

                var permisos = await _db.PermisosEIncapacidadesSAP
                    .Where(p => p.Desde <= fin && p.Hasta >= inicio
                                && (p.FechaSolicitud == null || p.EstadoSolicitud == "Aprobada"))
                    .Select(p => new { p.Nomina, p.Desde, p.Hasta })
                    .ToListAsync();

                var festivos = await _db.SolicitudesFestivosTrabajados
                    .Where(f => f.EstadoSolicitud == "Aprobada"
                                && f.FechaNuevaSolicitada >= inicio && f.FechaNuevaSolicitada <= fin
                                && usuariosDeLosGrupos.Any(u => u.Id == f.EmpleadoId))
                    .Select(f => new { f.EmpleadoId, f.FechaNuevaSolicitada })
                    .ToListAsync();

                var excepciones = await _db.ExcepcionesPorcentaje
                    .Where(e => e.Fecha >= inicio && e.Fecha <= fin && grupoIds.Contains(e.GrupoId))
                    .Select(e => new { e.GrupoId, e.Fecha, e.PorcentajeMaximoPermitido })
                    .ToListAsync();

                var excepcionPorClave = excepciones
                    .GroupBy(e => (e.GrupoId, e.Fecha))
                    .ToDictionary(g => g.Key, g => g.First().PorcentajeMaximoPermitido);

                // ── Cruce en memoria ────────────────────────────────────────
                // (grupo, fecha) -> empleados ausentes distintos. Un empleado que
                // tiene vacación y permiso el mismo día cuenta UNA vez, igual que
                // en ContarAusentesAsync.
                var ausentes = new Dictionary<(int Grupo, DateOnly Fecha), HashSet<int>>();
                var diasEmpresa = new Dictionary<(int Grupo, DateOnly Fecha), int>();
                var empleadosConDiasEmpresa = new HashSet<int>();

                void Marcar(int empleadoId, DateOnly fecha)
                {
                    if (!grupoDeUsuario.TryGetValue(empleadoId, out var g)) return;
                    var clave = (g, fecha);
                    if (!ausentes.TryGetValue(clave, out var set))
                    {
                        set = new HashSet<int>();
                        ausentes[clave] = set;
                    }
                    set.Add(empleadoId);
                }

                foreach (var v in vacaciones)
                {
                    Marcar(v.EmpleadoId, v.FechaVacacion);

                    // "Automatica" es lo que escribe AsignacionAutomaticaService:
                    // son los días que puso la empresa, no los que capturó el
                    // operador en su turno.
                    if (v.TipoVacacion == "Automatica" && grupoDeUsuario.TryGetValue(v.EmpleadoId, out var g))
                    {
                        var clave = (g, v.FechaVacacion);
                        diasEmpresa[clave] = diasEmpresa.GetValueOrDefault(clave) + 1;
                        empleadosConDiasEmpresa.Add(v.EmpleadoId);
                    }
                }

                foreach (var p in permisos)
                {
                    // Nomina en esta tabla es int (viene del Excel de SAP), no int?.
                    if (!usuarioPorNomina.TryGetValue(p.Nomina, out var empleadoId))
                        continue;

                    var desde = p.Desde < inicio ? inicio : p.Desde;
                    var hasta = p.Hasta > fin ? fin : p.Hasta;
                    for (var d = desde; d <= hasta; d = d.AddDays(1))
                        Marcar(empleadoId, d);
                }

                foreach (var f in festivos)
                    Marcar(f.EmpleadoId, f.FechaNuevaSolicitada);

                // ── Recorrer el año ─────────────────────────────────────────
                var dias = new List<DiaProgramacionAnualDto>();
                var rebasesPorGrupo = grupoIds.ToDictionary(id => id, _ => 0);
                var plantillaTotal = usuarios.Count;

                for (var fecha = inicio; fecha <= fin; fecha = fecha.AddDays(1))
                {
                    var totalAusentes = 0;
                    var totalDiasEmpresa = 0;
                    var gruposEnRebase = new List<string>();
                    var excedenteMaximo = 0m;

                    foreach (var grupo in grupos)
                    {
                        var clave = (grupo.GrupoId, fecha);
                        var ausentesGrupo = ausentes.TryGetValue(clave, out var set) ? set.Count : 0;
                        var plantillaGrupo = plantillaPorGrupo.GetValueOrDefault(grupo.GrupoId);

                        totalAusentes += ausentesGrupo;
                        totalDiasEmpresa += diasEmpresa.GetValueOrDefault(clave);

                        if (plantillaGrupo == 0 || ausentesGrupo == 0) continue;

                        var maximo = excepcionPorClave.TryGetValue(clave, out var exc) ? exc : porcentajeGlobal;
                        var regla = _validador.EvaluarRegla(plantillaGrupo, ausentesGrupo, 0, maximo);

                        if (!regla.Permitido)
                        {
                            gruposEnRebase.Add(grupo.Rol);
                            rebasesPorGrupo[grupo.GrupoId]++;
                            var excedente = regla.PorcentajeResultante - maximo;
                            if (excedente > excedenteMaximo) excedenteMaximo = excedente;
                        }
                    }

                    dias.Add(new DiaProgramacionAnualDto
                    {
                        Fecha = fecha,
                        DiasEmpresa = totalDiasEmpresa,
                        Ausentes = totalAusentes,
                        Plantilla = plantillaTotal,
                        Porcentaje = plantillaTotal > 0
                            ? Math.Round((decimal)totalAusentes / plantillaTotal * 100m, 2)
                            : 0m,
                        ExcedenteSobrePermitido = Math.Round(Math.Max(0m, excedenteMaximo), 2),
                        GruposEnRebase = gruposEnRebase
                    });
                }

                // ── Resúmenes ───────────────────────────────────────────────
                var totalDias = dias.Sum(d => d.DiasEmpresa);
                var cultura = new CultureInfo("es-MX");

                var meses = dias
                    .GroupBy(d => d.Fecha.Month)
                    .OrderBy(g => g.Key)
                    .Select(g => new MesProgramacionAnualDto
                    {
                        Mes = g.Key,
                        Nombre = cultura.DateTimeFormat.GetMonthName(g.Key),
                        DiasEmpresaAsignados = g.Sum(d => d.DiasEmpresa),
                        PorcentajePromedio = Math.Round(g.Average(d => d.Porcentaje), 2),
                        PorcentajeMaximo = g.Max(d => d.Porcentaje),
                        DiasConRebase = g.Count(d => d.GruposEnRebase.Count > 0),
                        DiasEsperadosSiFueraParejo = Math.Round(totalDias / 12m, 1)
                    })
                    .ToList();

                var diasEmpresaPorGrupo = diasEmpresa
                    .GroupBy(kv => kv.Key.Grupo)
                    .ToDictionary(g => g.Key, g => g.Sum(kv => kv.Value));

                var gruposDto = grupos
                    .Select(g =>
                    {
                        var plantilla = plantillaPorGrupo.GetValueOrDefault(g.GrupoId);
                        var asignados = diasEmpresaPorGrupo.GetValueOrDefault(g.GrupoId);
                        return new GrupoProgramacionAnualDto
                        {
                            GrupoId = g.GrupoId,
                            Nombre = g.Rol,
                            Area = g.Area?.NombreGeneral ?? "",
                            Plantilla = plantilla,
                            DiasEmpresaAsignados = asignados,
                            DiasPorEmpleado = plantilla > 0
                                ? Math.Round((decimal)asignados / plantilla, 2)
                                : 0m,
                            DiasConRebase = rebasesPorGrupo.GetValueOrDefault(g.GrupoId)
                        };
                    })
                    .OrderByDescending(g => g.DiasEmpresaAsignados)
                    .ToList();

                var response = new DashboardProgramacionAnualResponse
                {
                    Anio = anio,
                    PorcentajeMaximoGlobal = porcentajeGlobal,
                    PlantillaTotal = plantillaTotal,
                    DiasEmpresaAsignados = totalDias,
                    EmpleadosConDiasEmpresa = empleadosConDiasEmpresa.Count,
                    DiasConRebase = dias.Count(d => d.GruposEnRebase.Count > 0),
                    Meses = meses,
                    Dias = dias,
                    Grupos = gruposDto
                };

                return new ApiResponse<DashboardProgramacionAnualResponse>(true, response, null);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al armar el dashboard de programación anual del año {Anio}", anio);
                return new ApiResponse<DashboardProgramacionAnualResponse>(false, null,
                    $"Error inesperado: {ex.Message}");
            }
        }
    }
}
