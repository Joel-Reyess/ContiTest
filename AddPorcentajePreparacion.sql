-- =====================================================================
-- Porcentaje de ausencia propio para el AÑO EN PREPARACIÓN
-- (ConfiguracionVacaciones.PorcentajeAusenciaPreparacion).
--
-- Por qué: el porcentaje máximo de ausencia era uno solo para todo el
-- sistema. Al ajustarlo para que el año que se prepara (p. ej. 2027)
-- pudiera repartir sus días de empresa, el año vigente (2026) se quedaba
-- corriendo con ese mismo valor, y su captura y su reprogramación se
-- validaban contra un número pensado para otro año.
--
-- Qué hace: agrega la columna, NULL para todos. NULL significa "ese año
-- usa el porcentaje general", que es exactamente el comportamiento de
-- hoy: al correr este script nada cambia hasta que alguien capture un
-- porcentaje para el año en preparación desde la pantalla.
--
-- OBLIGATORIO correrlo ANTES de desplegar el backend con este cambio: el
-- modelo EF ya trae la columna y sin ella toda consulta a
-- ConfiguracionVacaciones truena con "Invalid column name", y esa tabla
-- la lee prácticamente todo el sistema.
--
-- Idempotente. Después corre VerificarEsquemaBD.sql.
-- =====================================================================

IF COL_LENGTH('dbo.ConfiguracionVacaciones', 'PorcentajeAusenciaPreparacion') IS NULL
BEGIN
    ALTER TABLE dbo.ConfiguracionVacaciones
        ADD PorcentajeAusenciaPreparacion DECIMAL(5,2) NULL;
    PRINT 'Columna PorcentajeAusenciaPreparacion agregada.';
END
ELSE
    PRINT 'La columna PorcentajeAusenciaPreparacion ya existe; no se hizo nada.';
GO

SELECT Id, PeriodoActual, AnioVigente, AnioProgramacionAnual,
       PorcentajeAusenciaMaximo, PorcentajeAusenciaPreparacion
FROM dbo.ConfiguracionVacaciones
ORDER BY Id DESC;
GO
