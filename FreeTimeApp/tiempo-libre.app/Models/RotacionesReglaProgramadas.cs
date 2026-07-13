using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace tiempo_libre.Models
{
    /// <summary>
    /// Programación de patrón de una regla a una fecha futura ("Fecha de ejecución
    /// arranque"). Ejecutada por EjecucionRotacionesProgramadasBackgroundService.
    /// Dos modos:
    ///   * Arranque (default nuevo): PatronBaseline != null. Ese día se FIJA el
    ///     patrón como baseline llamando a ReglasTurnoService.ActualizarPatronAsync.
    ///   * Rotación (legacy): PatronBaseline == null → se aplica RotarAsync N días.
    /// </summary>
    public class RotacionesReglaProgramadas
    {
        [Key]
        public int Id { get; set; }

        [Required]
        [MaxLength(20)]
        public string CodigoRegla { get; set; } = null!;

        [ForeignKey(nameof(CodigoRegla))]
        public ReglasTurno? Regla { get; set; }

        [Required]
        [Column(TypeName = "date")]
        public DateTime FechaEjecucion { get; set; }

        [Required]
        public int DiasRotacion { get; set; } = 7;

        /// <summary>
        /// Patrón (JSON de List&lt;string&gt;) que se fijará como baseline al llegar
        /// FechaEjecucion. Si null → se ejecuta rotación legacy con DiasRotacion.
        /// </summary>
        public string? PatronBaseline { get; set; }

        [Required]
        [MaxLength(20)]
        public string Estado { get; set; } = "Pendiente";

        public int CreatedByUserId { get; set; }
        [ForeignKey(nameof(CreatedByUserId))]
        public User? CreatedByUser { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime? FechaEjecutadaReal { get; set; }

        [MaxLength(500)]
        public string? MensajeError { get; set; }

        [MaxLength(500)]
        public string? Notas { get; set; }
    }
}
