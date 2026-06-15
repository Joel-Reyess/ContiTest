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

            foreach (var codigo in request.Codigos.Distinct())
            {
                var regla = await _db.ReglasTurno.FirstOrDefaultAsync(r => r.Codigo == codigo);
                if (regla == null) continue;

                var patron = JsonSerializer.Deserialize<List<string>>(regla.PatronJson) ?? new List<string>();
                if (patron.Count == 0) continue;

                var rotado = RotarPatron(patron, request.Dias);
                regla.PatronJson = JsonSerializer.Serialize(rotado);
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
