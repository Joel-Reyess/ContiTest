using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using tiempo_libre.Models;
using tiempo_libre.DTOs;

namespace tiempo_libre.Services
{
    public class VacacionesService
    {
        private readonly FreeTimeDbContext _db;
        private readonly ValidadorPorcentajeService _validadorPorcentaje;
        private readonly NotificacionesService _notificacionesService;
        private readonly ILogger<VacacionesService> _logger;

        public VacacionesService(
            FreeTimeDbContext db,
            ValidadorPorcentajeService validadorPorcentaje,
            NotificacionesService notificacionesService,
            ILogger<VacacionesService> logger)
        {
            _db = db;
            _validadorPorcentaje = validadorPorcentaje;
            _notificacionesService = notificacionesService;
            _logger = logger;
        }

        public async Task<ApiResponse<VacacionesEmpleadoResponse>> CalcularVacacionesPorEmpleadoAsync(int empleadoId, int anio)
        {
            var empleado = await _db.Users.FindAsync(empleadoId);

            if (empleado == null)
                return new ApiResponse<VacacionesEmpleadoResponse>(false, null, "El empleado especificado no existe.");

            if (empleado.FechaIngreso == null)
                return new ApiResponse<VacacionesEmpleadoResponse>(false, null, "El empleado no tiene fecha de ingreso registrada.");

            var fechaReferencia = new DateOnly(anio, 12, 31);
            var antiguedadEnAnios = CalcularAntiguedadEnAnios(empleado.FechaIngreso.Value, fechaReferencia);

            if (antiguedadEnAnios < 1)
                return new ApiResponse<VacacionesEmpleadoResponse>(false, null, "El empleado no tiene antigüedad suficiente para el año especificado.");

            var vacaciones = CalcularVacacionesPorAntiguedad(antiguedadEnAnios);

            var response = new VacacionesEmpleadoResponse
            {
                EmpleadoId = empleadoId,
                NombreCompleto = empleado.FullName,
                FechaIngreso = empleado.FechaIngreso.Value,
                AnioConsulta = anio,
                AntiguedadEnAnios = antiguedadEnAnios,
                DiasEmpresa = vacaciones.DiasEmpresa,
                DiasAsignadosAutomaticamente = vacaciones.DiasAsignadosAutomaticamente,
                DiasProgramables = vacaciones.DiasProgramables,
                TotalDias = vacaciones.TotalDias
            };

            return new ApiResponse<VacacionesEmpleadoResponse>(true, response, null);
        }

        public VacacionesCalculadas CalcularVacacionesPorAntiguedad(int antiguedadEnAnios)
        {
            const int diasEmpresa = 12;
            int diasAsignadosAutomaticamente = 0;
            int diasProgramables = 0;

            if (antiguedadEnAnios <= 5)
            {
                switch (antiguedadEnAnios)
                {
                    case 1: diasProgramables = 0; break;
                    case 2: diasProgramables = 2; break;
                    case 3: diasProgramables = 4; break;
                    case 4: diasAsignadosAutomaticamente = 3; diasProgramables = 3; break;
                    case 5: diasAsignadosAutomaticamente = 4; diasProgramables = 4; break;
                }
            }
            else
            {
                diasAsignadosAutomaticamente = 5;
                int diasProgramablesBase = 5;
                int gruposDeCincoAnios = (antiguedadEnAnios - 6) / 5;
                diasProgramables = diasProgramablesBase + (gruposDeCincoAnios * 2);
            }

            return new VacacionesCalculadas
            {
                DiasEmpresa = diasEmpresa,
                DiasAsignadosAutomaticamente = diasAsignadosAutomaticamente,
                DiasProgramables = diasProgramables,
                TotalDias = diasEmpresa + diasAsignadosAutomaticamente + diasProgramables
            };
        }

        private int CalcularAntiguedadEnAnios(DateOnly fechaIngreso, DateOnly fechaReferencia)
        {
            var antiguedad = fechaReferencia.Year - fechaIngreso.Year;

            if (fechaReferencia.Month < fechaIngreso.Month ||
                (fechaReferencia.Month == fechaIngreso.Month && fechaReferencia.Day < fechaIngreso.Day))
            {
                antiguedad--;
            }

            return Math.Max(0, antiguedad);
        }

        public async Task<ApiResponse<AsignacionManualResponse>> AsignarVacacionesManualAsync(
            AsignacionManualRequest request, int usuarioAsignaId)
        {
            using var transaction = await _db.Database.BeginTransactionAsync();
            try
            {
                var empleado = await _db.Users.Include(u => u.Grupo).FirstOrDefaultAsync(u => u.Id == request.EmpleadoId);
                if (empleado == null)
                    return new ApiResponse<AsignacionManualResponse>(false, null, "Empleado no encontrado");

                var vacacionesAsignadas = new List<VacacionesProgramadas>();
                var advertencias = new List<string>();

                if (!request.IgnorarRestricciones)
                {
                    var diasYaAsignados = await _db.VacacionesProgramadas
                        .Where(v => v.EmpleadoId == request.EmpleadoId
                            && request.FechasVacaciones.Contains(v.FechaVacacion)
                            && v.EstadoVacacion == "Activa")
                        .Select(v => v.FechaVacacion)
                        .ToListAsync();

                    if (diasYaAsignados.Any())
                    {
                        advertencias.Add($"Ya existen vacaciones asignadas en las fechas: {string.Join(", ", diasYaAsignados)}");
                        request.FechasVacaciones = request.FechasVacaciones
                            .Where(f => !diasYaAsignados.Contains(f))
                            .ToList();
                    }
                }

                // Porcentaje por día. Esta ruta —la del jefe y el superusuario—
                // NUNCA lo validaba: insertaba directo. Es el "en vulcanización
                // no respetó el bloqueo de los %, el 17 de septiembre dejó
                // capturar 13 personas" del reporte de 2026. Ahora se evalúa
                // siempre; lo que decide quien captura es si continúa.
                var diasConRebase = new List<DiaConRebaseDto>();
                var porcentajePorFecha = new Dictionary<DateOnly, decimal>();

                if (empleado.GrupoId.HasValue)
                {
                    foreach (var fecha in request.FechasVacaciones)
                    {
                        var estado = await _validadorPorcentaje.ObtenerEstadoAusenciasGrupo(empleado.GrupoId.Value, fecha);
                        if (estado == null) continue;

                        var conEsteDia = _validadorPorcentaje.EvaluarRegla(
                            estado.TotalEmpleados, estado.AusenciasActuales, 1, estado.PorcentajeMaximoPermitido);

                        porcentajePorFecha[fecha] = conEsteDia.PorcentajeResultante;

                        if (!estado.PuedeAgregarAusencia || !conEsteDia.Permitido)
                        {
                            diasConRebase.Add(new DiaConRebaseDto
                            {
                                Fecha = fecha,
                                PorcentajeResultante = conEsteDia.PorcentajeResultante,
                                PorcentajeMaximo = estado.PorcentajeMaximoPermitido,
                                Detalle = conEsteDia.Motivo
                            });
                        }
                    }
                }

                if (diasConRebase.Count > 0 && !request.ConfirmarRebasePorcentaje)
                {
                    await transaction.RollbackAsync();
                    var listado = string.Join(", ", diasConRebase.Select(d =>
                        $"{d.Fecha:dd/MM/yyyy} ({d.PorcentajeResultante:F2}% de {d.PorcentajeMaximo:F2}% permitido)"));

                    return new ApiResponse<AsignacionManualResponse>(false,
                        new AsignacionManualResponse
                        {
                            Exitoso = false,
                            EmpleadoId = request.EmpleadoId,
                            NombreEmpleado = empleado.FullName,
                            RequiereConfirmacionRebase = true,
                            DiasConRebase = diasConRebase,
                            Mensaje = $"Estos días ya rebasan el porcentaje permitido del grupo: {listado}."
                        },
                        $"El grupo ya rebasa el porcentaje permitido en: {listado}. Confirma si aun así quieres capturarlos.");
                }

                foreach (var fecha in request.FechasVacaciones)
                {
                    var conRebase = diasConRebase.Any(d => d.Fecha == fecha);
                    var vacacion = new VacacionesProgramadas
                    {
                        EmpleadoId = request.EmpleadoId,
                        FechaVacacion = fecha,
                        TipoVacacion = request.TipoVacacion,
                        OrigenAsignacion = request.OrigenAsignacion,
                        EstadoVacacion = request.EstadoVacacion,
                        Observaciones = request.Observaciones,
                        CapturadoConRebase = conRebase,
                        PorcentajeAlCapturar = porcentajePorFecha.TryGetValue(fecha, out var pct) ? pct : (decimal?)null,
                        // Sin esto el reporte de rebases no puede decir quién
                        // capturó el día: la columna quedaba siempre vacía.
                        CreatedBy = usuarioAsignaId,
                        UpdatedBy = usuarioAsignaId,
                        CreatedAt = DateTime.Now,
                        UpdatedAt = DateTime.Now
                    };

                    _db.VacacionesProgramadas.Add(vacacion);
                    vacacionesAsignadas.Add(vacacion);
                }

                await _db.SaveChangesAsync();

                if (diasConRebase.Count > 0)
                {
                    advertencias.Add(
                        "Se capturó rebasando el porcentaje permitido en: " +
                        string.Join(", ", diasConRebase.Select(d => $"{d.Fecha:dd/MM/yyyy} ({d.PorcentajeResultante:F2}%)")));

                    await AvisarRebaseAJefesDeAreaAsync(empleado, diasConRebase, usuarioAsignaId);
                }

                if (request.NotificarEmpleado)
                {
                    await _notificacionesService.CrearNotificacionAsync(
                        Models.Enums.TiposDeNotificacionEnum.RegistroVacaciones,
                        "Vacaciones Asignadas",
                        $"Se te han asignado {vacacionesAsignadas.Count} días de vacaciones. " +
                        $"Tipo: {request.TipoVacacion}. " +
                        $"Motivo: {request.MotivoAsignacion ?? "Asignación administrativa"}",
                        "Sistema de Vacaciones",
                        request.EmpleadoId,
                        usuarioAsignaId,
                        empleado.Grupo?.AreaId,
                        empleado.GrupoId,
                        "AsignacionManual",
                        null,
                        new
                        {
                            TotalDias = vacacionesAsignadas.Count,
                            Fechas = request.FechasVacaciones,
                            Tipo = request.TipoVacacion
                        }
                    );
                }

                var usuarioAsigno = await _db.Users.FindAsync(usuarioAsignaId);
                await transaction.CommitAsync();

                var response = new AsignacionManualResponse
                {
                    Exitoso = true,
                    EmpleadoId = request.EmpleadoId,
                    NombreEmpleado = empleado.FullName,
                    VacacionesAsignadasIds = vacacionesAsignadas.Select(v => v.Id).ToList(),
                    FechasAsignadas = vacacionesAsignadas.Select(v => v.FechaVacacion).ToList(),
                    TotalDiasAsignados = vacacionesAsignadas.Count,
                    TipoVacacion = request.TipoVacacion,
                    Mensaje = $"Se asignaron {vacacionesAsignadas.Count} días de vacaciones exitosamente",
                    Advertencias = advertencias,
                    FechaAsignacion = DateTime.Now,
                    UsuarioAsigno = usuarioAsigno?.FullName ?? $"Usuario {usuarioAsignaId}",
                    RequiereConfirmacionRebase = false,
                    DiasConRebase = diasConRebase
                };

                return new ApiResponse<AsignacionManualResponse>(true, response, null);
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                _logger.LogError(ex, "Error al asignar vacaciones manualmente");
                return new ApiResponse<AsignacionManualResponse>(false, null, $"Error: {ex.Message}");
            }
        }

        public async Task<ApiResponse<object>> EliminarVacacionesAsync(List<int> vacacionesIds)
        {
            try
            {
                var vacaciones = await _db.VacacionesProgramadas
                    .Where(v => vacacionesIds.Contains(v.Id))
                    .ToListAsync();

                if (vacaciones == null || !vacaciones.Any())
                    return new ApiResponse<object>(false, null, "No se encontraron vacaciones con los IDs especificados.");

                _db.VacacionesProgramadas.RemoveRange(vacaciones);
                await _db.SaveChangesAsync();

                return new ApiResponse<object>(true, null, $"Se eliminaron {vacaciones.Count} vacaciones correctamente.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al eliminar vacaciones");
                return new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}");
            }
        }

        public async Task<ApiResponse<object>> EliminarVacacionesPorFechaAsync(int empleadoId, List<DateOnly> fechas)
        {
            try
            {
                var vacaciones = await _db.VacacionesProgramadas
                    .Where(v => v.EmpleadoId == empleadoId && fechas.Contains(v.FechaVacacion))
                    .ToListAsync();

                if (!vacaciones.Any())
                    return new ApiResponse<object>(false, null, "No se encontraron vacaciones para las fechas especificadas.");

                _db.VacacionesProgramadas.RemoveRange(vacaciones);
                await _db.SaveChangesAsync();

                return new ApiResponse<object>(true, null, $"Se eliminaron {vacaciones.Count} vacaciones correctamente.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al eliminar vacaciones por fecha");
                return new ApiResponse<object>(false, null, $"Error inesperado: {ex.Message}");
            }
        }

        public async Task<ApiResponse<AsignacionManualLoteResponse>> AsignarVacacionesManualLoteAsync(
            AsignacionManualLoteRequest request, int usuarioAsignaId)
        {
            var response = new AsignacionManualLoteResponse
            {
                TotalEmpleados = request.EmpleadosIds.Count,
                FechaEjecucion = DateTime.Now,
                Detalles = new List<AsignacionManualResponse>()
            };

            var usuarioAsigno = await _db.Users.FindAsync(usuarioAsignaId);
            response.UsuarioEjecuto = usuarioAsigno?.FullName ?? $"Usuario {usuarioAsignaId}";

            foreach (var empleadoId in request.EmpleadosIds)
            {
                var asignacionIndividual = new AsignacionManualRequest
                {
                    EmpleadoId = empleadoId,
                    FechasVacaciones = request.FechasVacaciones,
                    TipoVacacion = request.TipoVacacion,
                    OrigenAsignacion = request.OrigenAsignacion,
                    EstadoVacacion = request.EstadoVacacion,
                    Observaciones = request.Observaciones,
                    MotivoAsignacion = request.MotivoAsignacion,
                    IgnorarRestricciones = request.IgnorarRestricciones,
                    NotificarEmpleado = request.NotificarEmpleados,
                    BloqueId = request.BloqueId,
                    OrigenSolicitud = request.OrigenSolicitud
                };

                var resultado = await AsignarVacacionesManualAsync(asignacionIndividual, usuarioAsignaId);

                if (resultado.Success && resultado.Data != null)
                {
                    response.AsignacionesExitosas++;
                    response.Detalles.Add(resultado.Data);
                }
                else
                {
                    response.AsignacionesFallidas++;
                    response.ErroresGenerales.Add($"Empleado {empleadoId}: {resultado.ErrorMsg}");
                }
            }

            return new ApiResponse<AsignacionManualLoteResponse>(true, response,
                $"Proceso completado: {response.AsignacionesExitosas} exitosas, {response.AsignacionesFallidas} fallidas");
        }
        /// <summary>
        /// Avisa a los jefes del área cuando alguien captura por encima del
        /// porcentaje. Validación 5 y 6 del punchlist: el jefe tiene que
        /// enterarse aunque el día lo haya forzado el superusuario.
        /// Los jefes salen de AreaJefes y, para las áreas que todavía no se
        /// migraron, de Area.JefeId / JefeSuplenteId.
        /// </summary>
        private async Task AvisarRebaseAJefesDeAreaAsync(
            User empleado, List<DiaConRebaseDto> diasConRebase, int usuarioAsignaId)
        {
            try
            {
                var areaId = empleado.Grupo?.AreaId;
                if (areaId == null) return;

                var jefes = await _db.AreaJefes
                    .Where(aj => aj.AreaId == areaId.Value)
                    .Select(aj => aj.UserId)
                    .ToListAsync();

                var area = await _db.Areas.FirstOrDefaultAsync(a => a.AreaId == areaId.Value);
                if (area != null)
                {
                    // Area.JefeId y JefeSuplenteId son int?: hay que desenvolverlos
                    // antes de meterlos en la lista de int.
                    if (area.JefeId.HasValue && area.JefeId.Value > 0) jefes.Add(area.JefeId.Value);
                    if (area.JefeSuplenteId.HasValue && area.JefeSuplenteId.Value > 0) jefes.Add(area.JefeSuplenteId.Value);
                }

                // Quien capturó no necesita avisarse a sí mismo.
                var destinatarios = jefes.Distinct().Where(id => id != usuarioAsignaId).ToList();
                if (destinatarios.Count == 0) return;

                var quienCapturo = await _db.Users.FindAsync(usuarioAsignaId);
                var detalle = string.Join(", ", diasConRebase.Select(d =>
                    $"{d.Fecha:dd/MM/yyyy} ({d.PorcentajeResultante:F2}% de {d.PorcentajeMaximo:F2}%)"));

                foreach (var jefeId in destinatarios)
                {
                    await _notificacionesService.CrearNotificacionAsync(
                        Models.Enums.TiposDeNotificacionEnum.RegistroVacaciones,
                        "Captura por encima del porcentaje",
                        $"{quienCapturo?.FullName ?? $"El usuario {usuarioAsignaId}"} capturó vacaciones de " +
                        $"{empleado.FullName} en día(s) que ya rebasan el porcentaje permitido del grupo: {detalle}.",
                        "Sistema de Vacaciones",
                        jefeId,
                        usuarioAsignaId,
                        areaId,
                        empleado.GrupoId,
                        "RebasePorcentaje",
                        null,
                        new
                        {
                            EmpleadoId = empleado.Id,
                            Dias = diasConRebase.Select(d => d.Fecha).ToList(),
                            CapturadoPor = usuarioAsignaId
                        }
                    );
                }

                _logger.LogWarning(
                    "Rebase de porcentaje: usuario {UsuarioId} capturó {Dias} día(s) del empleado {EmpleadoId} por encima del límite. Avisados {Jefes} jefe(s).",
                    usuarioAsignaId, diasConRebase.Count, empleado.Id, destinatarios.Count);
            }
            catch (Exception ex)
            {
                // El aviso no debe tumbar la captura que ya se guardó.
                _logger.LogError(ex, "No se pudo avisar del rebase de porcentaje al jefe de área");
            }
        }
    
        /// <summary>
        /// Días que se capturaron por encima del porcentaje permitido, con quién
        /// los capturó. Es el reporte que pide el punchlist para poder desglosar
        /// "quién capturó esos días" cuando un día se llenó de más.
        /// </summary>
        public async Task<ApiResponse<List<DiaRebasePorcentajeDto>>> ObtenerDiasConRebaseAsync(
            int anio, int? areaId = null, int? grupoId = null)
        {
            try
            {
                var query = _db.VacacionesProgramadas
                    .Include(v => v.Empleado).ThenInclude(u => u.Grupo).ThenInclude(g => g!.Area)
                    .Include(v => v.CreatedByUser)
                    .Where(v => v.CapturadoConRebase
                                && v.EstadoVacacion == "Activa"
                                && v.FechaVacacion.Year == anio);

                if (grupoId.HasValue)
                    query = query.Where(v => v.Empleado.GrupoId == grupoId.Value);
                else if (areaId.HasValue)
                    query = query.Where(v => v.Empleado.Grupo!.AreaId == areaId.Value);

                var filas = await query
                    .OrderBy(v => v.FechaVacacion)
                    .ThenBy(v => v.Empleado.Nomina)
                    .Select(v => new DiaRebasePorcentajeDto
                    {
                        Fecha = v.FechaVacacion,
                        Nomina = v.Empleado.Nomina.HasValue ? v.Empleado.Nomina.Value.ToString() : "",
                        NombreEmpleado = v.Empleado.FullName ?? "",
                        Area = v.Empleado.Grupo != null && v.Empleado.Grupo.Area != null
                            ? v.Empleado.Grupo.Area.NombreGeneral : "",
                        Grupo = v.Empleado.Grupo != null ? v.Empleado.Grupo.Rol : "",
                        TipoVacacion = v.TipoVacacion,
                        OrigenAsignacion = v.OrigenAsignacion,
                        PorcentajeAlCapturar = v.PorcentajeAlCapturar,
                        CapturadoPor = v.CreatedByUser != null ? v.CreatedByUser.FullName : null,
                        FechaCaptura = v.CreatedAt,
                        Observaciones = v.Observaciones
                    })
                    .ToListAsync();

                return new ApiResponse<List<DiaRebasePorcentajeDto>>(true, filas, null);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener los días capturados con rebase de porcentaje");
                return new ApiResponse<List<DiaRebasePorcentajeDto>>(false, null, $"Error inesperado: {ex.Message}");
            }
        }
    }

    public class VacacionesCalculadas
    {
        public int DiasEmpresa { get; set; }
        public int DiasAsignadosAutomaticamente { get; set; }
        public int DiasProgramables { get; set; }
        public int TotalDias { get; set; }
    
    }
}
