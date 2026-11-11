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
}
