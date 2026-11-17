-- =============================================================================
-- Revisión (nov-2026): ¿se corrió por error la asignación de días por la empresa
-- de 2026 en lugar de la de 2027?
--
-- El modal "Programar días" de la secuencia del año en preparación abría con el
-- año vigente (2026) aunque abajo dijera "se está programando 2027". Si alguien
-- confirmó así, a quien le faltaran días por la empresa de 2026 se le asignaron
-- en fechas de 2026 que ya pasaron. El frontend y el backend corregidos ya no lo
-- permiten (el backend nunca asigna fechas de hoy o anteriores).
--
-- Qué busca: días por la empresa de 2026 creados por la asignación automática a
-- partir del 10/11/2026 (la programación de 2026 se hizo mucho antes; la de 2027
-- fue el 09/11/2026 y crea fechas de 2027, no de 2026).
--
-- Paso 1 solo muestra. Paso 2 los borra SOLO si se cambia @Borrar a 1.
-- Se puede correr más de una vez.
-- =============================================================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Borrar BIT = 0;          -- 1 = borrar lo que muestra el paso 1
DECLARE @Desde DATETIME = '2026-11-10';

IF OBJECT_ID('tempdb..#PorError') IS NOT NULL DROP TABLE #PorError;

SELECT v.Id, v.EmpleadoId, v.FechaVacacion, v.EstadoVacacion, v.Observaciones, v.CreatedAt
INTO #PorError
FROM dbo.VacacionesProgramadas v
WHERE YEAR(v.FechaVacacion) = 2026
  AND v.OrigenAsignacion = 'Automatica'
  AND v.TipoVacacion = 'Automatica'
  AND v.Observaciones LIKE 'Asignaci%n autom%tica - Semana%'
  AND v.CreatedAt >= @Desde;

-- Paso 1a: resumen (si sale 0, no pasó nada y no hay que hacer más)
SELECT COUNT(*) AS DiasCreados, COUNT(DISTINCT EmpleadoId) AS Empleados,
       MIN(CreatedAt) AS PrimeraCreacion, MAX(CreatedAt) AS UltimaCreacion
FROM #PorError;

-- Paso 1b: detalle
SELECT u.Nomina, u.FullName AS Nombre, p.FechaVacacion, p.EstadoVacacion, p.Observaciones, p.CreatedAt
FROM #PorError p
JOIN dbo.Users u ON u.Id = p.EmpleadoId
ORDER BY u.Nomina, p.FechaVacacion;

-- Paso 2: borrar (solo con @Borrar = 1)
IF @Borrar = 1
BEGIN
    BEGIN TRANSACTION;

    DELETE v
    FROM dbo.VacacionesProgramadas v
    JOIN #PorError p ON p.Id = v.Id;

    PRINT CONCAT(@@ROWCOUNT, ' día(s) por la empresa de 2026 borrado(s).');

    COMMIT TRANSACTION;
END
ELSE
    PRINT 'Solo revisión: para borrar lo listado, cambia @Borrar a 1 y vuelve a correrlo.';

DROP TABLE #PorError;
