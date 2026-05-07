using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using tiempo_libre.Models;
using tiempo_libre.DTOs;
using tiempo_libre.Models.Enums;
using tiempo_libre.Helpers;

namespace tiempo_libre.Services
{
    public class CalendarioGrupoService
    {
        private readonly FreeTimeDbContext _db;


        public CalendarioGrupoService(FreeTimeDbContext db)
        {
            _db = db;
        }

        public async Task<ApiResponse<CalendarioGrupoResponse>> ObtenerCalendarioGrupoAsync(int grupoId, DateTime fechaInicio, DateTime fechaFin)
        {
            // Validaciones
            if (grupoId <= 0)
                return new ApiResponse<CalendarioGrupoResponse>(false, null, "El grupoId debe ser un entero positivo.");
            
            if (fechaInicio >= fechaFin)
                return new ApiResponse<CalendarioGrupoResponse>(false, null, "La fechaInicio debe ser menor a la fechaFin.");
            
            if ((fechaFin - fechaInicio).TotalDays > 365)
                return new ApiResponse<CalendarioGrupoResponse>(false, null, "El rango de fechas no puede ser mayor a 365 días.");

            // Obtener el grupo
            var grupo = await _db.Grupos
                .Include(g => g.Area)
                .FirstOrDefaultAsync(g => g.GrupoId == grupoId);
            
            if (grupo == null)
                return new ApiResponse<CalendarioGrupoResponse>(false, null, "El grupo especificado no existe.");

            // Obtener la regla del grupo basada en la columna Rol usando TurnosHelper
            var reglaInfo = TurnosHelper.ParseRolGrupo(grupo.Rol);
            if (reglaInfo == null)
                return new ApiResponse<CalendarioGrupoResponse>(false, null, "No se pudo determinar la regla del grupo.");

            // Generar el calendario
            var calendario = await GenerarCalendarioAsync(fechaInicio, fechaFin, reglaInfo.Value.Regla, reglaInfo.Value.NumeroGrupo);

            var response = new CalendarioGrupoResponse
            {
                GrupoId = grupoId,
                NombreGrupo = grupo.Rol,
                Regla = reglaInfo.Value.Regla,
                FechaInicio = fechaInicio,
                FechaFin = fechaFin,
                Calendario = calendario
            };

            return new ApiResponse<CalendarioGrupoResponse>(true, response, null);
        }


        private async Task<List<CalendarioGrupoDiaDto>> GenerarCalendarioAsync(DateTime fechaInicio, DateTime fechaFin, string regla, int numeroGrupo)
        {
            var resultado = new List<CalendarioGrupoDiaDto>();

            if (!TurnosHelper.REGLAS.ContainsKey(regla))
                return resultado;

            var patronRegla = TurnosHelper.REGLAS[regla];
            var cantSemanas = patronRegla.Length / 7;

            // Crear el rol específico para este grupo usando TurnosHelper
            var rol = TurnosHelper.CrearRol(regla, numeroGrupo);

            // Buscar Semana Santa del año calendario, independientemente de si está visible en pantalla
            // Obtener todos los años en el rango de fechas para buscar Semana Santa en cada año
            var añoInicio = fechaInicio.Year;
            var añoFin = fechaFin.Year;

            // Get the LAST day (max FechaFinal) of Semana Santa in the year range
            var semanaSantaFechaFinal = await _db.DiasInhabiles
                .Where(d => d.Detalles.Contains("Semana Santa") &&
                           d.FechaFinal.Year >= añoInicio && d.FechaFinal.Year <= añoFin)
                .OrderByDescending(d => d.FechaFinal) // Get the LAST day of Semana Santa
                .Select(d => (DateOnly?)d.FechaFinal)
                .FirstOrDefaultAsync();

            Console.WriteLine($"[DEBUG] CalendarioGrupoService: Queried Semana Santa for years {añoInicio}-{añoFin}, found: {(semanaSantaFechaFinal.HasValue ? semanaSantaFechaFinal.Value.ToString("yyyy-MM-dd") : "NULL")}");

            // Normalizar fechas a medianoche para evitar problemas con componentes de tiempo
            var fechaInicioDate = fechaInicio.Date;
            var fechaFinDate = fechaFin.Date;

            var fecha = new DateTime(TurnosHelper.FECHA_REFERENCIA.Ticks).Date;
            var i = 0;

            // Generar desde la fecha de referencia hasta la fecha fin
            while (fecha <= fechaFinDate)
            {
                if (fecha >= fechaInicioDate)
                {
                    // Ajustar la fecha de referencia para el cálculo considerando Semana Santa
                    var fechaAjustada = TurnosHelper.AjustarFechaPorSemanaSanta(fecha, semanaSantaFechaFinal);
                    var diasDesdeFechaReferencia = (fechaAjustada - new DateTime(TurnosHelper.FECHA_REFERENCIA.Ticks).Date).Days;

                    var turnoCode = rol[Math.Abs(diasDesdeFechaReferencia) % (cantSemanas * 7)];
                    var tipoCalendario = TipoCalendarioExtensions.FromShortString(turnoCode);

                    resultado.Add(new CalendarioGrupoDiaDto
                    {
                        Fecha = fecha,
                        Turno = turnoCode,
                        Tipo = tipoCalendario.ToDescription()
                    });
                }

                fecha = fecha.AddDays(1);
                i++;
            }

            return resultado;
        }

        public async Task<ApiResponse<CalendarioUsuarioResponse>> ObtenerCalendarioUsuarioAsync(int usuarioId, DateTime fechaInicio, DateTime fechaFin)
        {
            // Validaciones
            if (usuarioId <= 0)
                return new ApiResponse<CalendarioUsuarioResponse>(false, null, "El usuarioId debe ser un entero positivo.");

            if (fechaInicio >= fechaFin)
                return new ApiResponse<CalendarioUsuarioResponse>(false, null, "La fechaInicio debe ser menor a la fechaFin.");

            if ((fechaFin - fechaInicio).TotalDays > 365)
                return new ApiResponse<CalendarioUsuarioResponse>(false, null, "El rango de fechas no puede ser mayor a 365 días.");

            // Obtener el usuario con su grupo
            var usuario = await _db.Users
                .Include(u => u.Grupo)
                .ThenInclude(g => g.Area)
                .FirstOrDefaultAsync(u => u.Id == usuarioId);

            if (usuario == null)
                return new ApiResponse<CalendarioUsuarioResponse>(false, null, "El usuario especificado no existe.");

            if (!usuario.GrupoId.HasValue || usuario.Grupo == null)
                return new ApiResponse<CalendarioUsuarioResponse>(false, null, "El usuario no tiene un grupo asignado.");

            // Obtener la regla del grupo
            var reglaInfo = TurnosHelper.ParseRolGrupo(usuario.Grupo.Rol);
            if (reglaInfo == null)
                return new ApiResponse<CalendarioUsuarioResponse>(false, null, "No se pudo determinar la regla del grupo del usuario.");

            // Generar el calendario base con incidencias
            var calendario = await GenerarCalendarioConIncidenciasAsync(usuarioId, fechaInicio, fechaFin, reglaInfo.Value.Regla, reglaInfo.Value.NumeroGrupo);

            var response = new CalendarioUsuarioResponse
            {
                UsuarioId = usuarioId,
                NombreCompleto = usuario.FullName ?? "",
                GrupoId = usuario.GrupoId,
                NombreGrupo = usuario.Grupo.Rol,
                Regla = reglaInfo.Value.Regla,
                FechaInicio = fechaInicio,
                FechaFin = fechaFin,
                Calendario = calendario
            };

            return new ApiResponse<CalendarioUsuarioResponse>(true, response, null);
        }

        public async Task<ApiResponse<CalendarioGrupoResponse>> ObtenerCalendarioGrupoConIncidenciasAsync(int grupoId, DateTime fechaInicio, DateTime fechaFin)
        {
            // Reutilizar la lógica base pero agregando incidencias
            var responseBase = await ObtenerCalendarioGrupoAsync(grupoId, fechaInicio, fechaFin);
            if (!responseBase.Success || responseBase.Data == null)
                return responseBase;

            // Obtener usuarios del grupo
            var usuariosDelGrupo = await _db.Users
                .Where(u => u.GrupoId == grupoId)
                .Select(u => u.Id)
                .ToListAsync();

            if (!usuariosDelGrupo.Any())
                return responseBase; // Sin usuarios, devolver calendario base

            // Agregar incidencias al calendario (consolidadas del grupo)
            var calendarioConIncidencias = await AgregarIncidenciasGrupoAsync(
                responseBase.Data.Calendario, usuariosDelGrupo, fechaInicio, fechaFin);

            responseBase.Data.Calendario = calendarioConIncidencias;
            return responseBase;
        }

        private async Task<List<CalendarioGrupoDiaDto>> GenerarCalendarioConIncidenciasAsync(
            int usuarioId, DateTime fechaInicio, DateTime fechaFin, string regla, int numeroGrupo)
        {
            // Generar calendario base
            var calendarioBase = await GenerarCalendarioAsync(fechaInicio, fechaFin, regla, numeroGrupo);

            // Obtener incidencias del usuario
            var fechaInicioOnly = DateOnly.FromDateTime(fechaInicio);
            var fechaFinOnly = DateOnly.FromDateTime(fechaFin);

            var vacaciones = await _db.VacacionesProgramadas
                .Where(v => v.EmpleadoId == usuarioId &&
                           v.FechaVacacion >= fechaInicioOnly && v.FechaVacacion <= fechaFinOnly &&
                           v.EstadoVacacion == "Activa")
                .ToListAsync();

            var incidencias = await _db.IncidenciasOPermisos
                .Where(i => i.IdUsuarioEmpleado == usuarioId &&
                           i.Fecha >= fechaInicioOnly && i.Fecha <= fechaFinOnly)
                .ToListAsync();

            // Permisos/incapacidades de SAP del usuario en el rango. Incluye los
            // registros de extensión manual (Punto 6) y respeta solicitudes
            // (FechaSolicitud != null implica que solo se pinta si está aprobada).
            var nominaUsuario = await _db.Users
                .Where(u => u.Id == usuarioId)
                .Select(u => u.Nomina)
                .FirstOrDefaultAsync();

            var permisosSap = nominaUsuario.HasValue
                ? await _db.PermisosEIncapacidadesSAP
                    .Where(p => p.Nomina == nominaUsuario.Value &&
                                p.Hasta >= fechaInicioOnly && p.Desde <= fechaFinOnly &&
                                (p.FechaSolicitud == null || p.EstadoSolicitud == "Aprobada"))
                    .ToListAsync()
                : new List<PermisosEIncapacidadesSAP>();

            var diasInhabiles = await _db.DiasInhabiles
                .Where(d => d.Fecha >= fechaInicioOnly && d.Fecha <= fechaFinOnly)
                .ToListAsync();

            // Aplicar incidencias al calendario
            foreach (var dia in calendarioBase)
            {
                var fechaDia = DateOnly.FromDateTime(dia.Fecha);

                // Verificar vacaciones
                var vacacion = vacaciones.FirstOrDefault(v => v.FechaVacacion == fechaDia);
                if (vacacion != null)
                {
                    dia.Incidencia = "V";
                    dia.TipoIncidencia = vacacion.TipoVacacion.ToLower();
                    continue;
                }

                // Verificar permisos/incapacidades SAP (incluye extensiones)
                var permisoSap = permisosSap.FirstOrDefault(p => fechaDia >= p.Desde && fechaDia <= p.Hasta);
                if (permisoSap != null)
                {
                    dia.Incidencia = "I";
                    dia.TipoIncidencia = !string.IsNullOrEmpty(permisoSap.ClaseAbsentismo)
                        ? permisoSap.ClaseAbsentismo
                        : (permisoSap.ClAbPre?.ToString() ?? "Permiso");
                    continue;
                }

                // Verificar incidencias/permisos
                var incidencia = incidencias.FirstOrDefault(i => i.Fecha == fechaDia);
                if (incidencia != null)
                {
                    dia.Incidencia = "I";
                    dia.TipoIncidencia = incidencia.TiposDeIncedencia.ToString();
                    continue;
                }

                // Verificar días inhábiles
                var diaInhabil = diasInhabiles.FirstOrDefault(d => d.Fecha == fechaDia);
                if (diaInhabil != null)
                {
                    dia.Incidencia = "DI";
                    dia.TipoIncidencia = "dia inhabil";
                }
            }

            return calendarioBase;
        }

        private async Task<List<CalendarioGrupoDiaDto>> AgregarIncidenciasGrupoAsync(
            List<CalendarioGrupoDiaDto> calendarioBase, List<int> usuarioIds, DateTime fechaInicio, DateTime fechaFin)
        {
            var fechaInicioOnly = DateOnly.FromDateTime(fechaInicio);
            var fechaFinOnly = DateOnly.FromDateTime(fechaFin);

            // Obtener todas las incidencias del grupo en el rango de fechas
            var vacaciones = await _db.VacacionesProgramadas
                .Where(v => usuarioIds.Contains(v.EmpleadoId) &&
                           v.FechaVacacion >= fechaInicioOnly && v.FechaVacacion <= fechaFinOnly &&
                           v.EstadoVacacion == "Activa")
                .GroupBy(v => v.FechaVacacion)
                .Select(g => new { Fecha = g.Key, Count = g.Count() })
                .ToListAsync();

            var incidencias = await _db.IncidenciasOPermisos
                .Where(i => usuarioIds.Contains(i.IdUsuarioEmpleado) &&
                           i.Fecha >= fechaInicioOnly && i.Fecha <= fechaFinOnly)
                .GroupBy(i => i.Fecha)
                .Select(g => new { Fecha = g.Key, Count = g.Count() })
                .ToListAsync();

            var diasInhabiles = await _db.DiasInhabiles
                .Where(d => d.Fecha >= fechaInicioOnly && d.Fecha <= fechaFinOnly)
                .ToListAsync();

            // Aplicar incidencias al calendario
            foreach (var dia in calendarioBase)
            {
                var fechaDia = DateOnly.FromDateTime(dia.Fecha);

                // Verificar días inhábiles (prioridad más alta)
                var diaInhabil = diasInhabiles.FirstOrDefault(d => d.Fecha == fechaDia);
                if (diaInhabil != null)
                {
                    dia.Incidencia = "DI";
                    dia.TipoIncidencia = "dia inhabil";
                    continue;
                }

                // Verificar vacaciones
                var vacacion = vacaciones.FirstOrDefault(v => v.Fecha == fechaDia);
                if (vacacion != null)
                {
                    dia.Incidencia = vacacion.Count > 1 ? $"V({vacacion.Count})" : "V";
                    dia.TipoIncidencia = "vacacion";
                    continue;
                }

                // Verificar incidencias/permisos
                var incidencia = incidencias.FirstOrDefault(i => i.Fecha == fechaDia);
                if (incidencia != null)
                {
                    dia.Incidencia = incidencia.Count > 1 ? $"I({incidencia.Count})" : "I";
                    dia.TipoIncidencia = "incidencia";
                }
            }

            return calendarioBase;
        }

    }
}
