using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace tiempo_libre.Models
{
    /// <summary>
    /// Solicitud de reprogramación de un día asignado por la empresa, iniciada
    /// EXCLUSIVAMENTE por el SuperUsuario, con motivo de catálogo cerrado
    /// (incapacidad, defunción, paternidad, maternidad). Va a aprobación del
    /// jefe del área del empleado. Al aprobar, la VacacionProgramada original se
    /// mueve a la fecha nueva con TipoVacacion = "DiaEmpresaReprogramado",
    /// que en el rol semanal se mapea a "C".
    ///
    /// Es un flujo paralelo a SolicitudEdicionDiaEmpresa (que es de uso del
    /// delegado sindical con auto-aprobación).
    /// </summary>
    [Table("SolicitudesReprogramacionDiaEmpresa")]
    public class SolicitudReprogramacionDiaEmpresa
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public int EmpleadoId { get; set; }

        [Required]
        public int VacacionOriginalId { get; set; }

        [Required]
        public DateOnly FechaOriginal { get; set; }

        [Required]
        public DateOnly FechaNueva { get; set; }

        /// <summary>
        /// Motivo tomado del catálogo de nomenclaturas SAP (ver
        /// <see cref="MotivosReprogramacionDiaEmpresa"/>). Es documental: el día
        /// reprogramado siempre se pinta como "C" en el rol semanal.
        /// </summary>
        [Required]
        [MaxLength(40)]
        public string MotivoTipo { get; set; } = string.Empty;

        /// <summary>Notas adicionales opcionales del SuperUsuario.</summary>
        [MaxLength(500)]
        public string? Justificacion { get; set; }

        [Required]
        [MaxLength(20)]
        public string EstadoSolicitud { get; set; } = "Pendiente"; // Pendiente, Aprobada, Rechazada

        public int? JefeAreaId { get; set; }

        [Required]
        public int SolicitadoPorId { get; set; }

        public int? AprobadoPorId { get; set; }

        public DateTime FechaSolicitud { get; set; } = DateTime.UtcNow;

        public DateTime? FechaRespuesta { get; set; }

        [MaxLength(500)]
        public string? MotivoRechazo { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public DateTime? UpdatedAt { get; set; }

        // Navigation properties
        [ForeignKey(nameof(EmpleadoId))]
        public virtual User Empleado { get; set; } = null!;

        [ForeignKey(nameof(VacacionOriginalId))]
        public virtual VacacionesProgramadas VacacionOriginal { get; set; } = null!;

        [ForeignKey(nameof(JefeAreaId))]
        public virtual User? JefeArea { get; set; }

        [ForeignKey(nameof(SolicitadoPorId))]
        public virtual User SolicitadoPor { get; set; } = null!;

        [ForeignKey(nameof(AprobadoPorId))]
        public virtual User? AprobadoPor { get; set; }
    }

    /// <summary>Catálogo cerrado de motivos válidos.</summary>
    /// <summary>
    /// Catálogo de motivos para reprogramar un día asignado por la empresa.
    /// Abarca TODAS las nomenclaturas SAP que maneja el rol semanal (mismas de
    /// CatalogoPermisosResponse) más "Otro": el SuperUsuario captura la papeleta
    /// después de los hechos y el motivo real puede ser cualquiera, así que un
    /// catálogo corto obligaba a elegir uno que no correspondía.
    ///
    /// Las cuatro primeras claves son las originales y no se renombran: hay
    /// solicitudes históricas guardadas con ese texto.
    /// </summary>
    public static class MotivosReprogramacionDiaEmpresa
    {
        public const string Incapacidad = "Incapacidad";
        public const string PermisoDefuncion = "PermisoDefuncion";
        public const string Paternidad = "Paternidad";
        public const string Maternidad = "Maternidad";
        public const string PermisoConGoce = "PermisoConGoce";
        public const string PermisoSinGoce = "PermisoSinGoce";
        public const string PermisoSinGoceSueldo = "PermisoSinGoceSueldo";
        public const string AccidenteTrabajo = "AccidenteTrabajo";
        public const string RiesgoTrabajo = "RiesgoTrabajo";
        public const string Suspension = "Suspension";
        public const string Vacacion = "Vacacion";
        public const string Otro = "Otro";

        public static readonly string[] Validos =
        {
            Incapacidad, PermisoDefuncion, Paternidad, Maternidad,
            PermisoConGoce, PermisoSinGoce, PermisoSinGoceSueldo,
            AccidenteTrabajo, RiesgoTrabajo, Suspension, Vacacion, Otro
        };

        public static bool EsValido(string? motivo) =>
            !string.IsNullOrEmpty(motivo) && Array.IndexOf(Validos, motivo) >= 0;
    }
}
