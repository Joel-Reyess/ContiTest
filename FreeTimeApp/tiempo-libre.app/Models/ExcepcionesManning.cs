using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace tiempo_libre.Models
{
    /// <summary>
    /// Excepciones de manning requerido por área para meses específicos
    /// Permite cambiar temporalmente el manning base del área
    /// </summary>
    public class ExcepcionesManning
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public int AreaId { get; set; }
        [ForeignKey("AreaId")]
        public Area? Area { get; set; }

        /// <summary>
        /// Grupo al que aplica la excepcion. NULL = toda el area, que es lo que
        /// habia antes y lo que conservan las filas existentes. Con valor, solo
        /// ese grupo: el manning de un grupo se resuelve grupo -> area -> base.
        /// </summary>
        public int? GrupoId { get; set; }
        [ForeignKey("GrupoId")]
        public Grupo? Grupo { get; set; }

        [Required]
        public int Anio { get; set; }

        [Required]
        [Range(1, 12)]
        public int Mes { get; set; }

        [Required]
        [Range(1, 200)]
        public int ManningRequeridoExcepcion { get; set; }

        [MaxLength(500)]
        public string? Motivo { get; set; }

        [Required]
        public int CreadoPorUserId { get; set; }
        [ForeignKey("CreadoPorUserId")]
        public User? CreadoPor { get; set; }

        public bool Activa { get; set; } = true;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime? UpdatedAt { get; set; }
    }
}