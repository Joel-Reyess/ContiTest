using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace tiempo_libre.DTOs
{
    public class RotacionProgramadaDto
    {
        public int Id { get; set; }
        public string CodigoRegla { get; set; } = "";
        public DateTime FechaEjecucion { get; set; }
        public int DiasRotacion { get; set; }
        /// <summary>
        /// Patrón que se fijará como baseline al llegar FechaEjecucion.
        /// Si null → la programación es una rotación legacy (DiasRotacion).
        /// </summary>
        public List<string>? PatronBaseline { get; set; }
        public string Estado { get; set; } = "";
        public int CreatedByUserId { get; set; }
        public string? CreatedByUserNombre { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime? FechaEjecutadaReal { get; set; }
        public string? MensajeError { get; set; }
        public string? Notas { get; set; }
    }

    public class CrearRotacionesProgramadasRequest
    {
        [Required]
        public string CodigoRegla { get; set; } = "";

        [Required]
        [MinLength(1, ErrorMessage = "Debe indicar al menos una fecha")]
        public List<DateTime> Fechas { get; set; } = new();

        /// <summary>
        /// Modo "Fecha de ejecución arranque": patrón editado por el SuperUsuario
        /// (list of turnos, longitud múltiplo de 7). Si viene con datos, se ignora
        /// DiasRotacion y se fija el patrón al ejecutar.
        /// </summary>
        public List<string>? PatronBaseline { get; set; }

        [Range(1, 365, ErrorMessage = "DiasRotacion debe estar entre 1 y 365")]
        public int DiasRotacion { get; set; } = 7;

        [MaxLength(500)]
        public string? Notas { get; set; }
    }

    public class CrearRotacionesProgramadasResponse
    {
        public List<RotacionProgramadaDto> Creadas { get; set; } = new();
        public List<string> Omitidas { get; set; } = new();
    }
}
