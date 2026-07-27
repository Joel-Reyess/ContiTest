using Microsoft.EntityFrameworkCore;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using tiempo_libre.Models;

namespace tiempo_libre.Helpers
{
    /// <summary>
    /// Cálculo único de las áreas visibles para un usuario con rol de
    /// liderazgo. DEBE coincidir con las fuentes que usa
    /// UserController.BuildConsolidatedAreas para armar el selector de áreas
    /// del frontend; si el selector muestra un área, las consultas de
    /// solicitudes tienen que devolver datos para ella:
    ///   1. AreaJefes (multi-jefes) — y columnas legacy JefeId/JefeSuplenteId
    ///      SOLO en áreas sin ninguna fila AreaJefes.
    ///   2. AreaAsignaciones (Gerente BT / RH).
    ///   3. Grupos.LiderId (líder de grupo → área del grupo).
    ///   4. AreaIngenieros activos (Ingeniero Industrial).
    /// </summary>
    public static class AreasVisiblesHelper
    {
        public static async Task<List<int>> AreasVisiblesAsync(FreeTimeDbContext db, int userId)
        {
            var porJefatura = await db.Areas
                .Where(a => a.Jefes.Any(aj => aj.UserId == userId) ||
                            a.Asignaciones.Any(aa => aa.UserId == userId) ||
                            (!a.Jefes.Any() &&
                             (a.JefeId == userId ||
                              a.JefeSuplenteId == userId)))
                .Select(a => a.AreaId)
                .ToListAsync();

            var porLiderazgo = await db.Grupos
                .Where(g => g.LiderId == userId)
                .Select(g => g.AreaId)
                .ToListAsync();

            var porIngenieria = await db.AreaIngenieros
                .Where(ai => ai.IngenieroId == userId && ai.Activo)
                .Select(ai => ai.AreaId)
                .ToListAsync();

            return porJefatura
                .Concat(porLiderazgo)
                .Concat(porIngenieria)
                .Distinct()
                .ToList();
        }
    }
}
