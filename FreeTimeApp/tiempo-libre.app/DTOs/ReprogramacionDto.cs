using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace tiempo_libre.DTOs
{
    /// <summary>
    /// Request para solicitar una reprogramación de vacaciones
    /// </summary>
    public class SolicitudReprogramacionRequest
    {
        /// <summary>
        /// ID del empleado al que se le cambiará la vacación
        /// </summary>
        [Required(ErrorMessage = "El ID del empleado es requerido")]
        public int EmpleadoId { get; set; }

        /// <summary>
        /// ID de la vacación original en VacacionesProgramadas
        /// </summary>
        [Required(ErrorMessage = "El ID de la vacación original es requerido")]
        public int VacacionOriginalId { get; set; }

        /// <summary>
        /// Nueva fecha solicitada para la vacación
        /// </summary>
        [Required(ErrorMessage = "La fecha nueva es requerida")]
        public DateOnly FechaNueva { get; set; }

        /// <summary>
        /// Motivo de la reprogramación
        /// </summary>
        [Required(ErrorMessage = "El motivo es requerido")]
        [MaxLength(500)]
        public string Motivo { get; set; } = string.Empty;

        /// <summary>
        /// ID del usuario que solicita (Delegado Sindical o Jefe de Área)
        /// Si es null, se toma del token JWT
        /// </summary>
        public int? SolicitadoPorId { get; set; }
    }

    /// <summary>
    /// Response de una solicitud de reprogramación
    /// </summary>
    public class SolicitudReprogramacionResponse
    {
        public int SolicitudId { get; set; }
        public int EmpleadoId { get; set; }
        public string NombreEmpleado { get; set; } = string.Empty;
        public string NominaEmpleado { get; set; } = string.Empty;
        public DateOnly FechaOriginal { get; set; }
        public DateOnly FechaNueva { get; set; }
        public string Motivo { get; set; } = string.Empty;
        public string EstadoSolicitud { get; set; } = string.Empty; // Pendiente, Aprobada, Rechazada
        public bool RequiereAprobacion { get; set; }
        public decimal? PorcentajeCalculado { get; set; }
        public string? MensajeValidacion { get; set; }
        public DateTime FechaSolicitud { get; set; }
        public string SolicitadoPor { get; set; } = string.Empty;
        public int? JefeAreaId { get; set; }
        public string? NombreJefeArea { get; set; }
    }

    /// <summary>
    /// Request para aprobar o rechazar una solicitud
    /// </summary>
    public class AprobarReprogramacionRequest
    {
        [Required(ErrorMessage = "El ID de la solicitud es requerido")]
        public int SolicitudId { get; set; }

        [Required(ErrorMessage = "La decisión de aprobación es requerida")]
        public bool Aprobada { get; set; }

        /// <summary>
        /// Motivo del rechazo (requerido si Aprobada = false)
        /// </summary>
        [MaxLength(500)]
        public string? MotivoRechazo { get; set; }
    }

    /// <summary>
    /// Response de aprobación/rechazo
    /// </summary>
    public class AprobarReprogramacionResponse
    {
        public int SolicitudId { get; set; }
        public bool Aprobada { get; set; }
        public string EstadoFinal { get; set; } = string.Empty;
        public int EmpleadoId { get; set; }
        public string NombreEmpleado { get; set; } = string.Empty;
        public DateOnly FechaOriginal { get; set; }
        public DateOnly FechaNueva { get; set; }
        public string? MotivoRechazo { get; set; }
        public DateTime FechaAprobacion { get; set; }
        public string AprobadoPor { get; set; } = string.Empty;
        public bool VacacionActualizada { get; set; }
    }

    /// <summary>
    /// Request para consultar solicitudes pendientes
    /// </summary>
    public class ConsultaSolicitudesRequest
    {
        public string? Estado { get; set; } // Pendiente, Aprobada, Rechazada
        public int? EmpleadoId { get; set; }
        public int? JefeAreaId { get; set; }
        public int? SolicitadoPorId { get; set; } // Usuario que registro la solicitud
        public DateTime? FechaDesde { get; set; }
        public DateTime? FechaHasta { get; set; }
        public int? AreaId { get; set; }
        public DateOnly? FechaNuevaDesde { get; set; } // Para filtrar por año de vacaciones
        public DateOnly? FechaNuevaHasta { get; set; } // Para filtrar por año de vacaciones
    }

    /// <summary>
    /// DTO para listado de solicitudes
    /// </summary>
    public class SolicitudReprogramacionDto
    {
        public int Id { get; set; }
        public int EmpleadoId { get; set; }
        public string NombreEmpleado { get; set; } = string.Empty;
        public string NominaEmpleado { get; set; } = string.Empty;
        public string AreaEmpleado { get; set; } = string.Empty;
        public string GrupoEmpleado { get; set; } = string.Empty;
        public int VacacionOriginalId { get; set; }
        public DateOnly FechaOriginal { get; set; }
        public DateOnly FechaNueva { get; set; }
        public string Motivo { get; set; } = string.Empty;
        public string EstadoSolicitud { get; set; } = string.Empty;
        public bool RequiereAprobacion { get; set; }
        public decimal? PorcentajeCalculado { get; set; }
        public decimal? PorcentajeDelDia { get; set; }
        public DateTime FechaSolicitud { get; set; }
        public string SolicitadoPor { get; set; } = string.Empty;
        public DateTime? FechaAprobacion { get; set; }
        public string? AprobadoPor { get; set; }
        public string? MotivoRechazo { get; set; }
        public bool PuedeAprobar { get; set; } // Para el frontend
    }

    /// <summary>
    /// Response para listado de solicitudes
    /// </summary>
    public class ListaSolicitudesReprogramacionResponse
    {
        public int TotalSolicitudes { get; set; }
        public int Pendientes { get; set; }
        public int Aprobadas { get; set; }
        public int Rechazadas { get; set; }
        public List<SolicitudReprogramacionDto> Solicitudes { get; set; } = new();
    }

    /// <summary>
    /// Request para validar disponibilidad antes de solicitar
    /// </summary>
    public class ValidarReprogramacionRequest
    {
        [Required]
        public int EmpleadoId { get; set; }

        [Required]
        public int VacacionOriginalId { get; set; }

        [Required]
        public DateOnly FechaNueva { get; set; }
    }

    /// <summary>
    /// Response de validación previa
    /// </summary>
    public class ValidarReprogramacionResponse
    {
        public bool EsValida { get; set; }
        public bool RequiereAprobacion { get; set; }
        public decimal PorcentajeCalculado { get; set; }
        public decimal PorcentajeMaximo { get; set; }
        public string? MotivoInvalidez { get; set; }
        public List<string> Advertencias { get; set; } = new();
        public DateOnly FechaOriginal { get; set; }
        public DateOnly FechaNueva { get; set; }
        public string TipoVacacionOriginal { get; set; } = string.Empty;
    }
}
