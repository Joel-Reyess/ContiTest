-- =============================================================================
-- DIAGNÓSTICO: "un operador desapareció de la app pero sí está en el archivo
-- de roles" (caso reportado: nómina 32000075).
--
-- SOLO LECTURA: son SELECT. No modifica nada, se puede correr en productivo.
-- Cambia @Nomina si quieres revisar a otro operador y manda el resultado de
-- todos los bloques (aunque alguno salga vacío: un vacío también dice algo).
--
-- Cómo leerlo, en corto: la app arma el rol semanal con
--     SELECT ... FROM Users WHERE GrupoId = @grupo AND Status = 0
-- así que un operador "desaparece" si (a) no existe su fila en Users, (b) su
-- Status ya no es 0 = Activo, (c) su GrupoId es NULL, o (d) la sincronización
-- de SAP lo movió a OTRO grupo/área — sigue existiendo, pero no donde lo
-- buscan. El bloque 12 traduce el resultado a una de esas cuatro.
-- =============================================================================

DECLARE @Nomina INT = 32000075;

PRINT '=== (1) ¿Existe el usuario en Users? (esta es la tabla que ve la app) ===';
-- Status: 0 = Activo, 1 = Desactivado, 2 = Suspendido.
-- Si esta consulta no regresa NADA, el usuario fue borrado o nunca se creó.
SELECT u.Id, u.Nomina, u.FullName, u.Username,
       u.Status,
       CASE u.Status WHEN 0 THEN 'Activo' WHEN 1 THEN 'Desactivado'
                     WHEN 2 THEN 'Suspendido' ELSE 'Desconocido' END AS StatusTexto,
       u.AreaId, u.GrupoId,
       u.CreatedAt, u.CreatedBy, u.UpdatedAt, u.UpdatedBy, u.UltimoInicioSesion,
       u.FechaIngreso, u.CentroCoste, u.Posicion
FROM dbo.Users u
WHERE u.Nomina = @Nomina;

PRINT '=== (1b) Por si la nómina quedó en Username y no en la columna Nomina ===';
SELECT u.Id, u.Nomina, u.FullName, u.Username, u.Status, u.AreaId, u.GrupoId
FROM dbo.Users u
WHERE u.Username = CAST(@Nomina AS NVARCHAR(50))
   OR u.Username LIKE '%' + CAST(@Nomina AS NVARCHAR(50)) + '%';

PRINT '=== (2) ¿Hay filas duplicadas para esa nómina? ===';
-- Dos filas con la misma nómina explican "a veces aparece y a veces no":
-- unas pantallas toman la primera y otras la segunda.
SELECT u.Nomina, COUNT(*) AS Filas
FROM dbo.Users u
WHERE u.Nomina = @Nomina
GROUP BY u.Nomina
HAVING COUNT(*) > 1;

PRINT '=== (3) Espejo de SAP: tabla Empleados ===';
SELECT e.Nomina, e.Nombre, e.FechaAlta, e.CentroCoste, e.Posicion,
       e.UnidadOrganizativa, e.EncargadoRegistro, e.Rol
FROM dbo.Empleados e
WHERE e.Nomina = @Nomina;

PRINT '=== (4) El archivo de roles tal como entró (RolesEmpleadosSAP) ===';
-- Esta es la tabla que se llena con el archivo de roles. Si aquí SÍ está y en
-- Users no, el problema es la sincronización, no el archivo.
SELECT r.Nomina, r.Nombre, r.Alta, r.CentroCoste, r.UnidadOrganizativa,
       r.EncargadoRegistro, r.Regla, r.Turno
FROM dbo.RolesEmpleadosSAP r
WHERE r.Nomina = @Nomina;

PRINT '=== (5) ¿La regla que trae SAP está configurada? ===';
-- Si Estado = PendienteConfiguracion, la sincronización actualiza Empleados
-- pero NO asigna grupo ni área: el operador se queda donde estaba (o sin grupo)
-- hasta que el SuperUsuario capture el patrón en Reglas de turnos.
SELECT rt.Codigo, rt.Estado, rt.PatronJson, rt.DiasRotadosAcumulado,
       rt.FechaReferencia, rt.UltimaRotacion, rt.UpdatedAt
FROM dbo.ReglasTurno rt
WHERE EXISTS (
    SELECT 1 FROM dbo.RolesEmpleadosSAP r
    WHERE r.Nomina = @Nomina
      AND UPPER(REPLACE(REPLACE(REPLACE(r.Regla, '_', ''), '-', ''), ' ', ''))
        = UPPER(REPLACE(REPLACE(REPLACE(rt.Codigo, '_', ''), '-', ''), ' ', ''))
);

PRINT '=== (6) ¿Existe un Grupo para esa regla, y en qué área(s)? ===';
-- La sincronización busca el grupo comparando la regla SIN _ ni - ni espacios.
-- Si esto sale vacío, falta crear el grupo: el operador nunca se asigna.
SELECT g.GrupoId, g.Rol AS RolDelGrupo, g.IdentificadorSAP,
       a.AreaId, a.NombreGeneral AS Area, a.UnidadOrganizativaSap,
       a.EncargadoRegistro AS EncargadoDelArea,
       a.JefeId, ju.FullName AS JefeTitular,
       (SELECT COUNT(*) FROM dbo.Users x WHERE x.GrupoId = g.GrupoId AND x.Status = 0) AS OperadoresActivos
FROM dbo.Grupos g
JOIN dbo.Areas a ON a.AreaId = g.AreaId
LEFT JOIN dbo.Users ju ON ju.Id = a.JefeId
WHERE EXISTS (
    SELECT 1 FROM dbo.RolesEmpleadosSAP r
    WHERE r.Nomina = @Nomina
      AND UPPER(REPLACE(REPLACE(REPLACE(r.Regla, '_', ''), '-', ''), ' ', ''))
        = UPPER(REPLACE(REPLACE(REPLACE(g.Rol,   '_', ''), '-', ''), ' ', ''))
)
ORDER BY a.UnidadOrganizativaSap, g.GrupoId;

PRINT '=== (7) ¿Dónde está parado HOY el operador? (grupo y área actuales) ===';
-- Compara esto con el bloque 6: si el GrupoId de aquí no es el que esperaban,
-- el operador no desapareció — se movió, y hay que buscarlo en esta otra área.
SELECT u.Id, u.Nomina, u.FullName, u.Status,
       u.GrupoId, g.Rol AS RolDelGrupo,
       u.AreaId, a.NombreGeneral AS Area, a.UnidadOrganizativaSap,
       a.JefeId, ju.FullName AS JefeTitular
FROM dbo.Users u
LEFT JOIN dbo.Grupos g ON g.GrupoId = u.GrupoId
LEFT JOIN dbo.Areas  a ON a.AreaId  = u.AreaId
LEFT JOIN dbo.Users ju ON ju.Id     = a.JefeId
WHERE u.Nomina = @Nomina;

PRINT '=== (8) ¿Aparecería en el rol semanal de su grupo? (mismo filtro que la app) ===';
SELECT u.Id, u.Nomina, u.FullName, u.Status, u.GrupoId,
       CASE
         WHEN u.GrupoId IS NULL THEN 'NO: no tiene grupo asignado'
         WHEN u.Status <> 0     THEN 'NO: su Status no es Activo'
         ELSE 'SÍ: sale en el rol semanal del grupo ' + CAST(u.GrupoId AS NVARCHAR(20))
       END AS SaleEnRolSemanal
FROM dbo.Users u
WHERE u.Nomina = @Nomina;

PRINT '=== (9) Compañeros del mismo grupo (para ver si es él solo o todo el grupo) ===';
SELECT TOP 30 u2.Nomina, u2.FullName, u2.Status, u2.GrupoId, u2.AreaId
FROM dbo.Users u2
WHERE u2.GrupoId = (SELECT TOP 1 u.GrupoId FROM dbo.Users u WHERE u.Nomina = @Nomina)
ORDER BY u2.Status, u2.Nomina;

PRINT '=== (10) ¿Quién puede verlo? Jefes del área donde quedó ===';
SELECT a.AreaId, a.NombreGeneral, a.UnidadOrganizativaSap,
       a.JefeId, ju.FullName AS JefeTitular, ju.Status AS StatusJefe,
       a.JefeSuplenteId, js.FullName AS JefeSuplente
FROM dbo.Areas a
LEFT JOIN dbo.Users ju ON ju.Id = a.JefeId
LEFT JOIN dbo.Users js ON js.Id = a.JefeSuplenteId
WHERE a.AreaId = (SELECT TOP 1 u.AreaId FROM dbo.Users u WHERE u.Nomina = @Nomina);

IF OBJECT_ID('dbo.AreaJefes') IS NOT NULL
BEGIN
    SELECT aj.AreaId, aj.UserId, u.FullName AS JefeExtra, u.Status
    FROM dbo.AreaJefes aj
    LEFT JOIN dbo.Users u ON u.Id = aj.UserId
    WHERE aj.AreaId = (SELECT TOP 1 x.AreaId FROM dbo.Users x WHERE x.Nomina = @Nomina);
END
ELSE
    PRINT '>>> La tabla AreaJefes NO EXISTE en esta base.';

PRINT '=== (11) Rastro de movimientos: transferencias de grupo y bitácora ===';
IF OBJECT_ID('dbo.TransferenciasGrupo') IS NOT NULL
BEGIN
    SELECT t.Id, t.FechaTransferencia, t.EmpleadoId,
           t.GrupoOrigenId, t.GrupoDestinoId, t.Motivo,
           t.RealizadoPorId, ru.FullName AS RealizadoPor
    FROM dbo.TransferenciasGrupo t
    LEFT JOIN dbo.Users ru ON ru.Id = t.RealizadoPorId
    WHERE t.EmpleadoId = (SELECT TOP 1 u.Id FROM dbo.Users u WHERE u.Nomina = @Nomina)
    ORDER BY t.FechaTransferencia DESC;
END
ELSE
    PRINT '>>> La tabla TransferenciasGrupo NO EXISTE en esta base.';

IF OBJECT_ID('dbo.LoggerAcciones') IS NOT NULL
BEGIN
    SELECT TOP 50 l.Id, l.Accion, l.IdUsuario, l.NombreCompletoUsuario,
           l.NominaUsuario, l.IdRegistro
    FROM dbo.LoggerAcciones l
    WHERE l.NominaUsuario = @Nomina
       OR l.IdRegistro = (SELECT TOP 1 u.Id FROM dbo.Users u WHERE u.Nomina = @Nomina)
    ORDER BY l.Id DESC;
END
ELSE
    PRINT '>>> La tabla LoggerAcciones NO EXISTE en esta base.';

PRINT '=== (12) Datos que dependen de él (para saber qué se rescata) ===';
SELECT
  (SELECT COUNT(*) FROM dbo.VacacionesProgramadas v
    WHERE v.EmpleadoId = (SELECT TOP 1 u.Id FROM dbo.Users u WHERE u.Nomina = @Nomina)) AS VacacionesProgramadas,
  (SELECT COUNT(*) FROM dbo.VacacionesProgramadas v
    WHERE v.EmpleadoId = (SELECT TOP 1 u.Id FROM dbo.Users u WHERE u.Nomina = @Nomina)
      AND v.EstadoVacacion = 'Activa') AS VacacionesActivas,
  (SELECT COUNT(*) FROM dbo.AsignacionesBloque ab
    WHERE ab.EmpleadoId = (SELECT TOP 1 u.Id FROM dbo.Users u WHERE u.Nomina = @Nomina)) AS AsignacionesDeBloque;

PRINT '=== (13) VEREDICTO ===';
SELECT CASE
  WHEN NOT EXISTS (SELECT 1 FROM dbo.Users WHERE Nomina = @Nomina)
       AND EXISTS (SELECT 1 FROM dbo.RolesEmpleadosSAP WHERE Nomina = @Nomina)
    THEN 'NO EXISTE en Users pero SÍ en el archivo de roles: se borró el usuario o nunca se creó. Ver bloque 1b (pudo quedar con la nómina en Username).'
  WHEN NOT EXISTS (SELECT 1 FROM dbo.Users WHERE Nomina = @Nomina)
    THEN 'NO EXISTE en Users ni en RolesEmpleadosSAP con esa nómina exacta. Revisar que la nómina esté bien escrita.'
  WHEN (SELECT TOP 1 Status FROM dbo.Users WHERE Nomina = @Nomina) <> 0
    THEN 'EXISTE pero su Status no es Activo: por eso se cayó de los roles semanales y de los listados.'
  WHEN (SELECT TOP 1 GrupoId FROM dbo.Users WHERE Nomina = @Nomina) IS NULL
    THEN 'EXISTE y está Activo pero SIN GRUPO: no pertenece a ningún rol semanal. Ver bloques 5 y 6 (regla pendiente o grupo inexistente).'
  ELSE 'EXISTE, Activo y con grupo: NO desapareció, está en el grupo/área del bloque 7. Compararlo con el área donde lo estaban buscando.'
END AS Veredicto;
