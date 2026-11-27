-- =============================================================================
-- DIAGNÓSTICO Herramental 2027 (27-nov-2026). SOLO LECTURA: no cambia nada.
--
-- (1) ¿Herramental tiene días por la empresa de 2027? Por grupo.
-- (2) Por empleado: días por la empresa y días capturados.
-- (3) Grupo R0135_02: todo lo que ocupa un día en 2027 (vacaciones de
--     cualquier tipo, permisos/incapacidades de SAP, festivos aprobados). Un
--     grupo de menos de 14 solo admite UNA ausencia por día: si un día ya
--     tiene a alguien, el compañero no puede tomarlo.
-- (4) Los GrupoId de Herramental (para correr la asignación solo ahí).
-- =============================================================================

SET NOCOUNT ON;
DECLARE @Anio INT = 2027;
DECLARE @Area NVARCHAR(100) = N'%erramental%';
DECLARE @Grupo NVARCHAR(50) = N'R0135_02';
DECLARE @Ini DATE = DATEFROMPARTS(@Anio, 1, 1), @Fin DATE = DATEFROMPARTS(@Anio, 12, 31);

PRINT '=== (1) Herramental por grupo: empleados con días por la empresa ===';
SELECT a.NombreGeneral AS Area, g.GrupoId, g.Rol AS Grupo,
       COUNT(DISTINCT u.Id) AS EmpleadosActivos,
       COUNT(DISTINCT CASE WHEN v.TipoVacacion = 'Automatica' THEN u.Id END) AS ConDiasEmpresa,
       SUM(CASE WHEN v.TipoVacacion = 'Automatica' THEN 1 ELSE 0 END) AS DiasEmpresa,
       SUM(CASE WHEN v.TipoVacacion = 'Anual' THEN 1 ELSE 0 END) AS DiasCapturados
FROM dbo.Grupos g
JOIN dbo.Areas a ON a.AreaId = g.AreaId
LEFT JOIN dbo.Users u ON u.GrupoId = g.GrupoId AND u.Status = 0
LEFT JOIN dbo.VacacionesProgramadas v ON v.EmpleadoId = u.Id AND v.EstadoVacacion = 'Activa'
     AND v.FechaVacacion BETWEEN @Ini AND @Fin
WHERE a.NombreGeneral LIKE @Area
GROUP BY a.NombreGeneral, g.GrupoId, g.Rol
ORDER BY a.NombreGeneral, g.Rol;

PRINT '=== (2) Herramental por empleado ===';
SELECT a.NombreGeneral AS Area, g.Rol AS Grupo, u.Nomina, u.FullName, u.FechaIngreso,
       DATEDIFF(YEAR, u.FechaIngreso, @Fin)
         - CASE WHEN DATEADD(YEAR, DATEDIFF(YEAR, u.FechaIngreso, @Fin), u.FechaIngreso) > @Fin THEN 1 ELSE 0 END AS AntiguedadAl31Dic,
       (SELECT COUNT(*) FROM dbo.VacacionesProgramadas v WHERE v.EmpleadoId = u.Id AND v.EstadoVacacion = 'Activa'
           AND v.TipoVacacion = 'Automatica' AND v.FechaVacacion BETWEEN @Ini AND @Fin) AS DiasEmpresa,
       (SELECT COUNT(*) FROM dbo.VacacionesProgramadas v WHERE v.EmpleadoId = u.Id AND v.EstadoVacacion = 'Activa'
           AND v.TipoVacacion = 'Anual' AND v.FechaVacacion BETWEEN @Ini AND @Fin) AS DiasCapturados
FROM dbo.Users u
JOIN dbo.Grupos g ON g.GrupoId = u.GrupoId
JOIN dbo.Areas a ON a.AreaId = g.AreaId
WHERE a.NombreGeneral LIKE @Area AND u.Status = 0
ORDER BY g.Rol, u.FechaIngreso, u.Nomina;

PRINT '=== (3) Grupo R0135_02 de Herramental: quién ocupa cada día de 2027 ===';
WITH Miembros AS (
    SELECT u.Id, u.Nomina, u.FullName
    FROM dbo.Users u
    JOIN dbo.Grupos g ON g.GrupoId = u.GrupoId
    JOIN dbo.Areas a ON a.AreaId = g.AreaId
    WHERE a.NombreGeneral LIKE @Area AND g.Rol = @Grupo AND u.Status = 0
)
SELECT v.FechaVacacion AS Dia, m.Nomina, m.FullName, 'Vacación ' + v.TipoVacacion AS Que,
       v.OrigenAsignacion AS Detalle, v.CreatedAt AS Registrado
FROM dbo.VacacionesProgramadas v JOIN Miembros m ON m.Id = v.EmpleadoId
WHERE v.EstadoVacacion = 'Activa' AND v.FechaVacacion BETWEEN @Ini AND @Fin
UNION ALL
SELECT p.Desde, m.Nomina, m.FullName,
       'Permiso SAP hasta ' + CONVERT(VARCHAR(10), p.Hasta, 103), ISNULL(p.ClaseAbsentismo, ''), p.FechaRegistro
FROM dbo.PermisosEIncapacidadesSAP p JOIN Miembros m ON m.Nomina = p.Nomina
WHERE p.Hasta >= @Ini AND p.Desde <= @Fin
UNION ALL
SELECT f.FechaNuevaSolicitada, m.Nomina, m.FullName, 'Festivo trabajado (' + f.EstadoSolicitud + ')', '', NULL
FROM dbo.SolicitudesFestivosTrabajados f JOIN Miembros m ON m.Id = f.EmpleadoId
WHERE f.FechaNuevaSolicitada BETWEEN @Ini AND @Fin AND f.EstadoSolicitud = 'Aprobada'
ORDER BY 1, 2;

PRINT '=== (4) GrupoId de Herramental (para correr la asignación solo ahí) ===';
SELECT STUFF((SELECT ',' + CAST(g.GrupoId AS VARCHAR(10))
              FROM dbo.Grupos g JOIN dbo.Areas a ON a.AreaId = g.AreaId
              WHERE a.NombreGeneral LIKE @Area
              ORDER BY g.GrupoId
              FOR XML PATH('')), 1, 1, '') AS GrupoIdsHerramental;
