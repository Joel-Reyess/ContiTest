using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace tiempo_libre.Models
{
    /// <summary>
    /// Reglas de turnos editables desde la vista de superusuario.
    /// Reemplaza el diccionario hardcodeado en TurnosHelper.cs para permitir
    /// rotaciones (Enero, Semana Santa, Fin de año) sin redeploy.
    /// </summary>
    public class ReglasTurno
    {
        [Key]
        public int Id { get; set; }

        [Required]
        [MaxLength(20)]
        public string Codigo { get; set; } = null!;

        /// <summary>
        /// Patrón de turnos como JSON array de strings, ej. ["3","D","2","2",...].
        /// La longitud debe ser múltiplo de 7 (semanas completas).
        /// </summary>
        [Required]
        public string PatronJson { get; set; } = "[]";

        /// <summary>
        /// Fecha base del cálculo del rol. Día 0 del patrón = esta fecha para grupo 1.
        /// </summary>
        [Required]
        public DateTime FechaReferencia { get; set; }

        public DateTime? UltimaRotacion { get; set; }

        public int? UltimoUsuarioRotacionId { get; set; }
        [ForeignKey("UltimoUsuarioRotacionId")]
        public User? UltimoUsuarioRotacion { get; set; }

        /// <summary>
        /// Días totales rotados desde el seed inicial (acumulado, informativo).
        /// </summary>
        public int DiasRotadosAcumulado { get; set; } = 0;

        [MaxLength(500)]
        public string? Notas { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime? UpdatedAt { get; set; }
    }
}
