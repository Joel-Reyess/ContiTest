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
    ///
    /// Excepción: un Gerente BT / RH que no sea además jefe, líder o ingeniero
    /// solo ve las áreas de AreaAsignaciones — la unión le heredaba áreas por
    /// fuentes ajenas a su rol.
    /// </summary>
    public static class AreasVisiblesHelper
    {
        public static async Task<List<int>> AreasVisiblesAsync(FreeTimeDbContext db, int userId)
        {
            // Gerente BT / RH "puro" (sin jefatura, liderazgo ni ingeniería):
            // su alcance son EXACTAMENTE las áreas que se le asignaron, y nada
            // más. Antes se le aplicaba la unión completa, así que heredaba
            // áreas por fuentes que no le corresponden — una fila vieja en
            // Grupos.LiderId o en las columnas legacy JefeId/JefeSuplenteId le
            // metía áreas que nadie le asignó. El calendario no lo mostraba
            // porque lee solo AreaAsignaciones; solicitudes y roles semanales
            // pasan por aquí, y por eso ahí sí aparecían.
            var roles = await db.Users
                .Where(u => u.Id == userId)
                .SelectMany(u => u.Roles)
                .Select(r => r.Name)
                .ToListAsync();

            var esGerenteORH = RolesHelper.TieneRolNombres(roles, "Gerente BT", "RH");
            var tieneOtroRolDeAlcance = RolesHelper.TieneRolNombres(
                roles, "Jefe De Area", "Lider De Grupo", "Ingeniero Industrial", "Super Usuario");

            if (esGerenteORH && !tieneOtroRolDeAlcance)
            {
                return await db.AreaAsignaciones
                    .Where(aa => aa.UserId == userId)
                    .Select(aa => aa.AreaId)
                    .Distinct()
                    .ToListAsync();
            }

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
