-- =============================================================================
-- Migración: CapacidadesPorcentaje (oct-2026)
--
-- Capacidad adicional de ausencia por periodo: un porcentaje distinto al general
-- para un día, una semana o un mes, para toda la planta, un área o un grupo
-- (Ingeniería Industrial, con autorización de tiempo extra). Se configura en
-- Superusuario -> Vacaciones -> "Capacidad por periodo".
--
-- CORRER ANTES de publicar el backend que la usa. Si el backend se publica sin
-- esta tabla, todo sigue con el porcentaje general como antes y la pantalla
-- avisa que falta la tabla. Se puede correr más de una vez.
-- =============================================================================

IF OBJECT_ID('dbo.CapacidadesPorcentaje') IS NULL
BEGIN
    CREATE TABLE [dbo].[CapacidadesPorcentaje] (
        [Id]                  INT            IDENTITY(1,1) PRIMARY KEY,
        [Alcance]             NVARCHAR(10)   NOT NULL,
        [AreaId]              INT            NULL,
        [GrupoId]             INT            NULL,
        [Periodo]             NVARCHAR(10)   NOT NULL,
        [FechaInicio]         DATE           NOT NULL,
        [FechaFin]            DATE           NOT NULL,
        [Porcentaje]          DECIMAL(5,2)   NOT NULL,
        [Motivo]              NVARCHAR(300)  NULL,
        [Activa]              BIT            NOT NULL DEFAULT 1,
        [CreadoPorId]         INT            NULL,
        [FechaCreacion]       DATETIME2      NOT NULL DEFAULT GETDATE(),
        [DesactivadoPorId]    INT            NULL,
        [FechaDesactivacion]  DATETIME2      NULL,

        CONSTRAINT FK_CapPct_Area          FOREIGN KEY ([AreaId])           REFERENCES [dbo].[Areas] ([AreaId])   ON DELETE NO ACTION,
        CONSTRAINT FK_CapPct_Grupo         FOREIGN KEY ([GrupoId])          REFERENCES [dbo].[Grupos] ([GrupoId]) ON DELETE NO ACTION,
        CONSTRAINT FK_CapPct_CreadoPor     FOREIGN KEY ([CreadoPorId])      REFERENCES [dbo].[Users] ([Id])       ON DELETE NO ACTION,
        CONSTRAINT FK_CapPct_DesactivadoPor FOREIGN KEY ([DesactivadoPorId]) REFERENCES [dbo].[Users] ([Id])      ON DELETE NO ACTION,
        CONSTRAINT CK_CapPct_Alcance CHECK ([Alcance] IN ('Planta','Area','Grupo')),
        CONSTRAINT CK_CapPct_Periodo CHECK ([Periodo] IN ('Dia','Semana','Mes')),
        CONSTRAINT CK_CapPct_Fechas  CHECK ([FechaFin] >= [FechaInicio]),
        CONSTRAINT CK_CapPct_Pct     CHECK ([Porcentaje] > 0 AND [Porcentaje] <= 100)
    );

    CREATE INDEX IX_CapPct_Vigencia ON [dbo].[CapacidadesPorcentaje] ([Activa], [FechaInicio], [FechaFin]);

    PRINT 'Tabla CapacidadesPorcentaje creada.';
END
ELSE
BEGIN
    PRINT 'La tabla CapacidadesPorcentaje ya existe.';
END
