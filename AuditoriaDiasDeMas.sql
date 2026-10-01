-- =====================================================================
-- ¿Quién tiene MÁS días de vacaciones ACTIVOS de los que le tocan por
-- antigüedad? Solo lectura: trabaja en tablas temporales (#), no
-- modifica nada de la base.
--
-- DERECHO POR ANTIGÜEDAD — la misma regla que la app
-- (VacacionesService.CalcularVacacionesPorAntiguedad; está en código,
-- NO en la tabla VacacionesPorAntiguedad, que es heredada y no se usa
-- para validar nada):
--   antigüedad = años cumplidos al 31-dic de @Anio
--                (con corte al 31-dic eso es @Anio - año de ingreso)
--   años    empresa (Automatica)   común acuerdo (Anual)
--   1         0                      0
--   2         0                      2
--   3         0                      4
--   4         3                      3
--   5         4                      4
--   6+        5                      5 + 2 por cada 5 años después del 6
--             (6-10=5, 11-15=7, 16-20=9, 21-25=11, 26-30=13, 31-35=15)
--   < 1 año o sin FechaIngreso: la app no le reconoce días (rechaza).
--   (Los "12 días de empresa" fijos de VacacionesCalculadas.DiasEmpresa
--    NO son renglones de VacacionesProgramadas y no entran aquí.)
--
-- CÓMO SE CUENTAN LOS DÍAS ACTIVOS DE @Anio (EstadoVacacion = 'Activa'):
--   Empresa    : Automatica, AsignadaAutomaticamente, DiaEmpresaReprogramado
--   Adicionales: Anual, Reprogramacion (aquí caen las "Alta por
--                sincronización SAP"), y cualquier otro tipo que no sea
--                de empresa ni festivo.
--   VacacionLaborada: cuenta del lado de la vacación que reemplazó
--                (se busca en SolicitudesVacacionLaborada).
--   NO cuenta  : FestivoTrabajado / PeriodoProgramacion 'IntercambioFestivo'
--                (el festivo trabajado es aparte de los 4+4).
--   Un día que la app movió (solicitud de reprogramación, sync SAP)
--   conserva el TipoVacacion del original, así que cuenta en su lado.
--
-- Corre las dos consultas juntas (comparten las tablas #). El aviso
-- "Null value is eliminated by an aggregate" es normal (COUNT DISTINCT
-- de fechas repetidas) y no afecta el resultado.
-- =====================================================================
SET NOCOUNT ON;

DECLARE @Anio          INT = 2026;
DECLARE @SoloActivos   BIT = 1;   -- 1 = solo empleados con Users.Status = 0 (Activo)
DECLARE @VerCanceladas BIT = 0;   -- 1 = el detalle también lista los días cancelados (para seguir movimientos)

DECLARE @Ini DATE = DATEFROMPARTS(@Anio, 1, 1);
DECLARE @Fin DATE = DATEFROMPARTS(@Anio + 1, 1, 1);

IF OBJECT_ID('tempdb..#Vac') IS NOT NULL DROP TABLE #Vac;
IF OBJECT_ID('tempdb..#Res') IS NOT NULL DROP TABLE #Res;

-- ---------------------------------------------------------------------
-- 1) Renglones del año (cualquier estado) con marcas de la sync SAP
-- ---------------------------------------------------------------------
SELECT v.Id, v.EmpleadoId, v.FechaVacacion, v.TipoVacacion, v.OrigenAsignacion,
       v.EstadoVacacion, v.PeriodoProgramacion, v.FechaProgramacion, v.Observaciones,
       v.CreatedAt, v.CreatedBy, v.UpdatedAt, v.UpdatedBy,
       CAST(NULL AS NVARCHAR(50)) AS TipoOriginal,   -- solo VacacionLaborada
       CAST(NULL AS VARCHAR(10))  AS Cuenta,         -- Empresa / Operador / Festivo
       -- "Alta por sincronización SAP (vacación capturada directo en SAP)"
       CASE WHEN v.Observaciones LIKE N'Alta por sincronizaci%n SAP%' THEN 1 ELSE 0 END AS AltaSap,
       -- "Reprogramada por sincronización SAP: dd/MM/yyyy -> dd/MM/yyyy" (el renglón nuevo)
       CASE WHEN v.Observaciones LIKE N'Reprogramada por sincronizaci%n SAP: %/%/% -> %' THEN 1 ELSE 0 END AS MovidaSap,
       CASE WHEN v.Observaciones LIKE N'%sincronizaci%n SAP%' THEN 1 ELSE 0 END AS MarcaSap,
       -- Fecha original (texto dd/MM/yyyy) de un día que la sync SAP movió
       CASE WHEN v.Observaciones LIKE N'Reprogramada por sincronizaci%n SAP: %/%/% -> %'
            THEN SUBSTRING(v.Observaciones, CHARINDEX(N'SAP: ', v.Observaciones) + 5, 10) END AS OriginalSapTxt
INTO #Vac
FROM VacacionesProgramadas v
     JOIN Users u ON u.Id = v.EmpleadoId
WHERE v.FechaVacacion >= @Ini AND v.FechaVacacion < @Fin
  AND (@SoloActivos = 0 OR u.Status = 0);         -- 0 = Activo

-- ---------------------------------------------------------------------
-- 2) VacacionLaborada: ¿qué tipo era la vacación que reemplazó?
--    (si la tabla no existe en esta base, se queda como 'Adicionales')
-- ---------------------------------------------------------------------
IF OBJECT_ID('dbo.SolicitudesVacacionLaborada') IS NOT NULL
    UPDATE x
       SET TipoOriginal = o.TipoVacacion
      FROM #Vac x
           JOIN dbo.SolicitudesVacacionLaborada s ON s.VacacionCreadaId = x.Id
           JOIN dbo.VacacionesProgramadas o
             ON o.Id = COALESCE(s.VacacionCanceladaId, s.VacacionOriginalId)
     WHERE x.TipoVacacion = 'VacacionLaborada';

-- ---------------------------------------------------------------------
-- 3) De qué lado cuenta cada día
-- ---------------------------------------------------------------------
UPDATE #Vac
   SET Cuenta = CASE
        WHEN TipoVacacion = 'FestivoTrabajado'
          OR PeriodoProgramacion = 'IntercambioFestivo'
          OR TipoOriginal = 'FestivoTrabajado'                          THEN 'Festivo'
        WHEN COALESCE(TipoOriginal, TipoVacacion)
             IN ('Automatica', 'AsignadaAutomaticamente', 'DiaEmpresaReprogramado') THEN 'Empresa'
        ELSE 'Operador'
   END;

-- ---------------------------------------------------------------------
-- 4) Resumen por empleado: derecho vs activos
-- ---------------------------------------------------------------------
;WITH Act AS (
    SELECT EmpleadoId,
           SUM(CASE WHEN Cuenta = 'Empresa'  THEN 1 ELSE 0 END) AS ActEmpresa,
           SUM(CASE WHEN Cuenta = 'Operador' THEN 1 ELSE 0 END) AS ActOperador,
           SUM(CASE WHEN Cuenta = 'Festivo'  THEN 1 ELSE 0 END) AS ActFestivo,
           SUM(CASE WHEN TipoVacacion IN ('Automatica', 'AsignadaAutomaticamente') THEN 1 ELSE 0 END) AS Automatica,
           SUM(CASE WHEN TipoVacacion = 'DiaEmpresaReprogramado' THEN 1 ELSE 0 END) AS DiaEmpresaReprogramado,
           SUM(CASE WHEN TipoVacacion = 'Anual'                  THEN 1 ELSE 0 END) AS Anual,
           SUM(CASE WHEN TipoVacacion = 'Reprogramacion'         THEN 1 ELSE 0 END) AS Reprogramacion,
           SUM(CASE WHEN TipoVacacion = 'VacacionLaborada' AND Cuenta <> 'Festivo' THEN 1 ELSE 0 END) AS VacacionLaborada,
           SUM(CASE WHEN Cuenta <> 'Festivo'
                     AND TipoVacacion NOT IN ('Automatica', 'AsignadaAutomaticamente', 'DiaEmpresaReprogramado',
                                              'Anual', 'Reprogramacion', 'VacacionLaborada')
                    THEN 1 ELSE 0 END) AS OtrosTipos,
           SUM(CASE WHEN Cuenta <> 'Festivo' AND AltaSap   = 1 THEN 1 ELSE 0 END) AS AltasSap,
           SUM(CASE WHEN Cuenta <> 'Festivo' AND MovidaSap = 1 THEN 1 ELSE 0 END) AS MovidasSap,
           SUM(CASE WHEN Cuenta <> 'Festivo' THEN 1 ELSE 0 END)
             - COUNT(DISTINCT CASE WHEN Cuenta <> 'Festivo' THEN FechaVacacion END) AS RenglonesEnFechaRepetida
    FROM #Vac
    WHERE EstadoVacacion = 'Activa'
    GROUP BY EmpleadoId
),
Base AS (
    SELECT a.*, u.Nomina, u.FullName, u.FechaIngreso, u.GrupoId,
           COALESCE(g.AreaId, u.AreaId) AS AreaId,
           CASE WHEN u.FechaIngreso IS NULL THEN NULL
                WHEN @Anio - YEAR(u.FechaIngreso) < 0 THEN 0
                ELSE @Anio - YEAR(u.FechaIngreso) END AS Anios
    FROM Act a
         JOIN Users u       ON u.Id = a.EmpleadoId
         LEFT JOIN Grupos g ON g.GrupoId = u.GrupoId
),
Der AS (
    SELECT b.*,
           CASE WHEN b.Anios IS NULL THEN 0
                WHEN b.Anios <= 3    THEN 0
                WHEN b.Anios = 4     THEN 3
                WHEN b.Anios = 5     THEN 4
                ELSE 5 END AS DerEmpresa,
           CASE WHEN b.Anios IS NULL THEN 0
                WHEN b.Anios <= 1    THEN 0
                WHEN b.Anios = 2     THEN 2
                WHEN b.Anios = 3     THEN 4
                WHEN b.Anios = 4     THEN 3
                WHEN b.Anios = 5     THEN 4
                ELSE 5 + 2 * ((b.Anios - 6) / 5) END AS DerAdicionales
    FROM Base b
)
SELECT d.*,
       d.ActEmpresa  - d.DerEmpresa      AS DifEmpresa,
       d.ActOperador - d.DerAdicionales  AS DifAdicionales,
       (d.ActEmpresa + d.ActOperador) - (d.DerEmpresa + d.DerAdicionales) AS DifTotal
INTO #Res
FROM Der d
WHERE d.ActEmpresa  > d.DerEmpresa
   OR d.ActOperador > d.DerAdicionales;

-- =====================================================================
-- CONSULTA 1: empleados que se pasan
--   Diagnostico:
--     EXCESO                 -> en total tiene más días de los que le tocan
--     TIPOS DESCUADRADOS     -> el total cuadra, pero un lado (empresa o
--                               adicionales) se pasa y el otro se queda corto
--     SIN FECHA DE INGRESO / MENOS DE 1 AÑO -> la app no le reconoce días
--   SinAltasSapYaCuadra = 'SI' -> quitando las "Alta por sincronización
--     SAP" ya no se pasa del total: el exceso viene del Excel.
-- =====================================================================
SELECT r.Nomina,
       r.FullName                         AS Nombre,
       a.NombreGeneral                    AS Area,
       g.Rol                              AS Grupo,
       r.FechaIngreso,
       r.Anios                            AS AniosAl31Dic,
       r.DerEmpresa                       AS CorrespondenEmpresa,
       r.DerAdicionales                   AS CorrespondenAdicionales,
       r.DerEmpresa + r.DerAdicionales    AS CorrespondenTotal,
       r.ActEmpresa                       AS ActivosEmpresa,
       r.ActOperador                      AS ActivosAdicionales,
       r.ActEmpresa + r.ActOperador       AS ActivosTotal,
       r.Automatica, r.DiaEmpresaReprogramado, r.Anual, r.Reprogramacion,
       r.VacacionLaborada, r.OtrosTipos,
       r.ActFestivo                       AS FestivoTrabajado_NoCuenta,
       CASE WHEN r.DifEmpresa     > 0 THEN r.DifEmpresa     ELSE 0 END AS ExcesoEmpresa,
       CASE WHEN r.DifAdicionales > 0 THEN r.DifAdicionales ELSE 0 END AS ExcesoAdicionales,
       CASE WHEN r.DifTotal       > 0 THEN r.DifTotal       ELSE 0 END AS ExcesoTotal,
       r.AltasSap                         AS DiasAltaPorSyncSAP,
       r.MovidasSap                       AS DiasMovidosPorSyncSAP,
       CASE WHEN r.AltasSap + r.MovidasSap > 0 THEN 'SI' ELSE 'NO' END AS TieneDiasDeSyncSAP,
       CASE WHEN r.AltasSap > 0
             AND (r.ActEmpresa + r.ActOperador - r.AltasSap) <= (r.DerEmpresa + r.DerAdicionales)
            THEN 'SI' ELSE 'NO' END       AS SinAltasSapYaCuadra,
       r.RenglonesEnFechaRepetida,
       CASE WHEN r.FechaIngreso IS NULL THEN 'SIN FECHA DE INGRESO'
            WHEN r.Anios < 1            THEN 'MENOS DE 1 AÑO'
            WHEN r.DifTotal > 0         THEN 'EXCESO'
            ELSE 'TIPOS DESCUADRADOS' END AS Diagnostico
FROM #Res r
     LEFT JOIN Grupos g ON g.GrupoId = r.GrupoId
     LEFT JOIN Areas  a ON a.AreaId  = r.AreaId
ORDER BY CASE WHEN r.DifTotal > 0 THEN 0 ELSE 1 END,
         r.DifTotal DESC, a.NombreGeneral, g.Rol, r.Nomina;

-- =====================================================================
-- CONSULTA 2: detalle día por día de esos empleados
--   SyncSAP                      ALTA SAP / MOVIDA POR SAP / SAP
--   FechaRepetida                'SI' = otro renglón activo (no festivo) el mismo día
--   SapMovioDosVecesElOriginal   'SI' = la sync SAP movió el MISMO día original a
--                                dos fechas (lo deja el lote de 100 sin guardar)
--   SolicitudSobreDiaYaMovidoSAP 'SI' = reprogramación aprobada cuyo día original
--                                ya lo había cancelado/movido la sync SAP (+1 día)
--   Sap1100_*                    la fila 1100 de PermisosEIncapacidadesSAP que cubre
--                                la fecha; si el rango (Hasta-Desde+1) es mayor que
--                                Dias, el Excel trae descansos dentro del periodo y
--                                la sync da de alta TODOS los días naturales.
-- =====================================================================
SELECT r.Nomina,
       r.FullName                          AS Nombre,
       x.FechaVacacion                     AS Fecha,
       CASE DATEDIFF(DAY, '19000101', x.FechaVacacion) % 7   -- 1900-01-01 fue lunes
            WHEN 0 THEN 'Lun' WHEN 1 THEN 'Mar' WHEN 2 THEN 'Mié' WHEN 3 THEN 'Jue'
            WHEN 4 THEN 'Vie' WHEN 5 THEN 'Sáb' ELSE 'Dom' END AS Dia,
       x.EstadoVacacion                    AS Estado,
       x.TipoVacacion                      AS Tipo,
       x.TipoOriginal                      AS TipoOriginal_Laborada,
       CASE x.Cuenta WHEN 'Empresa'  THEN 'Empresa'
                     WHEN 'Operador' THEN 'Adicionales'
                     ELSE 'No cuenta (festivo)' END AS CuentaComo,
       x.OrigenAsignacion                  AS Origen,
       x.PeriodoProgramacion               AS Periodo,
       CASE WHEN x.AltaSap   = 1 THEN 'ALTA SAP'
            WHEN x.MovidaSap = 1 THEN 'MOVIDA POR SAP'
            WHEN x.MarcaSap  = 1 THEN 'SAP'
            ELSE '' END                    AS SyncSAP,
       CASE WHEN x.EstadoVacacion = 'Activa' AND x.Cuenta <> 'Festivo' AND dup.n > 1
            THEN 'SI' ELSE '' END          AS FechaRepetida,
       CASE WHEN x.EstadoVacacion = 'Activa' AND x.OriginalSapTxt IS NOT NULL AND dos.n > 1
            THEN 'SI' ELSE '' END          AS SapMovioDosVecesElOriginal,
       CASE WHEN sol.OriginalId IS NOT NULL THEN 'SI' ELSE '' END AS SolicitudSobreDiaYaMovidoSAP,
       sap.Desde                           AS Sap1100_Desde,
       sap.Hasta                           AS Sap1100_Hasta,
       sap.Dias                            AS Sap1100_Dias,
       sap.DiaNat                          AS Sap1100_DiaNat,
       x.Observaciones,
       x.FechaProgramacion,
       x.CreatedAt,
       cu.FullName                         AS CreadoPor,
       x.UpdatedAt,
       uu.FullName                         AS ActualizadoPor,
       x.Id                                AS VacacionId
FROM #Vac x
     JOIN #Res r ON r.EmpleadoId = x.EmpleadoId
     LEFT JOIN Users cu ON cu.Id = x.CreatedBy
     LEFT JOIN Users uu ON uu.Id = x.UpdatedBy
     OUTER APPLY (SELECT COUNT(*) AS n
                  FROM #Vac d
                  WHERE d.EmpleadoId = x.EmpleadoId
                    AND d.FechaVacacion = x.FechaVacacion
                    AND d.EstadoVacacion = 'Activa'
                    AND d.Cuenta <> 'Festivo') dup
     OUTER APPLY (SELECT COUNT(*) AS n
                  FROM #Vac m
                  WHERE m.EmpleadoId = x.EmpleadoId
                    AND m.EstadoVacacion = 'Activa'
                    AND m.OriginalSapTxt = x.OriginalSapTxt) dos
     OUTER APPLY (SELECT TOP 1 o.Id AS OriginalId
                  FROM SolicitudesReprogramacion s
                       JOIN VacacionesProgramadas o ON o.Id = s.VacacionOriginalId
                  WHERE x.Observaciones LIKE N'Reprogramada via solicitud%'
                    AND s.EmpleadoId = x.EmpleadoId
                    AND s.FechaNuevaSolicitada = x.FechaVacacion
                    AND s.EstadoSolicitud = 'Aprobada'
                    AND o.Observaciones LIKE N'%sincronizaci%n SAP%') sol
     OUTER APPLY (SELECT TOP 1 p.Desde, p.Hasta, p.Dias, p.DiaNat
                  FROM PermisosEIncapacidadesSAP p
                  WHERE p.Nomina = r.Nomina
                    AND p.ClAbPre = 1100
                    AND x.FechaVacacion BETWEEN p.Desde AND p.Hasta
                  ORDER BY CASE WHEN p.Dias IS NULL OR p.Dias > 0 THEN 0 ELSE 1 END,
                           p.FechaRegistro DESC, p.Id DESC) sap
WHERE @VerCanceladas = 1 OR x.EstadoVacacion = 'Activa'
ORDER BY CASE WHEN r.DifTotal > 0 THEN 0 ELSE 1 END, r.DifTotal DESC,
         r.Nomina, x.FechaVacacion,
         CASE x.EstadoVacacion WHEN 'Activa' THEN 0 ELSE 1 END, x.Id;
