using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace tiempo_libre.DTOs
{
    public class DisponibilidadVacacionesRequest
    {
        /// <summary>
        /// Año a consultar
        /// </summary>
        [Required]
        public int Anio { get; set; }

        /// <summary>
        /// ID del grupo (requerido para calcular porcentajes específicos)
        /// </summary>
        [Required]
        public int GrupoId { get; set; }
    }

    public class DisponibilidadVacacionesResponse
    {
        public int Anio { get; set; }
        public int GrupoId { get; set; }
        public string NombreGrupo { get; set; } = string.Empty;
        public string NombreArea { get; set; } = string.Empty;
        public List<DisponibilidadMesResumenDto> MesesDelAnio { get; set; } = new();
        public ConfiguracionVacacionesDto ConfiguracionActual { get; set; } = new();
        public DateTime FechaConsulta { get; set; }
    }

    public class DisponibilidadMesResumenDto
    {
        public int Mes { get; set; }
        public string NombreMes { get; set; } = string.Empty;
        public int DiasDisponibles { get; set; }
        public int DiasNoDisponibles { get; set; }
        public int TotalDiasProcesados { get; set; }
        public decimal PorcentajeDisponibilidad { get; set; }
    }

    public class DisponibilidadMesDto
    {
        public int Anio { get; set; }
        public int Mes { get; set; }
        public string NombreMes { get; set; } = string.Empty;
        public int TotalDiasProcesados { get; set; }
        public int DiasDisponibles { get; set; }
        public int DiasNoDisponibles { get; set; }
        public List<DisponibilidadDiaDto> Dias { get; set; } = new();
    }

    public class DisponibilidadDiaDto
    {
        public DateOnly Fecha { get; set; }
        public string DiaSemana { get; set; } = string.Empty;
        public bool TieneDisponibilidad { get; set; }
        public int TotalGrupos { get; set; }
        public int GruposDisponibles { get; set; }
        public int GruposNoDisponibles { get; set; }
        public List<DisponibilidadGrupoDto> DisponibilidadPorGrupo { get; set; } = new();
    }

    public class DisponibilidadGrupoDto
    {
        public int GrupoId { get; set; }
        public string NombreGrupo { get; set; } = string.Empty;
        public int AreaId { get; set; }
        public string NombreArea { get; set; } = string.Empty;
        public bool TieneDisponibilidad { get; set; }
        public decimal PorcentajeAusenciaActual { get; set; }
        public decimal PorcentajeMaximoPermitido { get; set; }
        public int ManningRequerido { get; set; }
        public int PersonalDisponible { get; set; }
        public int PersonalTotal { get; set; }
        public string? MotivoNoDisponible { get; set; }
    }

    public class ConfiguracionVacacionesDto
    {
        public string PeriodoActual { get; set; } = string.Empty;
        public int AnioVigente { get; set; }
        public decimal PorcentajeAusenciaMaximo { get; set; }
        public DateTime FechaActualizacion { get; set; }
    }

    public class EstadoPeriodoVacacionesDto
    {
        public string PeriodoActual { get; set; } = string.Empty;
        public int AnioVigente { get; set; }
        /// <summary>Año en preparación de programación anual; null si no hay.</summary>
        public int? AnioProgramacionAnual { get; set; }
        public decimal PorcentajeAusenciaMaximo { get; set; }
        public bool PermiteProgramacionAnual { get; set; }
        public bool PermiteReprogramacion { get; set; }
        public bool EstaCerrado { get; set; }
        public string DescripcionPeriodo => PeriodoActual switch
        {
            "ProgramacionAnual" => "Periodo de Programación Anual - Los empleados pueden reservar sus vacaciones",
            "Reprogramacion" => "Periodo de Reprogramación - Se pueden solicitar cambios de fechas",
            "Cerrado" => "Sistema Cerrado - No se permiten cambios",
            _ => "Estado desconocido"
        };
    }

    public class ReservaVacacionRequest
    {
        [Required]
        public int EmpleadoId { get; set; }

        [Required]
        public List<DateOnly> FechasReservadas { get; set; } = new();

        public string? Observaciones { get; set; }
    }

    public class ReservaVacacionResponse
    {
        public int EmpleadoId { get; set; }
        public string NombreEmpleado { get; set; } = string.Empty;
        public List<VacacionReservadaDto> VacacionesReservadas { get; set; } = new();
        public List<string> Advertencias { get; set; } = new();
        public DateTime FechaReserva { get; set; } = DateTime.UtcNow;
        public bool ReservaExitosa { get; set; }
        public string? MotivoFallo { get; set; }
    }

    public class VacacionReservadaDto
    {
        public DateOnly Fecha { get; set; }
        public string DiaSemana { get; set; } = string.Empty;
        public bool FueReservada { get; set; }
        public decimal PorcentajeAusenciaCalculado { get; set; }
        public string? MotivoRechazo { get; set; }
    }

    public class CancelacionReservaRequest
    {
        [Required]
        public int EmpleadoId { get; set; }

        [Required]
        public List<DateOnly> FechasACancelar { get; set; } = new();

        [Required]
        [MaxLength(500)]
        public string Motivo { get; set; } = string.Empty;
    }

    public class CancelacionReservaResponse
    {
        public int EmpleadoId { get; set; }
        public string NombreEmpleado { get; set; } = string.Empty;
        public int VacacionesCanceladas { get; set; }
        public List<string> FechasCanceladas { get; set; } = new();
        public List<string> Advertencias { get; set; } = new();
        public bool CancelacionExitosa { get; set; }
        public string? MotivoFallo { get; set; }
    }

    public class ReservaAnualRequest
    {
        [Required]
        public int EmpleadoId { get; set; }

        [Required]
        public int AnioVacaciones { get; set; }

        [Required]
        [MinLength(1, ErrorMessage = "Debe especificar al menos una fecha")]
        public List<DateOnly> FechasSeleccionadas { get; set; } = new();

        [MaxLength(500, ErrorMessage = "Las observaciones no pueden exceder 500 caracteres")]
        public string? Observaciones { get; set; }
    }

    public class ReservaAnualResponse
    {
        public int EmpleadoId { get; set; }
        public string NombreEmpleado { get; set; } = string.Empty;
        public int AnioVacaciones { get; set; }
        public int DiasProgramablesDisponibles { get; set; }
        public int DiasProgramados { get; set; }
        public List<VacacionProgramadaDto> VacacionesProgramadas { get; set; } = new();
        public List<FechaNoDisponibleDto> FechasNoDisponibles { get; set; } = new();
        public List<string> Advertencias { get; set; } = new();
        public bool ReservaExitosa { get; set; }
        public string? MotivoFallo { get; set; }
        public DateTime FechaReserva { get; set; } = DateTime.UtcNow;
    }

    public class VacacionProgramadaDto
    {
        public DateOnly Fecha { get; set; }
        public string DiaSemana { get; set; } = string.Empty;
        public string TipoVacacion { get; set; } = string.Empty;
        public bool FueProgramada { get; set; }
    }

    public class FechaNoDisponibleDto
    {
        public DateOnly Fecha { get; set; }
        public string Motivo { get; set; } = string.Empty;
        public string Detalle { get; set; } = string.Empty;
    }
}