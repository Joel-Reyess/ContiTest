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
        public async Task<IActionResult> GetAusenciasMotivos([FromQuery] string? fecha = null)
        {
            var dia = fecha != null && DateOnly.TryParse(fecha, out var d) ? d : DateOnly.FromDateTime(DateTime.Today);

            var vacaciones = await _db.VacacionesProgramadas
                .Where(v => v.FechaVacacion == dia && v.EstadoVacacion == "Activa")
                .GroupBy(v => v.TipoVacacion)
                .Select(g => new { Motivo = g.Key, Total = g.Count() })
                .ToListAsync();

            var permisos = await _db.PermisosEIncapacidadesSAP
                .Where(p => p.Desde <= dia && p.Hasta >= dia &&
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
        /// basado en déficit de manning respecto al personal disponible
        /// </summary>
        [HttpGet("resumen-tiempo-extra")]
        public async Task<IActionResult> GetResumenTiempoExtra(
            [FromQuery] int anio = 0,
            [FromQuery] int mes = 0,
            [FromQuery] int? areaId = null)
        {
            if (anio == 0) anio = DateTime.Today.Year;
            if (mes == 0) mes = DateTime.Today.Month;

            var inicio = new DateOnly(anio, mes, 1);
            var fin = new DateOnly(anio, mes, DateTime.DaysInMonth(anio, mes));

            // Obtener grupos del área filtrada (o todos)
            var gruposQuery = _db.Grupos.Include(g => g.Area).AsQueryable();
            if (areaId.HasValue)
                gruposQuery = gruposQuery.Where(g => g.AreaId == areaId.Value);
            var grupos = await gruposQuery.ToListAsync();

            if (!grupos.Any())
                return Ok(new ApiResponse<object>(true, new List<object>()));

            var grupoIds = grupos.Select(g => g.GrupoId).ToList();

            // Empleados activos de esos grupos
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

            // Vacaciones del mes
            var vacaciones = await _db.VacacionesProgramadas
                .Where(v => empleadosIds.Contains(v.EmpleadoId) &&
                            v.FechaVacacion >= inicio && v.FechaVacacion <= fin &&
                            v.EstadoVacacion == "Activa")
                .Select(v => new { v.EmpleadoId, v.FechaVacacion })
                .ToListAsync();

            // Permisos e incapacidades del mes
            var permisos = await _db.PermisosEIncapacidadesSAP
                .Where(p => nominasActivas.Contains(p.Nomina) &&
                            p.Desde <= fin && p.Hasta >= inicio &&
                            (p.FechaSolicitud == null || p.EstadoSolicitud == "Aprobada"))
                .Select(p => new { p.Nomina, p.Desde, p.Hasta })
                .ToListAsync();

            // Manning por área (con excepciones si las hay)
            var excepcionesManning = await _db.ExcepcionesManning
                .Where(e => grupos.Select(g => g.AreaId).Contains(e.AreaId) &&
                            e.Anio == anio && e.Mes == mes && e.Activa)
                .ToListAsync();

            var nominaToId = empleadosPorGrupo
                .Where(e => e.Nomina.HasValue)
                .ToDictionary(e => e.Nomina!.Value, e => e.Id);

            static int GetWeek(DateOnly d) => (d.Day - 1) / 7 + 1;

            var resultado = Enumerable.Range(1, 5).Select(semana =>
            {
                var diasSemana = Enumerable.Range(1, DateTime.DaysInMonth(anio, mes))
                    .Select(d => new DateOnly(anio, mes, d))
                    .Where(d => GetWeek(d) == semana)
                    .ToList();

                if (!diasSemana.Any()) return null;

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

                    // Manning: excepción del mes o base del área
                    var excManning = excepcionesManning
                        .FirstOrDefault(e => e.AreaId == grupo.AreaId);
                    var manning = excManning?.ManningRequeridoExcepcion
                                  ?? grupo.Area?.Manning
                                  ?? 0;
                    if (manning <= 0) continue; // sin manning configurado, saltar

                    foreach (var dia in diasSemana)
                    {
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

                        totalHorasNormales += disponibles * 8;
                    }
                }

                return new
                {
                    semana,
                    horasExtra = Math.Round(totalHorasExtra, 1),
                    horasNormales = Math.Round(totalHorasNormales, 1),
                    pctExtra = totalHorasNormales > 0
                        ? Math.Round(totalHorasExtra / totalHorasNormales * 100, 1)
                        : 0.0
                };
            })
            .Where(x => x != null)
            .ToList();

            return Ok(new ApiResponse<object>(true, resultado));
        }
    }
}