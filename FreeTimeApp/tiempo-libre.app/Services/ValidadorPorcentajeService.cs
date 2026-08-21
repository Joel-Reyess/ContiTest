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

                // Calcular el mínimo de empleados para aplicar el porcentaje
                var minimoEmpleados = CalcularMinimoEmpleadosParaPorcentaje(config.PorcentajeAusenciaMaximo);

                // Obtener total de empleados activos del grupo
                if (!_totalEmpleadosCache.TryGetValue(grupoId, out var totalEmpleados))
                {
                    totalEmpleados = await _db.Users
                        .CountAsync(u => u.GrupoId == grupoId && u.Status == UserStatus.Activo);
                    _totalEmpleadosCache[grupoId] = totalEmpleados;
                }

                // EXCEPCIÓN: Grupos pequeños (menos del mínimo)
                if (totalEmpleados < minimoEmpleados)
                {
                    // Debug y no Information: esto se evalúa una vez por grupo, día
                    // y empleado. Durante la asignación automática del año llenaba el
                    // log con miles de líneas idénticas por segundo —y escribirlas
                    // cuesta E/S justo cuando el proceso ya va pesado.
                    _logger.LogDebug(
                        "Grupo {GrupoId} con {Total} empleados es menor al mínimo ({Minimo}) para aplicar porcentaje. " +
                        "Aplicando regla especial: permitir al menos 1 ausencia",
                        grupoId, totalEmpleados, minimoEmpleados);

                    // Para grupos pequeños: permitir al menos 1 ausencia
                    if (!ausenciasActuales.HasValue)
                    {
                        // Ausencias ya programadas para el día que se evalúa
                        ausenciasActuales = await _db.VacacionesProgramadas
                            .CountAsync(v =>
                                _db.Users.Any(u => u.Id == v.EmpleadoId && u.GrupoId == grupoId) &&
                                v.FechaVacacion == fechaEvaluada &&
                                v.EstadoVacacion == "Activa");
                    }

                    // Permitir la ausencia si actualmente no hay nadie ausente
                    // o si el grupo tiene solo 1 persona (caso especial)
                    return totalEmpleados == 1 || ausenciasActuales.Value == 0;
                }

                // REGLA NORMAL: Grupos grandes usan el porcentaje
                // El manning también se resuelve con la fecha evaluada: la excepción
                // mensual del SuperUsuario es por mes, y al programar el año siguiente
                // la del mes en curso no tiene por qué aplicar.
                var manningArea = await ObtenerManningAplicableAsync(grupo.AreaId, grupo.Area.Manning, fechaEvaluada);
                var manning = manningArea > 0 ? manningArea : totalEmpleados;

                // Calcular cuántos estarían ausentes con la nueva solicitud
                if (!ausenciasActuales.HasValue)
                {
                    ausenciasActuales = await _db.VacacionesProgramadas
                        .CountAsync(v =>
                            _db.Users.Any(u => u.Id == v.EmpleadoId && u.GrupoId == grupoId) &&
                            v.FechaVacacion == fechaEvaluada &&
                            v.EstadoVacacion == "Activa");
                }

                var totalAusencias = ausenciasActuales.Value + ausenciasSolicitadas;
                var disponibles = totalEmpleados - totalAusencias;

                // Calcular porcentaje de déficit
                var porcentajeDeficit = ((decimal)(manning - disponibles) / manning) * 100;

                var resultado = porcentajeDeficit <= config.PorcentajeAusenciaMaximo;

                _logger.LogDebug(
                    "Validación porcentaje Grupo {GrupoId}: Total={Total}, Manning={Manning}, " +
                    "Ausencias={Ausencias}, Déficit={Deficit:F2}%, Máximo={Maximo}%, Resultado={Resultado}",
                    grupoId, totalEmpleados, manning, totalAusencias,
                    porcentajeDeficit, config.PorcentajeAusenciaMaximo, resultado);

                return resultado;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al validar ausencias para grupo {GrupoId}", grupoId);
                return false;
            }
        }

        /// <summary>
        /// Obtiene información detallada sobre el estado de ausencias de un grupo
        /// </summary>
        public async Task<EstadoAusenciasGrupo> ObtenerEstadoAusenciasGrupo(int grupoId)
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

            var hoy = DateOnly.FromDateTime(DateTime.Today);
            var ausenciasActuales = await _db.VacacionesProgramadas
                .CountAsync(v =>
                    _db.Users.Any(u => u.Id == v.EmpleadoId && u.GrupoId == grupoId) &&
                    v.FechaVacacion == hoy &&
                    v.EstadoVacacion == "Activa");

            var minimoEmpleados = CalcularMinimoEmpleadosParaPorcentaje(config.PorcentajeAusenciaMaximo);
            var esGrupoPequeno = totalEmpleados < minimoEmpleados;

            var manningAreaEstado = await ObtenerManningAplicableAsync(grupo.AreaId, grupo.Area.Manning, hoy);
            var manning = manningAreaEstado > 0 ? manningAreaEstado : totalEmpleados;
            var disponibles = totalEmpleados - ausenciasActuales;
            var porcentajeDeficit = manning > 0 ? ((decimal)(manning - disponibles) / manning) * 100 : 0;

            return new EstadoAusenciasGrupo
            {
                GrupoId = grupoId,
                NombreGrupo = grupo.Rol,
                TotalEmpleados = totalEmpleados,
                AusenciasActuales = ausenciasActuales,
                Manning = (int)manning,
                PorcentajeDeficitActual = porcentajeDeficit,
                PorcentajeMaximoPermitido = config.PorcentajeAusenciaMaximo,
                EsGrupoPequeno = esGrupoPequeno,
                MinimoEmpleadosParaPorcentaje = minimoEmpleados,
                PuedeAgregarAusencia = await PuedeGrupoTenerAusencias(grupoId, 1, ausenciasActuales),
                MensajeEstado = esGrupoPequeno
                    ? $"Grupo pequeño: se permite máximo 1 ausencia (tiene {totalEmpleados} empleados, mínimo para porcentaje es {minimoEmpleados})"
                    : $"Déficit actual: {porcentajeDeficit:F2}% de {config.PorcentajeAusenciaMaximo}% máximo"
            };
        }
    }

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