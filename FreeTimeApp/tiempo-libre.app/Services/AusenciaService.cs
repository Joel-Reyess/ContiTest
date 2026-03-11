using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using tiempo_libre.Models;
using tiempo_libre.DTOs;

namespace tiempo_libre.Services
{
    public class AusenciaService
    {
        private readonly FreeTimeDbContext _db;
        private readonly ValidadorPorcentajeService _validadorPorcentaje;
        private const decimal PORCENTAJE_AUSENCIA_MAXIMO_DEFAULT = 4.5m;

        public AusenciaService(FreeTimeDbContext db, ValidadorPorcentajeService validadorPorcentaje)
        {
            _db = db;
            _validadorPorcentaje = validadorPorcentaje;
        }

        public async Task<ApiResponse<List<AusenciaPorFechaResponse>>> CalcularAusenciasPorFechasAsync(ConsultaAusenciaRequest request)
        {
            try
            {
                var fechas = GenerarFechasDelRango(request.FechaInicio, request.FechaFin);
                if (!fechas.Any())
                    return new ApiResponse<List<AusenciaPorFechaResponse>>
                        (true, new List<AusenciaPorFechaResponse>(), null);

                var fechaMin = fechas.Min();
                var fechaMax = fechas.Max();

                // ─── 1. Cargar grupos una sola vez ───────────────────────────────────
                var gruposQuery = _db.Grupos.Include(g => g.Area).AsQueryable();
                if (request.GrupoId.HasValue)
                    gruposQuery = gruposQuery.Where(g => g.GrupoId == request.GrupoId.Value);
                if (request.AreaId.HasValue)
                    gruposQuery = gruposQuery.Where(g => g.AreaId == request.AreaId.Value);
                var grupos = await gruposQuery.ToListAsync();

                if (!grupos.Any())
                    return new ApiResponse<List<AusenciaPorFechaResponse>>
                        (true, new List<AusenciaPorFechaResponse>(), null);

                var grupoIds = grupos.Select(g => g.GrupoId).ToList();
                var areaIds = grupos.Select(g => g.AreaId).Distinct().ToList();
                var anios = fechas.Select(f => f.Year).Distinct().ToList();
                var meses = fechas.Select(f => new { f.Year, f.Month }).Distinct().ToList();

                // ─── 2. Empleados activos de todos los grupos (1 query) ──────────────
                var empleadosPorGrupo = await _db.Users
                    .Where(u => grupoIds.Contains(u.GrupoId ?? 0) &&
                                u.Status == Models.Enums.UserStatus.Activo)
                    .Select(u => new { u.Id, u.GrupoId, u.FullName, u.Nomina, u.Maquina })
                    .ToListAsync();

                var nominasActivas = empleadosPorGrupo
                    .Where(e => e.Nomina.HasValue)
                    .Select(e => e.Nomina!.Value)
                    .Distinct().ToList();

                var empleadoIdSet = empleadosPorGrupo.Select(e => e.Id).ToHashSet();

                // ─── 3. Vacaciones del rango completo (1 query) ──────────────────────
                var vacacionesBatch = await _db.VacacionesProgramadas
                    .Where(v => empleadoIdSet.Contains(v.EmpleadoId) &&
                                v.FechaVacacion >= fechaMin &&
                                v.FechaVacacion <= fechaMax &&
                                v.EstadoVacacion == "Activa")
                    .Select(v => new {
                        v.EmpleadoId,
                        v.FechaVacacion,
                        v.PeriodoProgramacion,
                        v.TipoVacacion
                    })
                    .ToListAsync();

                // ─── 4. Permisos e incapacidades SAP del rango (1 query) ────────────
                var permisosBatch = await _db.PermisosEIncapacidadesSAP
                    .Where(p => nominasActivas.Contains(p.Nomina) &&
                                p.Desde <= fechaMax &&
                                p.Hasta >= fechaMin &&
                                (p.FechaSolicitud == null || p.EstadoSolicitud == "Aprobada"))
                    .Select(p => new { p.Nomina, p.Desde, p.Hasta, p.ClaseAbsentismo })
                    .ToListAsync();

                // ─── 5. Festivos trabajados del rango (1 query) ──────────────────────
                var festivosBatch = await _db.SolicitudesFestivosTrabajados
                    .Where(f => nominasActivas.Contains(f.Nomina) &&
                                f.FechaNuevaSolicitada >= fechaMin &&
                                f.FechaNuevaSolicitada <= fechaMax &&
                                f.EstadoSolicitud == "Aprobada")
                    .Select(f => new { f.EmpleadoId, f.FechaNuevaSolicitada, f.Nomina })
                    .ToListAsync();

                // ─── 6. Manning: excepciones + área base (1+1 queries) ───────────────
                var excepcionesManning = await _db.ExcepcionesManning
                    .Where(e => areaIds.Contains(e.AreaId) &&
                                anios.Contains(e.Anio) &&
                                e.Activa)
                    .ToListAsync();

                // ─── 7. Porcentaje máximo: excepciones + config global (1+1 queries) ─
                var excepcionesPorcentaje = await _db.ExcepcionesPorcentaje
                    .Where(e => grupoIds.Contains(e.GrupoId) &&
                                e.Fecha >= fechaMin && e.Fecha <= fechaMax)
                    .ToListAsync();

                var configGlobal = await _db.ConfiguracionVacaciones
                    .OrderByDescending(c => c.Id)
                    .Select(c => c.PorcentajeAusenciaMaximo)
                    .FirstOrDefaultAsync();
                var porcentajeDefault = configGlobal > 0 ? configGlobal : PORCENTAJE_AUSENCIA_MAXIMO_DEFAULT;

                // ─── 8. Mapas auxiliares para lookups O(1) ───────────────────────────
                var nominaToEmpleado = empleadosPorGrupo
                    .Where(e => e.Nomina.HasValue)
                    .GroupBy(e => e.Nomina!.Value)
                    .ToDictionary(g => g.Key, g => g.First());

                var empleadoToGrupo = empleadosPorGrupo
                    .ToDictionary(e => e.Id, e => e.GrupoId ?? 0);

                var areaManningBase = grupos
                    .GroupBy(g => g.AreaId)
                    .ToDictionary(g => g.Key, g => g.First().Area?.Manning ?? 0);

                // ─── 9. Construir resultados en memoria (sin más queries) ────────────
                var resultados = new List<AusenciaPorFechaResponse>();

                foreach (var fecha in fechas)
                {
                    var ausenciasPorGrupo = new List<AusenciaPorGrupoDto>();

                    foreach (var grupo in grupos)
                    {
                        // Empleados del grupo
                        var empGrupo = empleadosPorGrupo
                            .Where(e => e.GrupoId == grupo.GrupoId).ToList();
                        var personalTotal = empGrupo.Count;
                        var empIdsGrupo = empGrupo.Select(e => e.Id).ToHashSet();
                        var nominasGrupo = empGrupo
                            .Where(e => e.Nomina.HasValue)
                            .Select(e => e.Nomina!.Value).ToHashSet();

                        // Manning
                        var excManning = excepcionesManning
                            .FirstOrDefault(e => e.AreaId == grupo.AreaId &&
                                                 e.Anio == fecha.Year &&
                                                 e.Mes == fecha.Month);
                        var manning = excManning?.ManningRequeridoExcepcion
                                      ?? areaManningBase.GetValueOrDefault(grupo.AreaId, 1);
                        if (manning <= 0) manning = 1;

                        // Porcentaje máximo
                        var excPct = excepcionesPorcentaje
                            .FirstOrDefault(e => e.GrupoId == grupo.GrupoId && e.Fecha == fecha);
                        var porcentajeMaximo = excPct?.PorcentajeMaximoPermitido ?? porcentajeDefault;

                        // Ausentes del día (de memoria)
                        var ausentesVac = vacacionesBatch
                            .Where(v => empIdsGrupo.Contains(v.EmpleadoId) && v.FechaVacacion == fecha)
                            .Select(v => new EmpleadoAusenteDto
                            {
                                EmpleadoId = v.EmpleadoId,
                                NombreCompleto = empGrupo.First(e => e.Id == v.EmpleadoId).FullName ?? "",
                                Nomina = empGrupo.First(e => e.Id == v.EmpleadoId).Nomina,
                                Maquina = empGrupo.First(e => e.Id == v.EmpleadoId).Maquina,
                                TipoAusencia = v.PeriodoProgramacion == "Reprogramacion" ? "Reprogramacion" : "Vacacion",
                                TipoVacacion = v.PeriodoProgramacion == "Reprogramacion" ? "Reprogramacion" : v.TipoVacacion
                            }).ToList();

                        var ausentesPermisos = permisosBatch
                            .Where(p => nominasGrupo.Contains(p.Nomina) &&
                                        p.Desde <= fecha && p.Hasta >= fecha)
                            .Select(p => {
                                var emp = nominaToEmpleado.GetValueOrDefault(p.Nomina);
                                if (emp == null) return null!;
                                return new EmpleadoAusenteDto
                                {
                                    EmpleadoId = emp.Id,
                                    NombreCompleto = emp.FullName ?? "",
                                    Nomina = emp.Nomina,
                                    Maquina = emp.Maquina,
                                    TipoAusencia = (p.ClaseAbsentismo ?? "").Contains("Incapacidad") ? "Incapacidad" : "Permiso",
                                    TipoVacacion = p.ClaseAbsentismo ?? "Permiso"
                                };
                            })
                            .Where(x => x != null).ToList();

                        var ausentesFestivos = festivosBatch
                            .Where(f => nominasGrupo.Contains(f.Nomina) && f.FechaNuevaSolicitada == fecha)
                            .Select(f => {
                                var emp = nominaToEmpleado.GetValueOrDefault(f.Nomina);
                                if (emp == null) return null!;
                                return new EmpleadoAusenteDto
                                {
                                    EmpleadoId = emp.Id,
                                    NombreCompleto = emp.FullName ?? "",
                                    Nomina = emp.Nomina,
                                    Maquina = emp.Maquina,
                                    TipoAusencia = "Festivo Trabajado",
                                    TipoVacacion = "Descanso compensatorio"
                                };
                            })
                            .Where(x => x != null).ToList();

                        // Deduplicar por EmpleadoId (prioridad: vac > festivo > permiso)
                        var todosAusentes = ausentesVac
                            .Concat(ausentesFestivos)
                            .Concat(ausentesPermisos)
                            .GroupBy(a => a.EmpleadoId)
                            .Select(g => g.First())
                            .ToList();

                        var idsAusentes = todosAusentes.Select(a => a.EmpleadoId).ToHashSet();
                        var disponibles = empGrupo
                            .Where(e => !idsAusentes.Contains(e.Id))
                            .Select(e => new EmpleadoDisponibleDto
                            {
                                EmpleadoId = e.Id,
                                NombreCompleto = e.FullName ?? "",
                                Nomina = e.Nomina,
                                Maquina = e.Maquina,
                                Rol = grupo.Rol
                            }).ToList();

                        var personalNoDisponible = todosAusentes.Count;
                        var personalDisponible = Math.Max(0, personalTotal - personalNoDisponible);

                        // Cálculos de porcentajes
                        var pctCobertura = manning > 0
                            ? Math.Clamp(Math.Round((decimal)personalDisponible / manning * 100m, 2), 0m, 100m)
                            : 0m;
                        var pctAusencia = personalTotal > 0
                            ? Math.Clamp(Math.Round((decimal)personalNoDisponible / personalTotal * 100m, 2), 0m, 100m)
                            : 0m;

                        var minimoEmp = _validadorPorcentaje.CalcularMinimoEmpleadosParaPorcentaje(porcentajeMaximo);
                        var esSmall = personalTotal < minimoEmp;
                        var excedeLimite = !esSmall && pctAusencia > porcentajeMaximo;

                        ausenciasPorGrupo.Add(new AusenciaPorGrupoDto
                        {
                            GrupoId = grupo.GrupoId,
                            NombreGrupo = grupo.Rol ?? $"Grupo {grupo.GrupoId}",
                            AreaId = grupo.AreaId,
                            NombreArea = grupo.Area?.NombreGeneral ?? "Sin área",
                            ManningRequerido = (int)manning,
                            PersonalTotal = personalTotal,
                            PersonalNoDisponible = personalNoDisponible,
                            PersonalDisponible = personalDisponible,
                            PorcentajeDisponible = pctCobertura,
                            PorcentajeAusencia = pctAusencia,
                            PorcentajeMaximoPermitido = porcentajeMaximo,
                            ExcedeLimite = excedeLimite,
                            PuedeReservar = !excedeLimite,
                            EmpleadosAusentes = todosAusentes,
                            EmpleadosDisponibles = disponibles
                        });
                    }

                    resultados.Add(new AusenciaPorFechaResponse
                    {
                        Fecha = fecha,
                        AusenciasPorGrupo = ausenciasPorGrupo
                    });
                }

                return new ApiResponse<List<AusenciaPorFechaResponse>>(true, resultados, null);
            }
            catch (Exception ex)
            {
                return new ApiResponse<List<AusenciaPorFechaResponse>>
                    (false, null, $"Error al calcular ausencias: {ex.Message}");
            }
        }

        public async Task<ApiResponse<ValidacionDisponibilidadResponse>> ValidarDisponibilidadDiaAsync(ValidacionDisponibilidadRequest request)
        {
            try
            {
                // Obtener información del empleado
                var empleado = await _db.Users.FindAsync(request.EmpleadoId);
                if (empleado == null)
                    return new ApiResponse<ValidacionDisponibilidadResponse>(false, null, "Empleado no encontrado.");

                if (!empleado.GrupoId.HasValue || empleado.GrupoId == 0)
                    return new ApiResponse<ValidacionDisponibilidadResponse>(false, null, "Empleado sin grupo asignado.");

                // Calcular ausencia actual del grupo
                var ausenciaActual = await CalcularAusenciaPorGrupoAsync(request.Fecha, empleado.GrupoId.Value);

                // Usar el nuevo validador de porcentaje que considera grupos pequeños
                var puedeAusentarse = await _validadorPorcentaje.PuedeGrupoTenerAusencias(empleado.GrupoId.Value, 1);

                // Obtener el estado detallado del grupo para información adicional
                var estadoGrupo = await _validadorPorcentaje.ObtenerEstadoAusenciasGrupo(empleado.GrupoId.Value);

                // Simular la ausencia incluyendo al empleado para obtener el porcentaje
                var ausenciaConEmpleado = await CalcularAusenciaPorGrupoAsync(request.Fecha, empleado.GrupoId.Value, request.EmpleadoId);

                var response = new ValidacionDisponibilidadResponse
                {
                    DiaDisponible = puedeAusentarse,
                    PorcentajeAusenciaActual = ausenciaActual.PorcentajeAusencia,
                    PorcentajeAusenciaConEmpleado = ausenciaConEmpleado.PorcentajeAusencia,
                    PorcentajeMaximoPermitido = estadoGrupo?.PorcentajeMaximoPermitido ?? PORCENTAJE_AUSENCIA_MAXIMO_DEFAULT,
                    Motivo = estadoGrupo?.MensajeEstado ?? (puedeAusentarse ? "Día disponible" : "Excede el límite permitido"),
                    DetalleGrupo = ausenciaConEmpleado
                };

                return new ApiResponse<ValidacionDisponibilidadResponse>(true, response, null);
            }
            catch (Exception ex)
            {
                return new ApiResponse<ValidacionDisponibilidadResponse>(false, null, $"Error al validar disponibilidad: {ex.Message}");
            }
        }

        private async Task<List<AusenciaPorGrupoDto>> CalcularAusenciasPorGruposAsync(DateOnly fecha, int? grupoIdFiltro = null, int? areaIdFiltro = null)
        {
            var query = _db.Grupos
                .Include(g => g.Area)
                .AsQueryable();

            if (grupoIdFiltro.HasValue)
                query = query.Where(g => g.GrupoId == grupoIdFiltro.Value);

            if (areaIdFiltro.HasValue)
                query = query.Where(g => g.AreaId == areaIdFiltro.Value);

            var grupos = await query.ToListAsync();
            var resultados = new List<AusenciaPorGrupoDto>();

            foreach (var grupo in grupos)
            {
                var ausencia = await CalcularAusenciaPorGrupoAsync(fecha, grupo.GrupoId);
                resultados.Add(ausencia);
            }

            return resultados;
        }

        private async Task<AusenciaPorGrupoDto> CalcularAusenciaPorGrupoAsync(DateOnly fecha, int grupoId, int? empleadoAdicionalId = null)
        {
            // 1) Grupo + Area
            var grupo = await _db.Grupos
                .Include(g => g.Area)
                .FirstOrDefaultAsync(g => g.GrupoId == grupoId);

            if (grupo == null)
                throw new ArgumentException($"Grupo con ID {grupoId} no encontrado");

            // 2) Manning requerido (con fallback)
            var manningRequerido = await ObtenerManningRequeridoAsync(grupo.AreaId, fecha);
            if (manningRequerido <= 0) manningRequerido = 1; // evita división por cero

            // 3) Personal total del grupo (con fallback)
            var todosLosEmpleados = await _db.Users
        .Where(u => u.GrupoId == grupoId && u.Status == Models.Enums.UserStatus.Activo)
        .Select(u => new {
            u.Id,
            u.FullName,
            u.Nomina,
            u.Maquina,
            Rol = grupo.Rol
        })
        .ToListAsync();

            var personalTotal = todosLosEmpleados.Count;
            if (personalTotal < 0) personalTotal = 0; // seguridad

            // 4) Empleados ausentes (vacaciones, incapacidades, permisos)
            var empleadosAusentes = await ObtenerEmpleadosAusentesAsync(fecha, grupoId);

            // Simulación de ausencia: agregar empleado si aplica y no está ya en la lista
            if (empleadoAdicionalId.HasValue && !empleadosAusentes.Any(e => e.EmpleadoId == empleadoAdicionalId.Value))
            {
                var empleadoAdicional = await _db.Users.FindAsync(empleadoAdicionalId.Value);
                if (empleadoAdicional != null)
                {
                    empleadosAusentes.Add(new EmpleadoAusenteDto
                    {
                        EmpleadoId = empleadoAdicional.Id,
                        NombreCompleto = empleadoAdicional.FullName ?? "",
                        Nomina = empleadoAdicional.Nomina,
                        TipoAusencia = "Vacacion",
                        TipoVacacion = "Simulacion",
                        Maquina = empleadoAdicional.Maquina
                    });
                }
            }

            var idsAusentes = empleadosAusentes.Select(e => e.EmpleadoId).ToHashSet();
            var empleadosDisponibles = todosLosEmpleados
                .Where(emp => !idsAusentes.Contains(emp.Id))
                .Select(emp => new EmpleadoDisponibleDto
                {
                    EmpleadoId = emp.Id,
                    NombreCompleto = emp.FullName ?? "",
                    Nomina = emp.Nomina,
                    Maquina = emp.Maquina,
                    Rol = emp.Rol
                })
                .ToList();

            // 5) Disponibles / No disponibles
            var personalNoDisponible = empleadosAusentes.Count;
            var personalDisponible = Math.Max(0, personalTotal - personalNoDisponible);

            // ==============================
            // 6) PORCENTAJES CORREGIDOS
            // ==============================

            // 6.1 Cobertura (respecto al manning)
            //    - si hay más disponibles que manning, cobertura = 100%
            decimal porcentajeCobertura = 0m;
            if (manningRequerido > 0)
            {
                porcentajeCobertura = ((decimal)personalDisponible / manningRequerido) * 100m;
                porcentajeCobertura = Math.Clamp(Math.Round(porcentajeCobertura, 2), 0m, 100m);
            }

            // 6.2 Ausencia real del grupo (respecto al total del grupo)
            decimal porcentajeAusenciaGrupo = 0m;
            if (personalTotal > 0)
            {
                porcentajeAusenciaGrupo = ((decimal)personalNoDisponible / personalTotal) * 100m;
                porcentajeAusenciaGrupo = Math.Clamp(Math.Round(porcentajeAusenciaGrupo, 2), 0m, 100m);
            }
            // Nota: NO calculamos ausencia como (100 - cobertura) porque son métricas distintas.

            // 7) Límite permitido y grupos pequeños
            var porcentajeMaximo = await ObtenerPorcentajeMaximoPermitidoAsync(grupoId, fecha);
            var minimoEmpleados = _validadorPorcentaje.CalcularMinimoEmpleadosParaPorcentaje(porcentajeMaximo);
            var esGrupoPequeno = personalTotal < minimoEmpleados;

            // 8) Excede límite: se evalúa contra la ausencia real del grupo
            bool excedeLimite = !esGrupoPequeno && (porcentajeAusenciaGrupo > porcentajeMaximo);

            // 9) Puede reservar: usa el validador considerando el estado actual
            bool puedeReservar = await _validadorPorcentaje.PuedeGrupoTenerAusencias(grupoId, 1, personalNoDisponible);

            // 10) DTO de salida
            return new AusenciaPorGrupoDto
            {
                GrupoId = grupoId,
                NombreGrupo = grupo.Rol ?? $"Grupo {grupoId}",
                AreaId = grupo.AreaId,
                NombreArea = grupo.Area?.NombreGeneral ?? "Sin área",
                ManningRequerido = (int)manningRequerido,
                PersonalTotal = personalTotal,
                PersonalNoDisponible = personalNoDisponible,
                PersonalDisponible = personalDisponible,

                // Publicamos las dos métricas en los mismos campos:
                // - PorcentajeDisponible = COBERTURA (respecto al manning)
                // - PorcentajeAusencia   = AUSENCIA REAL DEL GRUPO (respecto a total)
                PorcentajeDisponible = porcentajeCobertura,
                PorcentajeAusencia = porcentajeAusenciaGrupo,

                PorcentajeMaximoPermitido = porcentajeMaximo,
                ExcedeLimite = excedeLimite,
                PuedeReservar = puedeReservar,
                EmpleadosAusentes = empleadosAusentes,
                EmpleadosDisponibles = empleadosDisponibles
            };
        }


        private async Task<List<EmpleadoAusenteDto>> ObtenerEmpleadosAusentesAsync(DateOnly fecha, int grupoId)
        {
            // 1. Vacaciones activas (todos los tipos: Anual, Automatica, Programable, FestivoTrabajado, etc.)
            // Incluye reprogramaciones aprobadas (PeriodoProgramacion == "Reprogramacion")
            var vacaciones = await _db.VacacionesProgramadas
                .Where(v => v.FechaVacacion == fecha && v.EstadoVacacion == "Activa")
                .Join(_db.Users.Where(u => u.GrupoId == grupoId && u.Status == Models.Enums.UserStatus.Activo),
                      v => v.EmpleadoId,
                      u => u.Id,
                      (v, u) => new { Vacacion = v, Usuario = u })
                .Select(vu => new EmpleadoAusenteDto
                {
                    EmpleadoId = vu.Vacacion.EmpleadoId,
                    NombreCompleto = vu.Usuario.FullName ?? "",
                    Nomina = vu.Usuario.Nomina,
                    TipoAusencia = vu.Vacacion.PeriodoProgramacion == "Reprogramacion" ? "Reprogramacion" : "Vacacion",
                    TipoVacacion = vu.Vacacion.PeriodoProgramacion == "Reprogramacion"
                        ? "Reprogramacion"
                        : vu.Vacacion.TipoVacacion,
                    Maquina = vu.Usuario.Maquina
                })
                .ToListAsync();

            // 2. Permisos e Incapacidades SAP
            // Si tiene FechaSolicitud = es solicitud manual, requiere aprobacion
            // Si NO tiene FechaSolicitud = viene de Excel/SAP, siempre se muestra
            var permisosIncapacidades = await _db.PermisosEIncapacidadesSAP
                .Where(p => p.Desde <= fecha && p.Hasta >= fecha
                    && (p.FechaSolicitud == null || p.EstadoSolicitud == "Aprobada"))
                .Join(_db.Users.Where(u => u.GrupoId == grupoId && u.Status == Models.Enums.UserStatus.Activo),
                      p => p.Nomina,
                      u => u.Nomina,
                      (p, u) => new { Permiso = p, Usuario = u })
                .Select(pu => new EmpleadoAusenteDto
                {
                    EmpleadoId = pu.Usuario.Id,
                    NombreCompleto = pu.Usuario.FullName ?? "",
                    Nomina = pu.Usuario.Nomina,
                    TipoAusencia = (pu.Permiso.ClaseAbsentismo ?? "").Contains("Incapacidad") ? "Incapacidad" : "Permiso",
                    TipoVacacion = pu.Permiso.ClaseAbsentismo ?? "Permiso",
                    Maquina = pu.Usuario.Maquina
                })
                .ToListAsync();

            // 3. Festivos trabajados aprobados (descanso compensatorio)
            // Nóminas del grupo para filtrar
            var nominasDelGrupo = await _db.Users
                .Where(u => u.GrupoId == grupoId && u.Status == Models.Enums.UserStatus.Activo)
                .Select(u => u.Nomina)
                .ToListAsync();

            var festivosAprobados = await _db.SolicitudesFestivosTrabajados
                .Where(f => f.FechaNuevaSolicitada == fecha &&
                            f.EstadoSolicitud == "Aprobada" &&
                            nominasDelGrupo.Contains(f.Nomina))
                .Select(f => new EmpleadoAusenteDto
                {
                    EmpleadoId = f.EmpleadoId,
                    NombreCompleto = f.Empleado.FullName ?? "",
                    Nomina = f.Nomina,
                    TipoAusencia = "Festivo Trabajado",
                    TipoVacacion = "Descanso compensatorio",
                    Maquina = f.Empleado.Maquina
                })
                .ToListAsync();

            // Combinar los 3 y eliminar duplicados por EmpleadoId (prioridad: vacacion > festivo > permiso)
            var todosAusentes = vacaciones
                .Concat(festivosAprobados)
                .Concat(permisosIncapacidades)
                .GroupBy(a => a.EmpleadoId)
                .Select(g => g.First())
                .ToList();

            return todosAusentes;
        }

        private async Task<decimal> ObtenerPorcentajeMaximoPermitidoAsync(int grupoId, DateOnly fecha)
        {
            // Primero verificar si hay una excepción específica para este grupo y fecha
            var excepcion = await _db.ExcepcionesPorcentaje
                .FirstOrDefaultAsync(e => e.GrupoId == grupoId && e.Fecha == fecha);

            if (excepcion != null)
                return excepcion.PorcentajeMaximoPermitido;

            // Si no hay excepción, usar la configuración general
            var config = await _db.ConfiguracionVacaciones
                .OrderByDescending(c => c.Id)
                .FirstOrDefaultAsync();

            return config?.PorcentajeAusenciaMaximo ?? PORCENTAJE_AUSENCIA_MAXIMO_DEFAULT;
        }

        /// <summary>
        /// Calcular si el grupo puede permitir una reserva adicional sin exceder los límites
        /// </summary>
        private bool CalcularSiPuedeReservar(int personalTotal, int personalNoDisponibleActual, decimal manningRequerido, decimal porcentajeMaximo)
        {
            if (personalTotal == 0 || manningRequerido == 0) return false;

            // Simular agregar una persona más ausente
            int personalNoDisponibleConUnoMas = personalNoDisponibleActual + 1;
            int personalDisponibleConUnoMas = personalTotal - personalNoDisponibleConUnoMas;

            // Salida rápida: verificar manning mínimo
            if (personalDisponibleConUnoMas < manningRequerido)
                return false;

            // Calcular porcentaje de ausencia con una persona más ausente
            decimal porcentajeDisponibleConUnoMas = manningRequerido > 0 ? (decimal)personalDisponibleConUnoMas / manningRequerido * 100 : 100;
            decimal porcentajeAusenciaConUnoMas = 100 - porcentajeDisponibleConUnoMas;

            // Aplicar límites para mantener consistencia
            porcentajeAusenciaConUnoMas = Math.Max(0, porcentajeAusenciaConUnoMas);

            // Retornar true si el porcentaje se mantiene dentro del límite
            return porcentajeAusenciaConUnoMas <= porcentajeMaximo;
        }

        /// <summary>
        /// Obtener el manning requerido considerando excepciones por mes
        /// </summary>
        private async Task<decimal> ObtenerManningRequeridoAsync(int areaId, DateOnly fecha)
        {
            // Buscar excepción específica para esta área y mes
            var excepcion = await _db.ExcepcionesManning
                .FirstOrDefaultAsync(e => e.AreaId == areaId
                                       && e.Anio == fecha.Year
                                       && e.Mes == fecha.Month
                                       && e.Activa);

            if (excepcion != null)
                return excepcion.ManningRequeridoExcepcion;

            // Si no hay excepción, usar el manning base del área
            var area = await _db.Areas.FirstOrDefaultAsync(a => a.AreaId == areaId);
            return area?.Manning ?? 0;
        }

        /// <summary>
        /// Generar lista de fechas desde fecha inicio hasta fecha fin (inclusive)
        /// Si fechaFin es null, solo retorna la fecha inicio
        /// </summary>
        private List<DateOnly> GenerarFechasDelRango(DateOnly fechaInicio, DateOnly? fechaFin)
        {
            var fechas = new List<DateOnly>();

            // Si no hay fecha fin, solo usar fecha inicio
            if (!fechaFin.HasValue)
            {
                fechas.Add(fechaInicio);
                return fechas;
            }

            // Validar que fechaFin no sea anterior a fechaInicio
            if (fechaFin.Value < fechaInicio)
            {
                throw new ArgumentException("La fecha fin no puede ser anterior a la fecha inicio");
            }

            // Generar todas las fechas del rango (incluyendo inicio y fin)
            var fechaActual = fechaInicio;
            while (fechaActual <= fechaFin.Value)
            {
                fechas.Add(fechaActual);
                fechaActual = fechaActual.AddDays(1);
            }

            return fechas;
        }
    }
}