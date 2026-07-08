using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using tiempo_libre.DTOs;
using tiempo_libre.Models;

namespace tiempo_libre.Services
{
    /// <summary>
    /// Flujo "Vacación Laborada": el delegado sindical registra que el empleado se
    /// presentó a trabajar en un día que tenía programado como vacación. Al aprobar
    /// el jefe de área, se cancela la vacación original y se crea una nueva en la
    /// fecha elegida con TipoVacacion="VacacionLaborada".
    ///
    /// Diferencias vs ReprogramacionService (día no consumido) y
    /// ReprogramacionPostIncapacidadService (día perdido por incapacidad):
    ///   - Aquí el día ya se trabajó → FechaOriginal puede ser hoy o pasada.
    ///   - No valida ConfiguracionVacaciones.PeriodoActual.
    ///   - No mueve la fila original; la cancela y crea una nueva para que
    ///     los reportes distingan "trabajada" (audit) vs "reprogramada".
    /// </summary>
    public class VacacionLaboradaService
    {
        private readonly FreeTimeDbContext _db;
        private readonly ILogger<VacacionLaboradaService> _logger;

        public VacacionLaboradaService(
            FreeTimeDbContext db,
            ILogger<VacacionLaboradaService> logger)
        {
            _db = db;
            _logger = logger;
        }

        public async Task<ApiResponse<VacacionLaboradaDto>> SolicitarAsync(
            SolicitarVacacionLaboradaRequest request, int usuarioSolicitanteId)
        {
            if (!DateOnly.TryParseExact(request.FechaNueva, "yyyy-MM-dd",
                CultureInfo.InvariantCulture, DateTimeStyles.None, out var fechaNueva))
            {
                return new ApiResponse<VacacionLaboradaDto>(false, null,
                    "Formato de fecha inválido (yyyy-MM-dd).");
            }

            var empleado = await _db.Users
                .Include(u => u.Area)
                .Include(u => u.Grupo)
                .FirstOrDefaultAsync(u => u.Id == request.EmpleadoId);
            if (empleado == null)
                return new ApiResponse<VacacionLaboradaDto>(false, null, "Empleado no encontrado.");
            if (!empleado.Nomina.HasValue)
                return new ApiResponse<VacacionLaboradaDto>(false, null, "El empleado no tiene nómina asignada.");

            var vacacion = await _db.VacacionesProgramadas
                .FirstOrDefaultAsync(v => v.Id == request.VacacionOriginalId &&
                                          v.EmpleadoId == request.EmpleadoId);
            if (vacacion == null)
                return new ApiResponse<VacacionLaboradaDto>(false, null,
                    "La vacación no existe o no pertenece al empleado.");
            if (vacacion.EstadoVacacion != "Activa")
                return new ApiResponse<VacacionLaboradaDto>(false, null,
                    $"La vacación no está activa (estado: {vacacion.EstadoVacacion}).");

            var hoy = DateOnly.FromDateTime(DateTime.Today);
            if (vacacion.FechaVacacion > hoy)
                return new ApiResponse<VacacionLaboradaDto>(false, null,
                    $"La vacación ({vacacion.FechaVacacion:yyyy-MM-dd}) es futura; " +
                    "solo se puede registrar como laborada cuando ya llegó el día o pasó.");

            if (fechaNueva <= hoy)
                return new ApiResponse<VacacionLaboradaDto>(false, null,
                    "La fecha nueva debe ser posterior al día de hoy.");

            var esDiaInhabil = await _db.DiasInhabiles.AnyAsync(d => d.Fecha == fechaNueva);
            if (esDiaInhabil)
                return new ApiResponse<VacacionLaboradaDto>(false, null,
                    "La fecha nueva es día inhábil / festivo.");

            // Regla anti-duplicado (#69): no otra solicitud pendiente o aprobada
            // sobre la MISMA fecha original.
            var duplicada = await _db.SolicitudesVacacionLaborada
                .AnyAsync(s => s.EmpleadoId == request.EmpleadoId &&
                               s.FechaOriginal == vacacion.FechaVacacion &&
                               (s.EstadoSolicitud == "Pendiente" || s.EstadoSolicitud == "Aprobada"));
            if (duplicada)
                return new ApiResponse<VacacionLaboradaDto>(false, null,
                    $"Ya existe una solicitud de vacación laborada para el día {vacacion.FechaVacacion:dd/MM/yyyy}");

            // No re-programar sobre una vacación activa existente.
            var conflictoFechaNueva = await _db.VacacionesProgramadas.AnyAsync(v =>
                v.EmpleadoId == request.EmpleadoId &&
                v.FechaVacacion == fechaNueva &&
                v.EstadoVacacion == "Activa" &&
                v.Id != vacacion.Id);
            if (conflictoFechaNueva)
                return new ApiResponse<VacacionLaboradaDto>(false, null,
                    "El empleado ya tiene una vacación activa en la fecha nueva propuesta.");

            // Tampoco duplicar contra reprogramación/post-incapacidad/otra vacación laborada pendiente.
            var otraReprogPend = await _db.SolicitudesReprogramacion.AnyAsync(s =>
                s.EmpleadoId == request.EmpleadoId &&
                s.FechaNuevaSolicitada == fechaNueva &&
                (s.EstadoSolicitud == "Pendiente" || s.EstadoSolicitud == "Aprobada"));
            if (otraReprogPend)
                return new ApiResponse<VacacionLaboradaDto>(false, null,
                    "El empleado ya tiene otra solicitud de reprogramación activa para la fecha nueva.");

            int? jefeAreaId = null;
            if (empleado.AreaId.HasValue)
            {
                var area = await _db.Areas.FirstOrDefaultAsync(a => a.AreaId == empleado.AreaId.Value);
                jefeAreaId = area?.JefeId;
            }

            var solicitud = new SolicitudesVacacionLaborada
            {
                EmpleadoId = empleado.Id,
                Nomina = empleado.Nomina.Value,
                VacacionOriginalId = vacacion.Id,
                FechaOriginal = vacacion.FechaVacacion,
                FechaNueva = fechaNueva,
                Motivo = request.Motivo,
                EstadoSolicitud = "Pendiente",
                FechaSolicitud = DateTime.UtcNow,
                SolicitadoPorId = usuarioSolicitanteId,
                JefeAreaId = jefeAreaId,
                CreatedAt = DateTime.UtcNow,
            };

            _db.SolicitudesVacacionLaborada.Add(solicitud);
            await _db.SaveChangesAsync();

            var dto = await CargarDtoAsync(solicitud.Id);
            return new ApiResponse<VacacionLaboradaDto>(true, dto, "Solicitud creada exitosamente.");
        }

        public async Task<ApiResponse<VacacionLaboradaDto>> AprobarRechazarAsync(
            AprobarVacacionLaboradaRequest request, int jefeId)
        {
            using var tx = await _db.Database.BeginTransactionAsync();
            try
            {
                var solicitud = await _db.SolicitudesVacacionLaborada
                    .Include(s => s.VacacionOriginal)
                    .FirstOrDefaultAsync(s => s.Id == request.SolicitudId);

                if (solicitud == null)
                    return new ApiResponse<VacacionLaboradaDto>(false, null, "Solicitud no encontrada.");
                if (solicitud.EstadoSolicitud != "Pendiente")
                    return new ApiResponse<VacacionLaboradaDto>(false, null,
                        $"La solicitud ya está {solicitud.EstadoSolicitud}.");

                if (request.Aprobada)
                {
                    var vac = solicitud.VacacionOriginal
                        ?? await _db.VacacionesProgramadas.FindAsync(solicitud.VacacionOriginalId);
                    if (vac == null)
                        return new ApiResponse<VacacionLaboradaDto>(false, null,
                            "No se encontró la vacación original.");
                    if (vac.EstadoVacacion != "Activa")
                        return new ApiResponse<VacacionLaboradaDto>(false, null,
                            "La vacación original ya no está activa.");

                    // Re-verificar conflicto en la fecha nueva (pudo cambiar).
                    var conflicto = await _db.VacacionesProgramadas.AnyAsync(v =>
                        v.EmpleadoId == solicitud.EmpleadoId &&
                        v.FechaVacacion == solicitud.FechaNueva &&
                        v.EstadoVacacion == "Activa" &&
                        v.Id != vac.Id);
                    if (conflicto)
                        return new ApiResponse<VacacionLaboradaDto>(false, null,
                            "Ya existe una vacación activa en la fecha nueva.");

                    // Cancelar la original y crear la nueva con TipoVacacion="VacacionLaborada"
                    // para que los reportes distingan este caso del resto.
                    vac.EstadoVacacion = "Cancelada";
                    vac.UpdatedAt = DateTime.UtcNow;
                    vac.UpdatedBy = jefeId;
                    vac.Observaciones = string.IsNullOrWhiteSpace(vac.Observaciones)
                        ? $"Cancelada por vacación laborada #{solicitud.Id}"
                        : $"{vac.Observaciones} | Cancelada por vacación laborada #{solicitud.Id}";

                    var nueva = new VacacionesProgramadas
                    {
                        EmpleadoId = solicitud.EmpleadoId,
                        FechaVacacion = solicitud.FechaNueva,
                        TipoVacacion = "VacacionLaborada",
                        OrigenAsignacion = vac.OrigenAsignacion,
                        EstadoVacacion = "Activa",
                        PeriodoProgramacion = "VacacionLaborada",
                        FechaProgramacion = vac.FechaProgramacion,
                        PuedeSerIntercambiada = vac.PuedeSerIntercambiada,
                        Observaciones = $"Reprogramada por vacación laborada #{solicitud.Id}: " +
                                        $"{solicitud.FechaOriginal:yyyy-MM-dd} → {solicitud.FechaNueva:yyyy-MM-dd}",
                        CreatedAt = DateTime.UtcNow,
                        CreatedBy = jefeId,
                        UpdatedAt = DateTime.UtcNow,
                        UpdatedBy = jefeId,
                    };
                    _db.VacacionesProgramadas.Add(nueva);
                    await _db.SaveChangesAsync();

                    solicitud.EstadoSolicitud = "Aprobada";
                    solicitud.VacacionCanceladaId = vac.Id;
                    solicitud.VacacionCreadaId = nueva.Id;
                }
                else
                {
                    solicitud.EstadoSolicitud = "Rechazada";
                    solicitud.MotivoRechazo = request.MotivoRechazo;
                }

                solicitud.FechaRespuesta = DateTime.UtcNow;
                solicitud.AprobadoPorId = jefeId;
                solicitud.UpdatedAt = DateTime.UtcNow;

                await _db.SaveChangesAsync();
                await tx.CommitAsync();

                var dto = await CargarDtoAsync(solicitud.Id);
                return new ApiResponse<VacacionLaboradaDto>(true, dto,
                    request.Aprobada ? "Solicitud aprobada y vacación reprogramada." : "Solicitud rechazada.");
            }
            catch (Exception ex)
            {
                await tx.RollbackAsync();
                _logger.LogError(ex, "Error aprobando/rechazando vacación laborada {Id}", request.SolicitudId);
                return new ApiResponse<VacacionLaboradaDto>(false, null,
                    "Error al procesar la solicitud: " + ex.Message);
            }
        }

        /// <summary>Vacaciones activas del empleado con fecha hoy o pasada — candidatas a marcar como laboradas.</summary>
        public async Task<List<VacacionCandidataLaboradaDto>> ObtenerVacacionesLaborablesAsync(int empleadoId)
        {
            var hoy = DateOnly.FromDateTime(DateTime.Today);
            return await _db.VacacionesProgramadas
                .Where(v => v.EmpleadoId == empleadoId &&
                            v.EstadoVacacion == "Activa" &&
                            v.FechaVacacion <= hoy)
                .OrderByDescending(v => v.FechaVacacion)
                .Select(v => new VacacionCandidataLaboradaDto
                {
                    VacacionId = v.Id,
                    FechaVacacion = v.FechaVacacion,
                    TipoVacacion = v.TipoVacacion,
                })
                .ToListAsync();
        }

        public async Task<List<VacacionLaboradaDto>> ObtenerPorEmpleadoAsync(int empleadoId)
        {
            return await BaseQuery()
                .Where(s => s.EmpleadoId == empleadoId)
                .OrderByDescending(s => s.FechaSolicitud)
                .Select(MapearSelector())
                .ToListAsync();
        }

        public async Task<List<VacacionLaboradaDto>> ObtenerCreadasPorUsuarioAsync(int usuarioId, int? anio = null)
        {
            var query = BaseQuery().Where(s => s.SolicitadoPorId == usuarioId);
            if (anio.HasValue)
            {
                var desde = new DateTime(anio.Value, 1, 1);
                var hasta = new DateTime(anio.Value, 12, 31, 23, 59, 59);
                query = query.Where(s => s.FechaSolicitud >= desde && s.FechaSolicitud <= hasta);
            }
            return await query
                .OrderByDescending(s => s.FechaSolicitud)
                .Select(MapearSelector())
                .ToListAsync();
        }

        public async Task<List<VacacionLaboradaDto>> ObtenerPorJefeAsync(int jefeId, string? estado = null)
        {
            var areasJefe = await _db.Areas
                .Where(a => a.Jefes.Any(aj => aj.UserId == jefeId))
                .Select(a => a.AreaId)
                .ToListAsync();
            if (!areasJefe.Any())
                return new List<VacacionLaboradaDto>();

            var query = BaseQuery()
                .Where(s => s.Empleado.AreaId.HasValue && areasJefe.Contains(s.Empleado.AreaId.Value));
            if (!string.IsNullOrWhiteSpace(estado))
                query = query.Where(s => s.EstadoSolicitud == estado);

            return await query
                .OrderByDescending(s => s.FechaSolicitud)
                .Select(MapearSelector())
                .ToListAsync();
        }

        private IQueryable<SolicitudesVacacionLaborada> BaseQuery() =>
            _db.SolicitudesVacacionLaborada
                .Include(s => s.Empleado).ThenInclude(u => u.Area)
                .Include(s => s.Empleado).ThenInclude(u => u.Grupo)
                .Include(s => s.VacacionOriginal)
                .Include(s => s.SolicitadoPor)
                .Include(s => s.AprobadoPor);

        private static System.Linq.Expressions.Expression<
            Func<SolicitudesVacacionLaborada, VacacionLaboradaDto>> MapearSelector() =>
            s => new VacacionLaboradaDto
            {
                Id = s.Id,
                EmpleadoId = s.EmpleadoId,
                Nomina = s.Nomina,
                NombreEmpleado = s.Empleado.FullName,
                AreaEmpleado = s.Empleado.Area != null ? s.Empleado.Area.NombreGeneral : null,
                GrupoEmpleado = s.Empleado.Grupo != null ? s.Empleado.Grupo.Rol : null,
                VacacionOriginalId = s.VacacionOriginalId,
                FechaOriginal = s.FechaOriginal,
                FechaNueva = s.FechaNueva,
                Motivo = s.Motivo,
                EstadoSolicitud = s.EstadoSolicitud,
                FechaSolicitud = s.FechaSolicitud,
                SolicitadoPorId = s.SolicitadoPorId,
                NombreSolicitadoPor = s.SolicitadoPor != null ? s.SolicitadoPor.FullName : null,
                JefeAreaId = s.JefeAreaId,
                FechaRespuesta = s.FechaRespuesta,
                AprobadoPorId = s.AprobadoPorId,
                NombreAprobadoPor = s.AprobadoPor != null ? s.AprobadoPor.FullName : null,
                MotivoRechazo = s.MotivoRechazo,
                VacacionCanceladaId = s.VacacionCanceladaId,
                VacacionCreadaId = s.VacacionCreadaId,
            };

        private async Task<VacacionLaboradaDto?> CargarDtoAsync(int id)
        {
            return await BaseQuery()
                .Where(s => s.Id == id)
                .Select(MapearSelector())
                .FirstOrDefaultAsync();
        }
    }

    public class VacacionCandidataLaboradaDto
    {
        public int VacacionId { get; set; }
        public DateOnly FechaVacacion { get; set; }
        public string TipoVacacion { get; set; } = string.Empty;
    }
}
