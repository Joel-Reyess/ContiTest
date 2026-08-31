using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace tiempo_libre.DTOs
{
    /// <summary>
    /// Request para asignar vacaciones manualmente a un empleado
    /// </summary>
    public class AsignacionManualRequest
    {
        [Required(ErrorMessage = "El ID del empleado es requerido")]
        public int EmpleadoId { get; set; }

        [Required(ErrorMessage = "Las fechas de vacaciones son requeridas")]
        public List<DateOnly> FechasVacaciones { get; set; } = new();

        [Required(ErrorMessage = "El tipo de vacación es requerido")]
        [MaxLength(50)]
        public string TipoVacacion { get; set; } = "Manual"; // 'Anual', 'Reprogramacion', 'Automatica', 'Manual', 'Compensatoria', 'Extraordinaria'

        [MaxLength(30)]
        public string OrigenAsignacion { get; set; } = "Manual"; // 'Manual', 'Automatica', 'Sistema'

        [MaxLength(20)]
        public string EstadoVacacion { get; set; } = "Activa"; // 'Activa', 'Intercambiada', 'Cancelada'

        [MaxLength(500)]
        public string? Observaciones { get; set; }

        [MaxLength(200)]
        public string? MotivoAsignacion { get; set; }

        // Para casos especiales
        public bool IgnorarRestricciones { get; set; } = true; // Permite asignar sin validar porcentajes, días disponibles, etc.

        public bool NotificarEmpleado { get; set; } = true; // Si se debe notificar al empleado

        /// <summary>
        /// El jefe o el superusuario ya vieron la alerta de que el día rebasa el
        /// porcentaje del grupo y aun así quieren guardarlo. Sin esto, un día
        /// rebasado se rechaza pidiendo confirmación. Va aparte de
        /// IgnorarRestricciones, que hoy llega en true desde todas las
        /// pantallas y se salta también los días duplicados.
        /// </summary>
        public bool ConfirmarRebasePorcentaje { get; set; } = false;

        public int? BloqueId { get; set; } // Si está relacionado con un bloque específico

        // Para tracking
        public string? OrigenSolicitud { get; set; } // 'NoRespondio', 'Ajuste', 'Correcion', 'Especial'
    }

    /// <summary>
    /// Request para asignar vacaciones en lote a múltiples empleados
    /// </summary>
    public class AsignacionManualLoteRequest
    {
        [Required(ErrorMessage = "Los IDs de empleados son requeridos")]
        public List<int> EmpleadosIds { get; set; } = new();

        [Required(ErrorMessage = "Las fechas de vacaciones son requeridas")]
        public List<DateOnly> FechasVacaciones { get; set; } = new();

        [Required(ErrorMessage = "El tipo de vacación es requerido")]
        [MaxLength(50)]
        public string TipoVacacion { get; set; } = "Manual";

        [MaxLength(30)]
        public string OrigenAsignacion { get; set; } = "Manual";

        [MaxLength(20)]
        public string EstadoVacacion { get; set; } = "Activa";

        [MaxLength(500)]
        public string? Observaciones { get; set; }

        [MaxLength(200)]
        public string? MotivoAsignacion { get; set; }

        public bool IgnorarRestricciones { get; set; } = true;

        public bool NotificarEmpleados { get; set; } = true;

        public int? BloqueId { get; set; }

        public string? OrigenSolicitud { get; set; }
    }

    /// <summary>
    /// Response de asignación manual individual
    /// </summary>
    public class AsignacionManualResponse
    {
        public bool Exitoso { get; set; }
        public int EmpleadoId { get; set; }
        public string NombreEmpleado { get; set; } = string.Empty;
        public List<int> VacacionesAsignadasIds { get; set; } = new();
        public List<DateOnly> FechasAsignadas { get; set; } = new();
        public int TotalDiasAsignados { get; set; }
        public string TipoVacacion { get; set; } = string.Empty;
        public string? Mensaje { get; set; }
        public List<string> Advertencias { get; set; } = new();
        public DateTime FechaAsignacion { get; set; }
        public string UsuarioAsigno { get; set; } = string.Empty;

        /// <summary>
        /// Hay días que rebasan el porcentaje y falta que quien captura lo
        /// confirme. El frontend muestra la alerta y reenvía con
        /// ConfirmarRebasePorcentaje = true.
        /// </summary>
        public bool RequiereConfirmacionRebase { get; set; }

        public List<DiaConRebaseDto> DiasConRebase { get; set; } = new();
    }

    /// <summary>Renglón del reporte de días capturados por encima del porcentaje.</summary>
    public class DiaRebasePorcentajeDto
    {
        public DateOnly Fecha { get; set; }
        public string Nomina { get; set; } = string.Empty;
        public string NombreEmpleado { get; set; } = string.Empty;
        public string Area { get; set; } = string.Empty;
        public string Grupo { get; set; } = string.Empty;
        public string TipoVacacion { get; set; } = string.Empty;
        public string OrigenAsignacion { get; set; } = string.Empty;
        public decimal? PorcentajeAlCapturar { get; set; }
        public string? CapturadoPor { get; set; }
        public DateTime FechaCaptura { get; set; }
        public string? Observaciones { get; set; }
    }

    /// <summary>Un día que se capturó (o se va a capturar) por encima del porcentaje.</summary>
    public class DiaConRebaseDto
    {
        public DateOnly Fecha { get; set; }
        public decimal PorcentajeResultante { get; set; }
        public decimal PorcentajeMaximo { get; set; }
        public string Detalle { get; set; } = string.Empty;
    }

    /// <summary>
    /// Response de asignación manual en lote
    /// </summary>
    public class AsignacionManualLoteResponse
    {
        public int TotalEmpleados { get; set; }
        public int AsignacionesExitosas { get; set; }
        public int AsignacionesFallidas { get; set; }
        public List<AsignacionManualResponse> Detalles { get; set; } = new();
        public List<string> ErroresGenerales { get; set; } = new();
        public DateTime FechaEjecucion { get; set; }
        public string UsuarioEjecuto { get; set; } = string.Empty;
    }

    /// <summary>
    /// DTO para validación previa de asignación
    /// </summary>
    public class ValidacionAsignacionDto
    {
        public int EmpleadoId { get; set; }
        public string NombreEmpleado { get; set; } = string.Empty;
        public List<DateOnly> FechasDisponibles { get; set; } = new();
        public List<DateOnly> FechasNoDisponibles { get; set; } = new();
        public List<ConflictoAsignacionDto> Conflictos { get; set; } = new();
        public int DiasDisponiblesRestantes { get; set; }
        public bool PuedeAsignar { get; set; }
    }

    public class ConflictoAsignacionDto
    {
        public DateOnly Fecha { get; set; }
        public string TipoConflicto { get; set; } = string.Empty; // 'YaAsignada', 'Incapacidad', 'DiaDescanso', 'Festivo'
        public string Descripcion { get; set; } = string.Empty;
    }
}