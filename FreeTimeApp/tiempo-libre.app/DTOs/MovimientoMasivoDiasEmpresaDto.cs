using System;
using System.Collections.Generic;

namespace tiempo_libre.DTOs
{
    /// <summary>Un renglón del machote: a quién, qué día por la empresa tenía y a qué día pasa.</summary>
    public class RenglonMovimientoDiaEmpresa
    {
        /// <summary>Número de renglón en el Excel (para decirle al usuario cuál corregir).</summary>
        public int Renglon { get; set; }
        public int? Nomina { get; set; }
        /// <summary>yyyy-MM-dd o dd/MM/yyyy.</summary>
        public string? FechaActual { get; set; }
        /// <summary>yyyy-MM-dd o dd/MM/yyyy.</summary>
        public string? FechaNueva { get; set; }
        /// <summary>
        /// Opcional: el motivo de ESTE renglón (nov-2026). Vacío = el motivo general.
        /// Es el que ve el operador entre paréntesis junto a su día por la empresa.
        /// </summary>
        public string? Motivo { get; set; }
    }

    public class MovimientoMasivoDiasEmpresaRequest
    {
        public List<RenglonMovimientoDiaEmpresa> Renglones { get; set; } = new();
        /// <summary>Motivo para todos (queda en el historial de reprogramaciones de día empresa).</summary>
        public string? Motivo { get; set; }
        /// <summary>Aplicar también los que dejan al grupo arriba de su % ese día.</summary>
        public bool IncluirAdvertencias { get; set; }
    }

    public class ResultadoRenglonMovimientoDto
    {
        public int Renglon { get; set; }
        public int? Nomina { get; set; }
        public string? Nombre { get; set; }
        public string? Area { get; set; }
        public string? Grupo { get; set; }
        /// <summary>yyyy-MM-dd cuando se pudo leer; si no, lo que venía.</summary>
        public string? FechaActual { get; set; }
        public string? FechaNueva { get; set; }
        /// <summary>"Listo", "Advertencia", "Error"; después de aplicar: "Aplicado" u "Omitido".</summary>
        public string Estado { get; set; } = "Listo";
        public string? Mensaje { get; set; }
        /// <summary>El motivo propio del renglón, si traía.</summary>
        public string? Motivo { get; set; }
    }

    public class ResultadoMovimientoMasivoDto
    {
        public List<ResultadoRenglonMovimientoDto> Renglones { get; set; } = new();
        public int Listos { get; set; }
        public int Advertencias { get; set; }
        public int Errores { get; set; }
        /// <summary>Solo al aplicar.</summary>
        public int Aplicados { get; set; }
    }

    /// <summary>
    /// Un día por la empresa que ya se movió (machote o reprogramación del
    /// superusuario/jefe): fecha anterior, fecha nueva, motivo y quién. Para la tabla
    /// de movimientos de "Reglas de trabajo" (nov-2026, caso de Román: domingos de
    /// paro que después se trabajaron).
    /// </summary>
    public class MovimientoDiaEmpresaDto
    {
        public int Id { get; set; }
        public int EmpleadoId { get; set; }
        public int? Nomina { get; set; }
        public string Nombre { get; set; } = string.Empty;
        public int? AreaId { get; set; }
        public string Area { get; set; } = string.Empty;
        public string Grupo { get; set; } = string.Empty;
        public DateOnly FechaAnterior { get; set; }
        public DateOnly FechaNueva { get; set; }
        public string Motivo { get; set; } = string.Empty;
        /// <summary>"Machote" o "Reprogramación".</summary>
        public string Como { get; set; } = string.Empty;
        public string? Quien { get; set; }
        public DateTime Cuando { get; set; }
    }
}
