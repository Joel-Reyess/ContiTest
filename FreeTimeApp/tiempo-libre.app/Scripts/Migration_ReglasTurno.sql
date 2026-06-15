-- =====================================================================
-- Migración: Reglas de Turnos editables (REGLAS antes hardcodeadas en
-- TurnosHelper.cs). Permite al superusuario rotar el patrón 7 días
-- (Enero / Semana Santa / Fin de año) sin redeploy.
-- Ejecutar en la base de datos FreeTime (SQL Server)
-- =====================================================================

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ReglasTurno')
BEGIN
    CREATE TABLE [dbo].[ReglasTurno] (
        [Id]                          INT             NOT NULL IDENTITY(1,1) PRIMARY KEY,
        [Codigo]                      NVARCHAR(20)    NOT NULL,
        [PatronJson]                  NVARCHAR(MAX)   NOT NULL,
        [FechaReferencia]             DATETIME2       NOT NULL,
        [UltimaRotacion]              DATETIME2       NULL,
        [UltimoUsuarioRotacionId]     INT             NULL,
        [DiasRotadosAcumulado]        INT             NOT NULL DEFAULT 0,
        [Notas]                       NVARCHAR(500)   NULL,
        [CreatedAt]                   DATETIME2       NOT NULL DEFAULT GETUTCDATE(),
        [UpdatedAt]                   DATETIME2       NULL,
        CONSTRAINT [FK_ReglasTurno_UltimoUsuarioRotacion]
            FOREIGN KEY ([UltimoUsuarioRotacionId]) REFERENCES [dbo].[Users]([Id])
            ON DELETE SET NULL
    );

    CREATE UNIQUE INDEX [IX_ReglasTurno_Codigo]
        ON [dbo].[ReglasTurno]([Codigo]);

    PRINT 'Tabla ReglasTurno creada.';
END
ELSE
    PRINT 'Tabla ReglasTurno ya existe.';

-- =====================================================================
-- Seed: 11 reglas tomadas de TurnosHelper.cs tal cual están en código.
-- Solo se insertan si el código aún no existe (idempotente).
-- Fecha de referencia: 2025-09-15 (FECHA_REFERENCIA en TurnosHelper).
-- =====================================================================
DECLARE @FechaRef DATETIME2 = '2025-09-15T00:00:00';

INSERT INTO [dbo].[ReglasTurno] ([Codigo], [PatronJson], [FechaReferencia])
SELECT v.Codigo, v.PatronJson, @FechaRef
FROM (VALUES
    ('R0144', '["3","D","2","2","D","1","1","1","1","1","1","1","D","D","D","3","3","3","3","3","D","2","2","D","D","2","2","3"]'),
    ('N0439', '["1","1","1","1","1","D","D"]'),
    ('R0135', '["1","1","1","1","1","D","D","D","1","1","1","1","1","D"]'),
    ('R0229', '["1","D","1","1","D","1","1","2","2","2","2","2","D","D","D","1","1","1","1","1","D","1","1","D","D","1","1","1"]'),
    ('R0154', '["D","1","1","1","1","1","D","2","2","2","2","2","D","D"]'),
    ('R0267', '["2","2","D","2","2","2","D","D","3","3","3","D","1","1","1","1","1","1","1","D","D"]'),
    ('R0130', '["1","1","1","1","1","D","D","D","3","3","D","2","2","2","2","2","D","3","3","3","3","3","D","2","2","D","1","1"]'),
    ('N0440', '["2","2","2","2","2","D","D"]'),
    ('N0A01', '["1","1","1","D","1","1","D"]'),
    ('R0133', '["1","1","1","1","1","D","D","2","2","2","2","2","D","D"]'),
    ('R0228', '["D","1","1","1","1","1","D","2","2","2","2","2","D","D","1","1","1","1","1","D","D","2","2","2","2","2","D","D"]')
) AS v(Codigo, PatronJson)
WHERE NOT EXISTS (
    SELECT 1 FROM [dbo].[ReglasTurno] r WHERE r.Codigo = v.Codigo
);

PRINT CONCAT('Reglas insertadas: ', @@ROWCOUNT, ' (las ya existentes se omitieron).');
