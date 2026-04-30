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

        public DashboardController(FreeTimeDbContext db)
        {
            _db = db;
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

        /// <summary>
        /// Carga las permutas aprobadas en el rango y construye un mapa
        /// (empleadoId, fecha) → turnoNuevo. Cubre permutas AB e individuales.
        /// </summary>
        private async Task<Dictionary<(int empleadoId, DateOnly fecha), string>> CargarPermutasAsync(
            DateOnly inicio, DateOnly fin, List<int> empleadosIds)
        {
            var permutas = await _db.Permutas
                .Where(p => p.EstadoSolicitud == "Aprobada" &&
                            p.FechaPermuta >= inicio && p.FechaPermuta <= fin)
                .Select(p => new
                {
                    p.EmpleadoOrigenId,
                    p.EmpleadoDestinoId,
                    p.FechaPermuta,
                    p.TurnoEmpleadoOrigen,
                    p.TurnoEmpleadoDestino
                })
                .ToListAsync();

            var mapa = new Dictionary<(int, DateOnly), string>();
            var idsSet = empleadosIds.ToHashSet();

            foreach (var p in permutas)
            {
                if (idsSet.Contains(p.EmpleadoOrigenId))
                    mapa[(p.EmpleadoOrigenId, p.FechaPermuta)] = p.TurnoEmpleadoOrigen ?? "";

                if (p.EmpleadoDestinoId.HasValue && idsSet.Contains(p.EmpleadoDestinoId.Value))
                    mapa[(p.EmpleadoDestinoId.Value, p.FechaPermuta)] = p.TurnoEmpleadoDestino ?? "";
            }

            return mapa;
        }

        /// <summary>
        /// Devuelve el turno efectivo de un empleado en una fecha,
        /// aplicando permuta aprobada si existe.
        /// </summary>
        private static string TurnoEfectivo(
            int empleadoId, DateOnly fecha, string rolGrupo,
            Dictionary<(int, DateOnly), string> permutas)
        {
            return permutas.TryGetValue((empleadoId, fecha), out var turnoPermuta)
                ? turnoPermuta
                : TurnosHelper.ObtenerTurnoParaFecha(rolGrupo, fecha);
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

                foreach (var v in vacaciones.Where(v => v.FechaVacacion.Month == mes))
                {
                    switch (v.TipoVacacion)
                    {
                        case "Anual":            setVac.Add(v.EmpleadoId); break;
                        case "Reprogramacion":   setRep.Add(v.EmpleadoId); break;
                        case "FestivoTrabajado": setFest.Add(v.EmpleadoId); break;
                    }
                }

                foreach (var p in permisos)
                {
                    var pIni = p.Desde > mesInicio ? p.Desde : mesInicio;
                    var pFin = p.Hasta < mesFin ? p.Hasta : mesFin;
                    if (pIni > pFin) continue;
                    if (!nominaToEmpId.TryGetValue(p.Nomina, out var empId)) continue;

                    var clase = p.ClaseAbsentismo ?? "";
                    if (clase.Contains("Incapacidad") || clase.Contains("Accidente") || clase.Contains("Maternidad"))
                        setInc.Add(empId);
                    else if (clase.Contains("Permiso") || clase.Contains("Enfermedad"))
                        setPerm.Add(empId);
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
                };
            }).ToList<object>();

            return Ok(new ApiResponse<object>(true, resultado));
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

            var inicio = new DateOnly(anio, mes, 1);
            var fin = new DateOnly(anio, mes, DateTime.DaysInMonth(anio, mes));

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
                            v.FechaVacacion >= inicio && v.FechaVacacion <= fin &&
                            v.EstadoVacacion == "Activa")
                .Select(v => new { v.EmpleadoId, v.FechaVacacion, v.TipoVacacion })
                .ToListAsync();

            var permisos = await _db.PermisosEIncapacidadesSAP
                .Where(p => p.Desde <= fin && p.Hasta >= inicio &&
                            nominasActivasList.Contains(p.Nomina) &&
                            (p.FechaSolicitud == null || p.EstadoSolicitud == "Aprobada"))
                .Select(p => new { p.Nomina, p.Desde, p.Hasta, p.ClaseAbsentismo })
                .ToListAsync();

            int GetWeek(DateOnly d) => (d.Day - 1) / 7 + 1;

            var resultado = Enumerable.Range(1, 5).Select(semana =>
            {
                var diasSemana = Enumerable.Range(1, DateTime.DaysInMonth(anio, mes))
                    .Select(d => new DateOnly(anio, mes, d))
                    .Where(d => GetWeek(d) == semana)
                    .ToList();

                if (!diasSemana.Any()) return null;

                var semInicio = diasSemana.Min();
                var semFin = diasSemana.Max();

                var setVac = new HashSet<int>();
                var setRep = new HashSet<int>();
                var setFest = new HashSet<int>();
                var setPerm = new HashSet<int>();
                var setInc = new HashSet<int>();

                foreach (var v in vacaciones.Where(v => v.FechaVacacion >= semInicio && v.FechaVacacion <= semFin))
                {
                    switch (v.TipoVacacion)
                    {
                        case "Anual":            setVac.Add(v.EmpleadoId); break;
                        case "Reprogramacion":   setRep.Add(v.EmpleadoId); break;
                        case "FestivoTrabajado": setFest.Add(v.EmpleadoId); break;
                    }
                }

                foreach (var p in permisos)
                {
                    var pIni = p.Desde > semInicio ? p.Desde : semInicio;
                    var pFin = p.Hasta < semFin ? p.Hasta : semFin;
                    if (pIni > pFin) continue;
                    if (!nominaToEmpId.TryGetValue(p.Nomina, out var empId)) continue;

                    var clase = p.ClaseAbsentismo ?? "";
                    if (clase.Contains("Incapacidad") || clase.Contains("Accidente") || clase.Contains("Maternidad"))
                        setInc.Add(empId);
                    else if (clase.Contains("Permiso") || clase.Contains("Enfermedad"))
                        setPerm.Add(empId);
                }

                return (object)new
                {
                    semana,
                    totalEmpleados,
                    turnosDisponibles = diasSemana.Count * totalEmpleados,
                    vacacion = setVac.Count,
                    reprogramacion = setRep.Count,
                    festivoTrabajado = setFest.Count,
                    permiso = setPerm.Count,
                    incapacidad = setInc.Count,
                };
            }).Where(x => x != null).ToList();

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

            static int GetWeekOfYear(int anio, int mes, int semana)
            {
                var primerDia = new DateOnly(anio, mes, Math.Min((semana - 1) * 7 + 1, DateTime.DaysInMonth(anio, mes)));
                var jan1 = new DateTime(primerDia.Year, 1, 1);
                var fecha = primerDia.ToDateTime(TimeOnly.MinValue);
                return (int)Math.Ceiling((fecha - jan1).TotalDays / 7) + 1;
            }

            var resultado = resumen.Select(r => (object)new
            {
                semana = r.Semana,
                semanaAnual = GetWeekOfYear(anio, mes, r.Semana),
                horasNormales = Math.Round(r.HorasNormales, 1),
                horasExtra = Math.Round(r.HorasExtra, 1),
                pctExtra = r.HorasNormales > 0
                    ? Math.Round(r.HorasExtra / r.HorasNormales * 100, 1)
                    : 0.0
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
            var inicio = new DateOnly(anio, mes, 1);
            var fin = new DateOnly(anio, mes, DateTime.DaysInMonth(anio, mes));

            var gruposQuery = _db.Grupos.Include(g => g.Area).AsQueryable();
            if (areasIds != null)
                gruposQuery = gruposQuery.Where(g => areasIds.Contains(g.AreaId));

            var grupos = await gruposQuery.ToListAsync();
            if (!grupos.Any()) return new List<ResumenSemanaDto>();

            var grupoIds = grupos.Select(g => g.GrupoId).ToList();
            var empleadosPorGrupo = await _db.Users
                .Where(u => grupoIds.Contains(u.GrupoId ?? 0) &&
                            u.Status == tiempo_libre.Models.Enums.UserStatus.Activo)
                .Select(u => new { u.Id, u.GrupoId, u.Nomina })
                .ToListAsync();

            var empleadosIds = empleadosPorGrupo.Select(e => e.Id).ToList();
            var nominasActivasList = empleadosPorGrupo.Where(e => e.Nomina.HasValue)
                .Select(e => e.Nomina!.Value).Distinct().ToList();

            var diasInhabiles = await CargarDiasInhabilesAsync(inicio, fin);

            var vacaciones = await _db.VacacionesProgramadas
                .Where(v => empleadosIds.Contains(v.EmpleadoId) &&
                            v.FechaVacacion >= inicio && v.FechaVacacion <= fin &&
                            v.EstadoVacacion == "Activa")
                .Select(v => new { v.EmpleadoId, v.FechaVacacion, v.TipoVacacion })
                .ToListAsync();

            var permisos = await _db.PermisosEIncapacidadesSAP
                .Where(p => nominasActivasList.Contains(p.Nomina) &&
                            p.Desde <= fin && p.Hasta >= inicio &&
                            (p.FechaSolicitud == null || p.EstadoSolicitud == "Aprobada"))
                .Select(p => new { p.Nomina, p.Desde, p.Hasta })
                .ToListAsync();

            // Indices para lookup rápido
            var vacacionesPorEmp = vacaciones
                .Where(v => v.TipoVacacion != "FestivoTrabajado")
                .GroupBy(v => v.EmpleadoId)
                .ToDictionary(g => g.Key, g => g.Select(x => x.FechaVacacion).ToHashSet());

            var permisosPorNomina = permisos
                .GroupBy(p => p.Nomina)
                .ToDictionary(g => g.Key, g => g.Select(x => (x.Desde, x.Hasta)).ToList());

            var permutasMap = await CargarPermutasAsync(inicio, fin, empleadosIds);

            var excepcionesManning = await _db.ExcepcionesManning
                .Where(e => grupos.Select(g => g.AreaId).Contains(e.AreaId) &&
                            e.Anio == anio && e.Mes == mes && e.Activa)
                .ToListAsync();

            static int GetWeek(DateOnly d) => (d.Day - 1) / 7 + 1;

            var resultado = new List<ResumenSemanaDto>();

            for (int semana = 1; semana <= 5; semana++)
            {
                var diasSemana = Enumerable.Range(1, DateTime.DaysInMonth(anio, mes))
                    .Select(d => new DateOnly(anio, mes, d))
                    .Where(d => GetWeek(d) == semana)
                    .ToList();
                if (!diasSemana.Any()) continue;

                double totalHorasNormales = 0;
                double totalHorasExtra = 0;

                foreach (var grupo in grupos)
                {
                    var empGrupo = empleadosPorGrupo.Where(e => e.GrupoId == grupo.GrupoId).ToList();
                    if (empGrupo.Count == 0) continue;

                    var rolGrupo = grupo.Rol ?? string.Empty;
                    var excManning = excepcionesManning.FirstOrDefault(e => e.AreaId == grupo.AreaId);
                    var manning = (double)(excManning?.ManningRequeridoExcepcion ?? grupo.Area?.Manning ?? 0);
                    if (manning <= 0) continue;

                    foreach (var dia in diasSemana)
                    {
                        if (diasInhabiles.Contains(dia)) continue;

                        // Personas del grupo que están "en tiempo normal" ese día:
                        // turno efectivo ∈ {1, 2, 3, F} y no estén ausentes (vac/permiso)
                        int personalTiempoNormal = 0;
                        bool grupoTrabajaDia = false;

                        foreach (var emp in empGrupo)
                        {
                            var turno = TurnoEfectivo(emp.Id, dia, rolGrupo, permutasMap);
                            if (turno != "1" && turno != "2" && turno != "3" && turno != "F")
                                continue;

                            grupoTrabajaDia = true;

                            if (vacacionesPorEmp.TryGetValue(emp.Id, out var fechasVac) && fechasVac.Contains(dia))
                                continue;

                            if (emp.Nomina.HasValue &&
                                permisosPorNomina.TryGetValue(emp.Nomina!.Value, out var rangos) &&
                                rangos.Any(r => r.Desde <= dia && r.Hasta >= dia))
                                continue;

                            personalTiempoNormal++;
                        }

                        if (!grupoTrabajaDia) continue;

                        // Fórmula WeeklyRoles: sin cap al manning
                        totalHorasNormales += personalTiempoNormal * 8;
                        var deficit = manning - personalTiempoNormal;
                        if (deficit > 0)
                            totalHorasExtra += deficit * 8;
                    }
                }

                resultado.Add(new ResumenSemanaDto(semana, totalHorasExtra, totalHorasNormales));
            }

            return resultado;
        }

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
