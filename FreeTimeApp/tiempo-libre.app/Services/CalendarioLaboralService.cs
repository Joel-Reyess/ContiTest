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
    /// Qué regla manda en un día (nov-2026, igual que en las capacidades por
    /// periodo): la de periodo más corto —un domingo suelto manda sobre un periodo
    /// largo—; si duran lo mismo, la del grupo antes que la del área; si aun así
    /// empatan, la más reciente. "RolNormal" (en base a rol) deja el día como diga
    /// el rol de cada quien: sirve para un grupo dentro de un área sin domingos o
    /// para habilitar un domingo a toda la planta. Sin reglas, o sin la tabla, todo
    /// es laborable, como antes.
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

        /// <summary>La regla que manda ese día para el grupo (o null si ninguna aplica).</summary>
        internal ReglaDomingo? ReglaQueManda(int grupoId, DateOnly fecha)
        {
            if (fecha.DayOfWeek != DayOfWeek.Sunday && fecha.DayOfWeek != DayOfWeek.Saturday) return null;
            if (_reglas == null || _reglas.Count == 0) return null;

            var area = _areaDeGrupo.GetValueOrDefault(grupoId);
            return QueManda(_reglas.Where(r =>
                r.GrupoId == grupoId || (r.GrupoId == null && area.HasValue && r.AreaId == area.Value)), fecha);
        }

        /// <summary>
        /// De las reglas que tocan a un grupo (o a un área), la que manda ese día.
        /// Solo compiten las que hablan de ese día (sábado o domingo, según su "día de
        /// aplicación"): una regla de un domingo suelto ya no le gana a un periodo de
        /// sábado y domingo en el sábado de esa semana. Luego, la de periodo más
        /// corto; la del grupo antes que la del área; la más reciente.
        /// </summary>
        public static ReglaDomingo? QueManda(IEnumerable<ReglaDomingo> candidatas, DateOnly fecha) =>
            candidatas
                .Where(r => r.FechaInicio <= fecha && fecha <= r.FechaFin && r.AplicaEnDia(fecha.DayOfWeek))
                .OrderBy(r => r.FechaFin.DayNumber - r.FechaInicio.DayNumber)
                .ThenBy(r => r.GrupoId.HasValue ? 0 : 1)
                .ThenByDescending(r => r.FechaCreacion)
                .ThenByDescending(r => r.Id)
                .FirstOrDefault();

        /// <summary>Los tres paros: ese día no se trabaja (el rol semanal lo pone en descanso).</summary>
        public static bool EsTipoParo(string? tipo) => tipo is "SinDomingo" or "ParoEmpresa" or "ParoOperador";

        /// <summary>
        /// Motivo si el operador NO puede programar ese día (null si puede). Cierran el
        /// día el "paro sin asignaciones" y el "paro con días por la empresa" (ahí la
        /// asignación automática pone los días por la empresa de quien lo trabajaba
        /// según su rol, ver AsignacionAutomaticaService). El "paro, el operador elige"
        /// (nov-2026) no se cierra: el operador puede poner ahí sus vacaciones.
        /// </summary>
        internal string? Resolver(int grupoId, DateOnly fecha)
        {
            var regla = ReglaQueManda(grupoId, fecha);
            if (regla == null || (regla.Tipo != "SinDomingo" && regla.Tipo != "ParoEmpresa")) return null;
            return Describir(regla, fecha);
        }

        /// <summary>
        /// Motivo si el día es de paro (cualquiera de los tres), null si se trabaja según
        /// el rol. Para la asignación automática, el machote y el rol semanal: en
        /// ningún paro se ponen días por la empresa seguidos ni se mueven ahí.
        /// </summary>
        internal string? ResolverParo(int grupoId, DateOnly fecha)
        {
            var regla = ReglaQueManda(grupoId, fecha);
            return regla != null && EsTipoParo(regla.Tipo) ? Describir(regla, fecha) : null;
        }

        private string Describir(ReglaDomingo regla, DateOnly fecha)
        {
            var dia = fecha.DayOfWeek == DayOfWeek.Sunday ? "Domingo" : "Sábado";
            var donde = _nombreArea.TryGetValue(regla.AreaId, out var n) ? n : "la unidad organizativa";
            var periodo = $"(regla del {regla.FechaInicio:dd/MM/yyyy} al {regla.FechaFin:dd/MM/yyyy})";
            return regla.Tipo switch
            {
                "ParoEmpresa" => $"{dia} de paro para {donde} {periodo}: no se programan vacaciones; a quien le tocaba trabajarlo " +
                                 "según su rol se le asignan ahí sus días por la empresa.",
                "ParoOperador" => $"{dia} de paro para {donde} {periodo}: no se asignan días por la empresa; el operador " +
                                  "puede programar ahí sus vacaciones si quiere.",
                _ => $"{dia} de paro para {donde} {periodo}: se registra como descanso y no se programan vacaciones ni días por la empresa."
            };
        }

        private async Task CargarAsync(IEnumerable<int> grupoIds)
        {
            if (_reglas == null)
            {
                _reglas = await TablaExisteAsync() ? await LeerReglasActivasAsync() : new List<ReglaDomingo>();
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
        /// Si falta la columna DiaAplicacion (no se corrió
        /// Scripts/Migration_ReglasTrabajo_CapacidadTurno.sql) se leen sin ella, como
        /// antes (domingo, y sábado si IncluyeSabado): la captura, el rol semanal y los
        /// calendarios no deben tronar por un script pendiente.
        /// </summary>
        private async Task<List<ReglaDomingo>> LeerReglasActivasAsync()
        {
            try
            {
                return await _db.ReglasDomingo.AsNoTracking().Where(r => r.Activa).ToListAsync();
            }
            catch (Exception) when (_db.Database.ProviderName?.Contains("SqlServer") == true)
            {
                var filas = await _db.ReglasDomingo.AsNoTracking().Where(r => r.Activa)
                    .Select(r => new { r.Id, r.AreaId, r.GrupoId, r.Tipo, r.IncluyeSabado, r.FechaInicio, r.FechaFin, r.FechaCreacion })
                    .ToListAsync();
                return filas.Select(r => new ReglaDomingo
                {
                    Id = r.Id, AreaId = r.AreaId, GrupoId = r.GrupoId, Tipo = r.Tipo, IncluyeSabado = r.IncluyeSabado,
                    DiaAplicacion = r.IncluyeSabado ? "Ambos" : "Domingo",
                    FechaInicio = r.FechaInicio, FechaFin = r.FechaFin, FechaCreacion = r.FechaCreacion, Activa = true
                }).ToList();
            }
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

        /// <summary>Cualquiera de los tres paros (incluye "el operador elige").</summary>
        public bool EsParo(int grupoId, DateOnly fecha) => _servicio.ResolverParo(grupoId, fecha) != null;

        public string? MotivoParo(int grupoId, DateOnly fecha) => _servicio.ResolverParo(grupoId, fecha);

        /// <summary>La regla que manda ese día para el grupo (o null).</summary>
        public ReglaDomingo? ReglaQueManda(int grupoId, DateOnly fecha) => _servicio.ReglaQueManda(grupoId, fecha);

        /// <summary>Paro con días por la empresa: ahí se asignan los días por la empresa según el rol.</summary>
        public bool EsParoConDiasEmpresa(int grupoId, DateOnly fecha) =>
            _servicio.ReglaQueManda(grupoId, fecha)?.Tipo == "ParoEmpresa";
    }
}
