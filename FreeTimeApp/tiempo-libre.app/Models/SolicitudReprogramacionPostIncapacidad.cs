using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace tiempo_libre.Models
{
    /// <summary>
    /// Solicitud para reprogramar una vacación futura no canjeada hacia
    /// un día post-incapacidad/permiso.
    /// El delegado sindical selecciona la incapacidad/permiso que motiva la solicitud,
    /// elige la vacación futura del empleado a mover, y propone la fecha nueva
    /// (típicamente un día después del Hasta de la incapacidad). Va a aprobación del
    /// jefe de área.
    /// </summary>
    [Table("SolicitudesReprogramacionPostIncapacidad")]
    public class SolicitudReprogramacionPostIncapacidad
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public int EmpleadoId { get; set; }

        [Required]
        public int Nomina { get; set; }

        /// <summary>
        /// FK al permiso/incapacidad que motiva la solicitud (consumido/post-retorno).
        /// </summary>
        [Required]
        public int PermisoIncapacidadId { get; set; }

        /// <summary>
        /// FK a la VacacionesProgramadas futura no canjeada que se va a mover.
        /// </summary>
        [Required]
        public int VacacionOriginalId { get; set; }

        /// <summary>Fecha de la vacación original (la que se mueve).</summary>
        [Required]
        public DateOnly FechaOriginal { get; set; }

        /// <summary>Fecha nueva propuesta (post-incapacidad).</summary>
        [Required]
        public DateOnly FechaNueva { get; set; }

        [Required]
        [MaxLength(500)]
        public string Motivo { get; set; } = string.Empty;

        [Required]
        [MaxLength(20)]
        public string EstadoSolicitud { get; set; } = "Pendiente"; // Pendiente, Aprobada, Rechazada

        [Required]
        public DateTime FechaSolicitud { get; set; } = DateTime.UtcNow;

        [Required]
        public int SolicitadoPorId { get; set; }

        public int? JefeAreaId { get; set; }

        public DateTime? FechaRespuesta { get; set; }

        public int? AprobadoPorId { get; set; }

        [MaxLength(500)]
        public string? MotivoRechazo { get; set; }

        // Navigation properties
        [ForeignKey(nameof(EmpleadoId))]
        public virtual User Empleado { get; set; } = null!;

        [ForeignKey(nameof(PermisoIncapacidadId))]
        public virtual PermisosEIncapacidadesSAP PermisoIncapacidad { get; set; } = null!;

        [ForeignKey(nameof(VacacionOriginalId))]
        public virtual VacacionesProgramadas VacacionOriginal { get; set; } = null!;

        [ForeignKey(nameof(SolicitadoPorId))]
        public virtual User SolicitadoPor { get; set; } = null!;

        [ForeignKey(nameof(JefeAreaId))]
        public virtual User? JefeArea { get; set; }

        [ForeignKey(nameof(AprobadoPorId))]
        public virtual User? AprobadoPor { get; set; }
    }
}
