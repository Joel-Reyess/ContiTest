-- =============================================================================
-- Migración: protección de incapacidades extendidas por jefe de área (Punto 6)
-- Cuando un jefe extiende una incapacidad, el registro original (que vino del
-- Excel) NO se sobrescribe. Se crea un nuevo registro de extensión y se marca
-- el original con ProtegidoPorExtension = 1 para que el sync de Excel
-- (SincronizacionPermisosBackgroundService) lo respete en futuras cargas.
-- =============================================================================

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE Name = N'ProtegidoPorExtension'
      AND Object_ID = Object_ID(N'PermisosEIncapacidadesSAP')
)
BEGIN
    ALTER TABLE [dbo].[PermisosEIncapacidadesSAP]
    ADD [ProtegidoPorExtension] BIT NOT NULL CONSTRAINT DF_PEI_ProtegidoPorExtension DEFAULT(0);
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE Name = N'PermisoOriginalId'
      AND Object_ID = Object_ID(N'PermisosEIncapacidadesSAP')
)
BEGIN
    ALTER TABLE [dbo].[PermisosEIncapacidadesSAP]
    ADD [PermisoOriginalId] INT NULL;
END
GO

-- Índice para acelerar la consulta de protección en el background service.
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_PEI_Protegido_NominaDesdeClAbPre'
      AND object_id = OBJECT_ID(N'PermisosEIncapacidadesSAP')
)
BEGIN
    CREATE INDEX [IX_PEI_Protegido_NominaDesdeClAbPre]
    ON [dbo].[PermisosEIncapacidadesSAP] ([Nomina], [Desde], [ClAbPre])
    WHERE [ProtegidoPorExtension] = 1;
END
GO
