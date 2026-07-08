using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace tiempo_libre.Models
{
    /// <summary>
    /// Rotación de patrón de una regla agendada a una fecha futura. Se ejecuta
    /// automáticamente por EjecucionRotacionesProgramadasBackgroundService.
    /// Semántica idéntica a "Recorrer 7" en Reglas de turnos (rota PatronJson,
    /// no toca Grupos.Rol ni Users.GrupoId).
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
