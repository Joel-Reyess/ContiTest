-- =============================================================================
-- RESTAURAR UN OPERADOR QUE DESAPARECIÓ DE LA APP
-- Caso: está en RolesEmpleadosSAP (el archivo de roles) pero NO en Empleados,
--       y por lo tanto tampoco en Users. Reportado con la nómina 32000075.
--
-- Por qué pasa: la aplicación NUNCA insertaba en Empleados. Solo actualizaba esa
-- tabla, y sí la borraba (el botón "eliminar empleado sindicalizado" borra la
-- fila de Users y la de Empleados en la misma transacción). Como el archivo de
-- roles solo sirve para ACTUALIZAR, una vez borrada la fila no había forma de
-- que regresara: la sincronización se limitaba a dejar el warning
--    "existe en RolesEmpleadosSAP pero NO en Empleados. Empleado nunca cargado."
--
-- Los bloques 1 a 4 son SOLO LECTURA. Del 5 en adelante SÍ escriben y están
-- marcados; córrelos únicamente si el bloque 4 dice que se puede.
-- =============================================================================
DECLARE @Nomina INT = 32000075;   -- <<< cambia la nómina aquí

-- ── 1. ¿Qué dice el archivo de roles? (aquí SÍ está, según lo revisado) ───────
SELECT 'RolesEmpleadosSAP' AS Tabla, Nomina, Nombre, Alta, CentroCoste,
       UnidadOrganizativa, EncargadoRegistro, Regla, Turno
FROM RolesEmpleadosSAP
WHERE Nomina = @Nomina;

-- ── 2. ¿Existe en Empleados y en Users? ──────────────────────────────────────
SELECT 'Empleados' AS Tabla, * FROM Empleados WHERE Nomina = @Nomina;

-- Status: 0 = Activo, 1 = Desactivado, 2 = Suspendido.
SELECT 'Users' AS Tabla, Id, Username, FullName, Nomina, Status, AreaId, GrupoId, FechaIngreso
FROM Users
WHERE Nomina = @Nomina OR Username = CAST(@Nomina AS NVARCHAR(20));

-- ── 3. ¿La regla que reporta SAP ya está configurada? ────────────────────────
-- Si Estado = 'PendienteConfiguracion', el SuperUsuario tiene que capturar el
-- patrón en Reglas de turnos ANTES de que el operador pueda caer en un grupo.
SELECT rt.Codigo, rt.Estado, rt.PatronJson
FROM ReglasTurno rt
JOIN RolesEmpleadosSAP r ON r.Nomina = @Nomina
WHERE REPLACE(REPLACE(REPLACE(rt.Codigo, '_', ''), '-', ''), ' ', '') =
      REPLACE(REPLACE(REPLACE(r.Regla,   '_', ''), '-', ''), ' ', '');

-- ── 4. ¿Hay Área y Grupo a dónde mandarlo? ───────────────────────────────────
-- Si esto sale VACÍO no basta con restaurar la fila: falta crear el grupo o el
-- área, y el operador quedaría cargado pero sin grupo (invisible igual).
SELECT a.AreaId, a.NombreGeneral, a.UnidadOrganizativaSap, a.EncargadoRegistro,
       g.GrupoId, g.Rol AS RolDelGrupo
FROM RolesEmpleadosSAP r
JOIN Areas  a ON UPPER(LTRIM(RTRIM(a.UnidadOrganizativaSap))) = UPPER(LTRIM(RTRIM(r.UnidadOrganizativa)))
JOIN Grupos g ON g.AreaId = a.AreaId
             AND REPLACE(REPLACE(REPLACE(UPPER(g.Rol), '_', ''), '-', ''), ' ', '') =
                 REPLACE(REPLACE(REPLACE(UPPER(r.Regla), '_', ''), '-', ''), ' ', '')
WHERE r.Nomina = @Nomina;

-- =============================================================================
-- ⚠️ DE AQUÍ EN ADELANTE SE ESCRIBE. Saca respaldo antes.
-- Si vas a desplegar el backend de la rama fix/punchlist-batch-1, NO necesitas
-- correr nada de esto: la sincronización ya restaura sola las dos filas.
-- =============================================================================

-- ── 5. Restaurar la fila en Empleados desde el archivo de roles ──────────────
BEGIN TRANSACTION;

INSERT INTO Empleados (Nomina, Nombre, FechaAlta, CentroCoste, UnidadOrganizativa, EncargadoRegistro, Rol)
SELECT r.Nomina, r.Nombre, r.Alta, TRY_CONVERT(INT, r.CentroCoste),
       r.UnidadOrganizativa, r.EncargadoRegistro, r.Regla
FROM RolesEmpleadosSAP r
WHERE r.Nomina = @Nomina
  AND NOT EXISTS (SELECT 1 FROM Empleados e WHERE e.Nomina = r.Nomina);

SELECT 'Empleados despues' AS Paso, * FROM Empleados WHERE Nomina = @Nomina;
-- Revisa el resultado y luego:
-- COMMIT TRANSACTION;   -- o   ROLLBACK TRANSACTION;

-- ── 6. Dar de alta el User (solo si el bloque 2 no devolvió ninguno) ─────────
-- Usuario = nómina, contraseña inicial = nómina, igual que el alta normal.
-- El hash es SHA256(contraseña + salt) en base64, idéntico al de la app.
BEGIN TRANSACTION;

DECLARE @Pwd  VARCHAR(20) = CAST(@Nomina AS VARCHAR(20));
DECLARE @Salt VARCHAR(50) = LOWER(CONVERT(VARCHAR(50), NEWID()));
DECLARE @Bin  VARBINARY(MAX) = HASHBYTES('SHA2_256', @Pwd + @Salt);
DECLARE @Hash VARCHAR(MAX) =
    CAST(N'' AS XML).value('xs:base64Binary(sql:variable("@Bin"))', 'VARCHAR(MAX)');

DECLARE @AreaId INT, @GrupoId INT, @Nombre NVARCHAR(100), @Alta DATE, @CC INT, @Pos NVARCHAR(100);

SELECT TOP 1 @AreaId = a.AreaId, @GrupoId = g.GrupoId
FROM Empleados e
JOIN Areas  a ON UPPER(LTRIM(RTRIM(a.UnidadOrganizativaSap))) = UPPER(LTRIM(RTRIM(e.UnidadOrganizativa)))
JOIN Grupos g ON g.AreaId = a.AreaId
             AND REPLACE(REPLACE(REPLACE(UPPER(g.Rol), '_', ''), '-', ''), ' ', '') =
                 REPLACE(REPLACE(REPLACE(UPPER(e.Rol), '_', ''), '-', ''), ' ', '')
WHERE e.Nomina = @Nomina
ORDER BY CASE WHEN UPPER(ISNULL(a.EncargadoRegistro, '')) = UPPER(ISNULL(e.EncargadoRegistro, '')) THEN 0 ELSE 1 END;

SELECT @Nombre = Nombre, @Alta = FechaAlta, @CC = CentroCoste, @Pos = Posicion
FROM Empleados WHERE Nomina = @Nomina;

IF @GrupoId IS NULL
    SELECT 'ALTO: no hay Area/Grupo para esa regla. Configura primero la regla y el grupo.' AS Aviso;
ELSE
BEGIN
    INSERT INTO Users (Username, PasswordHash, PasswordSalt, FullName, Status, CreatedAt, CreatedBy,
                       AreaId, GrupoId, Nomina, FechaIngreso, CentroCoste, Posicion)
    VALUES (CAST(@Nomina AS NVARCHAR(20)), @Hash, @Salt, @Nombre, 0, GETUTCDATE(), 0,
            @AreaId, @GrupoId, @Nomina, @Alta, @CC, @Pos);

    DECLARE @UserId INT = SCOPE_IDENTITY();

    -- El nombre de las columnas de UserRoles lo pone EF por convención, así que
    -- se resuelve en caliente en vez de adivinarlo.
    DECLARE @ColUser SYSNAME = (SELECT TOP 1 COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
                                WHERE TABLE_NAME = 'UserRoles' AND COLUMN_NAME LIKE '%User%');
    DECLARE @ColRol  SYSNAME = (SELECT TOP 1 COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
                                WHERE TABLE_NAME = 'UserRoles' AND COLUMN_NAME LIKE '%Rol%');
    DECLARE @Sql NVARCHAR(MAX) =
        N'INSERT INTO UserRoles (' + QUOTENAME(@ColUser) + N',' + QUOTENAME(@ColRol) + N') VALUES (@u, 2);';
    EXEC sp_executesql @Sql, N'@u INT', @u = @UserId;   -- 2 = Empleado Sindicalizado

    SELECT 'Users despues' AS Paso, Id, Username, FullName, Nomina, Status, AreaId, GrupoId, FechaIngreso
    FROM Users WHERE Id = @UserId;
END;

-- Revisa el resultado y luego:
-- COMMIT TRANSACTION;   -- o   ROLLBACK TRANSACTION;
