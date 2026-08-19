-- =============================================================================
-- DIAGNÓSTICO: error 400 al capturar papeletas en la unidad organizativa
-- "80805 A 101" (Corte de hilo y compuesto, jefe Martínez Arcelia).
--
-- SOLO LECTURA: son SELECT. No modifica absolutamente nada, se puede correr
-- en productivo sin riesgo. Copia el resultado de cada bloque y mándalo.
--
-- Ajusta @UnidadOrg si el código exacto en la tabla Areas difiere.
-- =============================================================================

DECLARE @UnidadOrg NVARCHAR(50) = '80805 A 101';

PRINT '=== (0) Búsqueda flexible del área ===';
SELECT AreaId, UnidadOrganizativaSap, NombreGeneral, Manning,
       JefeId, JefeSuplenteId
FROM dbo.Areas
WHERE UnidadOrganizativaSap LIKE '%80805%'
   OR NombreGeneral LIKE '%orte%hil%'
   OR NombreGeneral LIKE '%ompuest%';

PRINT '=== (1) Jefes registrados del área (JefeId, suplente y catálogo AreaJefes) ===';
-- Status: 0 = Activo, 1 = Desactivado, 2 = Suspendido
SELECT a.AreaId, a.UnidadOrganizativaSap, a.NombreGeneral,
       a.JefeId, uj.FullName  AS JefeTitular,   uj.Status AS StatusJefe,
       a.JefeSuplenteId, us.FullName AS JefeSuplente, us.Status AS StatusSuplente
FROM dbo.Areas a
LEFT JOIN dbo.Users uj ON uj.Id = a.JefeId
LEFT JOIN dbo.Users us ON us.Id = a.JefeSuplenteId
WHERE a.UnidadOrganizativaSap LIKE '%80805%';

IF OBJECT_ID('dbo.AreaJefes') IS NOT NULL
BEGIN
    SELECT aj.AreaId, aj.UserId, u.FullName, u.Status
    FROM dbo.AreaJefes aj
    JOIN dbo.Areas a ON a.AreaId = aj.AreaId
    LEFT JOIN dbo.Users u ON u.Id = aj.UserId
    WHERE a.UnidadOrganizativaSap LIKE '%80805%';
END
ELSE
    PRINT '>>> La tabla AreaJefes NO EXISTE: falta correr Migration_Consolidado_Pendientes.sql';

PRINT '=== (2) Grupos del área y su configuración (manning / % ausencia) ===';
SELECT g.*
FROM dbo.Grupos g
JOIN dbo.Areas a ON a.AreaId = g.AreaId
WHERE a.UnidadOrganizativaSap LIKE '%80805%';

PRINT '=== (3) Empleados del área: cuántos y si traen Area/Grupo asignados ===';
SELECT COUNT(*)                                        AS TotalEmpleados,
       SUM(CASE WHEN u.AreaId  IS NULL THEN 1 ELSE 0 END) AS SinAreaId,
       SUM(CASE WHEN u.GrupoId IS NULL THEN 1 ELSE 0 END) AS SinGrupoId,
       SUM(CASE WHEN u.Status <> 0     THEN 1 ELSE 0 END) AS NoActivos
FROM dbo.Users u
JOIN dbo.Areas a ON a.AreaId = u.AreaId
WHERE a.UnidadOrganizativaSap LIKE '%80805%';

PRINT '=== (4) CLAVE: tipos de vacación de los días activos del área ===';
PRINT '    Reprogramar SOLO acepta TipoVacacion = Anual o Reprogramacion.';
PRINT '    Si aquí domina Automatica/AsignadaAutomaticamente, ese es el 400.';
SELECT v.TipoVacacion, v.EstadoVacacion, COUNT(*) AS Dias
FROM dbo.VacacionesProgramadas v
JOIN dbo.Users u ON u.Id = v.EmpleadoId
JOIN dbo.Areas a ON a.AreaId = u.AreaId
WHERE a.UnidadOrganizativaSap LIKE '%80805%'
  AND YEAR(v.FechaVacacion) >= YEAR(GETDATE())
GROUP BY v.TipoVacacion, v.EstadoVacacion
ORDER BY Dias DESC;

PRINT '=== (5) Comparativo: misma consulta para TODA la planta ===';
PRINT '    Si el reparto de tipos del área es distinto al del resto, ahí está.';
SELECT v.TipoVacacion, v.EstadoVacacion, COUNT(*) AS Dias
FROM dbo.VacacionesProgramadas v
WHERE YEAR(v.FechaVacacion) >= YEAR(GETDATE())
GROUP BY v.TipoVacacion, v.EstadoVacacion
ORDER BY Dias DESC;

PRINT '=== (6) Estado del periodo de vacaciones (el gate viejo de los 400) ===';
SELECT * FROM dbo.ConfiguracionVacaciones;

PRINT '=== (7) Últimas solicitudes de reprogramación del área (¿alguna entró?) ===';
SELECT TOP 30 s.Id, s.EmpleadoId, u.FullName, s.FechaOriginalGuardada,
       s.FechaNuevaSolicitada, s.EstadoSolicitud, s.JefeAreaId, s.FechaSolicitud
FROM dbo.SolicitudesReprogramacion s
JOIN dbo.Users u ON u.Id = s.EmpleadoId
JOIN dbo.Areas a ON a.AreaId = u.AreaId
WHERE a.UnidadOrganizativaSap LIKE '%80805%'
ORDER BY s.FechaSolicitud DESC;

PRINT '=== (8) Días inhábiles del periodo que están pidiendo ===';
SELECT * FROM dbo.DiasInhabiles
WHERE Fecha >= CAST(GETDATE() AS DATE)
ORDER BY Fecha;
