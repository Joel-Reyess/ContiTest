using System;
using System.ComponentModel.DataAnnotations;

namespace tiempo_libre.DTOs
{
    /// <summary>
    /// Request para solicitar el intercambio de un festivo trabajado
    /// </summary>
    public class SolicitudFestivoTrabajadoRequest
    {
        /// <summary>
        /// ID del empleado que solicita el intercambio
        /// </summary>
        [Required(ErrorMessage = "El ID del empleado es requerido")]
        public int EmpleadoId { get; set; }

        /// <summary>
        /// ID del registro en DiasFestivosTrabajadosOriginalTable
        /// </summary>
        [Required(ErrorMessage = "El ID del festivo trabajado es requerido")]
        public int FestivoTrabajadoId { get; set; }

        /// <summary>
        /// Nueva fecha solicitada para tomar el día festivo
        /// </summary>
        [Required(ErrorMessage = "La fecha nueva es requerida")]
        public DateOnly FechaNueva { get; set; }

        /// <summary>
        /// Motivo del intercambio
        /// </summary>
        [Required(ErrorMessage = "El motivo es requerido")]
        [MaxLength(500)]
        public string Motivo { get; set; } = string.Empty;
    }

    /// <summary>
    /// Response de solicitud de festivo trabajado
    /// </summary>
    public class SolicitudFestivoTrabajadoResponse
    {
        public int SolicitudId { get; set; }
        public int EmpleadoId { get; set; }
        public string NombreEmpleado { get; set; } = string.Empty;
        public string NominaEmpleado { get; set; } = string.Empty;
        public DateOnly FestivoOriginal { get; set; }
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
        public int? VacacionId { get; set; } // Solo si fue auto-aprobada
    }

    /// <summary>
    /// Request para consultar festivos trabajados disponibles
    /// </summary>
    public class ConsultaFestivosTrabajadosRequest
    {
        public int? EmpleadoId { get; set; }
        public int? Nomina { get; set; }
        public int? Anio { get; set; }
        public bool SoloDisponibles { get; set; } = true;
    }

    /// <summary>
    /// DTO para festivo trabajado
    /// </summary>
    public class FestivoTrabajadoDto
    {
        public int Id { get; set; }
        public int Nomina { get; set; }
        public string NombreEmpleado { get; set; } = string.Empty;
        public string FestivoTrabajado { get; set; } = string.Empty;
        public string DiaSemana { get; set; } = string.Empty;
        public bool YaIntercambiado { get; set; }
        public int? VacacionAsignadaId { get; set; }
        public DateOnly? FechaIntercambio { get; set; }
    }

    /// <summary>
    /// Response para listado de festivos trabajados
    /// </summary>
    public class ListaFestivosTrabajadosResponse
    {
        public int TotalFestivos { get; set; }
        public int FestivosDisponibles { get; set; }
        public int FestivosIntercambiados { get; set; }
        public List<FestivoTrabajadoDto> Festivos { get; set; } = new();
    }

    /// <summary>
    /// Request para validar intercambio de festivo antes de solicitarlo
    /// </summary>
    public class ValidarFestivoTrabajadoRequest
    {
        [Required]
        public int EmpleadoId { get; set; }

        [Required]
        public int FestivoTrabajadoId { get; set; }

        [Required]
        public DateOnly FechaNueva { get; set; }
    }

    /// <summary>
    /// Response de validación de festivo trabajado
    /// </summary>
    public class ValidarFestivoTrabajadoResponse
    {
        public bool EsValido { get; set; }
        public string? MotivoInvalidez { get; set; }
        public DateOnly FestivoOriginal { get; set; }
        public DateOnly FechaNueva { get; set; }
        public List<string> Advertencias { get; set; } = new();
        public bool EmpleadoCoincide { get; set; }
        public bool FestivoDisponible { get; set; }
    }

    /// <summary>
    /// Request para aprobar o rechazar una solicitud de festivo
    /// </summary>
    public class AprobarFestivoTrabajadoRequest
    {
        [Required(ErrorMessage = "El ID de la solicitud es requerido")]
        public int SolicitudId { get; set; }

        [Required(ErrorMessage = "La decisión de aprobación es requerida")]
        public bool Aprobada { get; set; }

        [MaxLength(500)]
        public string? MotivoRechazo { get; set; }
    }

    /// <summary>
    /// Response de aprobación/rechazo de festivo
    /// </summary>
    public class AprobarFestivoTrabajadoResponse
    {
        public int SolicitudId { get; set; }
        public bool Aprobada { get; set; }
        public string EstadoFinal { get; set; } = string.Empty;
        public int EmpleadoId { get; set; }
        public string NombreEmpleado { get; set; } = string.Empty;
        public DateOnly FestivoOriginal { get; set; }
        public DateOnly FechaNueva { get; set; }
        public string? MotivoRechazo { get; set; }
        public DateTime FechaAprobacion { get; set; }
        public string AprobadoPor { get; set; } = string.Empty;
        public bool VacacionCreada { get; set; }
    }

    /// <summary>
    /// Request para consultar solicitudes de festivos
    /// </summary>
    public class ConsultaSolicitudesFestivoRequest
    {
        public string? Estado { get; set; } // Pendiente, Aprobada, Rechazada
        public int? EmpleadoId { get; set; }
        public int? JefeAreaId { get; set; }
        public DateTime? FechaDesde { get; set; }
        public DateTime? FechaHasta { get; set; }
        public int? AreaId { get; set; }
    }

    /// <summary>
    /// DTO para listado de solicitudes de festivos
    /// </summary>
    public class SolicitudFestivoDto
    {
        public int Id { get; set; }
        public int EmpleadoId { get; set; }
        public string NombreEmpleado { get; set; } = string.Empty;
        public string NominaEmpleado { get; set; } = string.Empty;
        public string AreaEmpleado { get; set; } = string.Empty;
        public string GrupoEmpleado { get; set; } = string.Empty;
        public int? FestivoTrabajadoOriginalId { get; set; }
        public DateOnly FestivoOriginal { get; set; }
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
        public bool PuedeAprobar { get; set; }
    }

    /// <summary>
    /// Response para listado de solicitudes de festivos
    /// </summary>
    public class ListaSolicitudesFestivoResponse
    {
        public int TotalSolicitudes { get; set; }
        public int Pendientes { get; set; }
        public int Aprobadas { get; set; }
        public int Rechazadas { get; set; }
        public List<SolicitudFestivoDto> Solicitudes { get; set; } = new();
    }
}