using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using tiempo_libre.DTOs;
using tiempo_libre.Helpers;
using tiempo_libre.Models;

namespace tiempo_libre.Services
{
    /// <summary>
    /// Lectura/edición de las reglas de turnos persistidas. Reemplaza al diccionario
    /// hardcodeado en TurnosHelper.cs y notifica a éste para que recargue su cache
    /// después de cualquier cambio.
    /// </summary>
    public class ReglasTurnoService
    {
        private readonly FreeTimeDbContext _db;

        public ReglasTurnoService(FreeTimeDbContext db)
        {
            _db = db;
        }

        public async Task<List<ReglaTurnoDto>> GetAllAsync()
        {
            var reglas = await _db.ReglasTurno
                .Include(r => r.UltimoUsuarioRotacion)
                .OrderBy(r => r.Codigo)
                .ToListAsync();

            return reglas.Select(ToDto).ToList();
        }

        public async Task<ReglaTurnoDto?> GetByCodigoAsync(string codigo)
        {
            var regla = await _db.ReglasTurno
                .Include(r => r.UltimoUsuarioRotacion)
                .FirstOrDefaultAsync(r => r.Codigo == codigo);
            return regla == null ? null : ToDto(regla);
        }

        public async Task<ReglaTurnoDto> ActualizarPatronAsync(
            string codigo, ActualizarPatronReglaTurnoRequest request, int usuarioId)
        {
            ValidarPatron(request.Patron);

            var regla = await _db.ReglasTurno.FirstOrDefaultAsync(r => r.Codigo == codigo)
                ?? throw new InvalidOperationException($"No existe la regla {codigo}");

            regla.PatronJson = JsonSerializer.Serialize(request.Patron);
            if (request.FechaReferencia.HasValue)
                regla.FechaReferencia = request.FechaReferencia.Value;
            if (!string.IsNullOrWhiteSpace(request.Notas))
                regla.Notas = request.Notas;
            regla.UpdatedAt = DateTime.UtcNow;
            regla.UltimoUsuarioRotacionId = usuarioId;
            regla.UltimaRotacion = DateTime.UtcNow;

            await _db.SaveChangesAsync();
            TurnosHelper.Reload(_db);

            return ToDto(await _db.ReglasTurno.Include(r => r.UltimoUsuarioRotacion)
                .FirstAsync(r => r.Id == regla.Id));
        }

        public async Task<List<ReglaTurnoDto>> RotarAsync(RotarReglasTurnoRequest request, int usuarioId)
        {
            var afectadas = new List<ReglasTurno>();
            var pasosSufijo = request.Dias / 7;

            foreach (var codigo in request.Codigos.Distinct())
            {
                var regla = await _db.ReglasTurno.FirstOrDefaultAsync(r => r.Codigo == codigo);
                if (regla == null) continue;

                // El "recorrido" es solo de las etiquetas Grupos.Rol. El PatronJson
                // es la definición FIJA de qué horario tiene cada sub-grupo
                // (offset = (gpoRef-1)*7). Al rotar la etiqueta de un grupo
                // HACIA ATRÁS en el ciclo (p. ej. R0144 → R0144_04 en 4-ciclo),
                // ese grupo pasa a leer el offset del sub-grupo previo y los
                // empleados ven el horario del sub-grupo anterior del ciclo.
                //
                // El tamaño del ciclo lo define el PATRÓN (PatronJson.Length / 7),
                // NO cuántos sub-grupos existan en cada área. Áreas con
                // sub-grupos faltantes simplemente ven a su(s) grupo(s) caminar
                // por el ciclo en cada rotación.
                var patron = JsonSerializer.Deserialize<List<string>>(regla.PatronJson) ?? new List<string>();
                var cantSubgrupos = patron.Count / 7;
                if (pasosSufijo != 0 && cantSubgrupos > 1)
                {
                    await RotarSufijosGruposAsync(codigo, pasosSufijo, cantSubgrupos);
                }

                regla.UltimaRotacion = DateTime.UtcNow;
                regla.UltimoUsuarioRotacionId = usuarioId;
                regla.DiasRotadosAcumulado += request.Dias;
                regla.UpdatedAt = DateTime.UtcNow;
                if (!string.IsNullOrWhiteSpace(request.Notas))
                    regla.Notas = request.Notas;

                afectadas.Add(regla);
            }

            await _db.SaveChangesAsync();
            TurnosHelper.Reload(_db);

            var ids = afectadas.Select(r => r.Id).ToList();
            var actualizadas = await _db.ReglasTurno
                .Include(r => r.UltimoUsuarioRotacion)
                .Where(r => ids.Contains(r.Id))
                .OrderBy(r => r.Codigo)
                .ToListAsync();
            return actualizadas.Select(ToDto).ToList();
        }

        /// <summary>
        /// Rota los sufijos de Grupos.Rol HACIA ATRÁS dentro del ciclo definido
        /// por el patrón de la regla (cantSubgruposPatron = PatronJson.Length / 7).
        /// Convención: sub-grupo 1 = sin sufijo (R0144), sub-grupo 2+ = _NN.
        /// pasos +1 (Recorrer 7 días) en 4-ciclo:
        ///   R0144 → R0144_04, R0144_02 → R0144,
        ///   R0144_03 → R0144_02, R0144_04 → R0144_03.
        /// Se aplica globalmente (no por AreaId): si un área tiene sub-grupos
        /// incompletos (p. ej. R0130 con índices [1,3,4]), cada grupo simplemente
        /// retrocede en el ciclo del patrón; las etiquetas que aparecen son las
        /// del ciclo completo.
        /// </summary>
        private async Task RotarSufijosGruposAsync(string codigoBase, int pasos, int cantSubgruposPatron)
        {
            if (cantSubgruposPatron <= 1) return;

            var grupos = await _db.Grupos
                .Where(g => g.Rol == codigoBase || g.Rol.StartsWith(codigoBase + "_"))
                .ToListAsync();

            if (grupos.Count == 0) return;

            int IndiceActual(string rol)
            {
                if (rol == codigoBase) return 1;
                var sufijo = rol.Substring(codigoBase.Length + 1);
                return int.TryParse(sufijo, out var n) ? n : 1;
            }

            string FormatearNombre(int idx)
            {
                return idx <= 1 ? codigoBase : $"{codigoBase}_{idx:D2}";
            }

            var N = cantSubgruposPatron;
            var shift = ((pasos % N) + N) % N;
            if (shift == 0) return;

            foreach (var g in grupos)
            {
                var idxCero = (((IndiceActual(g.Rol) - 1) % N) + N) % N;
                var nuevoIdxCero = ((idxCero - shift) % N + N) % N;
                g.Rol = FormatearNombre(nuevoIdxCero + 1);
            }
        }

        /// <summary>
        /// Rotar un patrón "dias" posiciones. Convención: dias positivo = cada grupo
        /// recibe el patrón del grupo previo (ej. R144_04 ← R144_03 como en Enero).
        /// Internamente: newPatron[i] = oldPatron[(i - dias + N) mod N].
        /// </summary>
        public static List<string> RotarPatron(List<string> patron, int dias)
        {
            int n = patron.Count;
            if (n == 0) return new List<string>();
            int shift = ((dias % n) + n) % n;
            var result = new List<string>(n);
            for (int i = 0; i < n; i++)
            {
                result.Add(patron[(i - shift + n) % n]);
            }
            return result;
        }

        private static void ValidarPatron(List<string> patron)
        {
            if (patron == null || patron.Count == 0)
                throw new InvalidOperationException("El patrón no puede estar vacío");
            if (patron.Count % 7 != 0)
                throw new InvalidOperationException(
                    $"La longitud del patrón ({patron.Count}) debe ser múltiplo de 7 (semanas completas)");
            foreach (var t in patron)
            {
                if (string.IsNullOrWhiteSpace(t))
                    throw new InvalidOperationException("Todos los turnos del patrón deben tener un valor");
            }
        }

        private static ReglaTurnoDto ToDto(ReglasTurno r) => new()
        {
            Id = r.Id,
            Codigo = r.Codigo,
            Patron = JsonSerializer.Deserialize<List<string>>(r.PatronJson) ?? new List<string>(),
            FechaReferencia = r.FechaReferencia,
            UltimaRotacion = r.UltimaRotacion,
            UltimoUsuarioRotacionId = r.UltimoUsuarioRotacionId,
            UltimoUsuarioRotacionNombre = r.UltimoUsuarioRotacion?.FullName,
            DiasRotadosAcumulado = r.DiasRotadosAcumulado,
            Notas = r.Notas,
            CreatedAt = r.CreatedAt,
            UpdatedAt = r.UpdatedAt,
        };

    }
}
