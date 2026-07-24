-- Diagnóstico: por qué algunos operadores no cambian de área tras sync SAP.
-- Correr en orden. Guardar resultados para comparar con logs del backend.

-- 1) Nóminas en RolesEmpleadosSAP con Regla que está PendienteConfiguracion.
--    Estas NO propagan nada al empleado hasta que la regla se active.
SELECT r.Regla, COUNT(*) AS Nominas
FROM RolesEmpleadosSAP r
INNER JOIN ReglasTurno t ON t.Codigo = r.Regla AND t.Estado = 'PendienteConfiguracion'
GROUP BY r.Regla
ORDER BY Nominas DESC;

-- 2) Nóminas en RolesEmpleadosSAP cuya Regla existe activa pero SIN Grupo asociado
--    (comparando el rol normalizado). Estas caen en el silent-skip "gruposPosibles vacío".
--    Reemplaza el REPLACE anidado si tu SQL Server no lo soporta con espacios.
SELECT r.Regla, COUNT(DISTINCT r.Nomina) AS Nominas
FROM RolesEmpleadosSAP r
INNER JOIN ReglasTurno t ON t.Codigo = r.Regla AND t.Estado = 'Activa'
LEFT JOIN Grupos g ON UPPER(REPLACE(REPLACE(REPLACE(g.Rol, '_', ''), '-', ''), ' ', ''))
                    = UPPER(REPLACE(REPLACE(REPLACE(r.Regla, '_', ''), '-', ''), ' ', ''))
WHERE g.GrupoId IS NULL
GROUP BY r.Regla
ORDER BY Nominas DESC;

-- 3) UnidadOrganizativa que aparece en RolesEmpleadosSAP pero NO existe en Areas.
--    Operadores movidos a esta unidad no encuentran área destino.
SELECT r.UnidadOrganizativa, COUNT(DISTINCT r.Nomina) AS Nominas
FROM RolesEmpleadosSAP r
LEFT JOIN Areas a ON a.UnidadOrganizativaSap = r.UnidadOrganizativa
WHERE a.AreaId IS NULL AND r.UnidadOrganizativa IS NOT NULL AND r.UnidadOrganizativa <> ''
GROUP BY r.UnidadOrganizativa
ORDER BY Nominas DESC;

-- 4) Delta directo: nóminas donde RolesEmpleadosSAP dice X pero Empleados/Users siguen en Y.
--    Muestra los casos concretos que "no cambiaron de área" a pesar de que SAP ya trae la nueva.
SELECT
    r.Nomina,
    r.UnidadOrganizativa AS SapUnidad,
    e.UnidadOrganizativa AS EmpleadoUnidad,
    r.Regla              AS SapRegla,
    e.Rol                AS EmpleadoRol,
    u.AreaId             AS UserAreaId,
    aUser.NombreGeneral  AS UserAreaNombre,
    aSap.NombreGeneral   AS SapAreaNombre,
    CASE
        WHEN t.Estado = 'PendienteConfiguracion' THEN 'REGLA PENDIENTE'
        WHEN t.Codigo IS NULL                    THEN 'REGLA NO EXISTE EN ReglasTurno'
        WHEN aSap.AreaId IS NULL                 THEN 'UNIDAD NO TIENE AREA'
        WHEN gSap.GrupoId IS NULL                THEN 'SIN GRUPO PARA LA REGLA'
        ELSE 'OTRO — revisar logs'
    END AS Diagnostico
FROM RolesEmpleadosSAP r
INNER JOIN Empleados e ON e.Nomina = r.Nomina
LEFT JOIN Users u      ON u.Username = CAST(r.Nomina AS NVARCHAR)
LEFT JOIN Areas aUser  ON aUser.AreaId = u.AreaId
LEFT JOIN Areas aSap   ON aSap.UnidadOrganizativaSap = r.UnidadOrganizativa
LEFT JOIN ReglasTurno t ON t.Codigo = r.Regla
LEFT JOIN Grupos gSap  ON UPPER(REPLACE(REPLACE(REPLACE(gSap.Rol, '_', ''), '-', ''), ' ', ''))
                       = UPPER(REPLACE(REPLACE(REPLACE(r.Regla, '_', ''), '-', ''), ' ', ''))
                       AND gSap.AreaId = aSap.AreaId
WHERE r.UnidadOrganizativa IS NOT NULL
  AND r.UnidadOrganizativa <> e.UnidadOrganizativa
ORDER BY r.UnidadOrganizativa, r.Nomina;

-- 5) Users cuya columna Nomina es NULL o distinta al Username (rompe el primer pase por Nomina).
SELECT u.Id, u.Username, u.Nomina, u.FullName
FROM Users u
WHERE u.Nomina IS NULL
   OR CAST(u.Nomina AS NVARCHAR) <> u.Username
ORDER BY u.Id;
