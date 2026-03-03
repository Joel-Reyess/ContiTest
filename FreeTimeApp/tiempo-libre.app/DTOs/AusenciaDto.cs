using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace tiempo_libre.DTOs
{
    public class ConsultaAusenciaRequest
    {
        [Required(ErrorMessage = "La fecha de inicio es requerida")]
        public DateOnly FechaInicio { get; set; }

        /// <summary>
        /// Fecha fin opcional. Si no se especifica, solo consulta la fecha de inicio
        /// </summary>
        public DateOnly? FechaFin { get; set; }

        public int? GrupoId { get; set; } // Opcional: filtrar por grupo específico
        public int? AreaId { get; set; }  // Opcional: filtrar por área específica
    }

    public class AusenciaPorFechaResponse
    {
        public DateOnly Fecha { get; set; }
        public List<AusenciaPorGrupoDto> AusenciasPorGrupo { get; set; } = new List<AusenciaPorGrupoDto>();
    }

    public class AusenciaPorGrupoDto
    {
        public int GrupoId { get; set; }
        public string NombreGrupo { get; set; } = string.Empty;
        public int AreaId { get; set; }
        public string NombreArea { get; set; } = string.Empty;
        public int ManningRequerido { get; set; }
        public int PersonalTotal { get; set; }
        public int PersonalNoDisponible { get; set; }
        public int PersonalDisponible { get; set; }
        public decimal PorcentajeDisponible { get; set; }
        public decimal PorcentajeAusencia { get; set; }
        public decimal PorcentajeMaximoPermitido { get; set; }
        public bool ExcedeLimite { get; set; }
        public bool PuedeReservar { get; set; } // Indica si una persona más podría tomar este día sin exceder el límite
        public List<EmpleadoAusenteDto> EmpleadosAusentes { get; set; } = new List<EmpleadoAusenteDto>();
        public List<EmpleadoDisponibleDto> EmpleadosDisponibles { get; set; } = new List<EmpleadoDisponibleDto>();
    }

    public class EmpleadoAusenteDto
    {
        public int EmpleadoId { get; set; }
        public string NombreCompleto { get; set; } = string.Empty;
        public string TipoAusencia { get; set; } = string.Empty; // 'Vacacion', 'Incapacidad'
        public int? Nomina { get; set; }
        public string TipoVacacion { get; set; } = string.Empty; // 'Anual', 'AsignadaAutomaticamente', etc.
        public string? Maquina { get; set; } // Máquina asignada al empleado
        public string? Motivo { get; set; }
    }

    public class EmpleadoDisponibleDto
    {
        public int EmpleadoId { get; set; }
        public string NombreCompleto { get; set; } = string.Empty;
        public int? Nomina { get; set; }
        public string? Maquina { get; set; }
        public string? Rol { get; set; }
    }

    public class ValidacionDisponibilidadRequest
    {
        [Required]
        public int EmpleadoId { get; set; }
        
        [Required]
        public DateOnly Fecha { get; set; }
        
        public string TipoVacacion { get; set; } = "Anual";
    }

    public class ValidacionDisponibilidadResponse
    {
        public bool DiaDisponible { get; set; }
        public decimal PorcentajeAusenciaActual { get; set; }
        public decimal PorcentajeAusenciaConEmpleado { get; set; }
        public decimal PorcentajeMaximoPermitido { get; set; }
        public string Motivo { get; set; } = string.Empty;
        public AusenciaPorGrupoDto DetalleGrupo { get; set; } = new AusenciaPorGrupoDto();
    }
}
