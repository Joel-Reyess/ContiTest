-- =============================================================================
-- DIAGNÓSTICO: por qué quedaron empleados sin asignación automática.
--
-- SOLO LECTURA. Cambia @Anio si revisas otro año.
--
-- Los "fallidos" del resumen no son todos iguales; se separan en tres:
--   A) Antigüedad de 1 a 3 años  -> NO les tocan días automáticos. Es correcto,
--      no hay nada que hacer: sus días son programables, los eligen ellos.
--   B) Sin fecha de ingreso      -> dato faltante. Estos SÍ hay que corregirlos,
--      porque tampoco se les calculan bien los días programables.
--   C) Con derecho pero sin lugar-> el grupo se llenó (o es chico y solo admite
--      una ausencia por día). Estos hay que colocarlos a mano.
-- =============================================================================

DECLARE @Anio INT = 2027;
DECLARE @Corte DATE = DATEFROMPARTS(@Anio, 12, 31);

PRINT '=== (1) Resumen por categoría ===';
WITH Base AS (
    SELECT u.Id, u.Nomina, u.FullName, u.GrupoId, u.FechaIngreso,
           CASE WHEN u.FechaIngreso IS NULL THEN NULL
                ELSE DATEDIFF(YEAR, u.FechaIngreso, @Corte)
                     - CASE WHEN DATEADD(YEAR, DATEDIFF(YEAR, u.FechaIngreso, @Corte), u.FechaIngreso) > @Corte
                            THEN 1 ELSE 0 END
           END AS Antiguedad,
           (SELECT COUNT(*) FROM dbo.VacacionesProgramadas v
             WHERE v.EmpleadoId = u.Id AND YEAR(v.FechaVacacion) = @Anio
               AND v.OrigenAsignacion = 'Automatica' AND v.EstadoVacacion = 'Activa') AS DiasAutomaticos
    FROM dbo.Users u
    WHERE u.Status = 0 AND u.Nomina IS NOT NULL
)
SELECT
    CASE
      WHEN FechaIngreso IS NULL                      THEN 'B) Sin fecha de ingreso — CORREGIR'
      WHEN Antiguedad < 1                            THEN 'B) Antigüedad menor a 1 año — revisar fecha'
      WHEN Antiguedad BETWEEN 1 AND 3                THEN 'A) 1 a 3 años: sin días automáticos (correcto)'
      WHEN DiasAutomaticos > 0                       THEN 'OK: asignado'
      ELSE                                                'C) Con derecho y SIN lugar — colocar a mano'
    END AS Categoria,
    COUNT(*) AS Empleados
FROM Base
GROUP BY
    CASE
      WHEN FechaIngreso IS NULL                      THEN 'B) Sin fecha de ingreso — CORREGIR'
      WHEN Antiguedad < 1                            THEN 'B) Antigüedad menor a 1 año — revisar fecha'
      WHEN Antiguedad BETWEEN 1 AND 3                THEN 'A) 1 a 3 años: sin días automáticos (correcto)'
      WHEN DiasAutomaticos > 0                       THEN 'OK: asignado'
      ELSE                                                'C) Con derecho y SIN lugar — colocar a mano'
    END
ORDER BY Categoria;

PRINT '=== (2) Los que hay que corregir: sin fecha de ingreso ===';
SELECT u.Id, u.Nomina, u.FullName, u.GrupoId, g.Rol AS Grupo, a.NombreGeneral AS Area
FROM dbo.Users u
LEFT JOIN dbo.Grupos g ON g.GrupoId = u.GrupoId
LEFT JOIN dbo.Areas  a ON a.AreaId  = u.AreaId
WHERE u.Status = 0 AND u.Nomina IS NOT NULL AND u.FechaIngreso IS NULL
ORDER BY a.NombreGeneral, g.Rol, u.Nomina;

PRINT '=== (3) Los que hay que colocar a mano: con derecho y sin lugar ===';
WITH Base AS (
    SELECT u.Id, u.Nomina, u.FullName, u.GrupoId, u.FechaIngreso,
           DATEDIFF(YEAR, u.FechaIngreso, @Corte)
             - CASE WHEN DATEADD(YEAR, DATEDIFF(YEAR, u.FechaIngreso, @Corte), u.FechaIngreso) > @Corte
                    THEN 1 ELSE 0 END AS Antiguedad,
           (SELECT COUNT(*) FROM dbo.VacacionesProgramadas v
             WHERE v.EmpleadoId = u.Id AND YEAR(v.FechaVacacion) = @Anio
               AND v.OrigenAsignacion = 'Automatica' AND v.EstadoVacacion = 'Activa') AS DiasAutomaticos
    FROM dbo.Users u
    WHERE u.Status = 0 AND u.Nomina IS NOT NULL AND u.FechaIngreso IS NOT NULL
)
SELECT b.Nomina, b.FullName, b.Antiguedad,
       CASE WHEN b.Antiguedad = 4 THEN 3 WHEN b.Antiguedad = 5 THEN 4 ELSE 5 END AS DiasQueLeTocan,
       b.GrupoId, g.Rol AS Grupo, a.NombreGeneral AS Area,
       (SELECT COUNT(*) FROM dbo.Users x WHERE x.GrupoId = b.GrupoId AND x.Status = 0) AS TamanoDelGrupo
FROM Base b
LEFT JOIN dbo.Grupos g ON g.GrupoId = b.GrupoId
LEFT JOIN dbo.Areas  a ON a.AreaId  = g.AreaId
WHERE b.Antiguedad >= 4 AND b.DiasAutomaticos = 0
ORDER BY a.NombreGeneral, g.Rol, b.Nomina;

PRINT '=== (4) Ocupación por grupo: dónde se llenó el año ===';
-- Un grupo por debajo del mínimo para aplicar porcentaje (23 con el 4.3% por
-- omisión) solo admite UNA ausencia por día: si tiene 16 personas × 5 días,
-- necesita 80 días hábiles libres en el año y compite con las vacaciones
-- programadas y los días de empresa.
SELECT g.GrupoId, g.Rol AS Grupo, a.NombreGeneral AS Area,
       (SELECT COUNT(*) FROM dbo.Users u WHERE u.GrupoId = g.GrupoId AND u.Status = 0) AS Empleados,
       (SELECT COUNT(*) FROM dbo.VacacionesProgramadas v
         JOIN dbo.Users u2 ON u2.Id = v.EmpleadoId
        WHERE u2.GrupoId = g.GrupoId AND YEAR(v.FechaVacacion) = @Anio
          AND v.EstadoVacacion = 'Activa') AS DiasOcupadosEnElAnio,
       (SELECT COUNT(DISTINCT v.FechaVacacion) FROM dbo.VacacionesProgramadas v
         JOIN dbo.Users u3 ON u3.Id = v.EmpleadoId
        WHERE u3.GrupoId = g.GrupoId AND YEAR(v.FechaVacacion) = @Anio
          AND v.EstadoVacacion = 'Activa') AS DiasDistintosUsados
FROM dbo.Grupos g
JOIN dbo.Areas a ON a.AreaId = g.AreaId
ORDER BY Empleados, a.NombreGeneral, g.Rol;

PRINT '=== (5) Porcentaje configurado (define el minimo de 23) ===';
SELECT TOP 1 Id, PorcentajeAusenciaMaximo, PeriodoActual, AnioVigente, AnioProgramacionAnual, CreatedAt
FROM dbo.ConfiguracionVacaciones
ORDER BY CreatedAt DESC;
