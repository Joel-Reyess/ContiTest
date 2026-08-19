-- Coexistencia programación anual / reprogramación (tarea #134)
-- Agrega ConfiguracionVacaciones.AnioProgramacionAnual: el año cuya programación
-- anual se PREPARA (p. ej. 2027) mientras AnioVigente sigue operando (2026).
-- NULL = sin preparación en curso.
--
-- OBLIGATORIO correr este script en FreeTime_Test ANTES de desplegar el backend
-- con este cambio: el modelo EF ya incluye la columna y sin ella todas las
-- consultas a ConfiguracionVacaciones truenan con "Invalid column name".
-- (Producción la necesitará igual cuando esta rama llegue a main.)

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.ConfiguracionVacaciones')
      AND name = 'AnioProgramacionAnual'
)
BEGIN
    ALTER TABLE dbo.ConfiguracionVacaciones
        ADD AnioProgramacionAnual INT NULL;
    PRINT 'Columna AnioProgramacionAnual agregada.';
END
ELSE
    PRINT 'La columna AnioProgramacionAnual ya existe; no se hizo nada.';
