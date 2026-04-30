using System;
using System.ComponentModel.DataAnnotations;

namespace tiempo_libre.DTOs
{
    /// <summary>
    /// Request para que el SuperUsuario solicite reprogramar un día asignado por
    /// la empresa de un empleado, con motivo del catálogo cerrado.
    /// </summary>
    public class SolicitarReprogramacionDiaEmpresaRequest
    {
        [Required] public int EmpleadoId { get; set; }
        [Required] public int VacacionOriginalId { get; set; }

        /// <summary>Fecha nueva propuesta. Formato yyyy-MM-dd.</summary>
        [Required] public string FechaNueva { get; set; } = string.Empty;

        /// <summary>Motivo del catálogo cerrado: Incapacidad, PermisoDefuncion, Paternidad, Maternidad.</summary>
        [Required, MaxLength(40)]
        public string MotivoTipo { get; set; } = string.Empty;

        [MaxLength(500)] public string? Justificacion { get; set; }
    }

    public class AprobarReprogramacionDiaEmpresaRequest
    {
        [Required] public int SolicitudId { get; set; }
        [Required] public bool Aprobada { get; set; }
        [MaxLength(500)] public string? MotivoRechazo { get; set; }
    }

    public class SolicitudReprogramacionDiaEmpresaDto
    {
        public int Id { get; set; }
        public int EmpleadoId { get; set; }
        public int? Nomina { get; set; }
        public string? NombreEmpleado { get; set; }
        public string? AreaEmpleado { get; set; }
        public string? GrupoEmpleado { get; set; }

        public int VacacionOriginalId { get; set; }
        public DateOnly FechaOriginal { get; set; }
        public DateOnly FechaNueva { get; set; }

        public string MotivoTipo { get; set; } = string.Empty;
        public string? Justificacion { get; set; }

        public string EstadoSolicitud { get; set; } = string.Empty;
        public DateTime FechaSolicitud { get; set; }
        public string? NombreSolicitadoPor { get; set; }
        public int? JefeAreaId { get; set; }
        public DateTime? FechaRespuesta { get; set; }
        public string? NombreAprobadoPor { get; set; }
        public string? MotivoRechazo { get; set; }
    }
}
