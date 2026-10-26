using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using tiempo_libre.Helpers;
using tiempo_libre.Models;

namespace tiempo_libre.Services
{
    /// <summary>De dónde salió el porcentaje que rige un grupo un día.</summary>
    public sealed record LimiteAplicable(decimal Porcentaje, string Origen, int? CapacidadId = null);

    /// <summary>
    /// LA respuesta a "¿qué porcentaje máximo de ausencia rige para este grupo este
    /// día?" (oct-2026). Antes cada servicio lo resolvía a su manera (unos con la
    /// excepción del grupo, otros solo con el general, leyendo la configuración por
    /// Id o por fecha de creación); ahora el candado, los calendarios, los
    /// dashboards y los festivos preguntan aquí.
    ///
    /// Orden (manda el primero que aplique):
    /// 1. Excepción del grupo para ese día (ExcepcionesPorcentaje, la de "Tiempo
    ///    Extra" del calendario del área).
    /// 2. Capacidad por periodo vigente (CapacidadesPorcentaje): la de periodo más
    ///    corto (día, luego semana, luego mes) y, con el mismo periodo, la de
    ///    alcance más chico (grupo, luego área, luego planta); si aun así empatan,
    ///    la más reciente.
    /// 3. El del año: el del año en preparación si tiene uno propio, si no el
    ///    general (PorcentajeAusenciaHelper.ParaAnio).
    ///
    /// Sin capacidades capturadas (o sin la tabla) contesta exactamente lo mismo
    /// que antes: excepción del grupo, o el del año.
    ///
    /// Es scoped: lo que lee (configuración, capacidades, área de cada grupo,
    /// excepciones) se recuerda lo que dura la petición, porque la asignación
    /// automática pregunta miles de veces.
    /// </summary>
    public class LimitePorcentajeService
    {
        private readonly FreeTimeDbContext _db;

        private ConfiguracionVacaciones? _config;
        private bool _configCargada;
        private List<CapacidadPorcentaje>? _capacidades;
        private readonly Dictionary<int, int?> _areaDeGrupo = new();
        private readonly Dictionary<(int GrupoId, DateOnly Fecha), decimal?> _excepciones = new();

        private static volatile bool _tablaConfirmada;

        public LimitePorcentajeService(FreeTimeDbContext db)
        {
            _db = db;
        }

        public async Task<decimal> LimiteAsync(int grupoId, DateOnly fecha) =>
            (await DetalleAsync(grupoId, fecha)).Porcentaje;

        public async Task<LimiteAplicable> DetalleAsync(int grupoId, DateOnly fecha)
        {
            if (!_excepciones.ContainsKey((grupoId, fecha)))
            {
                _excepciones[(grupoId, fecha)] = await _db.ExcepcionesPorcentaje
                    .Where(e => e.GrupoId == grupoId && e.Fecha == fecha)
                    .Select(e => (decimal?)e.PorcentajeMaximoPermitido)
                    .FirstOrDefaultAsync();
            }
            await CargarAreasAsync(new[] { grupoId });
            await CargarBaseAsync();
            return Resolver(grupoId, fecha);
        }

        /// <summary>
        /// Carga de una vez todo lo necesario para muchos grupos y días (calendario,
        /// dashboard, listas). Después cada consulta es en memoria.
        /// </summary>
        public async Task<TablaLimites> PrecargarAsync(IEnumerable<int> grupoIds, DateOnly desde, DateOnly hasta)
        {
            var ids = grupoIds.Distinct().ToList();
            if (ids.Count > 0)
            {
                var excepciones = await _db.ExcepcionesPorcentaje
                    .Where(e => ids.Contains(e.GrupoId) && e.Fecha >= desde && e.Fecha <= hasta)
                    .Select(e => new { e.GrupoId, e.Fecha, e.PorcentajeMaximoPermitido })
                    .ToListAsync();
                // Sin excepción también se recuerda (null) para no volver a preguntar.
                foreach (var g in ids)
                    for (var f = desde; f <= hasta; f = f.AddDays(1))
                        _excepciones.TryAdd((g, f), null);
                foreach (var e in excepciones.GroupBy(e => (e.GrupoId, e.Fecha)))
                    _excepciones[e.Key] = e.First().PorcentajeMaximoPermitido;
            }
            await CargarAreasAsync(ids);
            await CargarBaseAsync();
            return new TablaLimites(this);
        }

        /// <summary>Lo que rige el año sin capacidades ni excepciones (el "general" de ese año).</summary>
        public async Task<decimal> DelAnioAsync(int anio)
        {
            await CargarBaseAsync();
            return PorcentajeAusenciaHelper.ParaAnio(_config, anio);
        }

        /// <summary>Capacidades activas (para mostrarlas en dashboards).</summary>
        public async Task<IReadOnlyList<CapacidadPorcentaje>> CapacidadesVigentesAsync(DateOnly desde, DateOnly hasta)
        {
            await CargarBaseAsync();
            return _capacidades!.Where(c => c.FechaInicio <= hasta && c.FechaFin >= desde).ToList();
        }

        internal LimiteAplicable Resolver(int grupoId, DateOnly fecha)
        {
            if (_excepciones.TryGetValue((grupoId, fecha), out var excepcion) && excepcion.HasValue)
                return new LimiteAplicable(excepcion.Value, "Excepción del grupo para ese día");

            var areaId = _areaDeGrupo.GetValueOrDefault(grupoId);
            var capacidad = (_capacidades ?? new List<CapacidadPorcentaje>())
                .Where(c => c.FechaInicio <= fecha && fecha <= c.FechaFin && Aplica(c, grupoId, areaId))
                .OrderBy(c => RangoPeriodo(c.Periodo))
                .ThenBy(c => RangoAlcance(c.Alcance))
                .ThenByDescending(c => c.FechaCreacion)
                .ThenByDescending(c => c.Id)
                .FirstOrDefault();
            if (capacidad != null)
                return new LimiteAplicable(capacidad.Porcentaje, DescribirCapacidad(capacidad), capacidad.Id);

            var delAnio = PorcentajeAusenciaHelper.ParaAnio(_config, fecha.Year);
            var esPreparacion = _config?.AnioProgramacionAnual == fecha.Year &&
                                _config.PorcentajeAusenciaPreparacion is > 0m;
            return new LimiteAplicable(delAnio, esPreparacion ? $"Porcentaje del año {fecha.Year} (en preparación)" : "Porcentaje general");
        }

        public static string DescribirCapacidad(CapacidadPorcentaje c)
        {
            var periodo = c.Periodo switch
            {
                "Dia" => c.FechaInicio == c.FechaFin ? $"día {c.FechaInicio:dd/MM/yyyy}" : $"días {c.FechaInicio:dd/MM} al {c.FechaFin:dd/MM/yyyy}",
                "Semana" => $"semana del {c.FechaInicio:dd/MM} al {c.FechaFin:dd/MM/yyyy}",
                _ => $"mes {c.FechaInicio:MM/yyyy}"
            };
            var alcance = c.Alcance switch
            {
                "Grupo" => "del grupo",
                "Area" => "del área",
                _ => "de la planta"
            };
            return $"Capacidad por periodo ({periodo}, {alcance})";
        }

        private static bool Aplica(CapacidadPorcentaje c, int grupoId, int? areaId) => c.Alcance switch
        {
            "Grupo" => c.GrupoId == grupoId,
            "Area" => areaId.HasValue && c.AreaId == areaId,
            "Planta" => true,
            _ => false
        };

        private static int RangoPeriodo(string periodo) => periodo switch { "Dia" => 0, "Semana" => 1, _ => 2 };

        private static int RangoAlcance(string alcance) => alcance switch { "Grupo" => 0, "Area" => 1, _ => 2 };

        private async Task CargarAreasAsync(IEnumerable<int> grupoIds)
        {
            var faltan = grupoIds.Where(g => !_areaDeGrupo.ContainsKey(g)).Distinct().ToList();
            if (faltan.Count == 0) return;
            var areas = await _db.Grupos
                .Where(g => faltan.Contains(g.GrupoId))
                .Select(g => new { g.GrupoId, g.AreaId })
                .ToListAsync();
            foreach (var g in faltan) _areaDeGrupo[g] = null;
            foreach (var a in areas) _areaDeGrupo[a.GrupoId] = a.AreaId;
        }

        private async Task CargarBaseAsync()
        {
            if (!_configCargada)
            {
                // La fila más reciente, igual que el candado (por fecha de creación
                // y, si empatan, por Id).
                _config = await _db.ConfiguracionVacaciones
                    .OrderByDescending(c => c.CreatedAt)
                    .ThenByDescending(c => c.Id)
                    .FirstOrDefaultAsync();
                _configCargada = true;
            }
            if (_capacidades == null)
            {
                _capacidades = await TablaExisteAsync()
                    ? await _db.CapacidadesPorcentaje.AsNoTracking().Where(c => c.Activa).ToListAsync()
                    : new List<CapacidadPorcentaje>();
            }
        }

        /// <summary>
        /// Si todavía no se corrió Scripts/Migration_CapacidadesPorcentaje.sql no
        /// hay capacidades: todo sigue como antes y nada truena.
        /// </summary>
        public async Task<bool> TablaExisteAsync()
        {
            if (_tablaConfirmada) return true;
            if (_db.Database.ProviderName?.Contains("SqlServer") != true) return true;
            try
            {
                var existe = await _db.Database
                    .SqlQueryRaw<int>("SELECT CASE WHEN OBJECT_ID('dbo.CapacidadesPorcentaje') IS NULL THEN 0 ELSE 1 END AS [Value]")
                    .FirstAsync();
                if (existe == 1) _tablaConfirmada = true;
                return existe == 1;
            }
            catch
            {
                return false;
            }
        }
    }

    /// <summary>Límites ya cargados para un conjunto de grupos y días.</summary>
    public sealed class TablaLimites
    {
        private readonly LimitePorcentajeService _servicio;

        internal TablaLimites(LimitePorcentajeService servicio) => _servicio = servicio;

        public decimal Limite(int grupoId, DateOnly fecha) => _servicio.Resolver(grupoId, fecha).Porcentaje;

        public LimiteAplicable Detalle(int grupoId, DateOnly fecha) => _servicio.Resolver(grupoId, fecha);
    }
}
