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

            // Auto-alta: si la regla venía Pendiente (auto-descubierta desde
            // RolesEmpleadosSAP) y el SuperUsuario acaba de capturar un patrón
            // válido, pasa a Activa. Antes había que ir a "Asignar a área"
            // para activarla, lo cual era confuso.
            if (regla.Estado == "PendienteConfiguracion" && request.Patron.Count > 0)
            {
                regla.Estado = "Activa";
            }

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

                // El "recorrido" desliza el PATRÓN sin tocar las etiquetas Grupos.Rol:
                // cada sub-grupo conserva su nombre (R0144, R0144_02, …) pero la
                // semana se adelanta: cada sub-grupo pasa a leer el horario que
                // antes leía el sub-grupo SIGUIENTE del ciclo.
                // RotarPatron(patron, dias>0) hace exactamente eso: newPatron[i] =
                // oldPatron[(i + dias) mod N] ⇒ sub-grupo 1 (offset 0) ahora ve
                // lo que tenía el sub-grupo 2, etc.
                var patron = JsonSerializer.Deserialize<List<string>>(regla.PatronJson) ?? new List<string>();
                if (patron.Count > 0 && request.Dias != 0)
                {
                    var rotado = RotarPatron(patron, request.Dias);
                    regla.PatronJson = JsonSerializer.Serialize(rotado);
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
        /// Rotar un patrón "dias" posiciones. Convención: dias positivo = la semana
        /// se adelanta, cada grupo recibe el patrón del grupo SIGUIENTE
        /// (ej. R0144 ← R0144_02, R0144_02 ← R0144_03, …).
        /// Internamente: newPatron[i] = oldPatron[(i + dias) mod N].
        /// </summary>
        public static List<string> RotarPatron(List<string> patron, int dias)
        {
            int n = patron.Count;
            if (n == 0) return new List<string>();
            int shift = ((dias % n) + n) % n;
            var result = new List<string>(n);
            for (int i = 0; i < n; i++)
            {
                result.Add(patron[(i + shift) % n]);
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
            Estado = r.Estado,
            CreatedAt = r.CreatedAt,
            UpdatedAt = r.UpdatedAt,
        };

        /// <summary>
        /// Detecta reglas que existen en RolesEmpleadosSAP.Regla pero no en
        /// ReglasTurno, y las inserta con patrón vacío y Estado =
        /// "PendienteConfiguracion". Lo llama SincronizacionRolesService antes
        /// de matchear empleados contra grupos. Retorna los códigos creados.
        /// </summary>
        public async Task<List<string>> AutoDescubrirDesdeSapAsync()
        {
            var reglasSap = await _db.RolesEmpleadosSAP
                .Where(r => !string.IsNullOrEmpty(r.Regla))
                .Select(r => r.Regla!.Trim())
                .Where(r => r.Length > 0 && r.Length <= 20)
                .Distinct()
                .ToListAsync();

            if (reglasSap.Count == 0) return new List<string>();

            var codigosExistentes = await _db.ReglasTurno
                .Select(r => r.Codigo)
                .ToListAsync();
            var setExistentes = new HashSet<string>(codigosExistentes, StringComparer.OrdinalIgnoreCase);

            var nuevas = reglasSap.Where(r => !setExistentes.Contains(r)).ToList();
            if (nuevas.Count == 0) return new List<string>();

            var fechaRefBase = await _db.ReglasTurno
                .OrderBy(r => r.FechaReferencia)
                .Select(r => (DateTime?)r.FechaReferencia)
                .FirstOrDefaultAsync() ?? new DateTime(2025, 9, 15);

            foreach (var codigo in nuevas)
            {
                _db.ReglasTurno.Add(new ReglasTurno
                {
                    Codigo = codigo,
                    PatronJson = "[]",
                    FechaReferencia = fechaRefBase,
                    Estado = "PendienteConfiguracion",
                    Notas = "Auto-descubierta desde RolesEmpleadosSAP",
                    CreatedAt = DateTime.UtcNow,
                });
            }

            await _db.SaveChangesAsync();
            TurnosHelper.Reload(_db);
            return nuevas;
        }

        /// <summary>
        /// Crea los Grupos correspondientes a una regla dentro de un área y marca
        /// la regla como "Activa" si tenía patrón definido. Solo SuperUsuario debe
        /// llamarlo. Regla debe existir y tener patrón no vacío para pasar a Activa.
        /// </summary>
        public async Task<AsignarReglaAAreaResponse> AsignarAAreaAsync(
            string codigo, AsignarReglaAAreaRequest request)
        {
            var regla = await _db.ReglasTurno.FirstOrDefaultAsync(r => r.Codigo == codigo)
                ?? throw new InvalidOperationException($"No existe la regla {codigo}");

            var patron = JsonSerializer.Deserialize<List<string>>(regla.PatronJson) ?? new List<string>();
            if (patron.Count == 0 || patron.Count % 7 != 0)
                throw new InvalidOperationException(
                    "La regla no tiene patrón válido. Configúralo antes de asignarla a un área.");

            var semanasDelPatron = patron.Count / 7;
            if (request.CantidadSubGrupos > semanasDelPatron)
                throw new InvalidOperationException(
                    $"CantidadSubGrupos ({request.CantidadSubGrupos}) excede las semanas del patrón ({semanasDelPatron}).");

            var area = await _db.Areas.FirstOrDefaultAsync(a => a.AreaId == request.AreaId)
                ?? throw new InvalidOperationException($"No existe el área {request.AreaId}");

            var creados = new List<GrupoCreadoDto>();
            for (int i = 1; i <= request.CantidadSubGrupos; i++)
            {
                var rolGrupo = i == 1 ? codigo : $"{codigo}_{i:D2}";
                var existente = await _db.Grupos
                    .FirstOrDefaultAsync(g => g.AreaId == request.AreaId && g.Rol == rolGrupo);
                if (existente != null)
                {
                    creados.Add(new GrupoCreadoDto { GrupoId = existente.GrupoId, Rol = existente.Rol });
                    continue;
                }

                var grupo = new Grupo
                {
                    AreaId = request.AreaId,
                    Rol = rolGrupo,
                    IdentificadorSAP = string.IsNullOrWhiteSpace(request.IdentificadorSAP)
                        ? $"{area.UnidadOrganizativaSap}-{rolGrupo}"
                        : request.IdentificadorSAP,
                };
                _db.Grupos.Add(grupo);
                await _db.SaveChangesAsync();
                creados.Add(new GrupoCreadoDto { GrupoId = grupo.GrupoId, Rol = grupo.Rol });
            }

            if (regla.Estado == "PendienteConfiguracion")
            {
                regla.Estado = "Activa";
                regla.UpdatedAt = DateTime.UtcNow;
                await _db.SaveChangesAsync();
                TurnosHelper.Reload(_db);
            }

            return new AsignarReglaAAreaResponse
            {
                Codigo = codigo,
                AreaId = request.AreaId,
                GruposCreados = creados,
            };
        }
    }
}
