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
    /// Punto 9 del PDF: el SuperUsuario solicita reprogramar un día asignado por
    /// la empresa, con motivo de catálogo cerrado. Va a aprobación del jefe de
    /// área. Al aprobar, la VacacionProgramada se mueve a la fecha nueva con
    /// TipoVacacion = "DiaEmpresaReprogramado", que el rol semanal mapea a "C".
    /// </summary>
    public class ReprogramacionDiaEmpresaService
    {
        public const string TipoVacacionReprogramado = "DiaEmpresaReprogramado";

        private readonly FreeTimeDbContext _db;
        private readonly ILogger<ReprogramacionDiaEmpresaService> _logger;

        public ReprogramacionDiaEmpresaService(
            FreeTimeDbContext db,
            ILogger<ReprogramacionDiaEmpresaService> logger)
        {
            _db = db;
            _logger = logger;
        }

        /// <summary>
        /// Vacaciones ASIGNADAS por la empresa (TipoVacacion 'Automatica' o
        /// 'AsignadaAutomaticamente') que aún no han sido consumidas. Punto 9: el
        /// SuperUsuario solo puede reprogramar este tipo de vacaciones, no las
        /// que el empleado eligió ('Anual').
        /// </summary>
        public async Task<List<VacacionDisponibleDto>> ObtenerVacacionesAsignadasNoConsumidasAsync(int empleadoId)
        {
            var hoy = DateOnly.FromDateTime(DateTime.Today);
            return await _db.VacacionesProgramadas
                .Where(v => v.EmpleadoId == empleadoId &&
                            v.EstadoVacacion == "Activa" &&
                            v.FechaVacacion >= hoy &&
                            (v.TipoVacacion == "Automatica" ||
                             v.TipoVacacion == "AsignadaAutomaticamente"))
                .OrderBy(v => v.FechaVacacion)
                .Select(v => new VacacionDisponibleDto
                {
                    Id = v.Id,
                    Fecha = v.FechaVacacion,
                    TipoVacacion = v.TipoVacacion,
                    EstadoVacacion = v.EstadoVacacion,
                })
                .ToListAsync();
        }

        public async Task<ApiResponse<SolicitudReprogramacionDiaEmpresaDto>> SolicitarAsync(
            SolicitarReprogramacionDiaEmpresaRequest request, int superUsuarioId)
        {
            if (!DateOnly.TryParseExact(request.FechaNueva, "yyyy-MM-dd",
                CultureInfo.InvariantCulture, DateTimeStyles.None, out var fechaNueva))
            {
                return new ApiResponse<SolicitudReprogramacionDiaEmpresaDto>(false, null,
                    "Formato de fecha inválido (yyyy-MM-dd).");
            }

            if (!MotivosReprogramacionDiaEmpresa.EsValido(request.MotivoTipo))
            {
                return new ApiResponse<SolicitudReprogramacionDiaEmpresaDto>(false, null,
                    $"Motivo no válido. Permitidos: {string.Join(", ", MotivosReprogramacionDiaEmpresa.Validos)}.");
            }

            var empleado = await _db.Users
                .Include(u => u.Area)
                .Include(u => u.Grupo)
                .FirstOrDefaultAsync(u => u.Id == request.EmpleadoId);
            if (empleado == null)
                return new ApiResponse<SolicitudReprogramacionDiaEmpresaDto>(false, null, "Empleado no encontrado.");

            var vacacion = await _db.VacacionesProgramadas
                .FirstOrDefaultAsync(v => v.Id == request.VacacionOriginalId &&
                                          v.EmpleadoId == request.EmpleadoId);
            if (vacacion == null)
                return new ApiResponse<SolicitudReprogramacionDiaEmpresaDto>(false, null,
                    "La vacación no existe o no pertenece al empleado.");
            if (vacacion.EstadoVacacion != "Activa")
                return new ApiResponse<SolicitudReprogramacionDiaEmpresaDto>(false, null,
                    "Solo vacaciones activas pueden reprogramarse.");
            // Punto 9: el SuperUsuario solo puede reprogramar días asignados por empresa.
            if (vacacion.TipoVacacion != "Automatica" && vacacion.TipoVacacion != "AsignadaAutomaticamente")
                return new ApiResponse<SolicitudReprogramacionDiaEmpresaDto>(false, null,
                    "Solo días asignados por la empresa pueden reprogramarse desde aquí.");

            var hoy = DateOnly.FromDateTime(DateTime.Today);
            if (fechaNueva < hoy)
                return new ApiResponse<SolicitudReprogramacionDiaEmpresaDto>(false, null,
                    "La fecha nueva debe ser hoy o posterior.");

            // No permitir solicitudes pendientes duplicadas para la misma vacación
            var pendiente = await _db.SolicitudesReprogramacionDiaEmpresa.AnyAsync(s =>
                s.VacacionOriginalId == request.VacacionOriginalId &&
                s.EstadoSolicitud == "Pendiente");
            if (pendiente)
                return new ApiResponse<SolicitudReprogramacionDiaEmpresaDto>(false, null,
                    "Ya existe una solicitud pendiente para este día.");

            // Conflicto: el empleado ya tiene una vacación activa en la fecha nueva
            var conflicto = await _db.VacacionesProgramadas.AnyAsync(v =>
                v.EmpleadoId == request.EmpleadoId &&
                v.FechaVacacion == fechaNueva &&
                v.EstadoVacacion == "Activa" &&
                v.Id != vacacion.Id);
            if (conflicto)
                return new ApiResponse<SolicitudReprogramacionDiaEmpresaDto>(false, null,
                    "El empleado ya tiene una vacación activa en la fecha nueva.");

            // Resolver jefe del área del empleado
            int? jefeAreaId = null;
            if (empleado.AreaId.HasValue)
            {
                var area = await _db.Areas.FirstOrDefaultAsync(a => a.AreaId == empleado.AreaId.Value);
                jefeAreaId = area?.JefeId;
            }

            var solicitud = new SolicitudReprogramacionDiaEmpresa
            {
                EmpleadoId = empleado.Id,
                VacacionOriginalId = vacacion.Id,
                FechaOriginal = vacacion.FechaVacacion,
                FechaNueva = fechaNueva,
                MotivoTipo = request.MotivoTipo,
                Justificacion = request.Justificacion,
                EstadoSolicitud = "Pendiente",
                JefeAreaId = jefeAreaId,
                SolicitadoPorId = superUsuarioId,
                FechaSolicitud = DateTime.UtcNow,
                CreatedAt = DateTime.UtcNow,
            };

            _db.SolicitudesReprogramacionDiaEmpresa.Add(solicitud);
            await _db.SaveChangesAsync();

            var dto = await CargarDtoAsync(solicitud.Id);
            return new ApiResponse<SolicitudReprogramacionDiaEmpresaDto>(true, dto, "Solicitud creada.");
        }

        public async Task<ApiResponse<SolicitudReprogramacionDiaEmpresaDto>> AprobarRechazarAsync(
            AprobarReprogramacionDiaEmpresaRequest request, int jefeId)
        {
            using var tx = await _db.Database.BeginTransactionAsync();
            try
            {
                var solicitud = await _db.SolicitudesReprogramacionDiaEmpresa
                    .Include(s => s.VacacionOriginal)
                    .FirstOrDefaultAsync(s => s.Id == request.SolicitudId);

                if (solicitud == null)
                    return new ApiResponse<SolicitudReprogramacionDiaEmpresaDto>(false, null, "Solicitud no encontrada.");
                if (solicitud.EstadoSolicitud != "Pendiente")
                    return new ApiResponse<SolicitudReprogramacionDiaEmpresaDto>(false, null,
                        $"La solicitud ya está {solicitud.EstadoSolicitud}.");

                if (request.Aprobada)
                {
                    var vac = solicitud.VacacionOriginal;
                    if (vac.EstadoVacacion != "Activa")
                        return new ApiResponse<SolicitudReprogramacionDiaEmpresaDto>(false, null,
                            "La vacación original ya no está activa.");

                    vac.FechaVacacion = solicitud.FechaNueva;
                    vac.TipoVacacion = TipoVacacionReprogramado;
                    vac.UpdatedAt = DateTime.UtcNow;
                    vac.UpdatedBy = jefeId;
                    vac.Observaciones = $"Reprogramación día empresa #{solicitud.Id}: " +
                                        $"{solicitud.FechaOriginal:yyyy-MM-dd} → {solicitud.FechaNueva:yyyy-MM-dd} " +
                                        $"({solicitud.MotivoTipo})";

                    solicitud.EstadoSolicitud = "Aprobada";
                }
                else
                {
                    solicitud.EstadoSolicitud = "Rechazada";
                    solicitud.MotivoRechazo = request.MotivoRechazo;
                }

                solicitud.AprobadoPorId = jefeId;
                solicitud.FechaRespuesta = DateTime.UtcNow;
                solicitud.UpdatedAt = DateTime.UtcNow;

                await _db.SaveChangesAsync();
                await tx.CommitAsync();

                var dto = await CargarDtoAsync(solicitud.Id);
                return new ApiResponse<SolicitudReprogramacionDiaEmpresaDto>(true, dto,
                    request.Aprobada ? "Solicitud aprobada y vacación reprogramada como día empresa (C)." : "Solicitud rechazada.");
            }
            catch (Exception ex)
            {
                await tx.RollbackAsync();
                _logger.LogError(ex, "Error procesando solicitud reprogramación día empresa {Id}", request.SolicitudId);
                return new ApiResponse<SolicitudReprogramacionDiaEmpresaDto>(false, null,
                    "Error al procesar: " + ex.Message);
            }
        }

        public async Task<List<SolicitudReprogramacionDiaEmpresaDto>> ObtenerPorJefeAsync(
            int jefeId, string? estado = null)
        {
            var areasJefe = await _db.Areas
                .Where(a => a.JefeId == jefeId || a.JefeSuplenteId == jefeId)
                .Select(a => a.AreaId)
                .ToListAsync();
            if (!areasJefe.Any()) return new List<SolicitudReprogramacionDiaEmpresaDto>();

            var query = BaseQuery()
                .Where(s => s.Empleado.AreaId.HasValue && areasJefe.Contains(s.Empleado.AreaId.Value));
            if (!string.IsNullOrWhiteSpace(estado))
                query = query.Where(s => s.EstadoSolicitud == estado);

            return await query
                .OrderByDescending(s => s.FechaSolicitud)
                .Select(MapearSelector())
                .ToListAsync();
        }

        public async Task<List<SolicitudReprogramacionDiaEmpresaDto>> ObtenerTodasAsync(string? estado = null)
        {
            var query = BaseQuery();
            if (!string.IsNullOrWhiteSpace(estado))
                query = query.Where(s => s.EstadoSolicitud == estado);
            return await query
                .OrderByDescending(s => s.FechaSolicitud)
                .Select(MapearSelector())
                .ToListAsync();
        }

        public string[] ObtenerCatalogoMotivos() => MotivosReprogramacionDiaEmpresa.Validos;

        // ─── Helpers ────────────────────────────────────────────────────────

        private IQueryable<SolicitudReprogramacionDiaEmpresa> BaseQuery() =>
            _db.SolicitudesReprogramacionDiaEmpresa
                .Include(s => s.Empleado).ThenInclude(u => u.Area)
                .Include(s => s.Empleado).ThenInclude(u => u.Grupo)
                .Include(s => s.VacacionOriginal)
                .Include(s => s.SolicitadoPor)
                .Include(s => s.AprobadoPor);

        private static System.Linq.Expressions.Expression<
            Func<SolicitudReprogramacionDiaEmpresa, SolicitudReprogramacionDiaEmpresaDto>> MapearSelector() =>
            s => new SolicitudReprogramacionDiaEmpresaDto
            {
                Id = s.Id,
                EmpleadoId = s.EmpleadoId,
                Nomina = s.Empleado.Nomina,
                NombreEmpleado = s.Empleado.FullName,
                AreaEmpleado = s.Empleado.Area != null ? s.Empleado.Area.NombreGeneral : null,
                GrupoEmpleado = s.Empleado.Grupo != null ? s.Empleado.Grupo.Rol : null,
                VacacionOriginalId = s.VacacionOriginalId,
                FechaOriginal = s.FechaOriginal,
                FechaNueva = s.FechaNueva,
                MotivoTipo = s.MotivoTipo,
                Justificacion = s.Justificacion,
                EstadoSolicitud = s.EstadoSolicitud,
                FechaSolicitud = s.FechaSolicitud,
                NombreSolicitadoPor = s.SolicitadoPor.FullName,
                JefeAreaId = s.JefeAreaId,
                FechaRespuesta = s.FechaRespuesta,
                NombreAprobadoPor = s.AprobadoPor != null ? s.AprobadoPor.FullName : null,
                MotivoRechazo = s.MotivoRechazo,
            };

        private async Task<SolicitudReprogramacionDiaEmpresaDto?> CargarDtoAsync(int id)
        {
            return await BaseQuery().Where(s => s.Id == id).Select(MapearSelector()).FirstOrDefaultAsync();
        }
    }
}
