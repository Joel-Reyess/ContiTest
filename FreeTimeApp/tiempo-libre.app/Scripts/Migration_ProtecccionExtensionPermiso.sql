-- =============================================================================
-- Migración: protección de incapacidades extendidas por jefe de área (Punto 6)
-- Cuando un jefe extiende una incapacidad, el registro original (que vino del
-- Excel) NO se sobrescribe. Se crea un nuevo registro de extensión y se marca
-- el original con ProtegidoPorExtension = 1 para que el sync de Excel
-- (SincronizacionPermisosBackgroundService) lo respete en futuras cargas.
--
-- Idempotente: se puede ejecutar varias veces sin error.
-- =============================================================================

-- 1) Columna ProtegidoPorExtension (BIT, default 0)
IF COL_LENGTH('dbo.PermisosEIncapacidadesSAP', 'ProtegidoPorExtension') IS NULL
    ALTER TABLE [dbo].[PermisosEIncapacidadesSAP]
        ADD [ProtegidoPorExtension] BIT NOT NULL
        CONSTRAINT DF_PEI_ProtegidoPorExtension DEFAULT(0);
GO

-- 2) Columna PermisoOriginalId (INT NULL) — apunta al permiso original cuando
--    el registro es una extensión creada por el jefe.
IF COL_LENGTH('dbo.PermisosEIncapacidadesSAP', 'PermisoOriginalId') IS NULL
    ALTER TABLE [dbo].[PermisosEIncapacidadesSAP]
        ADD [PermisoOriginalId] INT NULL;
GO

-- 3) Índice filtrado para acelerar el chequeo de protegidos en el background sync.
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_PEI_Protegido_NominaDesdeClAbPre'
      AND object_id = OBJECT_ID(N'dbo.PermisosEIncapacidadesSAP')
)
    CREATE INDEX [IX_PEI_Protegido_NominaDesdeClAbPre]
    ON [dbo].[PermisosEIncapacidadesSAP] ([Nomina], [Desde], [ClAbPre])
    WHERE [ProtegidoPorExtension] = 1;
GO

-- Verificación
PRINT 'Verificación post-migración:';
SELECT
    CASE WHEN COL_LENGTH('dbo.PermisosEIncapacidadesSAP', 'ProtegidoPorExtension') IS NOT NULL
         THEN 'OK' ELSE 'FALTA' END AS ProtegidoPorExtension,
    CASE WHEN COL_LENGTH('dbo.PermisosEIncapacidadesSAP', 'PermisoOriginalId') IS NOT NULL
         THEN 'OK' ELSE 'FALTA' END AS PermisoOriginalId,
    CASE WHEN EXISTS (
            SELECT 1 FROM sys.indexes
            WHERE name = N'IX_PEI_Protegido_NominaDesdeClAbPre'
              AND object_id = OBJECT_ID(N'dbo.PermisosEIncapacidadesSAP'))
         THEN 'OK' ELSE 'FALTA' END AS Indice;
GO
