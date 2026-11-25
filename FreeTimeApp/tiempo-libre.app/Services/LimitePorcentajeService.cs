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
    public sealed record LimiteAplicable(decimal Porcentaje, string Origen, int? CapacidadId = null,
        CapacidadPorcentaje? Capacidad = null)
    {
        /// <summary>
        /// La capacidad que rige se mide "por día": el % es contra todo el personal
        /// del área que trabaja ese día, no contra la plantilla del grupo.
        /// </summary>
        public bool PorDia => Capacidad is { Medicion: "Dia", AreaId: not null };
    }

    /// <summary>
    /// Para qué se pregunta el límite: la asignación de días por la empresa, o lo
    /// que programan los operadores (captura, reprogramaciones, festivos). Una
    /// capacidad por periodo puede aplicar solo a uno de los dos.
    /// </summary>
    public enum ContextoLimite { Operador, Empresa }

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
    ///    alcance más chico (grupo, luego área, luego planta); luego la de un turno
    ///    antes que la de todo el día (la de un turno solo cuenta si ese día el
    ///    grupo va en ese turno por su rol, nov-2026); si aun así empatan, la más
    ///    reciente.
    /// 3. El del año: el del año en preparación si tiene uno propio, si no el
    ///    general (PorcentajeAusenciaHelper.ParaAnio).
    ///
    /// Una capacidad de área puede medirse "por día" (nov-2026, Bladders): el % ya
    /// no es por grupo sino contra todo el personal de los grupos del área que ese
    /// día trabajan según su rol (GruposDelDia). Aquí solo se dice cuál rige; la
    /// cuenta la hace ValidadorPorcentajeService.
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
        private readonly Dictionary<int, string> _rolDeGrupo = new();
        private readonly Dictionary<int, List<int>> _gruposDeArea = new();
        private readonly Dictionary<int, DateOnly?> _semanaSanta = new();
        private readonly Dictionary<(int GrupoId, DateOnly Fecha), decimal?> _excepciones = new();

        private static volatile bool _tablaConfirmada;

        public LimitePorcentajeService(FreeTimeDbContext db)
        {
            _db = db;
        }

        public async Task<decimal> LimiteAsync(int grupoId, DateOnly fecha, ContextoLimite contexto = ContextoLimite.Operador) =>
            (await DetalleAsync(grupoId, fecha, contexto)).Porcentaje;

        public async Task<LimiteAplicable> DetalleAsync(int grupoId, DateOnly fecha, ContextoLimite contexto = ContextoLimite.Operador)
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
            if (UsaRol) await CargarSemanaSantaAsync(new[] { fecha.Year });
            return Resolver(grupoId, fecha, contexto);
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
            if (UsaRol && desde <= hasta)
                await CargarSemanaSantaAsync(Enumerable.Range(desde.Year, hasta.Year - desde.Year + 1));
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

        /// <summary>Vuelve a leer las capacidades (se acaban de crear algunas en la misma petición).</summary>
        public void OlvidarCapacidades() => _capacidades = null;

        internal LimiteAplicable Resolver(int grupoId, DateOnly fecha, ContextoLimite contexto)
        {
            if (_excepciones.TryGetValue((grupoId, fecha), out var excepcion) && excepcion.HasValue)
                return new LimiteAplicable(excepcion.Value, "Excepción del grupo para ese día");

            var areaId = _areaDeGrupo.GetValueOrDefault(grupoId);
            string? turnoDelGrupo = null;
            string TurnoDelGrupo() => turnoDelGrupo ??= TurnoDeGrupo(grupoId, fecha);
            var capacidad = (_capacidades ?? new List<CapacidadPorcentaje>())
                .Where(c => c.FechaInicio <= fecha && fecha <= c.FechaFin && Aplica(c, grupoId, areaId) &&
                            (c.AplicaA == "Ambos" || c.AplicaA == contexto.ToString()) &&
                            // De un turno: solo si ese día el grupo va en ese turno por su rol.
                            (string.IsNullOrEmpty(c.Turno) || TurnoDelGrupo() == c.Turno))
                .OrderBy(c => RangoPeriodo(c.Periodo))
                .ThenBy(c => RangoAlcance(c.Alcance))
                .ThenBy(c => string.IsNullOrEmpty(c.Turno) ? 1 : 0)
                .ThenBy(c => c.AplicaA == "Ambos" ? 1 : 0)
                .ThenByDescending(c => c.FechaCreacion)
                .ThenByDescending(c => c.Id)
                .FirstOrDefault();
            if (capacidad != null)
                return new LimiteAplicable(capacidad.Porcentaje, DescribirCapacidad(capacidad), capacidad.Id, capacidad);

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
                "Anio" => c.FechaFin == CapacidadPorcentaje.SinFin ? $"cada año desde {c.FechaInicio:yyyy}" : $"año {c.FechaInicio:yyyy}",
                _ => $"mes {c.FechaInicio:MM/yyyy}"
            };
            var alcance = c.Alcance switch
            {
                "Grupo" => "del grupo",
                "Area" => "del área",
                _ => "de la planta"
            };
            var dias = c.AplicaA switch
            {
                "Empresa" => ", solo días por la empresa",
                "Operador" => ", solo días de los operadores",
                _ => ""
            };
            var turno = c.Turno switch
            {
                "1" => ", primer turno",
                "2" => ", segundo turno",
                "3" => ", tercer turno",
                _ => ""
            };
            var medicion = c.Medicion == "Dia" ? ", por día: todo el personal del área que trabaja ese día" : "";
            return $"Capacidad por periodo ({periodo}, {alcance}{turno}{dias}{medicion})";
        }

        /// <summary>
        /// Grupos cuyo personal se suma para una capacidad "por día" en esa fecha: los
        /// del área que ese día trabajan según su rol (el que descansa no cuenta: ni
        /// su gente ni sus ausencias), más siempre el grupo que pregunta.
        /// </summary>
        internal IReadOnlyList<int> GruposDelDia(CapacidadPorcentaje c, DateOnly fecha, int grupoId)
        {
            var lista = new List<int>();
            if (c.AreaId is int areaId && _gruposDeArea.TryGetValue(areaId, out var grupos))
                foreach (var g in grupos)
                    if (g == grupoId || !TurnosHelper.EsDescanso(TurnoDeGrupo(g, fecha)))
                        lista.Add(g);
            if (!lista.Contains(grupoId)) lista.Add(grupoId);
            lista.Sort();
            return lista;
        }

        /// <summary>Grupos del área con el turno que les toca ese día por su rol (vista previa del formulario).</summary>
        public async Task<List<(int GrupoId, string Rol, string Turno)>> TurnosDelAreaAsync(int areaId, DateOnly fecha)
        {
            await CargarGruposDeAreasAsync(new[] { areaId });
            await CargarSemanaSantaAsync(new[] { fecha.Year });
            return _gruposDeArea[areaId]
                .Select(g => (g, _rolDeGrupo.GetValueOrDefault(g) ?? string.Empty, TurnoDeGrupo(g, fecha)))
                .OrderBy(x => x.Item2)
                .ToList();
        }

        private static bool Aplica(CapacidadPorcentaje c, int grupoId, int? areaId) => c.Alcance switch
        {
            "Grupo" => c.GrupoId == grupoId,
            "Area" => areaId.HasValue && c.AreaId == areaId,
            "Planta" => true,
            _ => false
        };

        private static int RangoPeriodo(string periodo) => periodo switch { "Dia" => 0, "Semana" => 1, "Mes" => 2, _ => 3 };

        private static int RangoAlcance(string alcance) => alcance switch { "Grupo" => 0, "Area" => 1, _ => 2 };

        private async Task CargarAreasAsync(IEnumerable<int> grupoIds)
        {
            var faltan = grupoIds.Where(g => !_areaDeGrupo.ContainsKey(g)).Distinct().ToList();
            if (faltan.Count == 0) return;
            var areas = await _db.Grupos
                .Where(g => faltan.Contains(g.GrupoId))
                .Select(g => new { g.GrupoId, g.AreaId, g.Rol })
                .ToListAsync();
            foreach (var g in faltan) _areaDeGrupo[g] = null;
            foreach (var a in areas)
            {
                _areaDeGrupo[a.GrupoId] = a.AreaId;
                _rolDeGrupo[a.GrupoId] = a.Rol ?? string.Empty;
            }
        }

        private async Task CargarGruposDeAreasAsync(IEnumerable<int> areaIds)
        {
            var faltan = areaIds.Where(a => !_gruposDeArea.ContainsKey(a)).Distinct().ToList();
            if (faltan.Count == 0) return;
            var grupos = await _db.Grupos
                .Where(g => faltan.Contains(g.AreaId))
                .Select(g => new { g.GrupoId, g.AreaId, g.Rol })
                .ToListAsync();
            foreach (var a in faltan) _gruposDeArea[a] = new List<int>();
            foreach (var g in grupos)
            {
                _gruposDeArea[g.AreaId].Add(g.GrupoId);
                _areaDeGrupo[g.GrupoId] = g.AreaId;
                _rolDeGrupo[g.GrupoId] = g.Rol ?? string.Empty;
            }
        }

        /// <summary>Hay capacidades que dependen del turno que le toca a cada grupo por su rol.</summary>
        private bool UsaRol => _capacidades != null && _capacidades.Any(c => !string.IsNullOrEmpty(c.Turno) || c.Medicion == "Dia");

        private async Task CargarSemanaSantaAsync(IEnumerable<int> anios)
        {
            foreach (var anio in anios.Distinct().Where(a => !_semanaSanta.ContainsKey(a)).ToList())
                _semanaSanta[anio] = await _db.DiasInhabiles
                    .Where(d => d.Detalles.Contains("Semana Santa") && d.FechaFinal.Year == anio)
                    .OrderByDescending(d => d.FechaFinal)
                    .Select(d => (DateOnly?)d.FechaFinal)
                    .FirstOrDefaultAsync();
        }

        /// <summary>
        /// Turno que le toca al grupo ese día por su rol (con los arranques agendados y
        /// la semana de Semana Santa, igual que los calendarios y la asignación).
        /// </summary>
        private string TurnoDeGrupo(int grupoId, DateOnly fecha)
        {
            var rol = _rolDeGrupo.GetValueOrDefault(grupoId);
            if (string.IsNullOrEmpty(rol)) return string.Empty;
            return TurnosHelper.ObtenerTurnoParaFecha(rol, fecha, _semanaSanta.GetValueOrDefault(fecha.Year));
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
                try
                {
                    _capacidades = await TablaExisteAsync()
                        ? await _db.CapacidadesPorcentaje.AsNoTracking().Where(c => c.Activa).ToListAsync()
                        : new List<CapacidadPorcentaje>();
                }
                catch
                {
                    // Falta alguna columna nueva porque no se corrió su script: se leen
                    // sin ellas, como antes (sin Medicion = todas por grupo,
                    // Migration_CapacidadPorDiaYAnual.sql; sin Turno = todas de todo el
                    // día, Migration_ReglasTrabajo_CapacidadTurno.sql). Si también falta
                    // AplicaA, el porcentaje general: mejor eso que tumbar la captura y
                    // los calendarios.
                    try
                    {
                        _capacidades = await _db.CapacidadesPorcentaje.AsNoTracking().Where(c => c.Activa)
                            .Select(c => new CapacidadPorcentaje
                            {
                                Id = c.Id, Alcance = c.Alcance, AplicaA = c.AplicaA, Turno = c.Turno, AreaId = c.AreaId, GrupoId = c.GrupoId,
                                Periodo = c.Periodo, FechaInicio = c.FechaInicio, FechaFin = c.FechaFin,
                                Porcentaje = c.Porcentaje, Motivo = c.Motivo, Activa = c.Activa, FechaCreacion = c.FechaCreacion
                            })
                            .ToListAsync();
                    }
                    catch
                    {
                        try
                        {
                            _capacidades = await _db.CapacidadesPorcentaje.AsNoTracking().Where(c => c.Activa)
                                .Select(c => new CapacidadPorcentaje
                                {
                                    Id = c.Id, Alcance = c.Alcance, AplicaA = c.AplicaA, AreaId = c.AreaId, GrupoId = c.GrupoId,
                                    Periodo = c.Periodo, FechaInicio = c.FechaInicio, FechaFin = c.FechaFin,
                                    Porcentaje = c.Porcentaje, Motivo = c.Motivo, Activa = c.Activa, FechaCreacion = c.FechaCreacion
                                })
                                .ToListAsync();
                        }
                        catch
                        {
                            _capacidades = new List<CapacidadPorcentaje>();
                        }
                    }
                }

                // Las de un turno y las "por día" necesitan el rol de cada grupo ese
                // día, y el rol se recorre una semana después de Semana Santa: esa
                // fecha se carga por cada año que se consulta (DetalleAsync y
                // PrecargarAsync), no por los años de cada capacidad, porque la de
                // año que se repite no tiene fin.
                // Las "por día" suman todos los grupos de su área.
                await CargarGruposDeAreasAsync(_capacidades.Where(c => c.Medicion == "Dia" && c.AreaId.HasValue)
                    .Select(c => c.AreaId!.Value));
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

        public decimal Limite(int grupoId, DateOnly fecha, ContextoLimite contexto = ContextoLimite.Operador) =>
            _servicio.Resolver(grupoId, fecha, contexto).Porcentaje;

        /// <summary>El mayor de los dos (para dashboards: lo autorizado para cualquiera de los dos no es rebase).</summary>
        public decimal LimiteMayor(int grupoId, DateOnly fecha) =>
            Math.Max(Limite(grupoId, fecha, ContextoLimite.Operador), Limite(grupoId, fecha, ContextoLimite.Empresa));

        public LimiteAplicable Detalle(int grupoId, DateOnly fecha, ContextoLimite contexto = ContextoLimite.Operador) =>
            _servicio.Resolver(grupoId, fecha, contexto);

        /// <summary>Para una capacidad "por día": los grupos del área que ese día trabajan (más el que pregunta).</summary>
        public IReadOnlyList<int> GruposDelDia(CapacidadPorcentaje capacidad, DateOnly fecha, int grupoId) =>
            _servicio.GruposDelDia(capacidad, fecha, grupoId);
    }
}
