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
        /// null si la captura del año ya abrió para el grupo; si no, por qué no
        /// (sin la palabra "tu": cada pantalla lo completa).
        /// </summary>
        public static async Task<string?> CapturaSinAbrirAsync(FreeTimeDbContext db, int? grupoId, int anio)
        {
            if (grupoId == null)
                return $"sin grupo asignado no hay turno de captura para {anio}";
            var (hayBloques, inicio) = await PrimerBloqueAsync(db, grupoId.Value, anio);
            if (!hayBloques)
                return $"todavía no se liberan los bloques (turnos de captura) de {anio} del grupo";
            if (DateTime.Now < inicio!.Value)
                return $"la captura de {anio} del grupo abre el {inicio.Value:dd/MM/yyyy} a las {inicio.Value:HH:mm}";
            return null;
        }
    }
}
