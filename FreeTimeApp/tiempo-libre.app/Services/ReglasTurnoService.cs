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
                // (offset = (gpoRef-1)*7). Al mover la etiqueta de un grupo
                // (p.ej. R0144 → R0144_02), ese grupo automáticamente lee el offset
                // del siguiente sub-grupo y los empleados reciben el horario nuevo.
                //
                // Rotar también el patrón se cancelaba con la rotación del sufijo
                // (cada grupo terminaba leyendo su mismo horario original) → la
                // etiqueta cambiaba pero los días no se movían.
                if (pasosSufijo != 0)
                {
                    await RotarSufijosGruposAsync(codigo, pasosSufijo);
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
        /// Rota los sufijos numéricos de Grupos.Rol que pertenecen a una regla base.
        /// Convención: sub-grupo 1 = sin sufijo (R0144), sub-grupo 2+ = _NN (R0144_02, ...).
        /// El ciclo se calcula por AreaId con el conjunto de sub-grupos existentes en
        /// esa área (así no se generan etiquetas huérfanas).
        /// pasos +1 = R0144 → R0144_02 → R0144_03 → R0144_04 → R0144.
        /// </summary>
        private async Task RotarSufijosGruposAsync(string codigoBase, int pasos)
        {
            var grupos = await _db.Grupos
                .Where(g => g.Rol == codigoBase || g.Rol.StartsWith(codigoBase + "_"))
                .ToListAsync();

            if (grupos.Count <= 1) return;

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

            foreach (var porArea in grupos.GroupBy(g => g.AreaId))
            {
                var ordenados = porArea.OrderBy(g => IndiceActual(g.Rol)).ToList();
                if (ordenados.Count <= 1) continue;

                var indicesExistentes = ordenados.Select(g => IndiceActual(g.Rol)).ToList();
                var cycleN = ordenados.Count;
                var shift = ((pasos % cycleN) + cycleN) % cycleN;

                // Calcular el nuevo Rol para cada grupo según su posición en el ciclo.
                var nuevosRoles = new List<string>(cycleN);
                for (int i = 0; i < cycleN; i++)
                {
                    var nuevoIdx = indicesExistentes[(i + shift) % cycleN];
                    nuevosRoles.Add(FormatearNombre(nuevoIdx));
                }

                for (int i = 0; i < cycleN; i++)
                {
                    ordenados[i].Rol = nuevosRoles[i];
                }
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
