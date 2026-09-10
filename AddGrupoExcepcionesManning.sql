-- =====================================================================
-- Manning por GRUPO, además del de área (ExcepcionesManning.GrupoId).
--
-- Por qué: la excepción de manning sólo existía por (área, año, mes).
-- Desde el calendario de Ingeniería Industrial, aunque se dejara marcado
-- un solo grupo, el ajuste se guardaba para TODA el área y cambiaba el
-- manning de todos sus grupos.
--
-- Qué hace:
--   1. Agrega GrupoId INT NULL. NULL = excepción de toda el área, que es
--      exactamente lo que había: las filas existentes quedan igual.
--   2. FK a Grupos.
--   3. Quita el índice único viejo (AreaId, Anio, Mes), que no dejaría
--      guardar la de un grupo en el mismo mes que la del área.
--   4. Crea un único FILTRADO (AreaId, GrupoId, Anio, Mes) WHERE Activa = 1.
--      El filtro además arregla que, tras "eliminar" (desactivar) una
--      excepción, no se pudiera volver a crear la del mismo mes.
--
-- OBLIGATORIO correrlo ANTES de desplegar el backend con este cambio: el
-- modelo EF ya trae la columna y sin ella toda consulta a
-- ExcepcionesManning truena con "Invalid column name 'GrupoId'" — y esa
-- tabla la leen el calendario, los tableros y el candado de captura.
--
-- Idempotente: se puede correr las veces que sea. Después, corre
-- VerificarEsquemaBD.sql: las dos filas de ExcepcionesManning deben salir 'ok'.
-- =====================================================================

-- Un índice filtrado exige estas dos opciones al crearlo (SSMS ya las trae
-- encendidas; sqlcmd no).
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- 1) Columna GrupoId
IF COL_LENGTH('dbo.ExcepcionesManning', 'GrupoId') IS NULL
BEGIN
    ALTER TABLE dbo.ExcepcionesManning ADD GrupoId INT NULL;
    PRINT 'Columna GrupoId agregada.';
END
ELSE
    PRINT 'La columna GrupoId ya existe; no se hizo nada.';
GO

-- 2) FK a Grupos
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys
               WHERE name = 'FK_ExcepcionesManning_Grupos_GrupoId')
BEGIN
    ALTER TABLE dbo.ExcepcionesManning
        ADD CONSTRAINT FK_ExcepcionesManning_Grupos_GrupoId
        FOREIGN KEY (GrupoId) REFERENCES dbo.Grupos (GrupoId);
    PRINT 'FK a Grupos agregada.';
END
ELSE
    PRINT 'La FK a Grupos ya existe; no se hizo nada.';
GO

-- 3) Quitar el único viejo sobre exactamente (AreaId, Anio, Mes).
--    Se busca por columnas y no por nombre: la tabla pudo crearse a mano y
--    el nombre no es el mismo en todos los ambientes.
DECLARE @sql NVARCHAR(MAX) = N'';

SELECT @sql += CASE
        WHEN i.is_unique_constraint = 1
            THEN N'ALTER TABLE dbo.ExcepcionesManning DROP CONSTRAINT ' + QUOTENAME(i.name) + N'; '
        ELSE N'DROP INDEX ' + QUOTENAME(i.name) + N' ON dbo.ExcepcionesManning; '
    END
FROM sys.indexes i
WHERE i.object_id = OBJECT_ID('dbo.ExcepcionesManning')
  AND i.is_unique = 1
  AND i.is_primary_key = 0
  AND (SELECT COUNT(*) FROM sys.index_columns ic
       WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id
         AND ic.is_included_column = 0) = 3
  AND NOT EXISTS (
        SELECT 1
        FROM sys.index_columns ic
             JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
        WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id
          AND ic.is_included_column = 0
          AND c.name NOT IN ('AreaId', 'Anio', 'Mes'));

IF @sql <> N''
BEGIN
    EXEC sp_executesql @sql;
    PRINT 'Índice único viejo (AreaId, Anio, Mes) eliminado.';
END
ELSE
    PRINT 'No había índice único (AreaId, Anio, Mes); no se hizo nada.';
GO

-- 4) Nuevo único filtrado. Si ya hubiera excepciones ACTIVAS duplicadas
--    (posible si la tabla nunca tuvo el índice), no se crea y se listan:
--    hay que desactivar las sobrantes y volver a correr el script.
IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE object_id = OBJECT_ID('dbo.ExcepcionesManning')
                 AND name = 'UX_ExcepcionesManning_Area_Grupo_Anio_Mes')
BEGIN
    IF EXISTS (SELECT 1 FROM dbo.ExcepcionesManning
               WHERE Activa = 1
               GROUP BY AreaId, GrupoId, Anio, Mes
               HAVING COUNT(*) > 1)
    BEGIN
        PRINT '*** HAY EXCEPCIONES ACTIVAS DUPLICADAS: NO se creó el índice. Revisa el resultado. ***';
        SELECT AreaId, GrupoId, Anio, Mes, COUNT(*) AS Activas
        FROM dbo.ExcepcionesManning
        WHERE Activa = 1
        GROUP BY AreaId, GrupoId, Anio, Mes
        HAVING COUNT(*) > 1;
    END
    ELSE
    BEGIN
        CREATE UNIQUE INDEX UX_ExcepcionesManning_Area_Grupo_Anio_Mes
            ON dbo.ExcepcionesManning (AreaId, GrupoId, Anio, Mes)
            WHERE Activa = 1;
        PRINT 'Índice único filtrado creado.';
    END
END
ELSE
    PRINT 'El índice único filtrado ya existe; no se hizo nada.';
GO
