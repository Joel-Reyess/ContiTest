using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace tiempo_libre.Models
{
    [Table("Permutas")]
    public class Permuta
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public int EmpleadoOrigenId { get; set; }

        [ForeignKey(nameof(EmpleadoOrigenId))]
        public virtual User? EmpleadoOrigen { get; set; }

        //[Required]
        public int? EmpleadoDestinoId { get; set; }

        [ForeignKey(nameof(EmpleadoDestinoId))]
        public virtual User? EmpleadoDestino { get; set; }

        [Required]
        public DateOnly FechaPermuta { get; set; }

        /// <summary>
        /// Solo para cambio individual que se mueve de día: fecha en la que el
        /// empleado se presentará a laborar (la papeleta GT-67 trae "fecha del
        /// rol" y "fecha del cambio"). Null = el cambio es el mismo día
        /// (solo cambia el turno) o es permuta hombre por hombre.
        /// Requiere la columna FechaDestino (ver AddFechaDestinoPermutas.sql).
        /// </summary>
        public DateOnly? FechaDestino { get; set; }

        [Required]
        [MaxLength(50)]
        public string TurnoEmpleadoOrigen { get; set; } = string.Empty;

        //[Required]
        [MaxLength(50)]
        public string? TurnoEmpleadoDestino { get; set; } = string.Empty;

        [Required]
        [MaxLength(500)]
        public string Motivo { get; set; } = string.Empty;

        [Required]
        public int SolicitadoPorId { get; set; }

        [ForeignKey(nameof(SolicitadoPorId))]
        public virtual User? SolicitadoPor { get; set; }

        [Required]
        public DateTime FechaSolicitud { get; set; } = DateTime.UtcNow;

        [MaxLength(50)]
        public string EstadoSolicitud { get; set; } = "Pendiente"; // Pendiente, Aprobada, Rechazada

        public int? JefeAprobadorId { get; set; }

        [ForeignKey(nameof(JefeAprobadorId))]
        public virtual User? JefeAprobador { get; set; }

        public DateTime? FechaRespuesta { get; set; }

        [MaxLength(500)]
        public string? MotivoRechazo { get; set; }
    }
}