using System;
using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace tiempo_libre.DTOs
{
    public class SolicitudPermutaRequest
    {
        [Required]
        [JsonPropertyName("empleadoOrigenId")] // ✅ AGREGAR
        public int EmpleadoOrigenId { get; set; }

        //[Required]
        [JsonPropertyName("empleadoDestinoId")] // ✅ AGREGAR
        public int? EmpleadoDestinoId { get; set; }

        [Required]
        [JsonPropertyName("fechaPermuta")] // ✅ AGREGAR
        public string FechaPermuta { get; set; } = string.Empty;

        /// <summary>
        /// Cambio individual con cambio de día: fecha a la que el empleado se
        /// presenta a laborar ("fecha del cambio" de la papeleta GT-67).
        /// Opcional: sin ella el cambio individual es el mismo día.
        /// </summary>
        [JsonPropertyName("fechaDestino")]
        public string? FechaDestino { get; set; }

        [Required]
        [MaxLength(500)]
        [JsonPropertyName("motivo")] // ✅ AGREGAR
        public string Motivo { get; set; } = string.Empty;

        [JsonPropertyName("solicitadoPor")] // ✅ AGREGAR
        public int SolicitadoPor { get; set; }

        [Required] // ✅ AGREGAR Required
        [JsonPropertyName("turnoEmpleadoOrigen")]
        public string TurnoEmpleadoOrigen { get; set; } = string.Empty;

        //[Required] // ✅ AGREGAR Required
        [JsonPropertyName("turnoEmpleadoDestino")]
        public string? TurnoEmpleadoDestino { get; set; } = string.Empty;
    }

    public class ResponderPermutaRequest
    {
        [Required]
        public bool Aprobar { get; set; }

        [MaxLength(500)]
        public string? MotivoRechazo { get; set; }
    }

    public class SolicitudPermutaResponse
    {
        public bool Exitoso { get; set; }
        public string Mensaje { get; set; } = string.Empty;
        public int PermutaId { get; set; }
        public EmpleadoPermutaInfo EmpleadoOrigen { get; set; } = new();
        public EmpleadoPermutaInfo EmpleadoDestino { get; set; } = new();
        public DateOnly FechaPermuta { get; set; }
    }

    public class EmpleadoPermutaInfo
    {
        public int Id { get; set; }
        public string Nombre { get; set; } = string.Empty;
        public string TurnoOriginal { get; set; } = string.Empty;
        public string TurnoNuevo { get; set; } = string.Empty;
    }
}