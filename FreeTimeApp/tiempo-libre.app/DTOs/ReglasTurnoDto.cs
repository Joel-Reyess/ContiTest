using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace tiempo_libre.DTOs
{
    public class ReglaTurnoDto
    {
        public int Id { get; set; }
        public string Codigo { get; set; } = null!;
        /// <summary>Array de turnos (decodificado del JSON almacenado en BD).</summary>
        public List<string> Patron { get; set; } = new();
        public DateTime FechaReferencia { get; set; }
        public DateTime? UltimaRotacion { get; set; }
        public int? UltimoUsuarioRotacionId { get; set; }
        public string? UltimoUsuarioRotacionNombre { get; set; }
        public int DiasRotadosAcumulado { get; set; }
        public string? Notas { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime? UpdatedAt { get; set; }
    }

    public class ActualizarPatronReglaTurnoRequest
    {
        /// <summary>Nuevo patrón completo. Debe tener longitud múltiplo de 7.</summary>
        [Required]
        [MinLength(7)]
        public List<string> Patron { get; set; } = new();

        /// <summary>Opcional: actualizar también la fecha de referencia.</summary>
        public DateTime? FechaReferencia { get; set; }

        [MaxLength(500)]
        public string? Notas { get; set; }
    }

    public class RotarReglasTurnoRequest
    {
        /// <summary>Códigos de las reglas a rotar (ej. ["R0144","R0229"]).</summary>
        [Required]
        [MinLength(1)]
        public List<string> Codigos { get; set; } = new();

        /// <summary>
        /// Días a recorrer. Positivo = cada grupo recibe el patrón del grupo anterior
        /// (R4 recibe lo que tenía R3, R3 recibe lo que tenía R2, etc. — el caso de Enero).
        /// Negativo = sentido contrario. Típicamente 7.
        /// </summary>
        [Required]
        [Range(-365, 365)]
        public int Dias { get; set; } = 7;

        [MaxLength(500)]
        public string? Notas { get; set; }
    }
}
