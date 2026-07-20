-- =============================================================================
-- Migración — nuevos roles Gerente BT y RH (2026-07-20).
-- Idempotente: se puede re-correr sin efectos duplicados.
--
-- Uso: pégalo en SSMS conectado a la BD productiva y F5.
-- =============================================================================

PRINT '=====================================================';
PRINT '  Inserción de roles Gerente BT y RH — inicio';
PRINT '=====================================================';

-------------------------------------------------------------------------------
-- 1) Gerente BT  (Id = 7)
--    Acceso planta completa: Calendario, Dashboard, Plantilla, Reportes,
--    Roles semanales. NO ve Solicitudes.
-------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM [dbo].[Roles] WHERE [Id] = 7 OR [Name] = 'Gerente BT')
BEGIN
    SET IDENTITY_INSERT [dbo].[Roles] ON;

    INSERT INTO [dbo].[Roles] ([Id], [Name], [Description], [Abreviation])
    VALUES (
        7,
        'Gerente BT',
        'Gerente de la unidad de negocio BT. Acceso planta completa: Calendario, Dashboard, Plantilla, Reportes y Roles semanales.',
        'GBT'
    );

    SET IDENTITY_INSERT [dbo].[Roles] OFF;
    PRINT '  ✔ Rol Gerente BT (Id=7) insertado.';
END
ELSE
BEGIN
    PRINT '  = Rol Gerente BT ya existe (Id=7 o Name colisiona).';
END

-------------------------------------------------------------------------------
-- 2) RH  (Id = 8)
--    Acceso planta completa en solo lectura: ve Solicitudes SIN aprobar/rechazar,
--    Calendario, Plantilla, Roles semanales, Reportes.
-------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM [dbo].[Roles] WHERE [Id] = 8 OR [Name] = 'RH')
BEGIN
    SET IDENTITY_INSERT [dbo].[Roles] ON;

    INSERT INTO [dbo].[Roles] ([Id], [Name], [Description], [Abreviation])
    VALUES (
        8,
        'RH',
        'Recursos Humanos. Ve las solicitudes de toda la planta en modo lectura (sin aprobar ni rechazar). También accede a Calendario, Plantilla, Roles semanales y Reportes.',
        'RH'
    );

    SET IDENTITY_INSERT [dbo].[Roles] OFF;
    PRINT '  ✔ Rol RH (Id=8) insertado.';
END
ELSE
BEGIN
    PRINT '  = Rol RH ya existe (Id=8 o Name colisiona).';
END

-------------------------------------------------------------------------------
-- RESUMEN FINAL
-------------------------------------------------------------------------------
PRINT '';
PRINT '=====================================================';
PRINT '  RESUMEN FINAL';
PRINT '=====================================================';

SELECT [Id], [Name], [Abreviation], LEFT([Description], 80) AS Descripcion
FROM [dbo].[Roles]
ORDER BY [Id];

PRINT '';
PRINT '  Inserción de roles terminada.';
PRINT '=====================================================';
