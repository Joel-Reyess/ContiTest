using System;
using System.ComponentModel.DataAnnotations;

namespace tiempo_libre.DTOs
{
    /// <summary>
    /// Request para crear una solicitud de reprogramación post-incapacidad.
    /// El delegado sindical (o empleado) selecciona la incapacidad consumida que motiva
    /// la solicitud, una vacación futura no canjeada del empleado, y la fecha nueva
    /// (post-incapacidad) a la que se moverá esa vacación.
    /// </summary>
    public class SolicitarReprogramacionPostIncapacidadRequest
    {
        [Required] public int EmpleadoId { get; set; }
        [Required] public int PermisoIncapacidadId { get; set; }
        [Required] public int VacacionOriginalId { get; set; }

        /// <summary>Fecha nueva propuesta (post-incapacidad). Formato yyyy-MM-dd.</summary>
        [Required] public string FechaNueva { get; set; } = string.Empty;

        [Required, MaxLength(500)] public string Motivo { get; set; } = string.Empty;
    }

    public class AprobarReprogramacionPostIncapacidadRequest
    {
        [Required] public int SolicitudId { get; set; }
        [Required] public bool Aprobada { get; set; }

        [MaxLength(500)] public string? MotivoRechazo { get; set; }
    }

    /// <summary>Vacación futura no canjeada (candidata a ser movida).</summary>
    public class VacacionDisponibleDto
    {
        public int Id { get; set; }
        public DateOnly Fecha { get; set; }
        public string TipoVacacion { get; set; } = string.Empty;
        public string EstadoVacacion { get; set; } = string.Empty;
    }

    /// <summary>Incapacidad/permiso ya consumido del empleado (motivo posible).</summary>
    public class IncapacidadConsumidaDto
    {
        public int Id { get; set; }
        public int Nomina { get; set; }
        public DateOnly Desde { get; set; }
        public DateOnly Hasta { get; set; }
        public string? ClaseAbsentismo { get; set; }
        public int? ClAbPre { get; set; }
        public string? Observaciones { get; set; }
    }

    public class SolicitudReprogramacionPostIncapacidadDto
    {
        public int Id { get; set; }
        public int EmpleadoId { get; set; }
        public int Nomina { get; set; }
        public string? NombreEmpleado { get; set; }
        public string? AreaEmpleado { get; set; }
        public string? GrupoEmpleado { get; set; }

        public int PermisoIncapacidadId { get; set; }
        public DateOnly PermisoDesde { get; set; }
        public DateOnly PermisoHasta { get; set; }
        public string? PermisoClase { get; set; }

        public int VacacionOriginalId { get; set; }
        public DateOnly FechaOriginal { get; set; }
        public DateOnly FechaNueva { get; set; }

        public string Motivo { get; set; } = string.Empty;
        public string EstadoSolicitud { get; set; } = string.Empty;

        public DateTime FechaSolicitud { get; set; }
        public string? NombreSolicitadoPor { get; set; }

        public int? JefeAreaId { get; set; }
        public DateTime? FechaRespuesta { get; set; }
        public string? NombreAprobadoPor { get; set; }
        public string? MotivoRechazo { get; set; }
    }
}
