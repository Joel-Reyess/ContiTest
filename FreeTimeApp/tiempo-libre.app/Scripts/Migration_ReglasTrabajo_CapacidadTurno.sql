-- =============================================================================
-- Reglas de trabajo y asignación de días + capacidad por turno (nov-2026).
-- CORRER ANTES DE PUBLICAR EL BACKEND. Se puede correr más de una vez.
--
-- 1) ReglasDomingo.DiaAplicacion: a qué días aplica la regla ("Domingo",
--    "Sabado" o "Ambos"). Antes era siempre el domingo y el sábado opcional
--    (IncluyeSabado): las reglas que ya existen quedan igual que estaban
--    ("Ambos" si tenían el sábado, "Domingo" si no).
-- 2) CK_RegDom_Tipo acepta también 'ParoEmpresa' (paro con días por la
--    empresa; la pantalla todavía no lo deja guardar).
-- 3) CapacidadesPorcentaje.Turno: NULL = todo el día; '1', '2' o '3' = el % solo
--    aplica a los grupos que ese día van en ese turno por su rol.
--
-- Requiere que ya existan las tablas (Migration_ReglasDomingo.sql y
-- Migration_CapacidadesPorcentaje.sql).
-- =============================================================================

SET NOCOUNT ON;

-- 1 y 2) ReglasDomingo
IF OBJECT_ID('dbo.ReglasDomingo') IS NULL
    PRINT 'Falta la tabla dbo.ReglasDomingo: corre primero Scripts/Migration_ReglasDomingo.sql.';
ELSE
BEGIN
    IF COL_LENGTH('dbo.ReglasDomingo', 'DiaAplicacion') IS NULL
    BEGIN
        ALTER TABLE dbo.ReglasDomingo ADD [DiaAplicacion] NVARCHAR(8) NOT NULL
            CONSTRAINT DF_RegDom_DiaAplicacion DEFAULT 'Domingo' WITH VALUES;
        EXEC('UPDATE dbo.ReglasDomingo SET DiaAplicacion = ''Ambos'' WHERE IncluyeSabado = 1;');
        EXEC('ALTER TABLE dbo.ReglasDomingo ADD CONSTRAINT CK_RegDom_DiaAplicacion
              CHECK ([DiaAplicacion] IN (''Domingo'', ''Sabado'', ''Ambos''));');
        PRINT 'ReglasDomingo.DiaAplicacion agregada.';
    END
    ELSE
        PRINT 'ReglasDomingo.DiaAplicacion ya existía.';

    IF EXISTS (SELECT 1 FROM sys.check_constraints
               WHERE name = 'CK_RegDom_Tipo' AND parent_object_id = OBJECT_ID('dbo.ReglasDomingo')
                 AND definition NOT LIKE '%ParoEmpresa%')
        ALTER TABLE dbo.ReglasDomingo DROP CONSTRAINT CK_RegDom_Tipo;

    IF NOT EXISTS (SELECT 1 FROM sys.check_constraints
                   WHERE name = 'CK_RegDom_Tipo' AND parent_object_id = OBJECT_ID('dbo.ReglasDomingo'))
    BEGIN
        ALTER TABLE dbo.ReglasDomingo ADD CONSTRAINT CK_RegDom_Tipo
            CHECK ([Tipo] IN ('SinDomingo', 'RolNormal', 'ParoEmpresa'));
        PRINT 'CK_RegDom_Tipo acepta ParoEmpresa.';
    END
END

-- 3) CapacidadesPorcentaje.Turno
IF OBJECT_ID('dbo.CapacidadesPorcentaje') IS NULL
    PRINT 'Falta la tabla dbo.CapacidadesPorcentaje: corre primero Scripts/Migration_CapacidadesPorcentaje.sql.';
ELSE IF COL_LENGTH('dbo.CapacidadesPorcentaje', 'Turno') IS NULL
BEGIN
    ALTER TABLE dbo.CapacidadesPorcentaje ADD [Turno] NVARCHAR(1) NULL;
    EXEC('ALTER TABLE dbo.CapacidadesPorcentaje ADD CONSTRAINT CK_CapPct_Turno
          CHECK ([Turno] IS NULL OR [Turno] IN (''1'', ''2'', ''3''));');
    PRINT 'CapacidadesPorcentaje.Turno agregada.';
END
ELSE
    PRINT 'CapacidadesPorcentaje.Turno ya existía.';
