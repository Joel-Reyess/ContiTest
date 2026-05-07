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
    /// Lógica para reprogramar una vacación futura no canjeada hacia un día post-incapacidad.
    /// Mismo patrón que FestivoTrabajadoService: solicitud → aprobación del jefe → reflejo
    /// en VacacionesProgramadas como Reprogramacion.
    /// </summary>
    public class ReprogramacionPostIncapacidadService
    {
        private readonly FreeTimeDbContext _db;
        private readonly ILogger<ReprogramacionPostIncapacidadService> _logger;

        public ReprogramacionPostIncapacidadService(
            FreeTimeDbContext db,
            ILogger<ReprogramacionPostIncapacidadService> logger)
        {
            _db = db;
            _logger = logger;
        }

        // ─── Listas para los dropdowns del modal ───────────────────────────────

        /// <summary>
        /// Incapacidades / permisos del empleado ya consumidos (Hasta &lt; hoy).
        /// </summary>
        public async Task<List<IncapacidadConsumidaDto>> ObtenerIncapacidadesConsumidasAsync(int empleadoId)
        {
            var empleado = await _db.Users
                .Where(u => u.Id == empleadoId)
                .Select(u => new { u.Id, u.Nomina })
                .FirstOrDefaultAsync();
            if (empleado == null || !empleado.Nomina.HasValue) return new List<IncapacidadConsumidaDto>();

            var hoy = DateOnly.FromDateTime(DateTime.Today);

            return await _db.PermisosEIncapacidadesSAP
                .Where(p => p.Nomina == empleado.Nomina.Value &&
                            p.Hasta < hoy &&
                            (p.FechaSolicitud == null || p.EstadoSolicitud == "Aprobada"))
                .OrderByDescending(p => p.Hasta)
                .Select(p => new IncapacidadConsumidaDto
                {
                    Id = p.Id,
                    Nomina = p.Nomina,
                    Desde = p.Desde,
                    Hasta = p.Hasta,
                    ClaseAbsentismo = p.ClaseAbsentismo,
                    ClAbPre = p.ClAbPre,
                    Observaciones = p.Observaciones,
                })
                .ToListAsync();
        }

        /// <summary>
        /// Vacaciones SELECCIONADAS por el empleado (TipoVacacion = "Anual") que
        /// aún no han sido canjeadas. Punto 7: el delegado solo puede reprogramar
        /// las que el empleado eligió, no las asignadas por la empresa
        /// (esas son terreno del Punto 9).
        /// </summary>
        public async Task<List<VacacionDisponibleDto>> ObtenerVacacionesNoCanjeadasAsync(int empleadoId)
        {
            var hoy = DateOnly.FromDateTime(DateTime.Today);
            return await _db.VacacionesProgramadas
                .Where(v => v.EmpleadoId == empleadoId &&
                            v.EstadoVacacion == "Activa" &&
                            v.FechaVacacion >= hoy &&
                            v.TipoVacacion == "Anual")
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

        /// <summary>
        /// Vacaciones "Anual" del empleado cuya fecha cae DENTRO del rango de un
        /// permiso/incapacidad específico (no se gozaron porque el operador estaba
        /// incapacitado). Punto 7: estas son las únicas candidatas reales para
        /// reprogramar después de una incapacidad.
        /// </summary>
        public async Task<List<VacacionDisponibleDto>> ObtenerVacacionesEnIncapacidadAsync(int empleadoId, int permisoId)
        {
            var permiso = await _db.PermisosEIncapacidadesSAP
                .FirstOrDefaultAsync(p => p.Id == permisoId);
            if (permiso == null) return new List<VacacionDisponibleDto>();

            return await _db.VacacionesProgramadas
                .Where(v => v.EmpleadoId == empleadoId &&
                            v.EstadoVacacion == "Activa" &&
                            v.TipoVacacion == "Anual" &&
                            v.FechaVacacion >= permiso.Desde &&
                            v.FechaVacacion <= permiso.Hasta)
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

        // ─── Solicitar ─────────────────────────────────────────────────────────

        public async Task<ApiResponse<SolicitudReprogramacionPostIncapacidadDto>> SolicitarAsync(
            SolicitarReprogramacionPostIncapacidadRequest request, int usuarioSolicitanteId)
        {
            if (!DateOnly.TryParseExact(request.FechaNueva, "yyyy-MM-dd",
                CultureInfo.InvariantCulture, DateTimeStyles.None, out var fechaNueva))
            {
                return new ApiResponse<SolicitudReprogramacionPostIncapacidadDto>(false, null,
                    "Formato de fecha inválido (yyyy-MM-dd).");
            }

            var empleado = await _db.Users
                .Include(u => u.Area)
                .Include(u => u.Grupo)
                .FirstOrDefaultAsync(u => u.Id == request.EmpleadoId);
            if (empleado == null)
                return new ApiResponse<SolicitudReprogramacionPostIncapacidadDto>(false, null, "Empleado no encontrado.");
            if (!empleado.Nomina.HasValue)
                return new ApiResponse<SolicitudReprogramacionPostIncapacidadDto>(false, null, "El empleado no tiene nómina asignada.");

            var permiso = await _db.PermisosEIncapacidadesSAP
                .FirstOrDefaultAsync(p => p.Id == request.PermisoIncapacidadId &&
                                          p.Nomina == empleado.Nomina.Value);
            if (permiso == null)
                return new ApiResponse<SolicitudReprogramacionPostIncapacidadDto>(false, null,
                    "El permiso/incapacidad no existe o no corresponde al empleado.");

            var hoy = DateOnly.FromDateTime(DateTime.Today);
            if (permiso.Hasta >= hoy)
                return new ApiResponse<SolicitudReprogramacionPostIncapacidadDto>(false, null,
                    "El permiso/incapacidad aún no termina; debe estar consumido.");

            if (fechaNueva <= permiso.Hasta)
                return new ApiResponse<SolicitudReprogramacionPostIncapacidadDto>(false, null,
                    "La fecha nueva debe ser posterior al fin del permiso/incapacidad.");

            var vacacion = await _db.VacacionesProgramadas
                .FirstOrDefaultAsync(v => v.Id == request.VacacionOriginalId &&
                                          v.EmpleadoId == request.EmpleadoId);
            if (vacacion == null)
                return new ApiResponse<SolicitudReprogramacionPostIncapacidadDto>(false, null,
                    "La vacación a reprogramar no existe o no pertenece al empleado.");
            if (vacacion.EstadoVacacion != "Activa")
                return new ApiResponse<SolicitudReprogramacionPostIncapacidadDto>(false, null,
                    "Solo vacaciones activas pueden reprogramarse.");
            // Punto 7: solo aplica a vacaciones seleccionadas por el empleado (no asignadas)
            if (vacacion.TipoVacacion != "Anual")
                return new ApiResponse<SolicitudReprogramacionPostIncapacidadDto>(false, null,
                    "Solo vacaciones seleccionadas por el empleado pueden reprogramarse aquí. " +
                    "Las vacaciones asignadas por la empresa se reprograman desde el módulo de SuperUsuario.");
            // Punto 7: la vacación debe haber caído DENTRO del rango de la incapacidad
            // (es decir, el operador no la gozó porque estuvo incapacitado ese día)
            if (vacacion.FechaVacacion < permiso.Desde || vacacion.FechaVacacion > permiso.Hasta)
                return new ApiResponse<SolicitudReprogramacionPostIncapacidadDto>(false, null,
                    $"La vacación seleccionada ({vacacion.FechaVacacion:yyyy-MM-dd}) no cae dentro " +
                    $"del rango de la incapacidad ({permiso.Desde:yyyy-MM-dd} → {permiso.Hasta:yyyy-MM-dd}). " +
                    "Solo se pueden reprogramar días que el operador no gozó por estar incapacitado.");

            // Evitar duplicados: misma vacación con solicitud pendiente
            var existePendiente = await _db.SolicitudesReprogramacionPostIncapacidad
                .AnyAsync(s => s.VacacionOriginalId == request.VacacionOriginalId &&
                               s.EstadoSolicitud == "Pendiente");
            if (existePendiente)
                return new ApiResponse<SolicitudReprogramacionPostIncapacidadDto>(false, null,
                    "Ya existe una solicitud pendiente para esta vacación.");

            // No reprogramar a una fecha donde ya tenga vacación activa
            var conflicto = await _db.VacacionesProgramadas.AnyAsync(v =>
                v.EmpleadoId == request.EmpleadoId &&
                v.FechaVacacion == fechaNueva &&
                v.EstadoVacacion == "Activa" &&
                v.Id != vacacion.Id);
            if (conflicto)
                return new ApiResponse<SolicitudReprogramacionPostIncapacidadDto>(false, null,
                    "El empleado ya tiene una vacación activa en la fecha nueva propuesta.");

            // Resolver jefe del área (Area.JefeId)
            int? jefeAreaId = null;
            if (empleado.AreaId.HasValue)
            {
                var area = await _db.Areas.FirstOrDefaultAsync(a => a.AreaId == empleado.AreaId.Value);
                jefeAreaId = area?.JefeId;
            }

            var solicitud = new SolicitudReprogramacionPostIncapacidad
            {
                EmpleadoId = empleado.Id,
                Nomina = empleado.Nomina.Value,
                PermisoIncapacidadId = permiso.Id,
                VacacionOriginalId = vacacion.Id,
                FechaOriginal = vacacion.FechaVacacion,
                FechaNueva = fechaNueva,
                Motivo = request.Motivo,
                EstadoSolicitud = "Pendiente",
                FechaSolicitud = DateTime.UtcNow,
                SolicitadoPorId = usuarioSolicitanteId,
                JefeAreaId = jefeAreaId,
            };

            _db.SolicitudesReprogramacionPostIncapacidad.Add(solicitud);
            await _db.SaveChangesAsync();

            var dto = await CargarDtoAsync(solicitud.Id);
            return new ApiResponse<SolicitudReprogramacionPostIncapacidadDto>(true, dto, "Solicitud creada exitosamente.");
        }

        // ─── Aprobar / Rechazar ───────────────────────────────────────────────

        public async Task<ApiResponse<SolicitudReprogramacionPostIncapacidadDto>> AprobarRechazarAsync(
            AprobarReprogramacionPostIncapacidadRequest request, int jefeId)
        {
            using var tx = await _db.Database.BeginTransactionAsync();
            try
            {
                var solicitud = await _db.SolicitudesReprogramacionPostIncapacidad
                    .Include(s => s.VacacionOriginal)
                    .FirstOrDefaultAsync(s => s.Id == request.SolicitudId);

                if (solicitud == null)
                    return new ApiResponse<SolicitudReprogramacionPostIncapacidadDto>(false, null, "Solicitud no encontrada.");
                if (solicitud.EstadoSolicitud != "Pendiente")
                    return new ApiResponse<SolicitudReprogramacionPostIncapacidadDto>(false, null,
                        $"La solicitud ya está {solicitud.EstadoSolicitud}.");

                if (request.Aprobada)
                {
                    var vac = solicitud.VacacionOriginal;
                    if (vac.EstadoVacacion != "Activa")
                        return new ApiResponse<SolicitudReprogramacionPostIncapacidadDto>(false, null,
                            "La vacación original ya no está activa.");

                    vac.FechaVacacion = solicitud.FechaNueva;
                    vac.TipoVacacion = "Reprogramacion";
                    vac.UpdatedAt = DateTime.UtcNow;
                    vac.UpdatedBy = jefeId;
                    vac.Observaciones = $"Reprogramación post-incapacidad #{solicitud.Id}: " +
                                        $"{solicitud.FechaOriginal:yyyy-MM-dd} → {solicitud.FechaNueva:yyyy-MM-dd}";

                    solicitud.EstadoSolicitud = "Aprobada";
                }
                else
                {
                    solicitud.EstadoSolicitud = "Rechazada";
                    solicitud.MotivoRechazo = request.MotivoRechazo;
                }

                solicitud.FechaRespuesta = DateTime.UtcNow;
                solicitud.AprobadoPorId = jefeId;

                await _db.SaveChangesAsync();
                await tx.CommitAsync();

                var dto = await CargarDtoAsync(solicitud.Id);
                return new ApiResponse<SolicitudReprogramacionPostIncapacidadDto>(true, dto,
                    request.Aprobada ? "Solicitud aprobada y vacación reprogramada." : "Solicitud rechazada.");
            }
            catch (Exception ex)
            {
                await tx.RollbackAsync();
                _logger.LogError(ex, "Error aprobando/rechazando solicitud post-incapacidad {Id}", request.SolicitudId);
                return new ApiResponse<SolicitudReprogramacionPostIncapacidadDto>(false, null,
                    "Error al procesar la solicitud: " + ex.Message);
            }
        }

        // ─── Consultas ────────────────────────────────────────────────────────

        public async Task<List<SolicitudReprogramacionPostIncapacidadDto>> ObtenerPorEmpleadoAsync(int empleadoId)
        {
            return await BaseQuery()
                .Where(s => s.EmpleadoId == empleadoId)
                .OrderByDescending(s => s.FechaSolicitud)
                .Select(MapearSelector())
                .ToListAsync();
        }

        public async Task<List<SolicitudReprogramacionPostIncapacidadDto>> ObtenerPorJefeAsync(
            int jefeId, string? estado = null)
        {
            // Áreas a cargo del jefe
            var areasJefe = await _db.Areas
                .Where(a => a.JefeId == jefeId || a.JefeSuplenteId == jefeId)
                .Select(a => a.AreaId)
                .ToListAsync();

            if (!areasJefe.Any()) return new List<SolicitudReprogramacionPostIncapacidadDto>();

            var query = BaseQuery()
                .Where(s => s.Empleado.AreaId.HasValue && areasJefe.Contains(s.Empleado.AreaId.Value));

            if (!string.IsNullOrWhiteSpace(estado))
                query = query.Where(s => s.EstadoSolicitud == estado);

            return await query
                .OrderByDescending(s => s.FechaSolicitud)
                .Select(MapearSelector())
                .ToListAsync();
        }

        // ─── Helpers internos ─────────────────────────────────────────────────

        private IQueryable<SolicitudReprogramacionPostIncapacidad> BaseQuery() =>
            _db.SolicitudesReprogramacionPostIncapacidad
                .Include(s => s.Empleado).ThenInclude(u => u.Area)
                .Include(s => s.Empleado).ThenInclude(u => u.Grupo)
                .Include(s => s.PermisoIncapacidad)
                .Include(s => s.VacacionOriginal)
                .Include(s => s.SolicitadoPor)
                .Include(s => s.AprobadoPor);

        private static System.Linq.Expressions.Expression<
            Func<SolicitudReprogramacionPostIncapacidad, SolicitudReprogramacionPostIncapacidadDto>> MapearSelector() =>
            s => new SolicitudReprogramacionPostIncapacidadDto
            {
                Id = s.Id,
                EmpleadoId = s.EmpleadoId,
                Nomina = s.Nomina,
                NombreEmpleado = s.Empleado.FullName,
                AreaEmpleado = s.Empleado.Area != null ? s.Empleado.Area.NombreGeneral : null,
                GrupoEmpleado = s.Empleado.Grupo != null ? s.Empleado.Grupo.Rol : null,
                PermisoIncapacidadId = s.PermisoIncapacidadId,
                PermisoDesde = s.PermisoIncapacidad.Desde,
                PermisoHasta = s.PermisoIncapacidad.Hasta,
                PermisoClase = s.PermisoIncapacidad.ClaseAbsentismo,
                VacacionOriginalId = s.VacacionOriginalId,
                FechaOriginal = s.FechaOriginal,
                FechaNueva = s.FechaNueva,
                Motivo = s.Motivo,
                EstadoSolicitud = s.EstadoSolicitud,
                FechaSolicitud = s.FechaSolicitud,
                NombreSolicitadoPor = s.SolicitadoPor.FullName,
                JefeAreaId = s.JefeAreaId,
                FechaRespuesta = s.FechaRespuesta,
                NombreAprobadoPor = s.AprobadoPor != null ? s.AprobadoPor.FullName : null,
                MotivoRechazo = s.MotivoRechazo,
            };

        private async Task<SolicitudReprogramacionPostIncapacidadDto?> CargarDtoAsync(int id)
        {
            return await BaseQuery()
                .Where(s => s.Id == id)
                .Select(MapearSelector())
                .FirstOrDefaultAsync();
        }
    }
}
