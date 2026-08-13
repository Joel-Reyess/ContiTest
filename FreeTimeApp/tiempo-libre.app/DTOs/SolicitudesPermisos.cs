using System;
using System.ComponentModel.DataAnnotations;
using System.Collections.Generic;

namespace tiempo_libre.DTOs
{
    /// <summary>
    /// Request para crear solicitud de permiso
    /// </summary>
    public class CrearSolicitudPermisoRequest
    {
        [Required(ErrorMessage = "La nómina del empleado es requerida")]
        public int Nomina { get; set; }

        [Required(ErrorMessage = "La clave de ausencia es requerida")]
        public string ClAbPre { get; set; } = string.Empty;

        public string FechaInicio { get; set; } = string.Empty;
        public string FechaFin { get; set; } = string.Empty;

        [MaxLength(500)]
        public string? Observaciones { get; set; }
    }

    /// <summary>
    /// Response de creación de solicitud
    /// </summary>
    public class CrearSolicitudPermisoResponse
    {
        public bool Exitoso { get; set; }
        public string Mensaje { get; set; } = string.Empty;
        public int SolicitudId { get; set; }
        public string Estado { get; set; } = string.Empty;
        public string NombreEmpleado { get; set; } = string.Empty;
        public string TipoPermiso { get; set; } = string.Empty;
        public DateTime FechaInicio { get; set; }  // Era DateOnly
        public DateTime FechaFin { get; set; }
    }

    /// <summary>
    /// Request para aprobar/rechazar solicitud
    /// </summary>
    public class ResponderSolicitudPermisoRequest
    {
        [Required]
        public int SolicitudId { get; set; }

        [Required]
        public bool Aprobar { get; set; }

        [MaxLength(500)]
        public string? MotivoRechazo { get; set; }
    }

    /// <summary>
    /// DTO para listar solicitudes
    /// </summary>
    public class SolicitudPermisoDto
    {
        public int Id { get; set; }
        public int NominaEmpleado { get; set; }
        public string NombreEmpleado { get; set; } = string.Empty;
        public string ClAbPre { get; set; } = string.Empty;
        public string ClaveVisualizacion { get; set; } = string.Empty;
        public string DescripcionPermiso { get; set; } = string.Empty;
        public string FechaInicio { get; set; } = string.Empty;
        public string FechaFin { get; set; } = string.Empty;
        public string? Observaciones { get; set; }
        public string Estado { get; set; } = string.Empty;
        public string? MotivoRechazo { get; set; }
        public DateTime FechaSolicitud { get; set; }
        public DateTime? FechaRespuesta { get; set; }
        public string DelegadoNombre { get; set; } = string.Empty;
        /// <summary>
        /// Id del delegado sindical que capturó la solicitud. Null = la
        /// solicitud no la capturó un delegado (vino del sistema/SAP).
        /// El front lo usa para el filtro Todos/Sistema/Delegado; no se puede
        /// deducir del nombre porque los textos de respaldo varían.
        /// </summary>
        public int? DelegadoSolicitanteId { get; set; }
        public string? JefeAreaNombre { get; set; }
    }

    /// <summary>
    /// Request para consultar solicitudes
    /// </summary>
    public class ConsultarSolicitudesRequest
    {
        public int? NominaEmpleado { get; set; }
        public int? DelegadoId { get; set; }
        public int? AreaId { get; set; }
        public string? Estado { get; set; } // Pendiente, Aprobada, Rechazada
        public string? FechaInicio { get; set; }
        public string? FechaFin { get; set; }
    }

    /// <summary>
    /// Response para consulta de solicitudes
    /// </summary>
    public class ConsultarSolicitudesResponse
    {
        public int TotalRegistros { get; set; }
        public List<SolicitudPermisoDto> Solicitudes { get; set; } = new();
    }

    /// <summary>
    /// Catálogo filtrado para delegados sindicales
    /// </summary>
    public class CatalogoPermisosDelegadoResponse
    {
        public List<TipoPermisoDto> TiposPermisosPermitidos { get; set; } = new();
    }
}