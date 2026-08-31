-- Reporte de días capturados rebasando el porcentaje (punto 5 de "errores
-- durante la captura del 2026" y Validaciones 5 y 6 del punchlist).
--
-- Marca en VacacionesProgramadas los días que el jefe o el superusuario
-- capturaron aun con el grupo por encima del porcentaje permitido, y el
-- porcentaje con el que quedó el grupo ese día.
--
-- OBLIGATORIO correr este script ANTES de desplegar el backend con este
-- cambio: el modelo EF ya incluye las columnas y sin ellas todas las consultas
-- a VacacionesProgramadas truenan con "Invalid column name".
-- Idempotente: se puede repetir sin efecto.

IF COL_LENGTH('dbo.VacacionesProgramadas', 'CapturadoConRebase') IS NULL
BEGIN
    ALTER TABLE dbo.VacacionesProgramadas
        ADD CapturadoConRebase BIT NOT NULL
        CONSTRAINT DF_VacacionesProgramadas_CapturadoConRebase DEFAULT(0);
    PRINT 'Columna CapturadoConRebase agregada.';
END
ELSE
    PRINT 'La columna CapturadoConRebase ya existe; no se hizo nada.';
GO

IF COL_LENGTH('dbo.VacacionesProgramadas', 'PorcentajeAlCapturar') IS NULL
BEGIN
    ALTER TABLE dbo.VacacionesProgramadas
        ADD PorcentajeAlCapturar DECIMAL(5,2) NULL;
    PRINT 'Columna PorcentajeAlCapturar agregada.';
END
ELSE
    PRINT 'La columna PorcentajeAlCapturar ya existe; no se hizo nada.';
GO
