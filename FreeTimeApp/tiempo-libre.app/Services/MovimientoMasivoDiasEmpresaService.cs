using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using tiempo_libre.DTOs;
using tiempo_libre.Helpers;
using tiempo_libre.Models;
using tiempo_libre.Models.Enums;

namespace tiempo_libre.Services
{
    /// <summary>
    /// Mover en lote días asignados por la empresa con un machote (nov-2026,
    /// reunión con Román/Maricela). Ejemplo: un domingo se declara no laborable
    /// (paro, falta de luz) y los operadores que ya tenían ahí su día por la
    /// empresa se reparten entre lunes, martes y miércoles. El superusuario sube el
    /// Excel (nómina, día actual, fecha nueva), ve renglón por renglón qué se puede
    /// mover y por qué no, y aplica.
    ///
    /// Cada movimiento hace lo mismo que la reprogramación de día empresa ya
    /// aprobada: la vacación pasa a la fecha nueva como "DiaEmpresaReprogramado"
    /// (C en el rol semanal) y queda un registro aprobado en
    /// SolicitudesReprogramacionDiaEmpresa (motivo "Otro" + el motivo escrito), así
    /// aparece en el historial y en el reporte de días reprogramados. No necesita
    /// tablas nuevas.
    /// </summary>
    public class MovimientoMasivoDiasEmpresaService
    {
        public const int MaximoRenglones = 3000;
        private static readonly string[] TiposEmpresa = { "Automatica", "AsignadaAutomaticamente", ReprogramacionDiaEmpresaService.TipoVacacionReprogramado };
        private static readonly string[] FormatosFecha = { "yyyy-MM-dd", "dd/MM/yyyy", "d/M/yyyy", "dd-MM-yyyy", "d-M-yyyy" };

        private readonly FreeTimeDbContext _db;
        private readonly ValidadorPorcentajeService _validador;
        private readonly ILogger<MovimientoMasivoDiasEmpresaService> _logger;

        public MovimientoMasivoDiasEmpresaService(FreeTimeDbContext db, ValidadorPorcentajeService validador,
            ILogger<MovimientoMasivoDiasEmpresaService> logger)
        {
            _db = db;
            _validador = validador;
            _logger = logger;
        }

        /// <summary>Lo que se movería, sin tocar nada.</summary>
        public async Task<ApiResponse<ResultadoMovimientoMasivoDto>> ValidarAsync(MovimientoMasivoDiasEmpresaRequest req)
        {
            var error = Revisar(req);
            if (error != null) return new ApiResponse<ResultadoMovimientoMasivoDto>(false, null, error);
            var evaluados = await EvaluarAsync(req.Renglones);
            return new ApiResponse<ResultadoMovimientoMasivoDto>(true, Resumir(evaluados.Select(e => e.Resultado).ToList()), null);
        }

        /// <summary>Vuelve a revisar todo y mueve los renglones listos (y, si se pide, los de advertencia).</summary>
        public async Task<ApiResponse<ResultadoMovimientoMasivoDto>> AplicarAsync(MovimientoMasivoDiasEmpresaRequest req, int usuarioId)
        {
            var error = Revisar(req);
            if (error != null) return new ApiResponse<ResultadoMovimientoMasivoDto>(false, null, error);
            var motivo = string.IsNullOrWhiteSpace(req.Motivo) ? null : req.Motivo.Trim();
            if (motivo == null)
                return new ApiResponse<ResultadoMovimientoMasivoDto>(false, null, "Escribe el motivo del movimiento (queda en el historial).");

            using var tx = await _db.Database.BeginTransactionAsync();
            try
            {
                var evaluados = await EvaluarAsync(req.Renglones);
                var aplicar = evaluados
                    .Where(e => e.VacacionId.HasValue &&
                                (e.Resultado.Estado == "Listo" || (req.IncluirAdvertencias && e.Resultado.Estado == "Advertencia")))
                    .ToList();

                var ids = aplicar.Select(e => e.VacacionId!.Value).ToList();
                var vacaciones = await _db.VacacionesProgramadas.Where(v => ids.Contains(v.Id)).ToDictionaryAsync(v => v.Id);
                var ahora = DateTime.UtcNow;
                var justificacion = $"Movimiento con machote: {motivo}";
                if (justificacion.Length > 500) justificacion = justificacion[..500];

                foreach (var e in aplicar)
                {
                    var vac = vacaciones[e.VacacionId!.Value];
                    var original = vac.FechaVacacion;
                    vac.FechaVacacion = e.FechaNueva;
                    vac.TipoVacacion = ReprogramacionDiaEmpresaService.TipoVacacionReprogramado;
                    vac.UpdatedAt = ahora;
                    vac.UpdatedBy = usuarioId > 0 ? usuarioId : null;
                    var obs = $"Movimiento con machote: {original:yyyy-MM-dd} → {e.FechaNueva:yyyy-MM-dd} ({motivo})";
                    vac.Observaciones = obs.Length > 500 ? obs[..500] : obs;

                    _db.SolicitudesReprogramacionDiaEmpresa.Add(new SolicitudReprogramacionDiaEmpresa
                    {
                        EmpleadoId = vac.EmpleadoId,
                        VacacionOriginalId = vac.Id,
                        FechaOriginal = original,
                        FechaNueva = e.FechaNueva,
                        MotivoTipo = MotivosReprogramacionDiaEmpresa.Otro,
                        Justificacion = justificacion,
                        EstadoSolicitud = "Aprobada",
                        JefeAreaId = e.JefeAreaId,
                        SolicitadoPorId = usuarioId,
                        AprobadoPorId = usuarioId,
                        FechaSolicitud = ahora,
                        FechaRespuesta = ahora,
                        CreatedAt = ahora,
                    });
                    e.Resultado.Estado = "Aplicado";
                }
                foreach (var e in evaluados.Where(x => x.Resultado.Estado != "Aplicado"))
                {
                    e.Resultado.Mensaje = e.Resultado.Estado == "Advertencia"
                        ? $"{e.Resultado.Mensaje} No se movió (no se marcó aplicar los que rebasan)."
                        : e.Resultado.Mensaje;
                    e.Resultado.Estado = "Omitido";
                }

                await _db.SaveChangesAsync();
                await tx.CommitAsync();

                var resumen = Resumir(evaluados.Select(e => e.Resultado).ToList());
                resumen.Aplicados = aplicar.Count;
                _logger.LogWarning("Movimiento masivo de días por la empresa por usuario {Usuario}: {Aplicados} de {Total} renglones ({Motivo})",
                    usuarioId, aplicar.Count, evaluados.Count, motivo);
                return new ApiResponse<ResultadoMovimientoMasivoDto>(true, resumen, null);
            }
            catch (Exception ex)
            {
                await tx.RollbackAsync();
                _logger.LogError(ex, "Error en el movimiento masivo de días por la empresa");
                return new ApiResponse<ResultadoMovimientoMasivoDto>(false, null, "No se movió nada: " + ex.GetBaseException().Message);
            }
        }

        private static string? Revisar(MovimientoMasivoDiasEmpresaRequest req)
        {
            if (req.Renglones == null || req.Renglones.Count == 0) return "El machote no trae renglones con fecha nueva.";
            if (req.Renglones.Count > MaximoRenglones) return $"Son demasiados renglones ({req.Renglones.Count}); el máximo es {MaximoRenglones} por archivo.";
            return null;
        }

        private static ResultadoMovimientoMasivoDto Resumir(List<ResultadoRenglonMovimientoDto> renglones) => new()
        {
            Renglones = renglones,
            Listos = renglones.Count(r => r.Estado == "Listo"),
            Advertencias = renglones.Count(r => r.Estado == "Advertencia"),
            Errores = renglones.Count(r => r.Estado == "Error"),
        };

        private sealed class Evaluado
        {
            public ResultadoRenglonMovimientoDto Resultado { get; init; } = null!;
            public int? VacacionId { get; set; }
            public DateOnly FechaNueva { get; set; }
            public int? JefeAreaId { get; set; }
        }

        private static DateOnly? LeerFecha(string? s)
        {
            if (string.IsNullOrWhiteSpace(s)) return null;
            var t = s.Trim();
            if (t.Length > 10 && t[10] == 'T') t = t[..10];
            return DateOnly.TryParseExact(t, FormatosFecha, CultureInfo.InvariantCulture, DateTimeStyles.None, out var f) ? f : null;
        }

        /// <summary>
        /// Revisa cada renglón contra lo mismo que la asignación de días por la
        /// empresa: que exista ese día por la empresa, que la fecha nueva sea del
        /// mismo año, no sea inhábil, ni domingo/sábado no laborable, ni descanso de
        /// su rol, que ese día no tenga ya vacación, permiso o incapacidad, y avisa si
        /// el grupo rebasa su % (contando los que el mismo archivo mete ese día).
        /// </summary>
        private async Task<List<Evaluado>> EvaluarAsync(List<RenglonMovimientoDiaEmpresa> renglones)
        {
            var lista = renglones.Select(r => new
            {
                r,
                Actual = LeerFecha(r.FechaActual),
                Nueva = LeerFecha(r.FechaNueva),
            }).ToList();

            var nominas = lista.Where(x => x.r.Nomina.HasValue).Select(x => x.r.Nomina!.Value).Distinct().ToList();
            var empleados = (await _db.Users.AsNoTracking()
                    .Include(u => u.Grupo!).ThenInclude(g => g.Area)
                    .Where(u => u.Nomina != null && nominas.Contains(u.Nomina.Value))
                    .ToListAsync())
                .GroupBy(u => u.Nomina!.Value)
                .ToDictionary(g => g.Key, g => g.OrderByDescending(u => u.Status == UserStatus.Activo).First());

            var fechas = lista.SelectMany(x => new[] { x.Actual, x.Nueva }).Where(f => f.HasValue).Select(f => f!.Value).ToList();
            var desde = fechas.Count > 0 ? fechas.Min() : DateOnly.MinValue;
            var hasta = fechas.Count > 0 ? fechas.Max() : DateOnly.MinValue;
            var empIds = empleados.Values.Select(u => u.Id).ToList();

            var vacaciones = fechas.Count == 0 ? new List<VacacionesProgramadas>() : await _db.VacacionesProgramadas.AsNoTracking()
                .Where(v => empIds.Contains(v.EmpleadoId) && v.EstadoVacacion == "Activa" &&
                            v.FechaVacacion >= desde && v.FechaVacacion <= hasta)
                .ToListAsync();
            var vacIds = vacaciones.Select(v => v.Id).ToList();
            var conReprogramacionPendiente = (await _db.SolicitudesReprogramacionDiaEmpresa.AsNoTracking()
                .Where(s => vacIds.Contains(s.VacacionOriginalId) && s.EstadoSolicitud == "Pendiente")
                .Select(s => s.VacacionOriginalId).ToListAsync()).ToHashSet();
            var conEdicionPendiente = (await _db.SolicitudesEdicionDiasEmpresa.AsNoTracking()
                .Where(s => vacIds.Contains(s.VacacionOriginalId) && s.EstadoSolicitud == "Pendiente")
                .Select(s => s.VacacionOriginalId).ToListAsync()).ToHashSet();

            var fechasNuevas = lista.Where(x => x.Nueva.HasValue).Select(x => x.Nueva!.Value).Distinct().ToList();
            var inhabiles = (await _db.DiasInhabiles.AsNoTracking()
                .Where(d => fechasNuevas.Contains(d.Fecha)).Select(d => d.Fecha).ToListAsync()).ToHashSet();
            var anios = fechasNuevas.Select(f => f.Year).Distinct().ToList();
            var semanaSanta = new Dictionary<int, DateOnly?>();
            foreach (var anio in anios)
                semanaSanta[anio] = await _db.DiasInhabiles.AsNoTracking()
                    .Where(d => d.Detalles.Contains("Semana Santa") && d.FechaFinal.Year == anio)
                    .OrderByDescending(d => d.FechaFinal)
                    .Select(d => (DateOnly?)d.FechaFinal)
                    .FirstOrDefaultAsync();

            var noLaborables = await new CalendarioLaboralService(_db)
                .PrecargarAsync(empleados.Values.Where(u => u.GrupoId.HasValue).Select(u => u.GrupoId!.Value));

            // Permisos e incapacidades: esos días la persona ya no está (igual que la asignación).
            var permisos = fechas.Count == 0 ? new List<(int Nomina, DateOnly Desde, DateOnly Hasta)>() :
                (await _db.PermisosEIncapacidadesSAP.AsNoTracking()
                    .Where(p => nominas.Contains(p.Nomina) && p.Desde <= hasta && p.Hasta >= desde &&
                                (p.FechaSolicitud == null || p.EstadoSolicitud == "Aprobada" || p.EstadoSolicitud == "Aprobado") &&
                                (p.ClAbPre != 1100 || p.Dias == null || p.Dias > 0))
                    .Select(p => new { p.Nomina, p.Desde, p.Hasta })
                    .ToListAsync())
                .Select(p => (p.Nomina, p.Desde, p.Hasta)).ToList();

            var vacacionesUsadas = new HashSet<int>();
            var destinosDelArchivo = new HashSet<(int EmpleadoId, DateOnly Fecha)>();
            var entranAlGrupo = new Dictionary<(int GrupoId, DateOnly Fecha), int>();
            var resultado = new List<Evaluado>();

            foreach (var x in lista)
            {
                var res = new ResultadoRenglonMovimientoDto
                {
                    Renglon = x.r.Renglon,
                    Nomina = x.r.Nomina,
                    FechaActual = x.Actual?.ToString("yyyy-MM-dd") ?? x.r.FechaActual,
                    FechaNueva = x.Nueva?.ToString("yyyy-MM-dd") ?? x.r.FechaNueva,
                };
                var ev = new Evaluado { Resultado = res };
                resultado.Add(ev);
                void Falla(string m) { res.Estado = "Error"; res.Mensaje = m; }

                if (!x.r.Nomina.HasValue) { Falla("Falta la nómina."); continue; }
                if (!empleados.TryGetValue(x.r.Nomina.Value, out var emp)) { Falla("No existe un empleado con esa nómina."); continue; }
                res.Nombre = emp.FullName;
                res.Grupo = emp.Grupo?.Rol;
                res.Area = emp.Grupo?.Area?.NombreGeneral;
                ev.JefeAreaId = emp.Grupo?.Area?.JefeId;
                if (emp.Status != UserStatus.Activo) { Falla("El empleado no está activo."); continue; }
                if (emp.GrupoId == null || emp.Grupo == null) { Falla("El empleado no tiene grupo."); continue; }
                if (!x.Actual.HasValue) { Falla("No se pudo leer el día por la empresa actual (usa dd/mm/aaaa)."); continue; }
                if (!x.Nueva.HasValue) { Falla("No se pudo leer la fecha nueva (usa dd/mm/aaaa)."); continue; }
                var actual = x.Actual.Value;
                var nueva = x.Nueva.Value;
                ev.FechaNueva = nueva;
                if (nueva == actual) { Falla("La fecha nueva es la misma que la actual."); continue; }
                if (nueva.Year != actual.Year) { Falla($"La fecha nueva debe ser del mismo año ({actual.Year})."); continue; }

                var vac = vacaciones.FirstOrDefault(v => v.EmpleadoId == emp.Id && v.FechaVacacion == actual && TiposEmpresa.Contains(v.TipoVacacion));
                if (vac == null)
                {
                    var otra = vacaciones.FirstOrDefault(v => v.EmpleadoId == emp.Id && v.FechaVacacion == actual);
                    Falla(otra != null
                        ? $"El {actual:dd/MM/yyyy} no es día por la empresa (es {otra.TipoVacacion}); solo se mueven días por la empresa."
                        : $"No tiene día por la empresa activo el {actual:dd/MM/yyyy}.");
                    continue;
                }
                if (!vacacionesUsadas.Add(vac.Id)) { Falla("Renglón repetido: ese día ya se mueve en otro renglón del archivo."); continue; }
                if (conReprogramacionPendiente.Contains(vac.Id)) { Falla("Ese día tiene una solicitud de reprogramación pendiente: resuélvela primero."); continue; }
                if (conEdicionPendiente.Contains(vac.Id)) { Falla("Ese día tiene una solicitud de edición de días pendiente: resuélvela primero."); continue; }

                if (inhabiles.Contains(nueva)) { Falla($"El {nueva:dd/MM/yyyy} es día inhábil."); continue; }
                var motivoNl = noLaborables.Motivo(emp.GrupoId.Value, nueva);
                if (motivoNl != null) { Falla(motivoNl); continue; }
                if (!string.IsNullOrEmpty(emp.Grupo.Rol))
                {
                    var turno = TurnosHelper.ObtenerTurnoParaFecha(emp.Grupo.Rol, nueva, semanaSanta.GetValueOrDefault(nueva.Year));
                    if (TurnosHelper.EsDescanso(turno)) { Falla($"El {nueva:dd/MM/yyyy} es su descanso por rol."); continue; }
                }
                var yaTiene = vacaciones.FirstOrDefault(v => v.EmpleadoId == emp.Id && v.FechaVacacion == nueva && v.Id != vac.Id);
                if (yaTiene != null) { Falla($"Ya tiene {yaTiene.TipoVacacion} el {nueva:dd/MM/yyyy}."); continue; }
                if (!destinosDelArchivo.Add((emp.Id, nueva))) { Falla("Otro renglón del archivo ya le pone un día en esa misma fecha."); continue; }
                if (permisos.Any(p => p.Nomina == x.r.Nomina.Value && p.Desde <= nueva && nueva <= p.Hasta))
                { Falla($"Tiene permiso o incapacidad el {nueva:dd/MM/yyyy}."); continue; }

                ev.VacacionId = vac.Id;
                var clave = (emp.GrupoId.Value, nueva);
                var entran = entranAlGrupo.GetValueOrDefault(clave) + 1;
                entranAlGrupo[clave] = entran;
                if (!await _validador.PuedeGrupoTenerAusencias(emp.GrupoId.Value, entran, null, nueva, ContextoLimite.Empresa))
                {
                    res.Estado = "Advertencia";
                    res.Mensaje = $"Con este movimiento el grupo {emp.Grupo.Rol} rebasa su % de ausencia el {nueva:dd/MM/yyyy}.";
                }
                else
                {
                    res.Estado = "Listo";
                    res.Mensaje = vac.TipoVacacion == ReprogramacionDiaEmpresaService.TipoVacacionReprogramado
                        ? "Se mueve (ya era un día reprogramado)."
                        : null;
                }
            }
            return resultado;
        }
    }
}
