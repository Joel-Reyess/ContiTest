using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using tiempo_libre.DTOs;
using tiempo_libre.Models;

namespace tiempo_libre.Services
{
    /// <summary>
    /// Reporte "Días de más por antigüedad" del superusuario:
    /// - los días del Excel de SAP que la sincronización retuvo (VacacionRetenidaSap),
    ///   para aceptarlos (se crea la vacación) o descartarlos (RH corrige SAP);
    /// - los empleados que HOY ya tienen más días de los que les tocan (casos de
    ///   antes de la retención, o lo que se haya aceptado).
    /// </summary>
    public class VacacionesRetenidasService
    {
        private static readonly string[] TiposEmpresa = { "Automatica", "AsignadaAutomaticamente", "DiaEmpresaReprogramado" };
        private static readonly string[] TiposComunAcuerdo = { "Anual", "Reprogramacion" };

        private readonly FreeTimeDbContext _db;
        private readonly ILogger<VacacionesRetenidasService> _logger;

        public VacacionesRetenidasService(FreeTimeDbContext db, ILogger<VacacionesRetenidasService> logger)
        {
            _db = db;
            _logger = logger;
        }

        public async Task<ApiResponse<VacacionesRetenidasResponse>> ObtenerAsync(string? estado, int? anio)
        {
            if (!await RetencionesSap.TablaExisteAsync(_db))
                return new ApiResponse<VacacionesRetenidasResponse>(true,
                    new VacacionesRetenidasResponse { TablaExiste = false }, null);

            var q = _db.VacacionesRetenidasSAP.AsQueryable();
            if (!string.IsNullOrWhiteSpace(estado) && estado != "Todas")
                q = q.Where(r => r.Estado == estado);
            if (anio.HasValue)
                q = q.Where(r => r.Fecha.Year == anio.Value);

            var filas = await q
                .OrderBy(r => r.Estado == "Pendiente" ? 0 : 1)
                .ThenByDescending(r => r.FechaCargaExcel)
                .Select(r => new
                {
                    r.Id, r.EmpleadoId, r.Nomina, r.Fecha, r.Antiguedad, r.Corresponden, r.YaTenia,
                    r.Estado, r.FechaCargaExcel, r.FechaResolucion, r.Nota,
                    Nombre = r.Empleado.FullName,
                    Grupo = r.Empleado.Grupo != null ? r.Empleado.Grupo.Rol : "",
                    Area = r.Empleado.Grupo != null && r.Empleado.Grupo.Area != null ? r.Empleado.Grupo.Area.NombreGeneral : "",
                    ResueltoPor = r.ResueltoPor != null ? r.ResueltoPor.FullName : null
                })
                .ToListAsync();

            // Cuántos días de común acuerdo tiene hoy cada empleado en cada año.
            var ids = filas.Select(f => f.EmpleadoId).Distinct().ToList();
            var anios = filas.Select(f => f.Fecha.Year).Distinct().ToList();
            var tieneHoy = (await _db.VacacionesProgramadas
                    .Where(v => ids.Contains(v.EmpleadoId) && v.EstadoVacacion == "Activa" &&
                                TiposComunAcuerdo.Contains(v.TipoVacacion) && anios.Contains(v.FechaVacacion.Year))
                    .Select(v => new { v.EmpleadoId, v.FechaVacacion.Year })
                    .ToListAsync())
                .GroupBy(v => (v.EmpleadoId, v.Year))
                .ToDictionary(g => g.Key, g => g.Count());

            return new ApiResponse<VacacionesRetenidasResponse>(true, new VacacionesRetenidasResponse
            {
                Retenidas = filas.Select(f => new VacacionRetenidaDto
                {
                    Id = f.Id,
                    EmpleadoId = f.EmpleadoId,
                    Nomina = f.Nomina,
                    Nombre = f.Nombre ?? string.Empty,
                    Area = f.Area ?? string.Empty,
                    Grupo = f.Grupo ?? string.Empty,
                    Fecha = f.Fecha,
                    Antiguedad = f.Antiguedad,
                    Corresponden = f.Corresponden,
                    YaTenia = f.YaTenia,
                    TieneHoy = tieneHoy.GetValueOrDefault((f.EmpleadoId, f.Fecha.Year)),
                    Estado = f.Estado,
                    FechaCargaExcel = f.FechaCargaExcel,
                    ResueltoPor = f.ResueltoPor,
                    FechaResolucion = f.FechaResolucion,
                    Nota = f.Nota
                }).ToList()
            }, null);
        }

        /// <summary>
        /// Aceptar: el superusuario decide que el día sí va aunque se pase de la
        /// antigüedad. Se crea la vacación como la habría creado la sincronización,
        /// con nota de quién la aceptó.
        /// </summary>
        public async Task<ApiResponse<object>> AceptarAsync(int id, int usuarioId, string? nota)
        {
            var r = await _db.VacacionesRetenidasSAP.FirstOrDefaultAsync(x => x.Id == id);
            if (r == null) return new ApiResponse<object>(false, null, "No se encontró el día retenido.");
            if (r.Estado != "Pendiente")
                return new ApiResponse<object>(false, null, $"Este día ya está {r.Estado.ToLowerInvariant()}.");

            var usuario = await _db.Users.Where(u => u.Id == usuarioId).Select(u => u.FullName).FirstOrDefaultAsync();
            var yaTieneEseDia = await _db.VacacionesProgramadas.AnyAsync(v =>
                v.EmpleadoId == r.EmpleadoId && v.FechaVacacion == r.Fecha && v.EstadoVacacion == "Activa");

            if (!yaTieneEseDia)
            {
                var vacacion = new VacacionesProgramadas
                {
                    EmpleadoId = r.EmpleadoId,
                    FechaVacacion = r.Fecha,
                    TipoVacacion = "Reprogramacion",
                    OrigenAsignacion = "Manual",
                    EstadoVacacion = "Activa",
                    PeriodoProgramacion = "Reprogramacion",
                    FechaProgramacion = DateTime.Now,
                    PuedeSerIntercambiada = true,
                    Observaciones = $"Alta por sincronización SAP retenida por exceder la antigüedad " +
                                    $"({r.YaTenia} de {r.Corresponden}) y aceptada por {usuario ?? "superusuario"}" +
                                    (string.IsNullOrWhiteSpace(nota) ? "" : $": {nota}"),
                    CreatedAt = DateTime.Now,
                    CreatedBy = usuarioId,
                    UpdatedAt = DateTime.Now,
                    UpdatedBy = usuarioId
                };
                _db.VacacionesProgramadas.Add(vacacion);
                await _db.SaveChangesAsync();
                r.VacacionCreadaId = vacacion.Id;
            }

            r.Estado = "Aceptada";
            r.ResueltoPorId = usuarioId;
            r.FechaResolucion = DateTime.Now;
            r.Nota = (yaTieneEseDia ? "Ya tenía vacación activa ese día; no se creó otra. " : "") + (nota ?? "");
            await _db.SaveChangesAsync();

            _logger.LogWarning("Retenido {Id} (nómina {Nomina}, {Fecha:yyyy-MM-dd}) ACEPTADO por usuario {Usuario}",
                r.Id, r.Nomina, r.Fecha, usuarioId);
            return new ApiResponse<object>(true, null, "Día aceptado: ya aparece como vacación del empleado.");
        }

        /// <summary>Descartar: el día no va. Hay que corregirlo en SAP (dejarlo en 0 días).</summary>
        public async Task<ApiResponse<object>> DescartarAsync(int id, int usuarioId, string? nota)
        {
            var r = await _db.VacacionesRetenidasSAP.FirstOrDefaultAsync(x => x.Id == id);
            if (r == null) return new ApiResponse<object>(false, null, "No se encontró el día retenido.");
            if (r.Estado != "Pendiente")
                return new ApiResponse<object>(false, null, $"Este día ya está {r.Estado.ToLowerInvariant()}.");

            r.Estado = "Descartada";
            r.ResueltoPorId = usuarioId;
            r.FechaResolucion = DateTime.Now;
            r.Nota = nota;
            await _db.SaveChangesAsync();

            _logger.LogWarning("Retenido {Id} (nómina {Nomina}, {Fecha:yyyy-MM-dd}) DESCARTADO por usuario {Usuario}",
                r.Id, r.Nomina, r.Fecha, usuarioId);
            return new ApiResponse<object>(true, null, "Día descartado. Falta corregirlo en SAP (dejarlo en 0 días).");
        }

        /// <summary>Empleados que HOY tienen más días activos de los que les tocan en el año.</summary>
        public async Task<ApiResponse<List<ExcesoAntiguedadDto>>> ExcesosAsync(int anio)
        {
            var inicio = new DateOnly(anio, 1, 1);
            var fin = new DateOnly(anio, 12, 31);

            var vacaciones = await _db.VacacionesProgramadas
                .Where(v => v.EstadoVacacion == "Activa" && v.FechaVacacion >= inicio && v.FechaVacacion <= fin &&
                            (TiposEmpresa.Contains(v.TipoVacacion) || TiposComunAcuerdo.Contains(v.TipoVacacion)) &&
                            v.Empleado.Status == Models.Enums.UserStatus.Activo)
                .Select(v => new { v.EmpleadoId, v.FechaVacacion, v.TipoVacacion, v.Observaciones })
                .ToListAsync();

            var ids = vacaciones.Select(v => v.EmpleadoId).Distinct().ToList();
            var empleados = await _db.Users
                .Where(u => ids.Contains(u.Id))
                .Select(u => new
                {
                    u.Id, u.Nomina, u.FullName, u.FechaIngreso,
                    Grupo = u.Grupo != null ? u.Grupo.Rol : "",
                    Area = u.Grupo != null && u.Grupo.Area != null ? u.Grupo.Area.NombreGeneral : ""
                })
                .ToDictionaryAsync(u => u.Id);

            var resultado = new List<ExcesoAntiguedadDto>();
            foreach (var g in vacaciones.GroupBy(v => v.EmpleadoId))
            {
                if (!empleados.TryGetValue(g.Key, out var e)) continue;
                var derecho = VacacionesService.DerechoAl31Dic(e.FechaIngreso, anio);
                var corrEmpresa = derecho?.Derecho.DiasAsignadosAutomaticamente ?? 0;
                var corrComun = derecho?.Derecho.DiasProgramables ?? 0;
                var tieneEmpresa = g.Count(v => TiposEmpresa.Contains(v.TipoVacacion));
                var tieneComun = g.Count(v => TiposComunAcuerdo.Contains(v.TipoVacacion));
                var exceso = Math.Max(0, tieneEmpresa - corrEmpresa) + Math.Max(0, tieneComun - corrComun);
                if (exceso == 0) continue;

                resultado.Add(new ExcesoAntiguedadDto
                {
                    EmpleadoId = e.Id,
                    Nomina = e.Nomina,
                    Nombre = e.FullName ?? string.Empty,
                    Area = e.Area ?? string.Empty,
                    Grupo = e.Grupo ?? string.Empty,
                    Antiguedad = derecho?.Antiguedad ?? 0,
                    CorrespondenEmpresa = corrEmpresa,
                    CorrespondenComunAcuerdo = corrComun,
                    TieneEmpresa = tieneEmpresa,
                    TieneComunAcuerdo = tieneComun,
                    Exceso = exceso,
                    Dias = g.OrderBy(v => v.FechaVacacion).Select(v => new DiaDeExcesoDto
                    {
                        Fecha = v.FechaVacacion,
                        TipoVacacion = v.TipoVacacion,
                        Observaciones = v.Observaciones,
                        VieneDelExcel = (v.Observaciones ?? "").Contains("sincronización SAP")
                    }).ToList()
                });
            }

            return new ApiResponse<List<ExcesoAntiguedadDto>>(true,
                resultado.OrderByDescending(r => r.Exceso).ThenBy(r => r.Area).ThenBy(r => r.Nomina).ToList(), null);
        }
    }
}
