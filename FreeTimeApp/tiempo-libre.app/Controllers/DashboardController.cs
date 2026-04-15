using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using tiempo_libre.Models;
using tiempo_libre.DTOs;

namespace tiempo_libre.Controllers
{
    [ApiController]
    [Route("api/dashboard")]
    [Authorize]
    public class DashboardController : ControllerBase
    {
        private readonly FreeTimeDbContext _db;

        public DashboardController(FreeTimeDbContext db)
        {
            _db = db;
        }

        /// <summary>
        /// Retorna ausencias agrupadas por mes para un año dado
        /// </summary>
        [HttpGet("ausencias-anuales")]
        public async Task<IActionResult> GetAusenciasAnuales([FromQuery] int anio = 0, [FromQuery] int? areaId = null)
        {
            if (anio == 0) anio = DateTime.Today.Year;

            var inicio = new DateOnly(anio, 1, 1);
            var fin = new DateOnly(anio, 12, 31);

            var empleadosQuery = _db.Users
                .Where(u => u.Status == tiempo_libre.Models.Enums.UserStatus.Activo && u.GrupoId != null);
            if (areaId.HasValue)
                empleadosQuery = empleadosQuery.Where(u => u.AreaId == areaId.Value);

            var empleadoIds = await empleadosQuery.Select(u => u.Id).ToListAsync();
            var totalEmpleados = empleadoIds.Count;

            var nominasArea = await empleadosQuery
                .Where(u => u.Nomina.HasValue)
                .Select(u => u.Nomina!.Value)
                .ToListAsync();
            var nominasSet = nominasArea.ToHashSet();

            var vacaciones = await _db.VacacionesProgramadas
                .Where(v => empleadoIds.Contains(v.EmpleadoId) &&
                            v.FechaVacacion >= inicio && v.FechaVacacion <= fin &&
                            v.EstadoVacacion == "Activa")
                .GroupBy(v => new { v.FechaVacacion.Month, v.TipoVacacion })
                .Select(g => new { g.Key.Month, g.Key.TipoVacacion, Total = g.Count() })
                .ToListAsync();

            var permisosRaw = await _db.PermisosEIncapacidadesSAP
                .Where(p => p.Desde >= inicio && p.Desde <= fin &&
                            (p.FechaSolicitud == null || p.EstadoSolicitud == "Aprobada"))
                .Select(p => new { p.Desde.Month, Tipo = p.ClaseAbsentismo ?? "Permiso", p.Nomina })
                .ToListAsync();

            var permisos = areaId.HasValue
                ? permisosRaw.Where(p => nominasSet.Contains(p.Nomina)).ToList()
                : permisosRaw;

            var resultado = Enumerable.Range(1, 12).Select(mes => new
            {
                mes,
                totalEmpleados,
                vacacion = vacaciones.Where(v => v.Month == mes && v.TipoVacacion == "Anual").Sum(v => v.Total),
                reprogramacion = vacaciones.Where(v => v.Month == mes && v.TipoVacacion == "Reprogramacion").Sum(v => v.Total),
                festivoTrabajado = vacaciones.Where(v => v.Month == mes && v.TipoVacacion == "FestivoTrabajado").Sum(v => v.Total),
                permiso = permisos.Where(p => p.Month == mes && p.Tipo.Contains("Permiso")).Sum(p => 1),
                incapacidad = permisos.Where(p => p.Month == mes && p.Tipo.Contains("Incapacidad")).Sum(p => 1),
            }).ToList();

            return Ok(new ApiResponse<object>(true, resultado));
        }

        /// <summary>
        /// Retorna ausencias por semana del mes actual
        /// </summary>
        [HttpGet("ausencias-semanales")]
        public async Task<IActionResult> GetAusenciasSemanales([FromQuery] int anio = 0, [FromQuery] int mes = 0, [FromQuery] int? areaId = null)
        {
            if (anio == 0) anio = DateTime.Today.Year;
            if (mes == 0) mes = DateTime.Today.Month;

            var inicio = new DateOnly(anio, mes, 1);
            var fin = new DateOnly(anio, mes, DateTime.DaysInMonth(anio, mes));

            var empleadosQuery = _db.Users
                .Where(u => u.Status == tiempo_libre.Models.Enums.UserStatus.Activo && u.GrupoId != null);
            if (areaId.HasValue)
                empleadosQuery = empleadosQuery.Where(u => u.AreaId == areaId.Value);

            var empleadoIds = await empleadosQuery.Select(u => u.Id).ToListAsync();
            var totalEmpleados = empleadoIds.Count;

            var nominasArea = await empleadosQuery
                .Where(u => u.Nomina.HasValue)
                .Select(u => u.Nomina!.Value)
                .ToListAsync();
            var nominasSet = nominasArea.ToHashSet();

            var vacaciones = await _db.VacacionesProgramadas
                .Where(v => empleadoIds.Contains(v.EmpleadoId) &&
                            v.FechaVacacion >= inicio && v.FechaVacacion <= fin &&
                            v.EstadoVacacion == "Activa")
                .Select(v => new { v.FechaVacacion, v.TipoVacacion })
                .ToListAsync();

            var permisosRaw = await _db.PermisosEIncapacidadesSAP
                .Where(p => p.Desde >= inicio && p.Desde <= fin &&
                            (p.FechaSolicitud == null || p.EstadoSolicitud == "Aprobada"))
                .Select(p => new { Fecha = p.Desde, Tipo = p.ClaseAbsentismo ?? "Permiso", p.Nomina })
                .ToListAsync();

            var permisos = areaId.HasValue
                ? permisosRaw.Where(p => nominasSet.Contains(p.Nomina)).ToList()
                : permisosRaw;

            static int GetWeek(DateOnly d) => (d.Day - 1) / 7 + 1;

            var resultado = Enumerable.Range(1, 5).Select(semana => new
            {
                semana,
                totalEmpleados,
                vacacion = vacaciones.Count(v => GetWeek(v.FechaVacacion) == semana && v.TipoVacacion == "Anual"),
                reprogramacion = vacaciones.Count(v => GetWeek(v.FechaVacacion) == semana && v.TipoVacacion == "Reprogramacion"),
                festivoTrabajado = vacaciones.Count(v => GetWeek(v.FechaVacacion) == semana && v.TipoVacacion == "FestivoTrabajado"),
                permiso = permisos.Count(p => GetWeek(p.Fecha) == semana && p.Tipo.Contains("Permiso")),
                incapacidad = permisos.Count(p => GetWeek(p.Fecha) == semana && p.Tipo.Contains("Incapacidad")),
            }).ToList();

            return Ok(new ApiResponse<object>(true, resultado));
        }

        /// <summary>
        /// Retorna el desglose de motivos de ausencia del día actual (o fecha indicada)
        /// </summary>
        [HttpGet("ausencias-motivos")]
        public async Task<IActionResult> GetAusenciasMotivos([FromQuery] string? fecha = null, [FromQuery] string? fechaFin = null)
        {
            var dia = fecha != null && DateOnly.TryParse(fecha, out var d) ? d : DateOnly.FromDateTime(DateTime.Today);
            var diaFin = fechaFin != null && DateOnly.TryParse(fechaFin, out var df) ? df : dia;

            var vacaciones = await _db.VacacionesProgramadas
                .Where(v => v.FechaVacacion >= dia && v.FechaVacacion <= diaFin && v.EstadoVacacion == "Activa")
                .GroupBy(v => v.TipoVacacion)
                .Select(g => new { Motivo = g.Key, Total = g.Count() })
                .ToListAsync();

            var permisos = await _db.PermisosEIncapacidadesSAP
                .Where(p => p.Desde <= diaFin && p.Hasta >= dia &&
                            (p.FechaSolicitud == null || p.EstadoSolicitud == "Aprobada"))
                .GroupBy(p => p.ClaseAbsentismo)
                .Select(g => new { Motivo = g.Key ?? "Permiso", Total = g.Count() })
                .ToListAsync();

            var resultado = vacaciones.Select(v => new { motivo = v.Motivo, total = v.Total })
                .Concat(permisos.Select(p => new { motivo = p.Motivo, total = p.Total }))
                .ToList();

            return Ok(new ApiResponse<object>(true, resultado));
        }

        /// <summary>
        /// Retorna resumen de horas normales vs tiempo extra por semana del mes
        /// </summary>
        [HttpGet("resumen-tiempo-extra")]
        public async Task<IActionResult> GetResumenTiempoExtra(
            [FromQuery] int anio = 0,
            [FromQuery] int mes = 0,
            [FromQuery] int? areaId = null)
        {
            if (anio == 0) anio = DateTime.Today.Year;
            if (mes == 0) mes = DateTime.Today.Month;

            var resultado = await CalcularResumenTiempoExtraMes(anio, mes, areaId);
            var response = resultado.Select(r => new
            {
                r.Semana,
                horasExtra = Math.Round(r.HorasExtra, 1),
                horasNormales = Math.Round(r.HorasNormales, 1),
                pctExtra = r.HorasNormales > 0
                    ? Math.Round(r.HorasExtra / r.HorasNormales * 100, 1)
                    : 0.0
            }).ToList();

            return Ok(new ApiResponse<object>(true, response));
        }

        [HttpGet("resumen-tiempo-extra-anual")]
        public async Task<IActionResult> GetResumenTiempoExtraAnual(
            [FromQuery] int anio = 0,
            [FromQuery] int? areaId = null)
        {
            if (anio == 0) anio = DateTime.Today.Year;
            var resultado = new List<object>();

            for (int mes = 1; mes <= 12; mes++)
            {
                var resumenMes = await CalcularResumenTiempoExtraMes(anio, mes, areaId);
                resultado.Add(new
                {
                    mes,
                    horasExtra = Math.Round(resumenMes.Sum(r => r.HorasExtra), 1),
                    horasNormales = Math.Round(resumenMes.Sum(r => r.HorasNormales), 1),
                    pctExtra = resumenMes.Sum(r => r.HorasNormales) > 0
                        ? Math.Round(resumenMes.Sum(r => r.HorasExtra) / resumenMes.Sum(r => r.HorasNormales) * 100, 1)
                        : 0.0
                });
            }

            return Ok(new ApiResponse<object>(true, resultado));
        }

        private record ResumenSemanaDto(int Semana, double HorasExtra, double HorasNormales);

        private async Task<List<ResumenSemanaDto>> CalcularResumenTiempoExtraMes(
            int anio, int mes, int? areaId)
        {
            var inicio = new DateOnly(anio, mes, 1);
            var fin = new DateOnly(anio, mes, DateTime.DaysInMonth(anio, mes));

            var gruposQuery = _db.Grupos.Include(g => g.Area).AsQueryable();
            if (areaId.HasValue)
                gruposQuery = gruposQuery.Where(g => g.AreaId == areaId.Value);
            var grupos = await gruposQuery.ToListAsync();

            if (!grupos.Any()) return new List<ResumenSemanaDto>();

            var grupoIds = grupos.Select(g => g.GrupoId).ToList();

            var empleadosPorGrupo = await _db.Users
                .Where(u => grupoIds.Contains(u.GrupoId ?? 0) &&
                            u.Status == tiempo_libre.Models.Enums.UserStatus.Activo)
                .Select(u => new { u.Id, u.GrupoId, u.Nomina })
                .ToListAsync();

            var empleadosIds = empleadosPorGrupo.Select(e => e.Id).ToList();
            var nominasActivas = empleadosPorGrupo
                .Where(e => e.Nomina.HasValue)
                .Select(e => e.Nomina!.Value)
                .Distinct().ToList();

            var diasInhabiles = await _db.DiasInhabiles
                .Where(d => d.Fecha >= inicio && d.Fecha <= fin)
                .Select(d => d.Fecha)
                .ToHashSetAsync();

            var vacaciones = await _db.VacacionesProgramadas
                .Where(v => empleadosIds.Contains(v.EmpleadoId) &&
                            v.FechaVacacion >= inicio && v.FechaVacacion <= fin &&
                            v.EstadoVacacion == "Activa")
                .Select(v => new { v.EmpleadoId, v.FechaVacacion })
                .ToListAsync();

            var permisos = await _db.PermisosEIncapacidadesSAP
                .Where(p => nominasActivas.Contains(p.Nomina) &&
                            p.Desde <= fin && p.Hasta >= inicio &&
                            (p.FechaSolicitud == null || p.EstadoSolicitud == "Aprobada"))
                .Select(p => new { p.Nomina, p.Desde, p.Hasta })
                .ToListAsync();

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

                double totalHorasExtra = 0;
                double totalHorasNormales = 0;

                foreach (var grupo in grupos)
                {
                    var empGrupo = empleadosPorGrupo
                        .Where(e => e.GrupoId == grupo.GrupoId).ToList();
                    var totalEmp = empGrupo.Count;
                    if (totalEmp == 0) continue;

                    var empIds = empGrupo.Select(e => e.Id).ToHashSet();
                    var nominasGrupo = empGrupo
                        .Where(e => e.Nomina.HasValue)
                        .Select(e => e.Nomina!.Value).ToHashSet();

                    var excManning = excepcionesManning
                        .FirstOrDefault(e => e.AreaId == grupo.AreaId);
                    var manning = excManning?.ManningRequeridoExcepcion
                                  ?? grupo.Area?.Manning ?? 0;
                    if (manning <= 0) continue;

                    foreach (var dia in diasSemana)
                    {
                        // Excluir días inhábiles del cálculo
                        if (diasInhabiles.Contains(dia)) continue;

                        var ausentesVac = vacaciones
                            .Count(v => empIds.Contains(v.EmpleadoId) && v.FechaVacacion == dia);
                        var ausentesPerm = permisos
                            .Count(p => nominasGrupo.Contains(p.Nomina) &&
                                        p.Desde <= dia && p.Hasta >= dia);

                        var totalAusentes = Math.Min(ausentesVac + ausentesPerm, totalEmp);
                        var disponibles = totalEmp - totalAusentes;

                        var deficit = (double)manning - disponibles;
                        if (deficit > 0)
                            totalHorasExtra += deficit * 8;

                        // Solo contar horas normales de los que SÍ trabajan (disponibles)
                        totalHorasNormales += disponibles * 8;
                    }
                }

                resultado.Add(new ResumenSemanaDto(semana, totalHorasExtra, totalHorasNormales));
            }

            return resultado;
        }

        [HttpGet("resumen-tiempo-extra-semanal-v2")]
        public async Task<IActionResult> GetResumenTiempoExtraSemanalV2(
    [FromQuery] int anio = 0,
    [FromQuery] int mes = 0,
    [FromQuery] int? areaId = null)
        {
            if (anio == 0) anio = DateTime.Today.Year;
            if (mes == 0) mes = DateTime.Today.Month;

            var inicio = new DateOnly(anio, mes, 1);
            var fin = new DateOnly(anio, mes, DateTime.DaysInMonth(anio, mes));

            var gruposQuery = _db.Grupos.Include(g => g.Area).AsQueryable();
            if (areaId.HasValue)
                gruposQuery = gruposQuery.Where(g => g.AreaId == areaId.Value);
            var grupos = await gruposQuery.ToListAsync();
            if (!grupos.Any()) return Ok(new ApiResponse<object>(true, new List<object>()));

            var grupoIds = grupos.Select(g => g.GrupoId).ToList();

            var empleadosPorGrupo = await _db.Users
                .Where(u => grupoIds.Contains(u.GrupoId ?? 0) &&
                            u.Status == tiempo_libre.Models.Enums.UserStatus.Activo)
                .Select(u => new { u.Id, u.GrupoId, u.Nomina })
                .ToListAsync();

            var empleadosIds = empleadosPorGrupo.Select(e => e.Id).ToList();
            var nominasActivas = empleadosPorGrupo
                .Where(e => e.Nomina.HasValue)
                .Select(e => e.Nomina!.Value).Distinct().ToList();

            var diasInhabiles = await _db.DiasInhabiles
                .Where(d => d.Fecha >= inicio && d.Fecha <= fin)
                .Select(d => d.Fecha).ToHashSetAsync();

            var vacaciones = await _db.VacacionesProgramadas
                .Where(v => empleadosIds.Contains(v.EmpleadoId) &&
                            v.FechaVacacion >= inicio && v.FechaVacacion <= fin &&
                            v.EstadoVacacion == "Activa")
                .Select(v => new { v.EmpleadoId, v.FechaVacacion }).ToListAsync();

            var permisos = await _db.PermisosEIncapacidadesSAP
                .Where(p => nominasActivas.Contains(p.Nomina) &&
                            p.Desde <= fin && p.Hasta >= inicio &&
                            (p.FechaSolicitud == null || p.EstadoSolicitud == "Aprobada"))
                .Select(p => new { p.Nomina, p.Desde, p.Hasta }).ToListAsync();

            var excepcionesManning = await _db.ExcepcionesManning
                .Where(e => grupos.Select(g => g.AreaId).Contains(e.AreaId) &&
                            e.Anio == anio && e.Mes == mes && e.Activa)
                .ToListAsync();

            static int GetWeekOfMonth(DateOnly d) => (d.Day - 1) / 7 + 1;

            // Calcular número de semana del año para cada semana del mes
            static int GetWeekOfYear(int anio, int mes, int semana)
            {
                var primerDia = new DateOnly(anio, mes, Math.Min((semana - 1) * 7 + 1, DateTime.DaysInMonth(anio, mes)));
                var jan1 = new DateTime(primerDia.Year, 1, 1);
                var fecha = primerDia.ToDateTime(TimeOnly.MinValue);
                return (int)Math.Ceiling((fecha - jan1).TotalDays / 7) + 1;
            }

            var resultado = new List<object>();

            for (int semana = 1; semana <= 5; semana++)
            {
                var diasSemana = Enumerable.Range(1, DateTime.DaysInMonth(anio, mes))
                    .Select(d => new DateOnly(anio, mes, d))
                    .Where(d => GetWeekOfMonth(d) == semana)
                    .ToList();

                if (!diasSemana.Any()) continue;

                double totalHorasExtra = 0;
                double totalHorasNormales = 0;

                foreach (var grupo in grupos)
                {
                    var empGrupo = empleadosPorGrupo.Where(e => e.GrupoId == grupo.GrupoId).ToList();
                    var totalEmp = empGrupo.Count;
                    if (totalEmp == 0) continue;

                    var empIds = empGrupo.Select(e => e.Id).ToHashSet();
                    var nominasGrupo = empGrupo.Where(e => e.Nomina.HasValue)
                        .Select(e => e.Nomina!.Value).ToHashSet();

                    var excManning = excepcionesManning.FirstOrDefault(e => e.AreaId == grupo.AreaId);
                    var manning = excManning?.ManningRequeridoExcepcion ?? grupo.Area?.Manning ?? 0;
                    if (manning <= 0) continue;

                    foreach (var dia in diasSemana)
                    {
                        if (diasInhabiles.Contains(dia)) continue;

                        var ausentesVac = vacaciones.Count(v =>
                            empIds.Contains(v.EmpleadoId) && v.FechaVacacion == dia);
                        var ausentesPerm = permisos.Count(p =>
                            nominasGrupo.Contains(p.Nomina) && p.Desde <= dia && p.Hasta >= dia);

                        var totalAusentes = Math.Min(ausentesVac + ausentesPerm, totalEmp);
                        var disponibles = totalEmp - totalAusentes;

                        // Descanso: empleados que según el patrón del grupo descansan ese día
                        // Para simplificar usamos: personas que trabajan = disponibles (sin contar descanso)
                        // Horas normales = disponibles * 8 (igual que WeeklyRoles)
                        totalHorasNormales += disponibles * 8;

                        var deficit = (double)manning - disponibles;
                        if (deficit > 0)
                            totalHorasExtra += deficit * 8;
                    }
                }

                var semanaAnual = GetWeekOfYear(anio, mes, semana);

                resultado.Add(new
                {
                    semana,
                    semanaAnual,
                    horasExtra = Math.Round(totalHorasExtra, 1),
                    horasNormales = Math.Round(totalHorasNormales, 1),
                    pctExtra = totalHorasNormales > 0
                        ? Math.Round(totalHorasExtra / totalHorasNormales * 100, 1)
                        : 0.0
                });
            }

            return Ok(new ApiResponse<object>(true, resultado));
        }
    }
}