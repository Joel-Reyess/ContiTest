-- =====================================================================
-- Arregla los acentos rotos en DiasInhabiles.Detalles
-- ("Natalicio B. Ju?rez" en vez de "Natalicio B. Juárez").
--
-- Por qué pasó: las filas se insertaron con literales SIN el prefijo N
-- ('Juárez' en vez de N'Juárez'). Sin la N, SQL Server interpreta el
-- literal con la code page de la collation del servidor y todo lo que no
-- entra ahí se convierte en '?'. El '?' YA está guardado: no es un
-- problema de cómo se muestra, así que hay que reescribir el texto.
--
-- MODO DE USO
--   1. Corre el paso 1 (solo lectura) para ver qué filas están afectadas.
--   2. Si la lista se ve bien, corre el paso 2.
--
-- El paso 2 está envuelto en una transacción SIN COMMIT a propósito:
-- ejecútalo, revisa el SELECT de verificación que sale al final y, sólo
-- si todo está correcto, escribe COMMIT; a mano. Si algo se ve mal,
-- escribe ROLLBACK; y no se modificó nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PASO 1a — SOLO LECTURA: ¿la columna aguanta acentos?
--
-- Tiene que decir nvarchar. Si dijera varchar, el prefijo N no sirve de
-- nada (el acento se vuelve '?' al guardar) y primero habría que hacer
-- ALTER COLUMN a nvarchar. EF la crea como nvarchar, así que lo normal
-- es que esto salga bien; se revisa porque si no, el paso 2 "funciona"
-- sin arreglar nada.
-- ---------------------------------------------------------------------
SELECT  c.name          AS Columna,
        t.name          AS Tipo,
        c.max_length    AS Bytes
FROM    sys.columns c
        JOIN sys.types t ON t.user_type_id = c.user_type_id
WHERE   c.object_id = OBJECT_ID('DiasInhabiles')
  AND   c.name = 'Detalles';


-- ---------------------------------------------------------------------
-- PASO 1b — SOLO LECTURA: ¿qué filas traen el caracter roto?
-- ---------------------------------------------------------------------
SELECT  d.Id,
        d.Fecha,
        '[' + d.Detalles + ']' AS DetalleActual,
        LEN(d.Detalles)        AS Largo
FROM    DiasInhabiles d
WHERE   d.Detalles LIKE '%?%'
ORDER BY d.Fecha;


-- ---------------------------------------------------------------------
-- PASO 2 — CORRECCIÓN. Ejecuta y revisa antes de escribir COMMIT.
--
-- Sólo toca las filas cuyo texto coincide con el patrón esperado, así
-- que un "?" que sea legítimo (una pregunta en el detalle) no se altera.
-- ---------------------------------------------------------------------
BEGIN TRANSACTION;

    UPDATE DiasInhabiles SET Detalles = N'Natalicio de Benito Juárez'
    WHERE  Detalles LIKE 'Natalicio%Ju?rez%';

    UPDATE DiasInhabiles SET Detalles = N'Día de la Constitución'
    WHERE  Detalles LIKE 'D?a de la Constituci?n%'
        OR Detalles LIKE 'Dia de la Constituci?n%';

    UPDATE DiasInhabiles SET Detalles = N'Revolución Mexicana'
    WHERE  Detalles LIKE 'Revoluci?n Mexicana%';

    UPDATE DiasInhabiles SET Detalles = N'Transmisión del Poder Ejecutivo Federal'
    WHERE  Detalles LIKE 'Transmisi?n del Poder%';

    UPDATE DiasInhabiles SET Detalles = N'Día del Trabajo'
    WHERE  Detalles LIKE 'D?a del Trabajo%';

    UPDATE DiasInhabiles SET Detalles = N'Independencia de México'
    WHERE  Detalles LIKE 'Independencia de M?xico%';

    UPDATE DiasInhabiles SET Detalles = N'Navidad'
    WHERE  Detalles LIKE 'Navidad%' AND Detalles LIKE '%?%';

    UPDATE DiasInhabiles SET Detalles = N'Año Nuevo'
    WHERE  Detalles LIKE 'A?o Nuevo%';

    -- Verificación: lo que quedó, y lo que sigue roto (si algo sobra aquí,
    -- agrégalo arriba con su UPDATE antes de hacer COMMIT).
    SELECT  d.Id, d.Fecha, '[' + d.Detalles + ']' AS DetalleNuevo
    FROM    DiasInhabiles d
    WHERE   d.Fecha >= DATEFROMPARTS(YEAR(GETDATE()), 1, 1)
    ORDER BY d.Fecha;

    SELECT  d.Id, d.Fecha, '[' + d.Detalles + ']' AS SigueRoto
    FROM    DiasInhabiles d
    WHERE   d.Detalles LIKE '%?%'
    ORDER BY d.Fecha;

-- Escribe COMMIT; si la verificación se ve bien, o ROLLBACK; si no.
-- (Se deja SIN COMMIT a propósito: nada se guarda hasta que tú lo digas.)
