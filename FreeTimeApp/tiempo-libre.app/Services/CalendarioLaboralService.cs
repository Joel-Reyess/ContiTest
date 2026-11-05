using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using tiempo_libre.Models;

namespace tiempo_libre.Services
{
    /// <summary>
    /// LA respuesta a "¿este día es laborable para este grupo?" según las reglas
    /// dominicales por unidad organizativa y periodo (ReglasDomingo, oct-2026).
    /// La consultan la captura del operador, la asignación de días por la empresa,
    /// la asignación manual, las reprogramaciones, el rol semanal y los
    /// calendarios, para que ninguna pantalla ofrezca un domingo que otra rechaza.
    ///
    /// Solo dice si la REGLA cierra el día; el descanso del rol, los días
    /// inhábiles y el porcentaje se siguen revisando donde ya se revisaban.
    ///
    /// Qué regla manda en un día: la del grupo antes que la del área; con el mismo
    /// alcance, la más reciente. "RolNormal" deja el día laborable (excepción de un
    /// grupo dentro de un área sin domingos). Sin reglas, o sin la tabla, todo es
    /// laborable, como antes.
    ///
    /// Se puede construir solo con el contexto (lo usan servicios que se crean a
    /// mano en pruebas); lo que lee se recuerda lo que vive la instancia.
    /// </summary>
    public class CalendarioLaboralService
    {
        private readonly FreeTimeDbContext _db;
        private List<ReglaDomingo>? _reglas;
        private readonly Dictionary<int, int?> _areaDeGrupo = new();
        private readonly Dictionary<int, string> _nombreArea = new();

        private static volatile bool _tablaConfirmada;

        public CalendarioLaboralService(FreeTimeDbContext db)
        {
            _db = db;
        }

        /// <summary>null si el día es laborable; si no, el motivo para mostrarlo.</summary>
        public async Task<string?> MotivoNoLaborableAsync(int grupoId, DateOnly fecha)
        {
            if (fecha.DayOfWeek != DayOfWeek.Sunday && fecha.DayOfWeek != DayOfWeek.Saturday) return null;
            await CargarAsync(new[] { grupoId });
            return Resolver(grupoId, fecha);
        }

        public async Task<bool> EsNoLaborableAsync(int grupoId, DateOnly fecha) =>
            await MotivoNoLaborableAsync(grupoId, fecha) != null;

        /// <summary>
        /// Para las solicitudes que mueven un día (reprogramación, festivo trabajado,
        /// vacación laborada, post-incapacidad, día empresa, edición de días): null si
        /// la fecha nueva se puede usar; si no, el motivo para regresarlo tal cual.
        /// </summary>
        public static async Task<string?> MotivoParaEmpleadoAsync(FreeTimeDbContext db, int empleadoId, DateOnly fecha)
        {
            if (fecha.DayOfWeek != DayOfWeek.Sunday && fecha.DayOfWeek != DayOfWeek.Saturday) return null;
            var grupoId = await db.Users.Where(u => u.Id == empleadoId).Select(u => u.GrupoId).FirstOrDefaultAsync();
            if (grupoId == null) return null;
            var motivo = await new CalendarioLaboralService(db).MotivoNoLaborableAsync(grupoId.Value, fecha);
            return motivo == null ? null : $"La fecha nueva ({fecha:dd/MM/yyyy}) no se puede usar. {motivo}";
        }

        /// <summary>Carga de una vez para muchos grupos; luego cada consulta es en memoria.</summary>
        public async Task<TablaNoLaborables> PrecargarAsync(IEnumerable<int> grupoIds)
        {
            await CargarAsync(grupoIds);
            return new TablaNoLaborables(this);
        }

        /// <summary>Reglas activas que tocan a un grupo en un año (para el aviso del calendario).</summary>
        public async Task<List<ReglaDomingo>> ReglasDelGrupoAsync(int grupoId, int anio)
        {
            await CargarAsync(new[] { grupoId });
            var area = _areaDeGrupo.GetValueOrDefault(grupoId);
            var ini = new DateOnly(anio, 1, 1);
            var fin = new DateOnly(anio, 12, 31);
            return _reglas!
                .Where(r => r.FechaInicio <= fin && r.FechaFin >= ini &&
                            (r.GrupoId == grupoId || (r.GrupoId == null && r.AreaId == area)))
                .OrderBy(r => r.FechaInicio)
                .ToList();
        }

        internal string? Resolver(int grupoId, DateOnly fecha)
        {
            var esDomingo = fecha.DayOfWeek == DayOfWeek.Sunday;
            if (!esDomingo && fecha.DayOfWeek != DayOfWeek.Saturday) return null;
            if (_reglas == null || _reglas.Count == 0) return null;

            var area = _areaDeGrupo.GetValueOrDefault(grupoId);
            var regla = _reglas
                .Where(r => r.FechaInicio <= fecha && fecha <= r.FechaFin &&
                            (r.GrupoId == grupoId || (r.GrupoId == null && area.HasValue && r.AreaId == area.Value)))
                .OrderBy(r => r.GrupoId.HasValue ? 0 : 1)
                .ThenByDescending(r => r.FechaCreacion)
                .ThenByDescending(r => r.Id)
                .FirstOrDefault();

            if (regla == null || regla.Tipo != "SinDomingo") return null;
            if (!esDomingo && !regla.IncluyeSabado) return null;

            var dia = esDomingo ? "Domingo" : "Sábado";
            var donde = _nombreArea.TryGetValue(regla.AreaId, out var n) ? n : "la unidad organizativa";
            return $"{dia} no laborable para {donde} (regla del {regla.FechaInicio:dd/MM/yyyy} al {regla.FechaFin:dd/MM/yyyy}): " +
                   "no se programan vacaciones ni días por la empresa.";
        }

        private async Task CargarAsync(IEnumerable<int> grupoIds)
        {
            if (_reglas == null)
            {
                _reglas = await TablaExisteAsync()
                    ? await _db.ReglasDomingo.AsNoTracking().Where(r => r.Activa).ToListAsync()
                    : new List<ReglaDomingo>();
                if (_reglas.Count > 0)
                {
                    var areas = _reglas.Select(r => r.AreaId).Distinct().ToList();
                    foreach (var a in await _db.Areas.AsNoTracking().Where(a => areas.Contains(a.AreaId))
                                 .Select(a => new { a.AreaId, a.NombreGeneral }).ToListAsync())
                        _nombreArea[a.AreaId] = a.NombreGeneral;
                }
            }
            if (_reglas.Count == 0) return;

            var faltan = grupoIds.Where(g => !_areaDeGrupo.ContainsKey(g)).Distinct().ToList();
            if (faltan.Count == 0) return;
            var areasDeGrupos = await _db.Grupos.AsNoTracking()
                .Where(g => faltan.Contains(g.GrupoId))
                .Select(g => new { g.GrupoId, g.AreaId })
                .ToListAsync();
            foreach (var g in faltan) _areaDeGrupo[g] = null;
            foreach (var g in areasDeGrupos) _areaDeGrupo[g.GrupoId] = g.AreaId;
        }

        /// <summary>
        /// Si todavía no se corrió Scripts/Migration_ReglasDomingo.sql no hay
        /// reglas: todo sigue con el rol normal y nada truena.
        /// </summary>
        public async Task<bool> TablaExisteAsync()
        {
            if (_tablaConfirmada) return true;
            if (_db.Database.ProviderName?.Contains("SqlServer") != true) return true;
            try
            {
                var existe = await _db.Database
                    .SqlQueryRaw<int>("SELECT CASE WHEN OBJECT_ID('dbo.ReglasDomingo') IS NULL THEN 0 ELSE 1 END AS [Value]")
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

    /// <summary>Reglas ya cargadas para un conjunto de grupos.</summary>
    public sealed class TablaNoLaborables
    {
        private readonly CalendarioLaboralService _servicio;

        internal TablaNoLaborables(CalendarioLaboralService servicio) => _servicio = servicio;

        public bool EsNoLaborable(int grupoId, DateOnly fecha) => _servicio.Resolver(grupoId, fecha) != null;

        public string? Motivo(int grupoId, DateOnly fecha) => _servicio.Resolver(grupoId, fecha);
    }
}
