using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using tiempo_libre.Models;
using tiempo_libre.DTOs;
using tiempo_libre.Helpers;

namespace tiempo_libre.Controllers
{
    [ApiController]
    [Route("api/dashboard")]
    [Authorize(Roles = "SuperUsuario,Super Usuario,Jefe De Area,JefeArea,JefeDeArea,Ingeniero Industrial,IngenieroIndustrial")]
    public class DashboardController : ControllerBase
    {
        private readonly FreeTimeDbContext _db;
        private readonly tiempo_libre.Services.RolSemanalCalculoService _rolSemanal;

        public DashboardController(
            FreeTimeDbContext db,
            tiempo_libre.Services.RolSemanalCalculoService rolSemanal)
        {
            _db = db;
            _rolSemanal = rolSemanal;
        }

        // ─── Helpers de autorización ──────────────────────────────────────────

        private int? GetUserId()
        {
            var claim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            return int.TryParse(claim, out var id) ? id : (int?)null;
        }

        private bool EsSuperUsuario() =>
            User.IsInRole("SuperUsuario") || User.IsInRole("Super Usuario");

        /// <summary>
        /// Devuelve los IDs de áreas que el usuario puede ver.
        /// SuperUsuario → null (todas).
        /// Jefe de Área (Area.JefeId == userId) o Ingeniero Industrial (M:N AreaIngeniero) → áreas asignadas.
        /// </summary>
        private async Task<List<int>?> GetAreasPermitidasAsync()
        {
            if (EsSuperUsuario()) return null;

            var userId = GetUserId();
            if (userId == null) return new List<int>();

            var jefeAreaIds = await _db.Areas
                .Where(a => a.JefeId == userId || a.JefeSuplenteId == userId)
                .Select(a => a.AreaId)
                .ToListAsync();

            var ingenieroAreaIds = await _db.Areas
                .Where(a => a.Ingenieros.Any(u => u.Id == userId))
                .Select(a => a.AreaId)
                .ToListAsync();

            return jefeAreaIds.Union(ingenieroAreaIds).Distinct().ToList();
        }

        /// <summary>
        /// Resuelve los IDs de área que se aplicarán a la consulta:
        /// - Si SuperUsuario y pidió un area → solo esa.
        /// - Si SuperUsuario y no pidió → null = todas.
        /// - Si no es SuperUsuario y pidió un area permitida → solo esa.
        /// - Si no es SuperUsuario y no pidió → todas las permitidas.
        /// - Si pidió un area no permitida → lista vacía (no devolverá datos).
        /// </summary>
        private async Task<List<int>?> ResolverAreasAsync(int? areaIdRequest)
        {
            var permitidas = await GetAreasPermitidasAsync();

            if (permitidas == null)
            {
                // SuperUsuario
                return areaIdRequest.HasValue ? new List<int> { areaIdRequest.Value } : null;
            }

            if (areaIdRequest.HasValue)
            {
                return permitidas.Contains(areaIdRequest.Value)
                    ? new List<int> { areaIdRequest.Value }
                    : new List<int>(); // no permitida → sin datos
            }

            return permitidas;
        }

        // ─── Helpers de cálculo ───────────────────────────────────────────────

        private record SemanaRango(int Semana, DateOnly Inicio, DateOnly Fin);

        /// <summary>
        /// Devuelve las semanas lunes→domingo que contienen al menos un día del mes.
        /// La semana se numera 1..N en orden cronológico. Si una semana cruza meses
        /// (típico en bordes de mes), se devuelven los 7 días reales — el consumidor
        /// decide si recortar al mes o usarla completa.
        /// </summary>
        private static List<SemanaRango> CalcularSemanasLunesDomingo(int anio, int mes)
        {
            static DateOnly LunesDe(DateOnly d)
            {
                int diff = ((int)d.DayOfWeek - (int)DayOfWeek.Monday + 7) % 7;
                return d.AddDays(-diff);
            }

            var primero = new DateOnly(anio, mes, 1);
            var ultimo = new DateOnly(anio, mes, DateTime.DaysInMonth(anio, mes));

            var lunes = LunesDe(primero);
            var ultimoLunes = LunesDe(ultimo);

            var resultado = new List<SemanaRango>();
            int idx = 1;
            for (var l = lunes; l <= ultimoLunes; l = l.AddDays(7))
            {
                resultado.Add(new SemanaRango(idx++, l, l.AddDays(6)));
            }
            return resultado;
        }

        // ─── Ausencias ────────────────────────────────────────────────────────

        /// <summary>
        /// Ausencias agrupadas por mes para un año dado.
        /// Cuenta personas únicas (no días-persona) por mes y por categoría.
        /// </summary>
        [HttpGet("ausencias-anuales")]
        public async Task<IActionResult> GetAusenciasAnuales(
            [FromQuery] int anio = 0,
            [FromQuery] int? areaId = null)
        {
            if (anio == 0) anio = DateTime.Today.Year;
            var areasIds = await ResolverAreasAsync(areaId);
            if (areasIds != null && areasIds.Count == 0)
                return Ok(new ApiResponse<object>(true, EmptyAusenciasAnuales()));

            var inicio = new DateOnly(anio, 1, 1);
            var fin = new DateOnly(anio, 12, 31);

            var empleados = await CargarEmpleadosAsync(areasIds);
            var totalEmpleados = empleados.Count;
            if (totalEmpleados == 0)
                return Ok(new ApiResponse<object>(true, EmptyAusenciasAnuales()));

            var empleadoIds = empleados.Select(e => e.Id).ToList();
            var nominasActivas = empleados.Where(e => e.Nomina.HasValue)
                .Select(e => e.Nomina!.Value).ToHashSet();

            var diasInhabiles = await CargarDiasInhabilesAsync(inicio, fin);

            var vacaciones = await _db.VacacionesProgramadas
                .Where(v => empleadoIds.Contains(v.EmpleadoId) &&
                            v.FechaVacacion >= inicio && v.FechaVacacion <= fin &&
                            v.EstadoVacacion == "Activa")
                .Select(v => new { v.EmpleadoId, v.FechaVacacion, v.TipoVacacion })
                .ToListAsync();

            var permisosRaw = await _db.PermisosEIncapacidadesSAP
                .Where(p => p.Desde <= fin && p.Hasta >= inicio &&
                            (p.FechaSolicitud == null || p.EstadoSolicitud == "Aprobada"))
                .Select(p => new { p.Nomina, p.Desde, p.Hasta, p.ClaseAbsentismo })
                .ToListAsync();

            var permisos = permisosRaw.Where(p => nominasActivas.Contains(p.Nomina)).ToList();
            var nominaToEmpId = empleados.Where(e => e.Nomina.HasValue)
                .ToDictionary(e => e.Nomina!.Value, e => e.Id);

            // Manning para turnosDisponibles
            var manningPorArea = await _db.Areas
                .Where(a => areasIds == null || areasIds.Contains(a.AreaId))
                .Select(a => new { a.AreaId, a.Manning })
                .ToListAsync();
            var manningTotal = manningPorArea.Sum(m => (int)m.Manning);

            var resultado = Enumerable.Range(1, 12).Select(mes =>
            {
                var mesInicio = new DateOnly(anio, mes, 1);
                var mesFin = new DateOnly(anio, mes, DateTime.DaysInMonth(anio, mes));

                int turnosDisponibles = 0;
                for (var f = mesInicio; f <= mesFin; f = f.AddDays(1))
                {
                    if (!diasInhabiles.Contains(f))
                        turnosDisponibles += manningTotal;
                }

                // Personas únicas por categoría en el mes
                var setVac = new HashSet<int>();
                var setRep = new HashSet<int>();
                var setFest = new HashSet<int>();
                var setPerm = new HashSet<int>();
                var setInc = new HashSet<int>();

                var setOtros = new HashSet<int>();

                foreach (var v in vacaciones.Where(v => v.FechaVacacion.Month == mes))
                {
                    CategorizarVacacion(v.TipoVacacion, v.EmpleadoId, setVac, setRep, setFest);
                }

                foreach (var p in permisos)
                {
                    var pIni = p.Desde > mesInicio ? p.Desde : mesInicio;
                    var pFin = p.Hasta < mesFin ? p.Hasta : mesFin;
                    if (pIni > pFin) continue;
                    if (!nominaToEmpId.TryGetValue(p.Nomina, out var empId)) continue;

                    CategorizarPermiso(p.ClaseAbsentismo, empId, setPerm, setInc, setOtros);
                }

                return new
                {
                    mes,
                    totalEmpleados,
                    turnosDisponibles,
                    vacacion = setVac.Count,
                    reprogramacion = setRep.Count,
                    festivoTrabajado = setFest.Count,
                    permiso = setPerm.Count,
                    incapacidad = setInc.Count,
                    otros = setOtros.Count,
                };
            }).ToList<object>();

            return Ok(new ApiResponse<object>(true, resultado));
        }

        // ─── Categorización compartida ───────────────────────────────────────
        // Centraliza las reglas de clasificación de tipos de vacación / permiso
        // para que ausencias-anuales y ausencias-semanales se comporten igual.

        private static void CategorizarVacacion(
            string? tipoVacacion, int empleadoId,
            HashSet<int> setVac, HashSet<int> setRep, HashSet<int> setFest)
        {
            switch (tipoVacacion)
            {
                case "Reprogramacion":
                    setRep.Add(empleadoId);
                    break;
                case "FestivoTrabajado":
                    setFest.Add(empleadoId);
                    break;
                case "Anual":
                case "Automatica":
                case "Programable":
                default:
                    // Cualquier otro tipo de vacación (incluyendo NULL/vacío) cuenta como vacación.
                    setVac.Add(empleadoId);
                    break;
            }
        }

        private static void CategorizarPermiso(
            string? claseAbsentismo, int empleadoId,
            HashSet<int> setPerm, HashSet<int> setInc, HashSet<int> setOtros)
        {
            var clase = claseAbsentismo ?? "";

            // Orden importa: "Inc." gana sobre "Enfermedad" para no clasificar
            // "Inc. Enfermedad General" como permiso. Cubre también
            // "Inc. Pble. Riesgo Trabajo" y similares.
            if (clase.Contains("Incapacidad") || clase.StartsWith("Inc.") || clase.Contains(" Inc.") ||
                clase.Contains("Accidente") || clase.Contains("Maternidad"))
            {
                setInc.Add(empleadoId);
            }
            else if (clase.Contains("Permiso") || clase.Contains("Enfermedad"))
            {
                setPerm.Add(empleadoId);
            }
            else
            {
                // Suspensión y cualquier otra clase no reconocida.
                setOtros.Add(empleadoId);
            }
        }

        /// <summary>
        /// Ausencias por semana del mes — personas únicas por categoría.
        /// </summary>
        [HttpGet("ausencias-semanales")]
        public async Task<IActionResult> GetAusenciasSemanales(
            [FromQuery] int anio = 0,
            [FromQuery] int mes = 0,
            [FromQuery] int? areaId = null)
        {
            if (anio == 0) anio = DateTime.Today.Year;
            if (mes == 0) mes = DateTime.Today.Month;

            var areasIds = await ResolverAreasAsync(areaId);
            if (areasIds != null && areasIds.Count == 0)
                return Ok(new ApiResponse<object>(true, new List<object>()));

            var semanas = CalcularSemanasLunesDomingo(anio, mes);
            var rangoInicio = semanas.First().Inicio;
            var rangoFin = semanas.Last().Fin;

            var empleados = await CargarEmpleadosAsync(areasIds);
            var totalEmpleados = empleados.Count;
            if (totalEmpleados == 0)
                return Ok(new ApiResponse<object>(true, new List<object>()));

            var empleadoIds = empleados.Select(e => e.Id).ToList();
            var nominasActivasList = empleados.Where(e => e.Nomina.HasValue)
                .Select(e => e.Nomina!.Value).Distinct().ToList();
            var nominaToEmpId = empleados.Where(e => e.Nomina.HasValue)
                .ToDictionary(e => e.Nomina!.Value, e => e.Id);

            var vacaciones = await _db.VacacionesProgramadas
                .Where(v => empleadoIds.Contains(v.EmpleadoId) &&
                            v.FechaVacacion >= rangoInicio && v.FechaVacacion <= rangoFin &&
                            v.EstadoVacacion == "Activa")
                .Select(v => new { v.EmpleadoId, v.FechaVacacion, v.TipoVacacion })
                .ToListAsync();

            var permisos = await _db.PermisosEIncapacidadesSAP
                .Where(p => p.Desde <= rangoFin && p.Hasta >= rangoInicio &&
                            nominasActivasList.Contains(p.Nomina) &&
                            (p.FechaSolicitud == null || p.EstadoSolicitud == "Aprobada"))
                .Select(p => new { p.Nomina, p.Desde, p.Hasta, p.ClaseAbsentismo })
                .ToListAsync();

            var resultado = semanas.Select(s =>
            {
                var semInicio = s.Inicio;
                var semFin = s.Fin;

                var setVac = new HashSet<int>();
                var setRep = new HashSet<int>();
                var setFest = new HashSet<int>();
                var setPerm = new HashSet<int>();
                var setInc = new HashSet<int>();
                var setOtros = new HashSet<int>();

                foreach (var v in vacaciones.Where(v => v.FechaVacacion >= semInicio && v.FechaVacacion <= semFin))
                {
                    CategorizarVacacion(v.TipoVacacion, v.EmpleadoId, setVac, setRep, setFest);
                }

                foreach (var p in permisos)
                {
                    var pIni = p.Desde > semInicio ? p.Desde : semInicio;
                    var pFin = p.Hasta < semFin ? p.Hasta : semFin;
                    if (pIni > pFin) continue;
                    if (!nominaToEmpId.TryGetValue(p.Nomina, out var empId)) continue;

                    CategorizarPermiso(p.ClaseAbsentismo, empId, setPerm, setInc, setOtros);
                }

                return (object)new
                {
                    semana = s.Semana,
                    semanaInicio = s.Inicio.ToString("yyyy-MM-dd"),
                    semanaFin = s.Fin.ToString("yyyy-MM-dd"),
                    totalEmpleados,
                    turnosDisponibles = 7 * totalEmpleados,
                    vacacion = setVac.Count,
                    reprogramacion = setRep.Count,
                    festivoTrabajado = setFest.Count,
                    permiso = setPerm.Count,
                    incapacidad = setInc.Count,
                    otros = setOtros.Count,
                };
            }).ToList();

            return Ok(new ApiResponse<object>(true, resultado));
        }

        /// <summary>
        /// Distribución de motivos de ausencia para un rango de fechas.
        /// Cuenta personas únicas por motivo (una persona con varios motivos cuenta en cada uno).
        /// </summary>
        [HttpGet("ausencias-motivos")]
        public async Task<IActionResult> GetAusenciasMotivos(
            [FromQuery] string? fecha = null,
            [FromQuery] string? fechaFin = null,
            [FromQuery] int? areaId = null)
        {
            var dia = fecha != null && DateOnly.TryParse(fecha, out var d) ? d : DateOnly.FromDateTime(DateTime.Today);
            var diaFin = fechaFin != null && DateOnly.TryParse(fechaFin, out var df) ? df : dia;

            var areasIds = await ResolverAreasAsync(areaId);
            if (areasIds != null && areasIds.Count == 0)
                return Ok(new ApiResponse<object>(true, new List<object>()));

            var empleados = await CargarEmpleadosAsync(areasIds);
            var empleadoIds = empleados.Select(e => e.Id).ToList();
            var nominasActivasList = empleados.Where(e => e.Nomina.HasValue)
                .Select(e => e.Nomina!.Value).Distinct().ToList();
            var nominaToEmpId = empleados.Where(e => e.Nomina.HasValue)
                .ToDictionary(e => e.Nomina!.Value, e => e.Id);

            var vacaciones = await _db.VacacionesProgramadas
                .Where(v => empleadoIds.Contains(v.EmpleadoId) &&
                            v.FechaVacacion >= dia && v.FechaVacacion <= diaFin &&
                            v.EstadoVacacion == "Activa")
                .Select(v => new { v.EmpleadoId, v.TipoVacacion })
                .ToListAsync();

            var permisos = await _db.PermisosEIncapacidadesSAP
                .Where(p => p.Desde <= diaFin && p.Hasta >= dia &&
                            nominasActivasList.Contains(p.Nomina) &&
                            (p.FechaSolicitud == null || p.EstadoSolicitud == "Aprobada"))
                .Select(p => new { p.Nomina, p.ClaseAbsentismo })
                .ToListAsync();

            var motivoSets = new Dictionary<string, HashSet<int>>();
            void AddMotivo(string motivo, int empId)
            {
                if (!motivoSets.TryGetValue(motivo, out var set))
                {
                    set = new HashSet<int>();
                    motivoSets[motivo] = set;
                }
                set.Add(empId);
            }

            foreach (var v in vacaciones)
                AddMotivo(v.TipoVacacion ?? "Vacaciones", v.EmpleadoId);

            foreach (var p in permisos)
            {
                if (!nominaToEmpId.TryGetValue(p.Nomina, out var empId)) continue;
                AddMotivo(p.ClaseAbsentismo ?? "Permiso", empId);
            }

            var resultado = motivoSets.Select(kv => new { motivo = kv.Key, total = kv.Value.Count }).ToList<object>();
            return Ok(new ApiResponse<object>(true, resultado));
        }

        // ─── Tiempo extra ─────────────────────────────────────────────────────

        [HttpGet("resumen-tiempo-extra")]
        public async Task<IActionResult> GetResumenTiempoExtra(
            [FromQuery] int anio = 0,
            [FromQuery] int mes = 0,
            [FromQuery] int? areaId = null)
        {
            if (anio == 0) anio = DateTime.Today.Year;
            if (mes == 0) mes = DateTime.Today.Month;

            var areasIds = await ResolverAreasAsync(areaId);
            if (areasIds != null && areasIds.Count == 0)
                return Ok(new ApiResponse<object>(true, new List<object>()));

            var resumen = await CalcularResumenTiempoExtraMes(anio, mes, areasIds);
            var response = resumen.Select(r => new
            {
                semana = r.Semana,
                horasExtra = Math.Round(r.HorasExtra, 1),
                horasNormales = Math.Round(r.HorasNormales, 1),
                pctExtra = r.HorasNormales > 0
                    ? Math.Round(r.HorasExtra / r.HorasNormales * 100, 1)
                    : 0.0
            }).ToList<object>();

            return Ok(new ApiResponse<object>(true, response));
        }

        [HttpGet("resumen-tiempo-extra-anual")]
        public async Task<IActionResult> GetResumenTiempoExtraAnual(
            [FromQuery] int anio = 0,
            [FromQuery] int? areaId = null)
        {
            if (anio == 0) anio = DateTime.Today.Year;

            var areasIds = await ResolverAreasAsync(areaId);
            if (areasIds != null && areasIds.Count == 0)
                return Ok(new ApiResponse<object>(true, new List<object>()));

            var resultado = new List<object>();
            for (int mes = 1; mes <= 12; mes++)
            {
                var resumen = await CalcularResumenTiempoExtraMes(anio, mes, areasIds);
                var totalExtra = resumen.Sum(r => r.HorasExtra);
                var totalNormal = resumen.Sum(r => r.HorasNormales);
                resultado.Add(new
                {
                    mes,
                    horasExtra = Math.Round(totalExtra, 1),
                    horasNormales = Math.Round(totalNormal, 1),
                    pctExtra = totalNormal > 0
                        ? Math.Round(totalExtra / totalNormal * 100, 1)
                        : 0.0
                });
            }

            return Ok(new ApiResponse<object>(true, resultado));
        }

        /// <summary>
        /// Debug: desglose por grupo y por día de cómo se compone una semana del
        /// tiempo extra. Útil para comparar contra WeeklyRoles cuando los totales
        /// no cuadran. NO consumido por la UI normal.
        /// </summary>
        [HttpGet("resumen-tiempo-extra-debug")]
        public async Task<IActionResult> GetResumenTiempoExtraDebug(
            [FromQuery] int anio = 0,
            [FromQuery] int mes = 0,
            [FromQuery] int semana = 0,
            [FromQuery] int? areaId = null)
        {
            if (anio == 0) anio = DateTime.Today.Year;
            if (mes == 0) mes = DateTime.Today.Month;

            var areasIds = await ResolverAreasAsync(areaId);
            if (areasIds != null && areasIds.Count == 0)
                return Ok(new ApiResponse<object>(true, new { error = "Sin áreas resueltas" }));

            var semanas = CalcularSemanasLunesDomingo(anio, mes);
            var semanaSel = semana > 0
                ? semanas.FirstOrDefault(x => x.Semana == semana)
                : semanas.FirstOrDefault();
            if (semanaSel == null)
                return Ok(new ApiResponse<object>(true, new { error = "Semana no encontrada" }));

            var gruposQuery = _db.Grupos.Include(g => g.Area).AsQueryable();
            if (areasIds != null)
                gruposQuery = gruposQuery.Where(g => areasIds.Contains(g.AreaId));
            var grupos = await gruposQuery.ToListAsync();

            var excepcionesManning = await _db.ExcepcionesManning
                .Where(e => grupos.Select(g => g.AreaId).Contains(e.AreaId) &&
                            e.Anio == anio && e.Mes == mes && e.Activa)
                .ToListAsync();

            var diasSemana = Enumerable.Range(0, 7).Select(i => semanaSel.Inicio.AddDays(i)).ToList();
            var detalle = new List<object>();
            double totalNormal = 0, totalExtra = 0;

            foreach (var grupo in grupos)
            {
                var excManning = excepcionesManning.FirstOrDefault(e => e.AreaId == grupo.AreaId);
                var manningBase = grupo.Area?.Manning ?? 0;
                var manningExc = excManning?.ManningRequeridoExcepcion;
                var manning = (double)(manningExc ?? manningBase);

                var codigos = await _rolSemanal.CalcularCodigosTurnoGrupoAsync(
                    grupo.GrupoId, semanaSel.Inicio, semanaSel.Fin);

                var dias = new List<object>();
                foreach (var dia in diasSemana)
                {
                    var codigosDia = codigos.Where(kv => kv.Key.Item2 == dia)
                        .Select(kv => kv.Value).ToList();

                    bool trabaja = codigosDia.Any(EsTurnoTrabajo);
                    int ausentes = codigosDia.Count(EsAusente);
                    int descanso = codigosDia.Count(c => c == "D");
                    int personalNormal = Math.Max(0, codigosDia.Count - ausentes - descanso);
                    // Horas normales se cuentan SIEMPRE (igual que WeeklyRoles).
                    // Horas extra solo cuando el grupo trabaja el día.
                    double hNormal = personalNormal * 8.0;
                    double hExtra = (trabaja && manning > personalNormal) ? (manning - personalNormal) * 8.0 : 0;

                    totalNormal += hNormal;
                    if (trabaja) totalExtra += hExtra;

                    var conteoPorCodigo = codigosDia
                        .GroupBy(c => string.IsNullOrEmpty(c) ? "(vacío)" : c)
                        .OrderBy(g => g.Key)
                        .ToDictionary(g => g.Key, g => g.Count());

                    dias.Add(new
                    {
                        fecha = dia.ToString("yyyy-MM-dd"),
                        diaSemana = dia.DayOfWeek.ToString(),
                        totalEmpleados = codigosDia.Count,
                        trabajaDia = trabaja,
                        ausentes,
                        descanso,
                        personalTiempoNormal = personalNormal,
                        manningAplicado = manning,
                        deficit = trabaja ? Math.Max(0, manning - personalNormal) : 0,
                        horasNormales = hNormal,
                        horasExtra = hExtra,
                        conteoPorCodigo
                    });
                }

                detalle.Add(new
                {
                    grupoId = grupo.GrupoId,
                    rol = grupo.Rol,
                    areaId = grupo.AreaId,
                    area = grupo.Area?.NombreGeneral,
                    manningBase,
                    manningExcepcion = manningExc,
                    manningAplicado = manning,
                    dias
                });
            }

            return Ok(new ApiResponse<object>(true, new
            {
                anio,
                mes,
                semanaLocal = semanaSel.Semana,
                semanaInicio = semanaSel.Inicio.ToString("yyyy-MM-dd"),
                semanaFin = semanaSel.Fin.ToString("yyyy-MM-dd"),
                totalHorasNormales = Math.Round(totalNormal, 1),
                totalHorasExtra = Math.Round(totalExtra, 1),
                detalle
            }));
        }

        [HttpGet("resumen-tiempo-extra-semanal-v2")]
        public async Task<IActionResult> GetResumenTiempoExtraSemanalV2(
            [FromQuery] int anio = 0,
            [FromQuery] int mes = 0,
            [FromQuery] int? areaId = null)
        {
            if (anio == 0) anio = DateTime.Today.Year;
            if (mes == 0) mes = DateTime.Today.Month;

            var areasIds = await ResolverAreasAsync(areaId);
            if (areasIds != null && areasIds.Count == 0)
                return Ok(new ApiResponse<object>(true, new List<object>()));

            var resumen = await CalcularResumenTiempoExtraMes(anio, mes, areasIds);
            var semanas = CalcularSemanasLunesDomingo(anio, mes);
            var cal = System.Globalization.CultureInfo.InvariantCulture.Calendar;

            var resultado = resumen.Select(r =>
            {
                var s = semanas.First(x => x.Semana == r.Semana);
                int semanaAnual = cal.GetWeekOfYear(
                    s.Inicio.ToDateTime(TimeOnly.MinValue),
                    System.Globalization.CalendarWeekRule.FirstFourDayWeek,
                    DayOfWeek.Monday);
                return (object)new
                {
                    semana = r.Semana,
                    semanaAnual,
                    semanaInicio = s.Inicio.ToString("yyyy-MM-dd"),
                    semanaFin = s.Fin.ToString("yyyy-MM-dd"),
                    horasNormales = Math.Round(r.HorasNormales, 1),
                    horasExtra = Math.Round(r.HorasExtra, 1),
                    pctExtra = r.HorasNormales > 0
                        ? Math.Round(r.HorasExtra / r.HorasNormales * 100, 1)
                        : 0.0
                };
            }).ToList();

            return Ok(new ApiResponse<object>(true, resultado));
        }

        // ─── Permutas (métrica informativa) ───────────────────────────────────

        /// <summary>
        /// Resumen de permutas aprobadas por mes para un año (informativo).
        /// </summary>
        [HttpGet("permutas-resumen")]
        public async Task<IActionResult> GetPermutasResumen(
            [FromQuery] int anio = 0,
            [FromQuery] int? areaId = null)
        {
            if (anio == 0) anio = DateTime.Today.Year;

            var areasIds = await ResolverAreasAsync(areaId);
            if (areasIds != null && areasIds.Count == 0)
                return Ok(new ApiResponse<object>(true, new List<object>()));

            var inicio = new DateOnly(anio, 1, 1);
            var fin = new DateOnly(anio, 12, 31);

            var empleados = await CargarEmpleadosAsync(areasIds);
            var empleadoIds = empleados.Select(e => e.Id).ToHashSet();

            var permutas = await _db.Permutas
                .Where(p => p.EstadoSolicitud == "Aprobada" &&
                            p.FechaPermuta >= inicio && p.FechaPermuta <= fin)
                .Select(p => new { p.EmpleadoOrigenId, p.EmpleadoDestinoId, p.FechaPermuta })
                .ToListAsync();

            var permutasArea = permutas
                .Where(p => empleadoIds.Contains(p.EmpleadoOrigenId) ||
                            (p.EmpleadoDestinoId.HasValue && empleadoIds.Contains(p.EmpleadoDestinoId.Value)))
                .ToList();

            var resultado = Enumerable.Range(1, 12).Select(mes => new
            {
                mes,
                permutas = permutasArea.Count(p => p.FechaPermuta.Month == mes),
                intercambios = permutasArea.Count(p => p.FechaPermuta.Month == mes && p.EmpleadoDestinoId.HasValue),
                cambiosIndividuales = permutasArea.Count(p => p.FechaPermuta.Month == mes && !p.EmpleadoDestinoId.HasValue),
            }).ToList<object>();

            return Ok(new ApiResponse<object>(true, resultado));
        }

        // ─── Implementación cálculo TE ────────────────────────────────────────

        private record ResumenSemanaDto(int Semana, double HorasExtra, double HorasNormales);

        /// <summary>
        /// Calcula horas normales y extra por semana del mes usando la fórmula de WeeklyRoles.tsx.
        /// horasNormales = personalTiempoNormal × 8  (sin cap por manning)
        /// horasExtra = max(0, manning − personalTiempoNormal) × 8
        /// personalTiempoNormal = empleados del grupo con turno 1/2/3/F (no descanso, no ausentes).
        /// Aplica permutas aprobadas para sustituir el turno del patrón.
        /// </summary>
        private async Task<List<ResumenSemanaDto>> CalcularResumenTiempoExtraMes(
            int anio, int mes, List<int>? areasIds)
        {
            var semanas = CalcularSemanasLunesDomingo(anio, mes);
            var rangoInicio = semanas.First().Inicio;
            var rangoFin = semanas.Last().Fin;

            var gruposQuery = _db.Grupos.Include(g => g.Area).AsQueryable();
            if (areasIds != null)
                gruposQuery = gruposQuery.Where(g => areasIds.Contains(g.AreaId));

            var grupos = await gruposQuery.ToListAsync();
            if (!grupos.Any()) return new List<ResumenSemanaDto>();

            var excepcionesManning = await _db.ExcepcionesManning
                .Where(e => grupos.Select(g => g.AreaId).Contains(e.AreaId) &&
                            e.Anio == anio && e.Mes == mes && e.Activa)
                .ToListAsync();

            // Calcular el código de turno FINAL por empleado y día usando el
            // mismo servicio que el rol semanal (WeeklyRoles). Una sola llamada
            // por grupo cubre todo el rango del mes.
            var codigosPorGrupo = new Dictionary<int, Dictionary<(int, DateOnly), string>>();
            foreach (var grupo in grupos)
            {
                codigosPorGrupo[grupo.GrupoId] =
                    await _rolSemanal.CalcularCodigosTurnoGrupoAsync(grupo.GrupoId, rangoInicio, rangoFin);
            }

            var resultado = new List<ResumenSemanaDto>();

            foreach (var s in semanas)
            {
                var diasSemana = Enumerable.Range(0, 7)
                    .Select(i => s.Inicio.AddDays(i))
                    .ToList();

                double totalHorasNormales = 0;
                double totalHorasExtra = 0;

                foreach (var grupo in grupos)
                {
                    var excManning = excepcionesManning.FirstOrDefault(e => e.AreaId == grupo.AreaId);
                    var manning = (double)(excManning?.ManningRequeridoExcepcion ?? grupo.Area?.Manning ?? 0);
                    if (manning <= 0) continue;

                    var codigos = codigosPorGrupo[grupo.GrupoId];

                    foreach (var dia in diasSemana)
                    {
                        // Misma fórmula que WeeklyRoles.tsx:
                        //   ausentes  = códigos ∈ {E,A,R,M,V,P,G,H,O,S,T}
                        //   descanso  = código "D"
                        //   personalTiempoNormal = total − ausentes − descanso
                        //   díaDescanso = nadie con turno de trabajo {1,2,3,F}
                        var codigosDia = codigos
                            .Where(kv => kv.Key.Item2 == dia)
                            .Select(kv => kv.Value)
                            .ToList();

                        if (codigosDia.Count == 0) continue;

                        int ausentes = codigosDia.Count(EsAusente);
                        int descanso = codigosDia.Count(c => c == "D");
                        int personalTiempoNormal = Math.Max(0, codigosDia.Count - ausentes - descanso);

                        // Fórmula WeeklyRoles: horasTiempoNormal se contabiliza
                        // SIEMPRE (incluso en días donde el grupo descansa), igual
                        // que personalTiempoNormal × 8 en la fila correspondiente
                        // de WeeklyRoles. El cap por manning solo aplica cuando el
                        // grupo realmente trabaja el día — si descansa, no hay
                        // déficit (no se requieren turnos esa fecha).
                        totalHorasNormales += personalTiempoNormal * 8;

                        bool grupoTrabajaDia = codigosDia.Any(EsTurnoTrabajo);
                        if (grupoTrabajaDia)
                        {
                            var deficit = manning - personalTiempoNormal;
                            if (deficit > 0)
                                totalHorasExtra += deficit * 8;
                        }
                    }
                }

                resultado.Add(new ResumenSemanaDto(s.Semana, totalHorasExtra, totalHorasNormales));
            }

            return resultado;
        }

        // Códigos de turno de trabajo efectivo (cuentan como personal presente).
        private static bool EsTurnoTrabajo(string c) =>
            c == "1" || c == "2" || c == "3" || c == "F";

        // Códigos que representan ausencia (descuentan de personal tiempo normal),
        // igual que WeeklyRoles.tsx: E (incapacidad), A/R/M (APC), V (vacación),
        // P/G/H/O (permisos), S (castigo), T (fuera de tiempo).
        private static bool EsAusente(string c) =>
            c == "E" || c == "A" || c == "R" || c == "M" || c == "V" ||
            c == "P" || c == "G" || c == "H" || c == "O" || c == "S" || c == "T";

        // ─── Helpers de carga ─────────────────────────────────────────────────

        private async Task<List<EmpleadoLite>> CargarEmpleadosAsync(List<int>? areasIds)
        {
            var q = _db.Users
                .Where(u => u.Status == tiempo_libre.Models.Enums.UserStatus.Activo && u.GrupoId != null);
            if (areasIds != null)
                q = q.Where(u => u.AreaId.HasValue && areasIds.Contains(u.AreaId.Value));

            return await q
                .Select(u => new EmpleadoLite { Id = u.Id, Nomina = u.Nomina, GrupoId = u.GrupoId, AreaId = u.AreaId })
                .ToListAsync();
        }

        private async Task<HashSet<DateOnly>> CargarDiasInhabilesAsync(DateOnly inicio, DateOnly fin)
        {
            var raw = await _db.DiasInhabiles
                .Where(d => d.FechaFinal >= inicio && d.FechaInicial <= fin)
                .Select(d => new { d.FechaInicial, d.FechaFinal })
                .ToListAsync();

            var set = new HashSet<DateOnly>();
            foreach (var d in raw)
            {
                for (var f = d.FechaInicial; f <= d.FechaFinal && f <= fin; f = f.AddDays(1))
                    if (f >= inicio) set.Add(f);
            }
            return set;
        }

        private static List<object> EmptyAusenciasAnuales() =>
            Enumerable.Range(1, 12).Select(mes => (object)new
            {
                mes,
                totalEmpleados = 0,
                turnosDisponibles = 0,
                vacacion = 0,
                reprogramacion = 0,
                festivoTrabajado = 0,
                permiso = 0,
                incapacidad = 0,
            }).ToList();

        private class EmpleadoLite
        {
            public int Id { get; set; }
            public int? Nomina { get; set; }
            public int? GrupoId { get; set; }
            public int? AreaId { get; set; }
        }
    }
}
