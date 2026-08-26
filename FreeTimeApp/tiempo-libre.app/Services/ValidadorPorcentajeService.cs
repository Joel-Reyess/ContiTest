using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using tiempo_libre.Models;
using tiempo_libre.Models.Enums;

namespace tiempo_libre.Services
{
    public class ValidadorPorcentajeService
    {
        private readonly FreeTimeDbContext _db;
        private readonly ILogger<ValidadorPorcentajeService> _logger;

        // Memoria de la petición (el servicio es scoped). Nada de esto cambia
        // mientras corre una asignación anual, y releerlo era el grueso de las
        // consultas del paso 3.
        private ConfiguracionVacaciones? _configCache;
        private readonly Dictionary<int, Grupo?> _gruposCache = new();
        private readonly Dictionary<int, int> _totalEmpleadosCache = new();
        private readonly Dictionary<(int AreaId, int Anio, int Mes), decimal?> _manningCache = new();
        private readonly Dictionary<(int GrupoId, DateOnly Fecha), decimal?> _excepcionPorcentajeCache = new();
        private readonly Dictionary<int, List<int>> _gruposPorAreaCache = new();
        private readonly Dictionary<int, int> _totalEmpleadosAreaCache = new();

        public ValidadorPorcentajeService(FreeTimeDbContext db, ILogger<ValidadorPorcentajeService> logger)
        {
            _db = db;
            _logger = logger;
        }

        /// <summary>
        /// Calcula el tamaño mínimo de grupo para poder aplicar el porcentaje de ausencia
        /// </summary>
        /// <param name="porcentajeMaximo">Porcentaje máximo permitido de ausencias</param>
        /// <returns>Número mínimo de empleados para que 1 ausencia no supere el porcentaje</returns>
        public int CalcularMinimoEmpleadosParaPorcentaje(decimal porcentajeMaximo)
        {
            if (porcentajeMaximo <= 0)
                return int.MaxValue; // Si no se permite ausencia, ningún grupo puede tener ausentes

            // Fórmula: Manning = 100 / porcentaje
            // Para que 1 ausencia represente exactamente el porcentaje máximo
            var minimoExacto = 100.0m / porcentajeMaximo;

            // Redondeamos hacia arriba para ser conservadores
            return (int)Math.Ceiling(minimoExacto);
        }

        // Resuelve el manning aplicable a un área para una fecha: respeta la
        // excepción mensual capturada por el SuperUsuario (ExcepcionesManning)
        // antes de caer al Manning base del área. Si nada aplica, retorna 0
        // para que el llamador decida (típicamente fallback a totalEmpleados).
        private async Task<decimal> ObtenerManningAplicableAsync(int areaId, decimal manningBaseArea, DateOnly fecha)
        {
            // La excepción de manning es por área y por MES: dentro de una misma
            // petición basta consultarla una vez por cada combinación.
            var clave = (areaId, fecha.Year, fecha.Month);
            if (_manningCache.TryGetValue(clave, out var memorizado))
                return memorizado ?? manningBaseArea;

            var excepcion = await _db.ExcepcionesManning
                .Where(e => e.AreaId == areaId &&
                            e.Anio == fecha.Year &&
                            e.Mes == fecha.Month &&
                            e.Activa)
                .Select(e => (int?)e.ManningRequeridoExcepcion)
                .FirstOrDefaultAsync();

            _manningCache[clave] = excepcion.HasValue ? (decimal)excepcion.Value : (decimal?)null;
            return excepcion ?? manningBaseArea;
        }

        /// <summary>
        /// Empleados DISTINTOS del grupo ausentes ese día: vacaciones programadas
        /// activas (días de empresa y días capturados por el operador viven en la
        /// misma tabla), permisos e incapacidades de SAP vigentes ese día y
        /// descansos compensatorios de festivo trabajado ya aprobados.
        ///
        /// Antes esta cuenta solo miraba VacacionesProgramadas, así que el permiso
        /// que bloquea la captura no consideraba incapacidades ni permisos: el
        /// tablero mostraba el grupo al tope —ese sí los suma— y aun así la app
        /// dejaba capturar. Es el "no consolidó el mismo porcentaje" del reporte
        /// de 2026.
        ///
        /// Se cuentan empleados y no renglones: un operador con vacación capturada
        /// en la app y su fila 1100 exportada por SAP aparecería dos veces.
        /// </summary>
        private Task<int> ContarAusentesDelGrupoAsync(int grupoId, DateOnly fecha)
            => ContarAusentesAsync(new[] { grupoId }, fecha);

        private async Task<int> ContarAusentesAsync(IReadOnlyCollection<int> grupoIds, DateOnly fecha)
        {
            if (grupoIds.Count == 0) return 0;

            var usuariosDeLosGrupos = _db.Users
                .Where(u => u.GrupoId.HasValue && grupoIds.Contains(u.GrupoId.Value)
                            && u.Status == UserStatus.Activo);

            var porVacaciones = await _db.VacacionesProgramadas
                .Where(v => v.FechaVacacion == fecha && v.EstadoVacacion == "Activa")
                .Where(v => usuariosDeLosGrupos.Any(u => u.Id == v.EmpleadoId))
                .Select(v => v.EmpleadoId)
                .Distinct()
                .ToListAsync();

            // Mismo criterio que AusenciaService: las filas que vienen del Excel no
            // llevan FechaSolicitud; las capturadas en la app solo cuentan aprobadas.
            var porPermisos = await _db.PermisosEIncapacidadesSAP
                .Where(p => p.Desde <= fecha && p.Hasta >= fecha
                            && (p.FechaSolicitud == null || p.EstadoSolicitud == "Aprobada"))
                .Join(usuariosDeLosGrupos,
                      p => p.Nomina,
                      u => u.Nomina,
                      (p, u) => u.Id)
                .Distinct()
                .ToListAsync();

            var porFestivos = await _db.SolicitudesFestivosTrabajados
                .Where(f => f.FechaNuevaSolicitada == fecha && f.EstadoSolicitud == "Aprobada")
                .Where(f => usuariosDeLosGrupos.Any(u => u.Id == f.EmpleadoId))
                .Select(f => f.EmpleadoId)
                .Distinct()
                .ToListAsync();

            var ausentes = new HashSet<int>(porVacaciones);
            ausentes.UnionWith(porPermisos);
            ausentes.UnionWith(porFestivos);
            return ausentes.Count;
        }

        /// <summary>
        /// Porcentaje máximo que aplica a un grupo en una fecha: la excepción
        /// capturada para ese grupo y día (ExcepcionesPorcentaje) manda sobre el
        /// porcentaje global de ConfiguracionVacaciones.
        ///
        /// El tablero de ausencias ya respetaba estas excepciones; el candado no,
        /// así que el jefe veía el día "abierto" por la excepción y la app lo
        /// rechazaba al guardar (o al revés).
        /// </summary>
        private async Task<decimal> ObtenerPorcentajeMaximoAsync(int grupoId, DateOnly fecha, decimal porcentajeGlobal)
        {
            var clave = (grupoId, fecha);
            if (!_excepcionPorcentajeCache.TryGetValue(clave, out var excepcion))
            {
                excepcion = await _db.ExcepcionesPorcentaje
                    .Where(e => e.GrupoId == grupoId && e.Fecha == fecha)
                    .Select(e => (decimal?)e.PorcentajeMaximoPermitido)
                    .FirstOrDefaultAsync();
                _excepcionPorcentajeCache[clave] = excepcion;
            }
            return excepcion ?? porcentajeGlobal;
        }

        /// <summary>
        /// LA regla del porcentaje, sin base de datos, para que el candado (aquí),
        /// el tablero de ausencias y el semáforo del calendario contesten lo mismo
        /// con los mismos números.
        ///
        /// Grupos con menos del mínimo (100 / porcentaje, redondeado hacia arriba):
        /// se permite UNA sola ausencia por día; un grupo de una persona siempre
        /// puede. Grupos del mínimo en adelante: los ausentes —los que ya están
        /// más los que se piden— no pueden pasar del porcentaje máximo de la
        /// plantilla activa del grupo. Vacaciones de empresa, vacaciones capturadas
        /// y permisos entran todos en la misma cuenta.
        ///
        /// Antes el candado medía el déficit contra el manning del ÁREA
        /// ((manning − disponibles del grupo) / manning): en un área con varios
        /// grupos el manning del área es mayor que la plantilla de cualquiera de
        /// sus grupos, así que el déficit salía enorme y ningún día se abría; y en
        /// un área con manning menor que su grupo salía negativo y todo se abría.
        /// El tablero, en cambio, medía ausentes / plantilla del grupo. Por eso la
        /// vista y el candado no se ponían de acuerdo.
        /// </summary>
        public EvaluacionRegla EvaluarRegla(int totalEmpleados, int ausentesActuales, int ausenciasSolicitadas, decimal porcentajeMaximo)
        {
            var minimo = CalcularMinimoEmpleadosParaPorcentaje(porcentajeMaximo);
            var totalAusencias = ausentesActuales + ausenciasSolicitadas;

            if (totalEmpleados <= 0)
                return new EvaluacionRegla(false, 0m, false, minimo, "El grupo no tiene empleados activos");

            if (totalEmpleados < minimo)
            {
                var permitido = totalEmpleados == 1 || totalAusencias <= 1;
                var pct = Math.Round((decimal)totalAusencias / totalEmpleados * 100m, 2);
                return new EvaluacionRegla(permitido, pct, true, minimo,
                    permitido
                        ? $"Grupo pequeño ({totalEmpleados} < {minimo}): se permite máximo 1 ausencia por día"
                        : $"Grupo pequeño ({totalEmpleados} < {minimo}): ya hay {ausentesActuales} ausente(s) y solo se permite 1 por día");
            }

            var porcentaje = Math.Round((decimal)totalAusencias / totalEmpleados * 100m, 2);
            var ok = porcentaje <= porcentajeMaximo;
            return new EvaluacionRegla(ok, porcentaje, false, minimo,
                ok
                    ? $"{totalAusencias} de {totalEmpleados} ausentes = {porcentaje:F2}% (máximo {porcentajeMaximo}%)"
                    : $"{totalAusencias} de {totalEmpleados} ausentes = {porcentaje:F2}% supera el máximo de {porcentajeMaximo}%");
        }

        /// <summary>
        /// Valida si un grupo puede tener ausencias respetando el porcentaje configurado
        /// </summary>
        /// <param name="fecha">
        /// Día que se está evaluando. Sin esta fecha el cálculo se hacía siempre
        /// contra "hoy": al programar el año siguiente, las 365 respuestas eran la
        /// foto del día de la corrida, y si el grupo estaba al tope ese día la
        /// asignación de días por empresa no encontraba ninguna semana viable.
        /// </param>
        public async Task<bool> PuedeGrupoTenerAusencias(
            int grupoId,
            int ausenciasSolicitadas = 1,
            int? ausenciasActuales = null,
            DateOnly? fecha = null)
        {
            try
            {
                var fechaEvaluada = fecha ?? DateOnly.FromDateTime(DateTime.Today);

                // La configuración, el grupo y su plantilla no cambian mientras dura
                // la petición, pero se releían en CADA validación: durante la
                // asignación anual son tres consultas por empleado, por día y por
                // semana candidata. El servicio es scoped, así que recordarlas aquí
                // vive lo que vive la petición.
                var config = _configCache ??= await _db.ConfiguracionVacaciones
                    .OrderByDescending(c => c.CreatedAt)
                    .FirstOrDefaultAsync();

                if (config == null)
                {
                    _logger.LogWarning("No existe configuración de vacaciones");
                    return false;
                }

                if (!_gruposCache.TryGetValue(grupoId, out var grupo))
                {
                    grupo = await _db.Grupos
                        .Include(g => g.Area)
                        .FirstOrDefaultAsync(g => g.GrupoId == grupoId);
                    _gruposCache[grupoId] = grupo;
                }

                if (grupo == null)
                {
                    _logger.LogError("Grupo {GrupoId} no encontrado", grupoId);
                    return false;
                }

                if (!_totalEmpleadosCache.TryGetValue(grupoId, out var totalEmpleados))
                {
                    totalEmpleados = await _db.Users
                        .CountAsync(u => u.GrupoId == grupoId && u.Status == UserStatus.Activo);
                    _totalEmpleadosCache[grupoId] = totalEmpleados;
                }

                var porcentajeMaximo = await ObtenerPorcentajeMaximoAsync(grupoId, fechaEvaluada, config.PorcentajeAusenciaMaximo);

                // Ausencias ya programadas para el día que se evalúa
                ausenciasActuales ??= await ContarAusentesDelGrupoAsync(grupoId, fechaEvaluada);

                var regla = EvaluarRegla(totalEmpleados, ausenciasActuales.Value, ausenciasSolicitadas, porcentajeMaximo);

                // Debug y no Information: esto se evalúa una vez por grupo, día y
                // empleado. Durante la asignación automática del año llenaba el log
                // con miles de líneas idénticas por segundo.
                _logger.LogDebug("Validación porcentaje Grupo {GrupoId} {Fecha}: {Motivo} → {Resultado}",
                    grupoId, fechaEvaluada, regla.Motivo, regla.Permitido);

                if (!regla.Permitido)
                    return false;

                // Segundo candado, ahora sí con el manning: el personal requerido del
                // ÁREA se compara contra los disponibles de TODA el área (todos sus
                // grupos), con la misma tolerancia del porcentaje. Solo aplica si el
                // área tiene manning capturado (o una excepción del mes); con 0 no
                // hay nada contra qué comparar.
                var manningArea = await ObtenerManningAplicableAsync(grupo.AreaId, grupo.Area.Manning, fechaEvaluada);
                if (manningArea > 0)
                {
                    var (totalArea, ausentesArea) = await ContarPlantillaYAusentesDelAreaAsync(grupo.AreaId, fechaEvaluada);
                    var disponiblesArea = totalArea - ausentesArea - ausenciasSolicitadas;
                    var deficit = (manningArea - disponiblesArea) / manningArea * 100m;
                    if (deficit > porcentajeMaximo)
                    {
                        _logger.LogDebug(
                            "Manning Área {AreaId} {Fecha}: requeridos {Manning}, quedarían {Disponibles} de {Total} → déficit {Deficit:F2}% > {Maximo}%",
                            grupo.AreaId, fechaEvaluada, manningArea, disponiblesArea, totalArea, deficit, porcentajeMaximo);
                        return false;
                    }
                }

                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al validar ausencias para grupo {GrupoId}", grupoId);
                return false;
            }
        }

        private async Task<(int Total, int Ausentes)> ContarPlantillaYAusentesDelAreaAsync(int areaId, DateOnly fecha)
        {
            if (!_gruposPorAreaCache.TryGetValue(areaId, out var grupos))
            {
                grupos = await _db.Grupos.Where(g => g.AreaId == areaId).Select(g => g.GrupoId).ToListAsync();
                _gruposPorAreaCache[areaId] = grupos;
            }
            if (!_totalEmpleadosAreaCache.TryGetValue(areaId, out var total))
            {
                total = await _db.Users.CountAsync(u => u.GrupoId.HasValue && grupos.Contains(u.GrupoId.Value)
                                                        && u.Status == UserStatus.Activo);
                _totalEmpleadosAreaCache[areaId] = total;
            }
            // Los ausentes NO se memorizan: dentro de una misma asignación
            // automática cambian cada vez que se guarda un día.
            var ausentes = await ContarAusentesAsync(grupos, fecha);
            return (total, ausentes);
        }

        /// <summary>
        /// Obtiene información detallada sobre el estado de ausencias de un grupo
        /// </summary>
        public async Task<EstadoAusenciasGrupo> ObtenerEstadoAusenciasGrupo(int grupoId, DateOnly? fecha = null)
        {
            var config = await _db.ConfiguracionVacaciones
                .OrderByDescending(c => c.CreatedAt)
                .FirstOrDefaultAsync();

            var grupo = await _db.Grupos
                .Include(g => g.Area)
                .FirstOrDefaultAsync(g => g.GrupoId == grupoId);

            if (config == null || grupo == null)
                return null;

            var totalEmpleados = await _db.Users
                .CountAsync(u => u.GrupoId == grupoId && u.Status == UserStatus.Activo);

            var dia = fecha ?? DateOnly.FromDateTime(DateTime.Today);
            var ausenciasActuales = await ContarAusentesDelGrupoAsync(grupoId, dia);
            var porcentajeMaximo = await ObtenerPorcentajeMaximoAsync(grupoId, dia, config.PorcentajeAusenciaMaximo);
            var estado = EvaluarRegla(totalEmpleados, ausenciasActuales, 0, porcentajeMaximo);

            var manningAreaEstado = await ObtenerManningAplicableAsync(grupo.AreaId, grupo.Area.Manning, dia);

            return new EstadoAusenciasGrupo
            {
                GrupoId = grupoId,
                NombreGrupo = grupo.Rol,
                TotalEmpleados = totalEmpleados,
                AusenciasActuales = ausenciasActuales,
                Manning = (int)manningAreaEstado,
                PorcentajeDeficitActual = estado.PorcentajeResultante,
                PorcentajeMaximoPermitido = porcentajeMaximo,
                EsGrupoPequeno = estado.EsGrupoPequeno,
                MinimoEmpleadosParaPorcentaje = estado.MinimoEmpleados,
                PuedeAgregarAusencia = await PuedeGrupoTenerAusencias(grupoId, 1, ausenciasActuales, dia),
                MensajeEstado = estado.Motivo
            };
        }
    }

    /// <summary>Resultado de EvaluarRegla: la misma respuesta para el candado y para las vistas.</summary>
    public sealed record EvaluacionRegla(
        bool Permitido,
        decimal PorcentajeResultante,
        bool EsGrupoPequeno,
        int MinimoEmpleados,
        string Motivo);

    public class EstadoAusenciasGrupo
    {
        public int GrupoId { get; set; }
        public string NombreGrupo { get; set; }
        public int TotalEmpleados { get; set; }
        public int AusenciasActuales { get; set; }
        public int Manning { get; set; }
        public decimal PorcentajeDeficitActual { get; set; }
        public decimal PorcentajeMaximoPermitido { get; set; }
        public bool EsGrupoPequeno { get; set; }
        public int MinimoEmpleadosParaPorcentaje { get; set; }
        public bool PuedeAgregarAusencia { get; set; }
        public string MensajeEstado { get; set; }
    }
}