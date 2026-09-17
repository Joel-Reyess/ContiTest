using tiempo_libre.Models;

namespace tiempo_libre.Helpers
{
    /// <summary>
    /// Qué porcentaje máximo de ausencia rige un año.
    ///
    /// El porcentaje era uno solo para todo el sistema. Cuando se ajustaba para
    /// que el año que se está preparando pudiera repartir sus días de empresa,
    /// el año vigente se quedaba corriendo con ese mismo valor: la captura y la
    /// reprogramación del año en curso se validaban contra un número pensado
    /// para otro año.
    ///
    /// Regla: si el año consultado es el que está en preparación y ese año tiene
    /// su propio porcentaje, manda ese; si no, el general.
    ///
    /// Las excepciones por grupo y día (ExcepcionesPorcentaje) siguen mandando
    /// sobre este valor: se resuelven antes, en cada servicio.
    /// </summary>
    public static class PorcentajeAusenciaHelper
    {
        /// <summary>Se usa cuando no hay configuración cargada.</summary>
        public const decimal PorOmision = 4.5m;

        public static decimal ParaAnio(ConfiguracionVacaciones? config, int anio)
        {
            if (config == null) return PorOmision;

            var esElAnioEnPreparacion =
                config.AnioProgramacionAnual.HasValue &&
                config.AnioProgramacionAnual.Value == anio;

            if (esElAnioEnPreparacion &&
                config.PorcentajeAusenciaPreparacion.HasValue &&
                config.PorcentajeAusenciaPreparacion.Value > 0)
            {
                return config.PorcentajeAusenciaPreparacion.Value;
            }

            return config.PorcentajeAusenciaMaximo > 0
                ? config.PorcentajeAusenciaMaximo
                : PorOmision;
        }
    }
}
