-- =============================================================================
-- Migración: AreaJefes
-- Nueva tabla many-to-many entre Area y Users para permitir N jefes de área
-- por área. Todos los jefes en esta tabla comparten visibilidad y capacidad
-- de aprobación de las solicitudes del área.
--
-- Data migration: copia los actuales Area.JefeId y Area.JefeSuplenteId a
-- filas en AreaJefes para no romper compatibilidad.
--
-- Este script es idempotente.
-- =============================================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'AreaJefes')
BEGIN
    CREATE TABLE [dbo].[AreaJefes] (
        [AreaId]    INT       NOT NULL,
        [UserId]    INT       NOT NULL,
        [CreatedAt] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),

        CONSTRAINT PK_AreaJefes PRIMARY KEY ([AreaId], [UserId]),
        CONSTRAINT FK_AreaJefes_Area FOREIGN KEY ([AreaId])
            REFERENCES [dbo].[Areas] ([AreaId])  ON DELETE CASCADE,
        CONSTRAINT FK_AreaJefes_User FOREIGN KEY ([UserId])
            REFERENCES [dbo].[Users] ([Id])      ON DELETE NO ACTION
    );

    CREATE INDEX IX_AreaJefes_User ON [dbo].[AreaJefes] ([UserId]);

    PRINT 'Tabla AreaJefes creada.';
END
ELSE
BEGIN
    PRINT 'La tabla AreaJefes ya existe.';
END

-- Data migration: sembrar AreaJefes con los JefeId y JefeSuplenteId actuales,
-- sin duplicar (por si alguna corrida previa ya migró parte).
INSERT INTO [dbo].[AreaJefes] ([AreaId], [UserId], [CreatedAt])
SELECT a.[AreaId], a.[JefeId], GETUTCDATE()
FROM [dbo].[Areas] a
WHERE a.[JefeId] IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM [dbo].[AreaJefes] aj
      WHERE aj.[AreaId] = a.[AreaId] AND aj.[UserId] = a.[JefeId]
  );

INSERT INTO [dbo].[AreaJefes] ([AreaId], [UserId], [CreatedAt])
SELECT a.[AreaId], a.[JefeSuplenteId], GETUTCDATE()
FROM [dbo].[Areas] a
WHERE a.[JefeSuplenteId] IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM [dbo].[AreaJefes] aj
      WHERE aj.[AreaId] = a.[AreaId] AND aj.[UserId] = a.[JefeSuplenteId]
  );

DECLARE @n INT = (SELECT COUNT(*) FROM [dbo].[AreaJefes]);
PRINT CONCAT('AreaJefes total rows: ', @n);
