-- Diagnóstico: "Error al aprobar la solicitud" en una solicitud de reprogramación
-- (caso reportado: solicitud #2035, RAMIREZ DELGADO ROBERTO 32812993, Mtto. C Vulca,
--  fecha original 2026-09-14 -> nueva 2026-08-17, aprobador Genaro Palacios).
--
-- SOLO LECTURA: ninguna instrucción modifica datos. Ejecutar en producción tal cual.
-- Cambia @SolicitudId y @NombreAprobador y corre todo el script; cada bloque es una
-- de las validaciones que hace POST /api/reprogramacion/aprobar, en el mismo orden.

DECLARE @SolicitudId INT = 2035;
DECLARE @NombreAprobador NVARCHAR(100) = N'%PALACIOS%';   -- LIKE sobre Users.FullName

-------------------------------------------------------------------------------
-- 1) La solicitud y su empleado (área por grupo vs área directa del usuario)
-------------------------------------------------------------------------------
SELECT '1 Solicitud' AS Bloque,
       s.Id, s.EstadoSolicitud, s.FechaOriginalGuardada, s.FechaNuevaSolicitada,
       s.FechaSolicitud, s.JefeAreaId, jefe.FullName AS JefeAsignadoAlCrear,
       s.SolicitadoPorId, sol.FullName AS SolicitadoPor,
       s.EmpleadoId, e.FullName AS Empleado, e.Nomina,
       e.AreaId AS AreaUsuario, aU.NombreGeneral AS AreaUsuarioNombre,
       e.GrupoId, g.Rol AS Grupo, g.AreaId AS AreaDelGrupo, aG.NombreGeneral AS AreaDelGrupoNombre,
       s.VacacionOriginalId
FROM SolicitudesReprogramacion s
JOIN Users e            ON e.Id = s.EmpleadoId
LEFT JOIN Users jefe    ON jefe.Id = s.JefeAreaId
LEFT JOIN Users sol     ON sol.Id = s.SolicitadoPorId
LEFT JOIN Areas aU      ON aU.AreaId = e.AreaId
LEFT JOIN Grupos g      ON g.GrupoId = e.GrupoId
LEFT JOIN Areas aG      ON aG.AreaId = g.AreaId
WHERE s.Id = @SolicitudId;

-------------------------------------------------------------------------------
-- 2) El aprobador: roles (el backend exige "Jefe De Area", tolerante a _ y espacios)
--    y su AreaId de Users (lo escribe el sync SAP; puede NO ser el área del empleado)
-------------------------------------------------------------------------------
DECLARE @ColUser SYSNAME = (SELECT TOP 1 COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
                            WHERE TABLE_NAME = 'UserRoles' AND COLUMN_NAME LIKE '%User%');
DECLARE @ColRol  SYSNAME = (SELECT TOP 1 COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
                            WHERE TABLE_NAME = 'UserRoles' AND COLUMN_NAME LIKE '%Rol%');
DECLARE @Sql NVARCHAR(MAX) = N'
SELECT ''2 Aprobador'' AS Bloque, u.Id, u.FullName, u.Username, u.Status,
       u.AreaId AS AreaIdUsuario, a.NombreGeneral AS AreaUsuario,
       STRING_AGG(r.Name, '', '') AS Roles
FROM Users u
LEFT JOIN Areas a ON a.AreaId = u.AreaId
LEFT JOIN UserRoles ur ON ur.' + QUOTENAME(@ColUser) + N' = u.Id
LEFT JOIN Roles r ON r.Id = ur.' + QUOTENAME(@ColRol) + N'
WHERE u.FullName LIKE @n
GROUP BY u.Id, u.FullName, u.Username, u.Status, u.AreaId, a.NombreGeneral;';
EXEC sp_executesql @Sql, N'@n NVARCHAR(100)', @n = @NombreAprobador;

-------------------------------------------------------------------------------
-- 3) Alcance del aprobador sobre el área del empleado, fuente por fuente.
--    La versión en producción SOLO acepta: JefeAreaId de la solicitud, Users.AreaId
--    igual al área del empleado, o AreaJefes (o JefeId/JefeSuplenteId legacy si
--    AreaJefes está vacío). El botón "Aprobar" en cambio se muestra también por
--    AreaAsignaciones / líder de grupo / ingeniero: si aquí solo sale "AreaAsignaciones",
--    ésa es la causa del error.
-------------------------------------------------------------------------------
;WITH emp AS (
    SELECT e.Id AS EmpleadoId, e.AreaId AS AreaUsuario, g.AreaId AS AreaGrupo
    FROM SolicitudesReprogramacion s
    JOIN Users e ON e.Id = s.EmpleadoId
    LEFT JOIN Grupos g ON g.GrupoId = e.GrupoId
    WHERE s.Id = @SolicitudId
), apr AS (
    SELECT Id, FullName, AreaId FROM Users WHERE FullName LIKE @NombreAprobador
)
SELECT '3 Alcance' AS Bloque, apr.FullName AS Aprobador, x.Fuente, x.AreaId, a.NombreGeneral,
       CASE WHEN x.AreaId IN (emp.AreaUsuario, emp.AreaGrupo) THEN 'SI cubre al empleado' ELSE 'no' END AS CubreEmpleado,
       CASE WHEN x.Fuente IN ('Users.AreaId','AreaJefes','Areas.JefeId/JefeSuplenteId (legacy)')
            THEN 'aceptada por aprobar (prod)' ELSE 'SOLO muestra el boton (prod)' END AS Efecto
FROM apr
CROSS JOIN emp
CROSS APPLY (
    SELECT 'Users.AreaId' AS Fuente, apr.AreaId AS AreaId WHERE apr.AreaId IS NOT NULL
    UNION ALL SELECT 'AreaJefes', aj.AreaId FROM AreaJefes aj WHERE aj.UserId = apr.Id
    UNION ALL SELECT 'Areas.JefeId/JefeSuplenteId (legacy)', ar.AreaId FROM Areas ar
              WHERE (ar.JefeId = apr.Id OR ar.JefeSuplenteId = apr.Id)
                AND NOT EXISTS (SELECT 1 FROM AreaJefes aj2 WHERE aj2.AreaId = ar.AreaId)
    UNION ALL SELECT 'AreaAsignaciones', aa.AreaId FROM AreaAsignaciones aa WHERE aa.UserId = apr.Id
    UNION ALL SELECT 'Grupos.LiderId', gr.AreaId FROM Grupos gr WHERE gr.LiderId = apr.Id
    UNION ALL SELECT 'AreaIngenieros', ai.AreaId FROM AreaIngenieros ai WHERE ai.IngenieroId = apr.Id AND ai.Activo = 1
) x
LEFT JOIN Areas a ON a.AreaId = x.AreaId
ORDER BY CubreEmpleado DESC, x.Fuente;

-------------------------------------------------------------------------------
-- 4) Conflicto de vacación: otra vacación ACTIVA del empleado en la fecha nueva
--    ("Ya existe una vacación activa para la fecha solicitada") y estado de la original
-------------------------------------------------------------------------------
SELECT '4 Vacaciones' AS Bloque, v.Id, v.FechaVacacion, v.EstadoVacacion, v.TipoVacacion,
       v.PeriodoProgramacion, v.OrigenAsignacion,
       CASE WHEN v.Id = s.VacacionOriginalId THEN 'ORIGINAL de la solicitud'
            WHEN v.FechaVacacion = s.FechaNuevaSolicitada AND v.EstadoVacacion = 'Activa' THEN 'CONFLICTO: bloquea la aprobacion'
            ELSE '' END AS Nota
FROM SolicitudesReprogramacion s
JOIN VacacionesProgramadas v ON v.EmpleadoId = s.EmpleadoId
WHERE s.Id = @SolicitudId
  AND (v.Id = s.VacacionOriginalId OR v.FechaVacacion = s.FechaNuevaSolicitada)
ORDER BY v.FechaVacacion, v.Id;

-------------------------------------------------------------------------------
-- 5) Notificaciones que ya existen de esta solicitud (al aprobar deben aparecer
--    "Reprogramación Aprobada" para el empleado y para quien capturó)
-------------------------------------------------------------------------------
SELECT '5 Notificaciones' AS Bloque, n.Id, n.FechaAccion, n.TipoDeNotificacion, n.TipoMovimiento,
       n.Titulo, n.IdUsuarioReceptor, rcp.FullName AS Receptor, n.IdUsuarioEmisor, n.NombreEmisor, n.AreaId
FROM Notificaciones n
LEFT JOIN Users rcp ON rcp.Id = n.IdUsuarioReceptor
WHERE n.IdSolicitud = @SolicitudId
ORDER BY n.FechaAccion;
