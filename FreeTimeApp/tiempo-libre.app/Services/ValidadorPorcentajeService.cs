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
        private async Task<int> ObtenerManningAplicableAsync(int areaId, int manningBaseArea, DateOnly fecha)
        {
            var excepcion = await _db.ExcepcionesManning
                .Where(e => e.AreaId == areaId &&
                            e.Anio == fecha.Year &&
                            e.Mes == fecha.Month &&
                            e.Activa)
                .Select(e => (int?)e.ManningRequeridoExcepcion)
                .FirstOrDefaultAsync();
            return excepcion ?? manningBaseArea;
        }

        /// <summary>
        /// Valida si un grupo puede tener ausencias respetando el porcentaje configurado
        /// </summary>
        public async Task<bool> PuedeGrupoTenerAusencias(
            int grupoId,
            int ausenciasSolicitadas = 1,
            int? ausenciasActuales = null)
        {
            try
            {
                // Obtener configuración actual
                var config = await _db.ConfiguracionVacaciones
                    .OrderByDescending(c => c.CreatedAt)
                    .FirstOrDefaultAsync();

                if (config == null)
                {
                    _logger.LogWarning("No existe configuración de vacaciones");
                    return false;
                }

                // Obtener información del grupo
                var grupo = await _db.Grupos
                    .Include(g => g.Area)
                    .FirstOrDefaultAsync(g => g.GrupoId == grupoId);

                if (grupo == null)
                {
                    _logger.LogError("Grupo {GrupoId} no encontrado", grupoId);
                    return false;
                }

                // Calcular el mínimo de empleados para aplicar el porcentaje
                var minimoEmpleados = CalcularMinimoEmpleadosParaPorcentaje(config.PorcentajeAusenciaMaximo);

                // Obtener total de empleados activos del grupo
                var totalEmpleados = await _db.Users
                    .CountAsync(u => u.GrupoId == grupoId && u.Status == UserStatus.Activo);

                // EXCEPCIÓN: Grupos pequeños (menos del mínimo)
                if (totalEmpleados < minimoEmpleados)
                {
                    _logger.LogInformation(
                        "Grupo {GrupoId} con {Total} empleados es menor al mínimo ({Minimo}) para aplicar porcentaje. " +
                        "Aplicando regla especial: permitir al menos 1 ausencia",
                        grupoId, totalEmpleados, minimoEmpleados);

                    // Para grupos pequeños: permitir al menos 1 ausencia
                    if (!ausenciasActuales.HasValue)
                    {
                        // Calcular ausencias actuales (vacaciones programadas activas)
                        var hoy = DateOnly.FromDateTime(DateTime.Today);
                        ausenciasActuales = await _db.VacacionesProgramadas
                            .CountAsync(v =>
                                _db.Users.Any(u => u.Id == v.EmpleadoId && u.GrupoId == grupoId) &&
                                v.FechaVacacion == hoy &&
                                v.EstadoVacacion == "Activa");
                    }

                    // Permitir la ausencia si actualmente no hay nadie ausente
                    // o si el grupo tiene solo 1 persona (caso especial)
                    return totalEmpleados == 1 || ausenciasActuales.Value == 0;
                }

                // REGLA NORMAL: Grupos grandes usan el porcentaje
                var hoyManning = DateOnly.FromDateTime(DateTime.Today);
                var manningArea = await ObtenerManningAplicableAsync(grupo.AreaId, grupo.Area.Manning, hoyManning);
                var manning = manningArea > 0 ? manningArea : totalEmpleados;

                // Calcular cuántos estarían ausentes con la nueva solicitud
                if (!ausenciasActuales.HasValue)
                {
                    var hoy = DateOnly.FromDateTime(DateTime.Today);
                    ausenciasActuales = await _db.VacacionesProgramadas
                        .CountAsync(v =>
                            _db.Users.Any(u => u.Id == v.EmpleadoId && u.GrupoId == grupoId) &&
                            v.FechaVacacion == hoy &&
                            v.EstadoVacacion == "Activa");
                }

                var totalAusencias = ausenciasActuales.Value + ausenciasSolicitadas;
                var disponibles = totalEmpleados - totalAusencias;

                // Calcular porcentaje de déficit
                var porcentajeDeficit = ((decimal)(manning - disponibles) / manning) * 100;

                var resultado = porcentajeDeficit <= config.PorcentajeAusenciaMaximo;

                _logger.LogInformation(
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