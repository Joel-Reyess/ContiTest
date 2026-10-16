using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using tiempo_libre.Models;

namespace tiempo_libre.Services
{
    /// <summary>
    /// Días del Excel de SAP retenidos por pasarse de la antigüedad
    /// (VacacionesRetenidasSAP) que todavía NO cuentan: los "Pendiente" y los
    /// "Descartada". La fila 1100 sigue en PermisosEIncapacidadesSAP —es lo que
    /// mandó SAP—, así que todo lo que lee esas filas (rol semanal, calendario del
    /// empleado, porcentaje del día, validador de rebase, dashboard) tiene que
    /// saltarse estos días. Un retenido aceptado ya es una vacación de la app y
    /// cuenta por ese lado.
    ///
    /// Si la tabla no existe todavía (no se corrió
    /// Scripts/Migration_VacacionesRetenidasSAP.sql) no hay retenidos: se regresa
    /// vacío y nada truena.
    /// </summary>
    public static class RetencionesSap
    {
        private static volatile bool _tablaConfirmada;

        public static async Task<bool> TablaExisteAsync(FreeTimeDbContext db)
        {
            if (_tablaConfirmada) return true;
            // Fuera de SQL Server (pruebas con InMemory) el modelo basta.
            if (db.Database.ProviderName?.Contains("SqlServer") != true) return true;
            try
            {
                var existe = await db.Database
                    .SqlQueryRaw<int>("SELECT CASE WHEN OBJECT_ID('dbo.VacacionesRetenidasSAP') IS NULL THEN 0 ELSE 1 END AS [Value]")
                    .FirstAsync();
                if (existe == 1) _tablaConfirmada = true;
                return existe == 1;
            }
            catch
            {
                return false;
            }
        }

        /// <summary>(Nómina, día) retenidos que no cuentan, dentro del rango.</summary>
        public static async Task<HashSet<(int Nomina, DateOnly Fecha)>> NoCuentanAsync(
            FreeTimeDbContext db, DateOnly inicio, DateOnly fin)
        {
            if (!await TablaExisteAsync(db)) return new HashSet<(int, DateOnly)>();
            try
            {
                var filas = await db.VacacionesRetenidasSAP
                    .Where(r => r.Estado != "Aceptada" && r.Fecha >= inicio && r.Fecha <= fin)
                    .Select(r => new { r.Nomina, r.Fecha })
                    .ToListAsync();
                return filas.Select(r => (r.Nomina, r.Fecha)).ToHashSet();
            }
            catch
            {
                return new HashSet<(int, DateOnly)>();
            }
        }

        /// <summary>Nóminas con un día retenido que no cuenta en esa fecha.</summary>
        public static async Task<List<int>> NominasNoCuentanEnAsync(FreeTimeDbContext db, DateOnly fecha) =>
            (await NoCuentanAsync(db, fecha, fecha)).Select(r => r.Nomina).Distinct().ToList();
    }
}
