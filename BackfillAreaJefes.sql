-- Backfill AreaJefes desde Area.JefeId y Area.JefeSuplenteId.
-- Solo inserta cuando falta la fila; idempotente.
INSERT INTO AreaJefes (AreaId, UserId, CreatedAt)
SELECT a.AreaId, a.JefeId, GETUTCDATE()
FROM Areas a
WHERE a.JefeId IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM AreaJefes aj
    WHERE aj.AreaId = a.AreaId AND aj.UserId = a.JefeId
  );

INSERT INTO AreaJefes (AreaId, UserId, CreatedAt)
SELECT a.AreaId, a.JefeSuplenteId, GETUTCDATE()
FROM Areas a
WHERE a.JefeSuplenteId IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM AreaJefes aj
    WHERE aj.AreaId = a.AreaId AND aj.UserId = a.JefeSuplenteId
  );

-- Verificación: áreas que tienen JefeId pero AreaJefes vacío para ese usuario
-- (deberían ser 0 filas tras el backfill).
SELECT a.AreaId, a.NombreGeneral, a.JefeId, a.JefeSuplenteId
FROM Areas a
WHERE a.JefeId IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM AreaJefes aj WHERE aj.AreaId = a.AreaId AND aj.UserId = a.JefeId
  );
