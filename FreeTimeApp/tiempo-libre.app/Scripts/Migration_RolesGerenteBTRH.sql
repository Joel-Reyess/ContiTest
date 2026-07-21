-- =============================================================================
-- Migración — nuevos roles Gerente BT y RH.
-- Idempotente: se puede re-correr sin efectos duplicados.
--
-- Uso: pégalo en SSMS conectado a la BD productiva y F5.
--
-- Nota: checa existencia SOLO por Name. Si el Id 7/8 ya está ocupado por otro
-- rol pre-existente, deja que SQL asigne el siguiente Id libre; los checks de
-- autorización se hacen por Name (`User.IsInRole("Gerente BT")`), no por Id.
-- =============================================================================

PRINT '=====================================================';
PRINT '  Inserción de roles Gerente BT y RH — inicio';
PRINT '=====================================================';

PRINT '';
PRINT '  Estado ANTES:';
SELECT [Id], [Name], [Abreviation] FROM [dbo].[Roles] ORDER BY [Id];

-------------------------------------------------------------------------------
-- 1) Gerente BT
--    Acceso planta completa: Calendario, Dashboard, Plantilla, Reportes,
--    Roles semanales. NO ve Solicitudes.
-------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM [dbo].[Roles] WHERE [Name] = 'Gerente BT')
BEGIN
    -- Preferimos Id=7 si está libre; si no, dejamos que IDENTITY lo asigne.
    IF NOT EXISTS (SELECT 1 FROM [dbo].[Roles] WHERE [Id] = 7)
    BEGIN
        SET IDENTITY_INSERT [dbo].[Roles] ON;
        INSERT INTO [dbo].[Roles] ([Id], [Name], [Description], [Abreviation])
        VALUES (7, 'Gerente BT',
            'Gerente de la unidad de negocio BT. Acceso planta completa: Calendario, Dashboard, Plantilla, Reportes y Roles semanales.',
            'GBT');
        SET IDENTITY_INSERT [dbo].[Roles] OFF;
        PRINT '  ✔ Rol Gerente BT insertado con Id=7.';
    END
    ELSE
    BEGIN
        INSERT INTO [dbo].[Roles] ([Name], [Description], [Abreviation])
        VALUES ('Gerente BT',
            'Gerente de la unidad de negocio BT. Acceso planta completa: Calendario, Dashboard, Plantilla, Reportes y Roles semanales.',
            'GBT');
        PRINT '  ✔ Rol Gerente BT insertado con Id auto-asignado (Id=7 ocupado).';
    END
END
ELSE
BEGIN
    PRINT '  = Rol Gerente BT ya existe (por Name).';
END

-------------------------------------------------------------------------------
-- 2) RH
--    Acceso planta completa en solo lectura: ve Solicitudes SIN aprobar/rechazar,
--    Calendario, Plantilla, Roles semanales, Reportes.
-------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM [dbo].[Roles] WHERE [Name] = 'RH')
BEGIN
    IF NOT EXISTS (SELECT 1 FROM [dbo].[Roles] WHERE [Id] = 8)
    BEGIN
        SET IDENTITY_INSERT [dbo].[Roles] ON;
        INSERT INTO [dbo].[Roles] ([Id], [Name], [Description], [Abreviation])
        VALUES (8, 'RH',
            'Recursos Humanos. Ve las solicitudes de toda la planta en modo lectura (sin aprobar ni rechazar). También accede a Calendario, Plantilla, Roles semanales y Reportes.',
            'RH');
        SET IDENTITY_INSERT [dbo].[Roles] OFF;
        PRINT '  ✔ Rol RH insertado con Id=8.';
    END
    ELSE
    BEGIN
        INSERT INTO [dbo].[Roles] ([Name], [Description], [Abreviation])
        VALUES ('RH',
            'Recursos Humanos. Ve las solicitudes de toda la planta en modo lectura (sin aprobar ni rechazar). También accede a Calendario, Plantilla, Roles semanales y Reportes.',
            'RH');
        PRINT '  ✔ Rol RH insertado con Id auto-asignado (Id=8 ocupado).';
    END
END
ELSE
BEGIN
    PRINT '  = Rol RH ya existe (por Name).';
END

-------------------------------------------------------------------------------
-- RESUMEN FINAL
-------------------------------------------------------------------------------
PRINT '';
PRINT '=====================================================';
PRINT '  Estado DESPUÉS:';
PRINT '=====================================================';

SELECT [Id], [Name], [Abreviation], LEFT([Description], 80) AS Descripcion
FROM [dbo].[Roles]
ORDER BY [Id];

PRINT '';
PRINT '  Inserción de roles terminada.';
PRINT '=====================================================';
