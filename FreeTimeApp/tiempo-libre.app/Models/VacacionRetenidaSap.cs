using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace tiempo_libre.Models
{
    /// <summary>
    /// Día de vacación que trajo el Excel de SAP y que la sincronización NO dio de
    /// alta porque dejaba al empleado con más días de común acuerdo de los que le
    /// tocan por antigüedad (opción B acordada con el cliente, oct-2026: el Excel
    /// se puede manipular antes de cargarse). Queda aquí hasta que el superusuario
    /// lo acepta (se crea la vacación) o lo descarta (RH corrige SAP). Mientras no
    /// se acepte, ninguna pantalla ni cálculo lo cuenta.
    /// </summary>
    [Table("VacacionesRetenidasSAP")]
    public class VacacionRetenidaSap
    {
        [Key]
        public int Id { get; set; }

        public int EmpleadoId { get; set; }

        public int Nomina { get; set; }

        /// <summary>El día que trae el Excel.</summary>
        public DateOnly Fecha { get; set; }

        /// <summary>Años de antigüedad al 31-dic de ese año.</summary>
        public int Antiguedad { get; set; }

        /// <summary>Días de común acuerdo que le tocan en ese año.</summary>
        public int Corresponden { get; set; }

        /// <summary>Días de común acuerdo activos que ya tenía al retener.</summary>
        public int YaTenia { get; set; }

        /// <summary>Pendiente, Aceptada o Descartada.</summary>
        [MaxLength(20)]
        public string Estado { get; set; } = "Pendiente";

        /// <summary>Cuándo llegó en el Excel (momento de la sincronización).</summary>
        public DateTime FechaCargaExcel { get; set; } = DateTime.Now;

        public int? ResueltoPorId { get; set; }

        public DateTime? FechaResolucion { get; set; }

        [MaxLength(500)]
        public string? Nota { get; set; }

        /// <summary>La vacación que se creó al aceptarlo.</summary>
        public int? VacacionCreadaId { get; set; }

        [ForeignKey(nameof(EmpleadoId))]
        public virtual User Empleado { get; set; } = null!;

        [ForeignKey(nameof(ResueltoPorId))]
        public virtual User? ResueltoPor { get; set; }
    }
}
