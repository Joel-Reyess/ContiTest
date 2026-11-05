-- =============================================================================
-- Migración: ReglasDomingo (oct-2026)
--
-- Reglas dominicales por unidad organizativa y periodo: en el periodo elegido
-- el área (o un grupo) trabaja sin domingos (y opcionalmente sin sábados), o
-- sigue con el rol normal a siete días como excepción. Se configuran en
-- Superusuario -> Vacaciones -> "Domingos por unidad organizativa".
--
-- CORRER ANTES de publicar el backend que la usa. Sin esta tabla todo sigue
-- con el rol normal a siete días, como antes, y la pantalla avisa que falta la
-- tabla. Se puede correr más de una vez.
-- =============================================================================

IF OBJECT_ID('dbo.ReglasDomingo') IS NULL
BEGIN
    CREATE TABLE [dbo].[ReglasDomingo] (
        [Id]                  INT            IDENTITY(1,1) PRIMARY KEY,
        [AreaId]              INT            NOT NULL,
        [GrupoId]             INT            NULL,
        [Tipo]                NVARCHAR(12)   NOT NULL,
        [IncluyeSabado]       BIT            NOT NULL DEFAULT 0,
        [FechaInicio]         DATE           NOT NULL,
        [FechaFin]            DATE           NOT NULL,
        [Motivo]              NVARCHAR(300)  NULL,
        [Activa]              BIT            NOT NULL DEFAULT 1,
        [CreadoPorId]         INT            NULL,
        [FechaCreacion]       DATETIME2      NOT NULL DEFAULT GETDATE(),
        [DesactivadoPorId]    INT            NULL,
        [FechaDesactivacion]  DATETIME2      NULL,

        CONSTRAINT FK_RegDom_Area           FOREIGN KEY ([AreaId])           REFERENCES [dbo].[Areas] ([AreaId])   ON DELETE NO ACTION,
        CONSTRAINT FK_RegDom_Grupo          FOREIGN KEY ([GrupoId])          REFERENCES [dbo].[Grupos] ([GrupoId]) ON DELETE NO ACTION,
        CONSTRAINT FK_RegDom_CreadoPor      FOREIGN KEY ([CreadoPorId])      REFERENCES [dbo].[Users] ([Id])       ON DELETE NO ACTION,
        CONSTRAINT FK_RegDom_DesactivadoPor FOREIGN KEY ([DesactivadoPorId]) REFERENCES [dbo].[Users] ([Id])       ON DELETE NO ACTION,
        CONSTRAINT CK_RegDom_Tipo   CHECK ([Tipo] IN ('SinDomingo','RolNormal')),
        CONSTRAINT CK_RegDom_Fechas CHECK ([FechaFin] >= [FechaInicio])
    );

    CREATE INDEX IX_RegDom_Vigencia ON [dbo].[ReglasDomingo] ([Activa], [FechaInicio], [FechaFin]);

    PRINT 'Tabla ReglasDomingo creada.';
END
ELSE
BEGIN
    PRINT 'La tabla ReglasDomingo ya existe.';
END
