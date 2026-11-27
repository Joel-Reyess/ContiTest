using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using tiempo_libre.Models;

namespace tiempo_libre.Helpers
{
    /// <summary>
    /// ¿Ya abrió la captura de la programación anual para un grupo? (26-nov-2026)
    ///
    /// En productivo aparecieron días de 2027 "programados" en constancias y
    /// reportes un día antes de que se liberaran los bloques. Había dos huecos:
    /// el candado de turno del operador dejaba pasar a cualquiera cuyo grupo aún
    /// no tuviera bloques del año, y la asignación manual (jefe, ingeniero,
    /// superusuario) capturaba días de común acuerdo del año en preparación en
    /// cualquier momento, incluso en festivos. La regla ahora: días de común
    /// acuerdo del año que se programa solo cuando ya existen los bloques de su
    /// grupo y ya empezó el primero. Los días por la empresa no cambian: se
    /// asignan antes, por diseño.
    ///
    /// 27-nov-2026: a los operadores que SAP pasó a una regla nueva no se les
    /// podía capturar nada. La regla nueva crea grupos sin bloques de 2027 (se
    /// generaron antes) y el candado los frenaba con "todavía no se liberan los
    /// bloques del grupo". Ahora la captura abre, en este orden, con: el grupo
    /// del bloque donde el empleado tiene su turno (aunque ya no sea su grupo),
    /// su grupo, su área y, si su área tampoco tiene bloques, la planta.
    /// </summary>
    public static class CapturaAnualHelper
    {
        /// <summary>La fila de configuración vigente (la más reciente, igual que el resto de la app).</summary>
        public static Task<ConfiguracionVacaciones?> ConfiguracionAsync(FreeTimeDbContext db) =>
            db.ConfiguracionVacaciones.AsNoTracking()
                .OrderByDescending(c => c.CreatedAt).ThenByDescending(c => c.Id)
                .FirstOrDefaultAsync();

        /// <summary>
        /// Año cuya programación anual se captura: el que está en preparación o, si
        /// no hay uno y el periodo es ProgramacionAnual, el vigente. null = ninguno.
        /// </summary>
        public static int? AnioEnProgramacion(ConfiguracionVacaciones? c) =>
            c == null ? null : c.AnioProgramacionAnual ?? (c.PeriodoActual == "ProgramacionAnual" ? c.AnioVigente : null);

        /// <summary>
        /// Primer bloque (no cancelado) del grupo para ese año. HayBloques = false si
        /// todavía no se generan; Inicio = cuándo abre el primero.
        /// </summary>
        public static async Task<(bool HayBloques, DateTime? Inicio)> PrimerBloqueAsync(FreeTimeDbContext db, int grupoId, int anio)
        {
            var inicio = await db.BloquesReservacion
                .Where(b => b.AnioGeneracion == anio && b.GrupoId == grupoId && b.Estado != "Cancelado")
                .MinAsync(b => (DateTime?)b.FechaHoraInicio);
            return (inicio != null, inicio);
        }

        /// <summary>
        /// Cuándo abre la captura del año para el empleado y de quién se toma
        /// ("del grupo", "del área", "de la planta"). Inicio null = el año no
        /// tiene ningún bloque.
        /// </summary>
        public static async Task<(DateTime? Inicio, string De)> AbreCapturaAsync(
            FreeTimeDbContext db, int empleadoId, int? grupoId, int? areaId, int anio)
        {
            // 1. El grupo del bloque donde tiene su turno: a quien SAP movió de
            //    regla después de generar los bloques se le respeta el que tenía.
            var grupoDeSuTurno = await db.AsignacionesBloque
                .Where(a => a.EmpleadoId == empleadoId && a.Estado != "Transferido"
                            && a.Bloque.AnioGeneracion == anio && a.Bloque.Estado != "Cancelado")
                .OrderByDescending(a => a.Id)
                .Select(a => (int?)a.Bloque.GrupoId)
                .FirstOrDefaultAsync();

            // 2. Su grupo.
            foreach (var g in new[] { grupoDeSuTurno, grupoId }.Where(g => g != null).Distinct())
            {
                var (hayBloques, inicio) = await PrimerBloqueAsync(db, g!.Value, anio);
                if (hayBloques) return (inicio, "del grupo");
            }

            // 3. Su área: un grupo de regla nueva no tiene bloques del año.
            areaId ??= grupoId == null ? null
                : await db.Grupos.Where(g => g.GrupoId == grupoId).Select(g => (int?)g.AreaId).FirstOrDefaultAsync();
            var bloquesDelAnio = db.BloquesReservacion.Where(b => b.AnioGeneracion == anio && b.Estado != "Cancelado");
            if (areaId != null)
            {
                var abreArea = await bloquesDelAnio.Where(b => b.Grupo.AreaId == areaId)
                    .MinAsync(b => (DateTime?)b.FechaHoraInicio);
                if (abreArea != null) return (abreArea, "del área");
            }

            // 4. La planta.
            return (await bloquesDelAnio.MinAsync(b => (DateTime?)b.FechaHoraInicio), "de la planta");
        }

        /// <summary>
        /// null si la captura del año ya abrió para el empleado; si no, por qué no
        /// (sin la palabra "tu": cada pantalla lo completa).
        /// </summary>
        public static async Task<string?> CapturaSinAbrirAsync(
            FreeTimeDbContext db, int empleadoId, int? grupoId, int? areaId, int anio)
        {
            var (inicio, de) = await AbreCapturaAsync(db, empleadoId, grupoId, areaId, anio);
            if (inicio == null)
                return $"todavía no se liberan los bloques (turnos de captura) de {anio}";
            if (DateTime.Now < inicio.Value)
                return $"la captura de {anio} {de} abre el {inicio.Value:dd/MM/yyyy} a las {inicio.Value:HH:mm}";
            return null;
        }

        /// <summary>
        /// null si ya se puede dar un día (que no es de la empresa) en ese año; si
        /// no, por qué no. Para lo que no pasa por la captura del operador ni por
        /// la asignación manual: el intercambio de festivo trabajado. Un año
        /// posterior al vigente y al que se programa no está abierto; el que se
        /// programa, hasta que abra la captura del empleado (CapturaSinAbrirAsync).
        /// </summary>
        public static async Task<string?> AnioSinAbrirAsync(
            FreeTimeDbContext db, int empleadoId, int? grupoId, int? areaId, int anio)
        {
            var config = await ConfiguracionAsync(db);
            if (config == null) return null;
            var enProgramacion = AnioEnProgramacion(config);
            if (anio > Math.Max(config.AnioVigente, enProgramacion ?? int.MinValue))
                return $"la programación de {anio} no está abierta";
            if (anio == enProgramacion)
                return await CapturaSinAbrirAsync(db, empleadoId, grupoId, areaId, anio);
            return null;
        }
    }
}
