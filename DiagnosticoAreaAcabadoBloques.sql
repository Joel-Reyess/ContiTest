-- =====================================================================
-- Diagnóstico: el área "Acabado" no sale bien en el Excel de turnos
-- (Vacaciones -> Descargar turnos). SOLO LECTURA: no modifica nada.
-- Cambia @Anio si quieres revisar otro año.
-- =====================================================================
DECLARE @Anio INT = 2027;

-- 1) ¿Cómo está escrito el nombre del área? Los corchetes muestran
--    espacios al inicio/fin y LEN vs DATALENGTH delatan caracteres raros.
SELECT  a.AreaId,
        '[' + a.NombreGeneral + ']'      AS NombreEntreCorchetes,
        LEN(a.NombreGeneral)             AS Largo,
        DATALENGTH(a.NombreGeneral)      AS Bytes,
        a.UnidadOrganizativaSap
FROM    Areas a
WHERE   a.NombreGeneral LIKE '%cabad%'
ORDER BY a.AreaId;

-- 2) ¿Hay áreas duplicadas o con nombre vacío/nulo? (rompe el Excel,
--    que arma una hoja por nombre de área)
SELECT  ISNULL('[' + a.NombreGeneral + ']', '(NULL)') AS Nombre,
        COUNT(*) AS VecesQueSeRepite,
        MIN(a.AreaId) AS PrimerAreaId,
        MAX(a.AreaId) AS UltimoAreaId
FROM    Areas a
GROUP BY a.NombreGeneral
HAVING  COUNT(*) > 1
     OR a.NombreGeneral IS NULL
     OR LTRIM(RTRIM(ISNULL(a.NombreGeneral, ''))) = '';

-- 3) Bloques del año por área: cuántos bloques y cuántos empleados
--    asignados llegan al reporte por cada área.
SELECT  a.AreaId,
        '[' + ISNULL(a.NombreGeneral, '(NULL)') + ']' AS Area,
        COUNT(DISTINCT b.Id)   AS Bloques,
        COUNT(asg.Id)          AS EmpleadosAsignados
FROM    BloquesReservacion b
JOIN    Grupos g  ON g.GrupoId = b.GrupoId
LEFT JOIN Areas a ON a.AreaId  = g.AreaId
LEFT JOIN AsignacionesBloque asg ON asg.BloqueId = b.Id AND asg.Estado = 'Asignado'
WHERE   b.AnioGeneracion = @Anio
GROUP BY a.AreaId, a.NombreGeneral
ORDER BY Area;

-- 4) Detalle de los grupos de Acabado: si algún grupo apunta a un AreaId
--    que no existe, el reporte se queda sin nombre de área.
SELECT  g.GrupoId,
        g.Rol,
        g.AreaId,
        ISNULL('[' + a.NombreGeneral + ']', '*** AREA INEXISTENTE ***') AS Area,
        g.PersonasPorTurno,
        g.DuracionDeturno,
        (SELECT COUNT(*) FROM BloquesReservacion b
          WHERE b.GrupoId = g.GrupoId AND b.AnioGeneracion = @Anio) AS BloquesDelAnio
FROM    Grupos g
LEFT JOIN Areas a ON a.AreaId = g.AreaId
WHERE   a.NombreGeneral LIKE '%cabad%' OR a.AreaId IS NULL
ORDER BY g.Rol;

-- =====================================================================
-- 5) DECISIVA: Acabado (AreaId = 5) grupo por grupo.
--    Reproduce el filtro que usa el generador de bloques:
--    sindicalizado (Nomina no nula) + FechaIngreso no nula + >= 1 año
--    de antigüedad al 31-dic del año objetivo.
-- =====================================================================
DECLARE @AnioObj INT = 2027;

SELECT  g.GrupoId,
        g.Rol,
        g.PersonasPorTurno,
        (SELECT COUNT(*) FROM Users u WHERE u.GrupoId = g.GrupoId)                        AS UsuariosEnGrupo,
        (SELECT COUNT(*) FROM Users u WHERE u.GrupoId = g.GrupoId
            AND u.Nomina IS NOT NULL)                                                     AS ConNomina,
        (SELECT COUNT(*) FROM Users u WHERE u.GrupoId = g.GrupoId
            AND u.Nomina IS NOT NULL AND u.FechaIngreso IS NOT NULL)                      AS ConNominaYFecha,
        (SELECT COUNT(*) FROM Users u WHERE u.GrupoId = g.GrupoId
            AND u.Nomina IS NOT NULL AND u.FechaIngreso IS NOT NULL
            AND u.FechaIngreso <= DATEFROMPARTS(@AnioObj - 1, 12, 31))                    AS Elegibles,
        (SELECT COUNT(*) FROM BloquesReservacion b
           WHERE b.GrupoId = g.GrupoId AND b.AnioGeneracion = @AnioObj)                   AS BloquesDelAnio
FROM    Grupos g
WHERE   g.AreaId = 5
ORDER BY g.Rol;

-- ============================================================================
-- 6) DECISIVA PARA EL EXCEL DE TURNOS: bloques por área Y POR AÑO.
--    El botón "Descargar turnos" del panel principal baja el AÑO VIGENTE;
--    el del panel "en preparación" baja el año en preparación. Si el área
--    salió en un año y no en el otro, el archivo simplemente es del otro año.
--    Solo lectura.
-- ============================================================================
SELECT  b.AnioGeneracion            AS Anio,
        a.AreaId,
        a.NombreGeneral             AS Area,
        COUNT(DISTINCT b.Id)        AS Bloques,
        COUNT(asg.Id)               AS EmpleadosAsignados
FROM    BloquesReservacion b
        INNER JOIN Grupos g ON g.GrupoId = b.GrupoId
        LEFT  JOIN Areas  a ON a.AreaId  = g.AreaId
        LEFT  JOIN AsignacionesBloque asg
               ON asg.BloqueId = b.Id AND asg.Estado = 'Asignado'
GROUP BY b.AnioGeneracion, a.AreaId, a.NombreGeneral
ORDER BY b.AnioGeneracion, a.NombreGeneral;
