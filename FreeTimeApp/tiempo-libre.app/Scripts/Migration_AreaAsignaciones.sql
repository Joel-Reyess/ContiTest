-- =============================================================================
-- Migración — tabla AreaAsignaciones para asignar Gerente BT y RH por área.
-- Idempotente: se puede re-correr sin efectos.
--
-- Uso: pégalo en SSMS conectado a la BD productiva y F5.
--
-- Estructura:
--   (AreaId, UserId, RolId) es la clave primaria.
--   RolId = 7 → Gerente BT
--   RolId = 8 → RH
--   Un mismo usuario puede estar asignado a N áreas con el mismo rol,
--   y a la misma área con dos roles distintos (aunque no es lo esperado).
-- =============================================================================

PRINT '=====================================================';
PRINT '  Migración AreaAsignaciones — inicio';
PRINT '=====================================================';

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'AreaAsignaciones')
BEGIN
    CREATE TABLE [dbo].[AreaAsignaciones] (
        [AreaId] INT NOT NULL,
        [UserId] INT NOT NULL,
        [RolId]  INT NOT NULL,
        [CreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_AreaAsignaciones_CreatedAt] DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT [PK_AreaAsignaciones] PRIMARY KEY CLUSTERED ([AreaId], [UserId], [RolId]),
        CONSTRAINT [FK_AreaAsignaciones_Area]
            FOREIGN KEY ([AreaId]) REFERENCES [dbo].[Areas]([AreaId]) ON DELETE CASCADE,
        CONSTRAINT [FK_AreaAsignaciones_User]
            FOREIGN KEY ([UserId]) REFERENCES [dbo].[Users]([Id]),
        CONSTRAINT [FK_AreaAsignaciones_Rol]
            FOREIGN KEY ([RolId]) REFERENCES [dbo].[Roles]([Id])
    );

    CREATE NONCLUSTERED INDEX [IX_AreaAsignaciones_UserRol]
        ON [dbo].[AreaAsignaciones] ([UserId], [RolId]);

    CREATE NONCLUSTERED INDEX [IX_AreaAsignaciones_AreaRol]
        ON [dbo].[AreaAsignaciones] ([AreaId], [RolId]);

    PRINT '  ✔ Tabla AreaAsignaciones creada.';
END
ELSE
BEGIN
    PRINT '  = Tabla AreaAsignaciones ya existe.';
END

PRINT '';
PRINT '  Estado actual:';
SELECT COUNT(*) AS TotalAsignaciones FROM [dbo].[AreaAsignaciones];

PRINT '';
PRINT '  Migración terminada.';
PRINT '=====================================================';
