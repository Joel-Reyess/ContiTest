using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using tiempo_libre.Models;

namespace tiempo_libre.Helpers
{
    /// <summary>
    /// Helper centralizado para manejar la lógica de turnos y reglas de calendario.
    /// REGLAS se carga desde la tabla ReglasTurno al startup (ver Reload). Los valores
    /// hardcoded de FALLBACK_REGLAS son el seed inicial — si la BD aún no existe o falla
    /// la carga, se usan estos para que el sistema siga arrancando.
    /// </summary>
    public static class TurnosHelper
    {
        /// <summary>
        /// Seed inicial — coincide exactamente con Scripts/Migration_ReglasTurno.sql.
        /// Sirve de fallback antes de que se ejecute la migración o si falla la carga.
        /// </summary>
        private static readonly Dictionary<string, string[]> FALLBACK_REGLAS = new()
        {
            ["R0144"] = new[] { "3", "D", "2", "2", "D", "1", "1" ,"1", "1", "1", "1", "1", "D", "D", "D", "3", "3", "3", "3", "3", "D", "2", "2", "D", "D", "2", "2", "3" },
            ["N0439"] = new[] { "1", "1", "1", "1", "1", "D", "D" },
            ["R0135"] = new[] { "1", "1", "1", "1", "1", "D", "D", "D", "1", "1", "1", "1", "1", "D" },
            ["R0229"] = new[] { "1", "D", "1", "1", "D", "1", "1", "2", "2", "2", "2", "2", "D", "D", "D", "1", "1", "1", "1", "1", "D", "1", "1", "D", "D", "1", "1", "1" },
            ["R0154"] = new[] { "D", "1", "1", "1", "1", "1", "D", "2", "2", "2", "2", "2", "D", "D" },
            ["R0267"] = new[] { "2", "2", "D", "2", "2", "2", "D", "D", "3", "3", "3", "D", "1", "1", "1", "1", "1", "1", "1", "D", "D" },
            ["R0130"] = new[] { "1", "1", "1", "1", "1", "D", "D", "D", "3", "3", "D", "2", "2", "2", "2", "2", "D", "3", "3", "3", "3", "3", "D", "2", "2", "D", "1", "1" },
            ["N0440"] = new[] { "2", "2", "2", "2", "2", "D", "D" },
            ["N0A01"] = new[] { "1", "1", "1", "D", "1", "1", "D" },
            ["R0133"] = new[] { "1", "1", "1", "1", "1", "D", "D", "2", "2", "2", "2", "2", "D", "D" },
            ["R0228"] = new[] { "D", "1", "1", "1", "1", "1", "D", "2", "2", "2", "2", "2", "D", "D", "1", "1", "1", "1", "1", "D", "D", "2", "2", "2", "2", "2", "D", "D" }
        };

        /// <summary>
        /// Reglas activas. Se reemplazan en Reload(db). Empieza con los valores de fallback
        /// para que el sistema funcione mientras Reload todavía no se ha llamado.
        /// </summary>
        public static Dictionary<string, string[]> REGLAS { get; private set; } = new(FALLBACK_REGLAS);

        /// <summary>
        /// Fecha de referencia para cálculos de calendario.
        /// Por defecto 15-sep-2025; se actualiza desde la BD en Reload si las reglas
        /// tienen otra FechaReferencia.
        /// </summary>
        public static DateTime FECHA_REFERENCIA { get; private set; } = new DateTime(2025, 9, 15);

        /// <summary>
        /// Fecha de referencia POR regla. FECHA_REFERENCIA es el mínimo de todas y
        /// sólo se usa como respaldo: una regla que arrancó en otra fecha se debe
        /// anclar a la suya o el calendario sale corrido.
        /// </summary>
        private static Dictionary<string, DateTime> ANCLAS { get; set; } = new();

        /// <summary>
        /// Movimientos de patrón agendados y todavía NO aplicados
        /// (RotacionesReglaProgramadas en estado Pendiente), por regla y ordenados
        /// por fecha. Son de dos tipos: arranque (trae Patron, lo fija a partir de
        /// esa fecha) y recorrido (trae DiasRotacion, desliza el patrón vigente).
        /// Sirven para proyectar el año que se está programando: el turno de una
        /// fecha futura se calcula con lo que va a regir ese día, que es justo lo
        /// que muestra la vista "Calendario anual de reglas".
        /// Los ya ejecutados no entran aquí: quedaron dentro del patrón de la regla.
        /// </summary>
        private static Dictionary<string, List<(DateTime Fecha, string[]? Patron, int DiasRotacion)>> ARRANQUES { get; set; } = new();

        private static readonly object _lock = new();

        /// <summary>
        /// Recarga REGLAS y FECHA_REFERENCIA desde la tabla ReglasTurno. Se llama al
        /// startup y después de cada edición/rotación desde ReglasTurnoService.
        /// Idempotente y silencioso ante fallos (no debe tumbar el arranque).
        /// </summary>
        public static void Reload(FreeTimeDbContext db)
        {
            try
            {
                var filas = db.ReglasTurno.AsNoTracking().ToList();
                if (filas.Count == 0)
                    return;

                var nuevoDict = new Dictionary<string, string[]>(filas.Count);
                foreach (var fila in filas)
                {
                    try
                    {
                        var patron = JsonSerializer.Deserialize<string[]>(fila.PatronJson);
                        if (patron != null && patron.Length > 0)
                            nuevoDict[fila.Codigo] = patron;
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"[WARN] TurnosHelper.Reload: patrón inválido para {fila.Codigo}: {ex.Message}");
                    }
                }

                if (nuevoDict.Count == 0)
                    return;

                var fechaRef = filas.Min(f => f.FechaReferencia);
                var nuevasAnclas = filas
                    .GroupBy(f => f.Codigo)
                    .ToDictionary(g => g.Key, g => g.Min(f => f.FechaReferencia).Date);

                var nuevosArranques = CargarArranquesPendientes(db);

                lock (_lock)
                {
                    REGLAS = nuevoDict;
                    FECHA_REFERENCIA = fechaRef;
                    ANCLAS = nuevasAnclas;
                    ARRANQUES = nuevosArranques;
                }

                Console.WriteLine($"[INFO] TurnosHelper.Reload: {nuevoDict.Count} reglas cargadas desde BD, " +
                                  $"{nuevosArranques.Sum(a => a.Value.Count)} arranque(s) pendiente(s).");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[WARN] TurnosHelper.Reload falló, se mantienen reglas anteriores: {ex.Message}");
            }
        }

        /// <summary>
        /// Lee los arranques agendados que aún no se aplican. Va aparte y con su
        /// propio try/catch: si la tabla no existe todavía en una BD vieja, las
        /// reglas se siguen cargando y el sistema opera como antes.
        /// </summary>
        private static Dictionary<string, List<(DateTime Fecha, string[]? Patron, int DiasRotacion)>> CargarArranquesPendientes(FreeTimeDbContext db)
        {
            var resultado = new Dictionary<string, List<(DateTime Fecha, string[]? Patron, int DiasRotacion)>>();
            try
            {
                var filas = db.RotacionesReglaProgramadas
                    .AsNoTracking()
                    .Where(r => r.Estado == "Pendiente")
                    .OrderBy(r => r.FechaEjecucion)
                    .ToList();

                foreach (var fila in filas)
                {
                    try
                    {
                        string[]? patron = null;
                        if (!string.IsNullOrEmpty(fila.PatronBaseline))
                        {
                            patron = JsonSerializer.Deserialize<string[]>(fila.PatronBaseline);
                            if (patron != null && patron.Length == 0) patron = null;
                        }

                        // Recorrido sin días efectivos: no mueve nada, se ignora.
                        if (patron == null && fila.DiasRotacion == 0) continue;

                        if (!resultado.TryGetValue(fila.CodigoRegla, out var lista))
                        {
                            lista = new List<(DateTime, string[]?, int)>();
                            resultado[fila.CodigoRegla] = lista;
                        }
                        lista.Add((fila.FechaEjecucion.Date, patron, patron != null ? 0 : fila.DiasRotacion));
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"[WARN] TurnosHelper.Reload: movimiento programado #{fila.Id} con patrón inválido: {ex.Message}");
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[WARN] TurnosHelper.Reload: no se pudieron leer los arranques programados: {ex.Message}");
            }
            return resultado;
        }

        /// <summary>
        /// Lo que rige en una fecha: el patrón, la fecha a la que está anclado y
        /// cuántos días de recorrido acumula desde ese ancla.
        /// Manda el arranque agendado más reciente con fecha menor o igual; si no
        /// hay, el patrón vigente de la regla anclado a su FechaReferencia. Encima
        /// se suman los recorridos agendados posteriores al ancla.
        /// </summary>
        public static (string[] Patron, DateTime Ancla, int Desplazamiento) ObtenerPatronVigente(string regla, DateTime fecha)
        {
            var patron = REGLAS.TryGetValue(regla, out var p) ? p : Array.Empty<string>();
            var ancla = ANCLAS.TryGetValue(regla, out var a) ? a : FECHA_REFERENCIA.Date;
            var desplazamiento = 0;

            if (ARRANQUES.TryGetValue(regla, out var programadas))
            {
                for (var i = programadas.Count - 1; i >= 0; i--)
                {
                    if (programadas[i].Patron == null || programadas[i].Fecha > fecha.Date) continue;
                    patron = programadas[i].Patron!;
                    ancla = programadas[i].Fecha;
                    break;
                }

                foreach (var mov in programadas)
                {
                    if (mov.Patron != null) continue;
                    if (mov.Fecha > fecha.Date || mov.Fecha <= ancla) continue;
                    desplazamiento += mov.DiasRotacion;
                }
            }

            return (patron, ancla, desplazamiento);
        }

        /// <summary>
        /// Parsear el rol del grupo para extraer regla y número de grupo
        /// </summary>
        /// <param name="rolGrupo">Formato: "R0144_04" o "R0144"</param>
        /// <returns>Tupla con (Regla, NumeroGrupo) o null si es inválido</returns>
        public static (string Regla, int NumeroGrupo)? ParseRolGrupo(string rolGrupo)
        {
            if (string.IsNullOrEmpty(rolGrupo))
                return null;

            var parts = rolGrupo.Split('_');

            string regla;
            int numeroGrupo = 1;

            if (parts.Length == 1)
            {
                regla = parts[0];
            }
            else if (parts.Length == 2)
            {
                regla = parts[0];
                if (!int.TryParse(parts[1], out numeroGrupo))
                {
                    numeroGrupo = 1;
                }
            }
            else
            {
                return null;
            }

            if (!REGLAS.ContainsKey(regla))
                return null;

            return (regla, numeroGrupo);
        }

        /// <summary>
        /// Crear el rol específico para un grupo basado en la regla y número de grupo
        /// </summary>
        public static string[] CrearRol(string reglaRef, int gpoRef)
        {
            if (!REGLAS.ContainsKey(reglaRef))
                return new string[0];

            return CrearRolDesdePatron(REGLAS[reglaRef], gpoRef);
        }

        /// <summary>
        /// Igual que CrearRol pero sobre un patrón dado (el vigente en una fecha,
        /// que puede venir de un arranque agendado y no del patrón actual).
        /// </summary>
        public static string[] CrearRolDesdePatron(string[] regla, int gpoRef)
        {
            if (regla == null || regla.Length < 7)
                return new string[0];

            var cantSemanas = regla.Length / 7;
            var rol = new string[cantSemanas * 7];
            var dia = (gpoRef - 1) * 7;

            for (int i = 0; i < cantSemanas * 7; i++, dia++)
            {
                rol[i] = regla[dia % (cantSemanas * 7)];
            }

            return rol;
        }

        /// <summary>
        /// Obtener el turno de un empleado para una fecha específica
        /// </summary>
        public static string ObtenerTurnoParaFecha(string rolGrupo, DateOnly fecha)
        {
            return ObtenerTurnoParaFecha(rolGrupo, fecha, null);
        }

        /// <summary>
        /// Obtener el turno de un empleado para una fecha específica con ajuste de Semana Santa
        /// </summary>
        public static string ObtenerTurnoParaFecha(string rolGrupo, DateOnly fecha, DateOnly? semanaSantaFechaFinal)
        {
            var reglaInfo = ParseRolGrupo(rolGrupo);
            if (reglaInfo == null)
                return "1";

            var fechaDateTime = fecha.ToDateTime(TimeOnly.MinValue);

            // El patrón se elige con la fecha real (no la ajustada por Semana
            // Santa) para que el arranque entre exactamente el día agendado.
            var (patron, ancla, desplazamiento) = ObtenerPatronVigente(reglaInfo.Value.Regla, fechaDateTime);
            var rol = CrearRolDesdePatron(patron, reglaInfo.Value.NumeroGrupo);
            if (rol.Length == 0)
                return "1";

            var fechaAjustada = AjustarFechaPorSemanaSanta(fechaDateTime, semanaSantaFechaFinal);
            var diasDiferencia = (fechaAjustada.Date - ancla.Date).Days;

            // Módulo real y no Math.Abs: para fechas anteriores al ancla, el valor
            // absoluto espeja el patrón en vez de recorrerlo hacia atrás.
            var indice = (((diasDiferencia + desplazamiento) % rol.Length) + rol.Length) % rol.Length;

            return rol[indice];
        }

        public static bool EsDescanso(string turno)
        {
            return turno == "D" || turno == "0";
        }

        public static List<string> ObtenerReglasDisponibles()
        {
            return new List<string>(REGLAS.Keys);
        }

        /// <summary>
        /// Agregar o actualizar una regla en memoria (no persiste a BD).
        /// Para cambios persistentes usar ReglasTurnoService.
        /// </summary>
        public static void ActualizarRegla(string codigoRegla, string[] patron)
        {
            lock (_lock)
            {
                REGLAS[codigoRegla] = patron;
            }
        }

        /// <summary>
        /// Ajustar una fecha para cálculo de turnos considerando Semana Santa
        /// </summary>
        public static DateTime AjustarFechaPorSemanaSanta(DateTime fecha, DateOnly? semanaSantaFechaFinal)
        {
            if (!semanaSantaFechaFinal.HasValue)
            {
                return fecha;
            }

            var fechaOnly = DateOnly.FromDateTime(fecha);
            var fechaFinalSS = semanaSantaFechaFinal.Value;

            if (fechaOnly > fechaFinalSS)
            {
                return fecha.AddDays(-7);
            }

            return fecha;
        }
    }
}
