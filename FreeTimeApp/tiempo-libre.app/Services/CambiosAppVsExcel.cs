using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using tiempo_libre.Models;

namespace tiempo_libre.Services
{
    /// <summary>
    /// "Manda lo más reciente" entre la app y el Excel de SAP.
    ///
    /// El Excel manda (acuerdo con el cliente), pero solo puede reflejar lo que
    /// existía cuando RH lo exportó. Lo que la app cambió DESPUÉS de esa carga
    /// —una reprogramación aprobada, un día de empresa movido por edición o por
    /// el superusuario, una captura— el Excel todavía no lo sabe. Sin esta regla
    /// pasaba lo del 32813149 (oct-2026): el superusuario movió su día de empresa
    /// del 12/10 al 20/09 y el rol no ponía la V en el 20/09 (el Excel no lo
    /// traía) mientras el calendario seguía pintando la V del 12/10 (el Excel sí
    /// lo traía). Con la regla, cada día lo decide el dato más nuevo: si la app
    /// cambió después de la carga, manda la app; si el Excel llegó después del
    /// cambio, manda el Excel.
    ///
    /// Aquí se junta, por (empleado, día), CUÁNDO la app quitó o puso una
    /// vacación. Lo usan el rol semanal y el calendario del empleado, para que
    /// las dos pantallas decidan igual.
    ///
    /// Zonas horarias: la sincronización, las reprogramaciones y las capturas
    /// guardan hora local (DateTime.Now); la edición de días empresa y la
    /// reprogramación de día empresa del superusuario guardan UTC. Esas se pasan
    /// a hora local antes de comparar.
    /// </summary>
    public static class CambiosAppVsExcel
    {
        public sealed class Cambios
        {
            /// <summary>Días en que la app QUITÓ una vacación (la movió o la canceló) y cuándo.</summary>
            public Dictionary<(int EmpleadoId, DateOnly Fecha), DateTime> Quitados { get; } = new();

            /// <summary>Días en que la app PUSO una vacación activa y cuándo.</summary>
            public Dictionary<(int EmpleadoId, DateOnly Fecha), DateTime> Puestos { get; } = new();

            /// <summary>
            /// La app quitó la vacación de ese día después de <paramref name="momento"/>
            /// y no la volvió a poner después.
            /// </summary>
            public bool AppQuitoDespuesDe(int empleadoId, DateOnly fecha, DateTime momento) =>
                Quitados.TryGetValue((empleadoId, fecha), out var cuando) && cuando > momento &&
                !(Puestos.TryGetValue((empleadoId, fecha), out var puesto) && puesto > cuando);

            public bool AppPusoDespuesDe(int empleadoId, DateOnly fecha, DateTime momento) =>
                Puestos.TryGetValue((empleadoId, fecha), out var cuando) && cuando > momento;
        }

        private static DateTime DeUtc(DateTime t) => DateTime.SpecifyKind(t, DateTimeKind.Utc).ToLocalTime();

        private static void Guardar(Dictionary<(int, DateOnly), DateTime> d, int empleadoId, DateOnly fecha, DateTime cuando)
        {
            var clave = (empleadoId, fecha);
            if (!d.TryGetValue(clave, out var actual) || cuando > actual)
                d[clave] = cuando;
        }

        public static async Task<Cambios> ObtenerAsync(
            FreeTimeDbContext db, IReadOnlyCollection<int> empleadoIds, DateOnly inicio, DateOnly fin)
        {
            var r = new Cambios();
            if (empleadoIds.Count == 0) return r;
            var ids = empleadoIds.ToList();

            // Reprogramaciones aprobadas (hora local).
            var reprog = await db.SolicitudesReprogramacion
                .Where(s => s.EstadoSolicitud == "Aprobada" && ids.Contains(s.EmpleadoId) &&
                            ((s.FechaOriginalGuardada >= inicio && s.FechaOriginalGuardada <= fin) ||
                             (s.FechaNuevaSolicitada >= inicio && s.FechaNuevaSolicitada <= fin)))
                .Select(s => new { s.EmpleadoId, s.FechaOriginalGuardada, s.FechaNuevaSolicitada, s.FechaRespuesta, s.FechaSolicitud })
                .ToListAsync();
            foreach (var s in reprog)
            {
                var cuando = s.FechaRespuesta ?? s.FechaSolicitud;
                Guardar(r.Quitados, s.EmpleadoId, s.FechaOriginalGuardada, cuando);
                Guardar(r.Puestos, s.EmpleadoId, s.FechaNuevaSolicitada, cuando);
            }

            // Edición de días empresa (auto-aprobada, UTC).
            var ediciones = await db.SolicitudesEdicionDiasEmpresa
                .Where(s => s.EstadoSolicitud == "Aprobada" && ids.Contains(s.EmpleadoId) &&
                            ((s.FechaOriginal >= inicio && s.FechaOriginal <= fin) ||
                             (s.FechaNueva >= inicio && s.FechaNueva <= fin)))
                .Select(s => new { s.EmpleadoId, s.FechaOriginal, s.FechaNueva, s.FechaRespuesta, s.FechaSolicitud })
                .ToListAsync();
            foreach (var s in ediciones)
            {
                var cuando = DeUtc(s.FechaRespuesta ?? s.FechaSolicitud);
                Guardar(r.Quitados, s.EmpleadoId, s.FechaOriginal, cuando);
                Guardar(r.Puestos, s.EmpleadoId, s.FechaNueva, cuando);
            }

            // Reprogramación de día empresa del superusuario (aprobada por el jefe, UTC).
            var diaEmpresa = await db.SolicitudesReprogramacionDiaEmpresa
                .Where(s => s.EstadoSolicitud == "Aprobada" && ids.Contains(s.EmpleadoId) &&
                            ((s.FechaOriginal >= inicio && s.FechaOriginal <= fin) ||
                             (s.FechaNueva >= inicio && s.FechaNueva <= fin)))
                .Select(s => new { s.EmpleadoId, s.FechaOriginal, s.FechaNueva, s.FechaRespuesta, s.FechaSolicitud })
                .ToListAsync();
            foreach (var s in diaEmpresa)
            {
                var cuando = DeUtc(s.FechaRespuesta ?? s.FechaSolicitud);
                Guardar(r.Quitados, s.EmpleadoId, s.FechaOriginal, cuando);
                Guardar(r.Puestos, s.EmpleadoId, s.FechaNueva, cuando);
            }

            // Vacaciones de la app en el rango: las canceladas quitan el día, las
            // activas lo ponen desde que se crearon (hora local).
            var vacaciones = await db.VacacionesProgramadas
                .Where(v => ids.Contains(v.EmpleadoId) && v.FechaVacacion >= inicio && v.FechaVacacion <= fin)
                .Select(v => new { v.EmpleadoId, v.FechaVacacion, v.EstadoVacacion, v.CreatedAt, v.UpdatedAt })
                .ToListAsync();
            foreach (var v in vacaciones)
            {
                if (v.EstadoVacacion == "Cancelada")
                    Guardar(r.Quitados, v.EmpleadoId, v.FechaVacacion, v.UpdatedAt ?? v.CreatedAt);
                else
                    Guardar(r.Puestos, v.EmpleadoId, v.FechaVacacion, v.CreatedAt);
            }

            return r;
        }
    }
}
