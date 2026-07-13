-- =============================================================================
-- Migración: RotacionesReglaProgramadas
-- Nueva tabla para agendar rotaciones futuras del patrón de una regla de turno.
-- El SuperUsuario captura fecha (o varias fechas) + días a rotar (7/14/21).
-- Un background job las ejecuta automáticamente cuando FechaEjecucion llega.
-- Semántica idéntica a "Recorrer 7" en Reglas de turnos: rota PatronJson, no
-- toca Grupos.Rol ni Users.GrupoId.
-- Este script es idempotente.
-- =============================================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'RotacionesReglaProgramadas')
BEGIN
    CREATE TABLE [dbo].[RotacionesReglaProgramadas] (
        [Id]                 INT             IDENTITY(1,1) PRIMARY KEY,
        [CodigoRegla]        NVARCHAR(20)    NOT NULL,
        [FechaEjecucion]     DATE            NOT NULL,
        [DiasRotacion]       INT             NOT NULL DEFAULT 7,
        [Estado]             NVARCHAR(20)    NOT NULL DEFAULT 'Pendiente',
        [CreatedByUserId]    INT             NOT NULL,
        [CreatedAt]          DATETIME2       NOT NULL DEFAULT GETUTCDATE(),
        [FechaEjecutadaReal] DATETIME2       NULL,
        [MensajeError]       NVARCHAR(500)   NULL,
        [Notas]              NVARCHAR(500)   NULL,

        CONSTRAINT FK_RRP_Regla FOREIGN KEY ([CodigoRegla])
            REFERENCES [dbo].[ReglasTurno] ([Codigo])  ON DELETE NO ACTION,
        CONSTRAINT FK_RRP_CreatedBy FOREIGN KEY ([CreatedByUserId])
            REFERENCES [dbo].[Users] ([Id])            ON DELETE NO ACTION
    );

    CREATE INDEX IX_RRP_EstadoFecha ON [dbo].[RotacionesReglaProgramadas] ([Estado], [FechaEjecucion]);
    CREATE INDEX IX_RRP_ReglaFecha  ON [dbo].[RotacionesReglaProgramadas] ([CodigoRegla], [FechaEjecucion]);

    PRINT 'Tabla RotacionesReglaProgramadas creada.';
END
ELSE
BEGIN
    PRINT 'La tabla RotacionesReglaProgramadas ya existe.';
END

-- Columna nueva: PatronBaseline (task #84). Si != NULL, el modo es "Fecha de
-- ejecución arranque" y se fija el patrón; si NULL se aplica rotación legacy.
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
     WHERE Name = 'PatronBaseline' AND Object_ID = Object_ID('RotacionesReglaProgramadas')
)
BEGIN
    ALTER TABLE [dbo].[RotacionesReglaProgramadas]
    ADD [PatronBaseline] NVARCHAR(MAX) NULL;
    PRINT 'Columna PatronBaseline agregada.';
END
ELSE
BEGIN
    PRINT 'Columna PatronBaseline ya existe.';
END
