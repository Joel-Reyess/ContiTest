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

                lock (_lock)
                {
                    REGLAS = nuevoDict;
                    FECHA_REFERENCIA = fechaRef;
                }

                Console.WriteLine($"[INFO] TurnosHelper.Reload: {nuevoDict.Count} reglas cargadas desde BD.");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[WARN] TurnosHelper.Reload falló, se mantienen reglas anteriores: {ex.Message}");
            }
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

            var regla = REGLAS[reglaRef];
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

            var rol = CrearRol(reglaInfo.Value.Regla, reglaInfo.Value.NumeroGrupo);
            if (rol.Length == 0)
                return "1";

            var fechaDateTime = fecha.ToDateTime(TimeOnly.MinValue);

            var fechaAjustada = AjustarFechaPorSemanaSanta(fechaDateTime, semanaSantaFechaFinal);
            var diasDiferencia = (fechaAjustada - FECHA_REFERENCIA).Days;
            var indice = diasDiferencia;

            return rol[Math.Abs(indice) % rol.Length];
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
