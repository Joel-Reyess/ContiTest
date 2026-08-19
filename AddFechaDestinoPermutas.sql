-- Permuta individual con cambio de día (papeleta GT-67 de dos fechas)
-- Agrega Permutas.FechaDestino: fecha a la que el empleado se presentará a
-- laborar cuando el cambio individual se mueve de día (la papeleta trae
-- "fecha del rol" y "fecha del cambio"). NULL = cambio del mismo día (solo
-- turno) o permuta hombre por hombre.
--
-- OBLIGATORIO correr este script en FreeTime_Test ANTES de desplegar el
-- backend con este cambio: el modelo EF ya incluye la columna y sin ella
-- todas las consultas a Permutas truenan con "Invalid column name".
-- (Producción la necesitará igual cuando esta rama llegue a main.)

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.Permutas')
      AND name = 'FechaDestino'
)
BEGIN
    ALTER TABLE dbo.Permutas
        ADD FechaDestino DATE NULL;
    PRINT 'Columna FechaDestino agregada.';
END
ELSE
    PRINT 'La columna FechaDestino ya existe; no se hizo nada.';
