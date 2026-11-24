-- =============================================================================
-- Migración: Capacidad por periodo "por día" y "por año", y editar (nov-2026)
--
-- 1) CapacidadesPorcentaje.Medicion: 'Grupo' (lo de siempre: cada grupo contra
--    su plantilla) o 'Dia' (solo para un área: todo el personal de los grupos
--    del área que ese día trabajan, sumado; ej. Bladders 13 personas en el día,
--    8% = 1 persona en el día sin importar el turno).
-- 2) Periodo 'Anio': la capacidad rige del 1 de enero al 31 de diciembre.
-- 3) ModificadoPorId / FechaModificacion: botón Editar de la tabla (ya no hay
--    que desactivar y volver a capturar).
--
-- CORRER ANTES de publicar el backend. Si el backend se publica sin esto, las
-- capacidades se siguen aplicando por grupo como antes, pero no se puede guardar
-- ni editar (la pantalla avisa que falta este script). Se puede correr más de una vez.
-- Requiere Migration_CapacidadesPorcentaje.sql (y para Turno,
-- Migration_ReglasTrabajo_CapacidadTurno.sql).
-- =============================================================================

SET NOCOUNT ON;

IF OBJECT_ID('dbo.CapacidadesPorcentaje') IS NULL
BEGIN
    PRINT 'Falta la tabla dbo.CapacidadesPorcentaje: corre primero Scripts/Migration_CapacidadesPorcentaje.sql.';
    RETURN;
END

-- 1) Medicion
IF COL_LENGTH('dbo.CapacidadesPorcentaje', 'Medicion') IS NULL
BEGIN
    ALTER TABLE dbo.CapacidadesPorcentaje
        ADD [Medicion] NVARCHAR(5) NOT NULL CONSTRAINT DF_CapPct_Medicion DEFAULT 'Grupo' WITH VALUES;
    EXEC('ALTER TABLE dbo.CapacidadesPorcentaje ADD CONSTRAINT CK_CapPct_Medicion
          CHECK ([Medicion] IN (''Grupo'', ''Dia''));');
    PRINT 'CapacidadesPorcentaje.Medicion agregada (todas las existentes quedan por grupo).';
END
ELSE
    PRINT 'CapacidadesPorcentaje.Medicion ya existía.';

-- 2) Periodo 'Anio'
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints
               WHERE name = 'CK_CapPct_Periodo' AND definition LIKE '%Anio%')
BEGIN
    IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_CapPct_Periodo')
        ALTER TABLE dbo.CapacidadesPorcentaje DROP CONSTRAINT CK_CapPct_Periodo;
    ALTER TABLE dbo.CapacidadesPorcentaje ADD CONSTRAINT CK_CapPct_Periodo
        CHECK ([Periodo] IN ('Dia', 'Semana', 'Mes', 'Anio'));
    PRINT 'CK_CapPct_Periodo acepta Anio.';
END
ELSE
    PRINT 'CK_CapPct_Periodo ya aceptaba Anio.';

-- 3) Quién la editó y cuándo
IF COL_LENGTH('dbo.CapacidadesPorcentaje', 'ModificadoPorId') IS NULL
BEGIN
    ALTER TABLE dbo.CapacidadesPorcentaje ADD [ModificadoPorId] INT NULL;
    EXEC('ALTER TABLE dbo.CapacidadesPorcentaje ADD CONSTRAINT FK_CapPct_ModificadoPor
          FOREIGN KEY ([ModificadoPorId]) REFERENCES dbo.Users ([Id]) ON DELETE NO ACTION;');
    PRINT 'CapacidadesPorcentaje.ModificadoPorId agregada.';
END
ELSE
    PRINT 'CapacidadesPorcentaje.ModificadoPorId ya existía.';

IF COL_LENGTH('dbo.CapacidadesPorcentaje', 'FechaModificacion') IS NULL
BEGIN
    ALTER TABLE dbo.CapacidadesPorcentaje ADD [FechaModificacion] DATETIME2 NULL;
    PRINT 'CapacidadesPorcentaje.FechaModificacion agregada.';
END
ELSE
    PRINT 'CapacidadesPorcentaje.FechaModificacion ya existía.';
