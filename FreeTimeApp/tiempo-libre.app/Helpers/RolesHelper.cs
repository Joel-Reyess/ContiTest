using System;
using System.Collections.Generic;
using System.Linq;
using tiempo_libre.Models;

namespace tiempo_libre.Helpers
{
    /// <summary>
    /// Comparación de nombres de rol tolerante a la nomenclatura de cada BD:
    /// "Jefe De Area", "Jefe_De_Area" y "JefeDeArea" son el mismo rol.
    /// Los nombres de Roles.Name se insertaron a mano en cada ambiente y
    /// difieren entre local y productivo; comparar literal rompe la visibilidad
    /// (403 en [Authorize] y ramas de rol equivocadas en los servicios).
    /// </summary>
    public static class RolesHelper
    {
        public static string Normalizar(string? nombre)
        {
            if (string.IsNullOrWhiteSpace(nombre)) return string.Empty;
            return nombre
                .Replace("_", "")
                .Replace("-", "")
                .Replace(" ", "")
                .ToUpperInvariant();
        }

        public static bool EsMismoRol(string? a, string? b) =>
            Normalizar(a) == Normalizar(b) && !string.IsNullOrEmpty(Normalizar(a));

        /// <summary>
        /// True si la colección de roles contiene alguno de los nombres dados
        /// (comparación normalizada).
        /// </summary>
        public static bool TieneRol(IEnumerable<Rol>? roles, params string[] nombres)
        {
            if (roles == null) return false;
            var set = nombres.Select(Normalizar).ToHashSet();
            return roles.Any(r => set.Contains(Normalizar(r.Name)));
        }

        /// <summary>
        /// Variantes del nombre de rol para emitir como claims: el original,
        /// con guiones bajos como espacios, y sin separadores. Así los
        /// [Authorize(Roles="Jefe De Area")] existentes matchean sin importar
        /// cómo esté escrito Roles.Name en la BD del ambiente.
        /// </summary>
        public static IEnumerable<string> VariantesClaim(string nombre)
        {
            if (string.IsNullOrWhiteSpace(nombre)) yield break;
            var vistas = new HashSet<string>();

            var original = nombre.Trim();
            if (vistas.Add(original)) yield return original;

            var conEspacios = original.Replace("_", " ").Replace("-", " ").Trim();
            while (conEspacios.Contains("  ")) conEspacios = conEspacios.Replace("  ", " ");
            if (vistas.Add(conEspacios)) yield return conEspacios;

            var sinSeparadores = conEspacios.Replace(" ", "");
            if (vistas.Add(sinSeparadores)) yield return sinSeparadores;
        }
    }
}
