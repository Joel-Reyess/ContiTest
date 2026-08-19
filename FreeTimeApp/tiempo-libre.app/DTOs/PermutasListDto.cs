using System;
using System.Collections.Generic;

namespace tiempo_libre.DTOs
{
    public class PermutaListItem
    {
        public int Id { get; set; }
        public string EmpleadoOrigenNombre { get; set; } = string.Empty;
        public string EmpleadoDestinoNombre { get; set; } = string.Empty;
        public DateOnly FechaPermuta { get; set; }
        // Cambio individual con cambio de día: fecha a la que se presenta a laborar
        public DateOnly? FechaDestino { get; set; }
        public string TurnoEmpleadoOrigen { get; set; } = string.Empty;
        public string TurnoEmpleadoDestino { get; set; } = string.Empty;
        public string Motivo { get; set; } = string.Empty;
        public string SolicitadoPorNombre { get; set; } = string.Empty;
        public int SolicitadoPorId { get; set; }
        public DateTime FechaSolicitud { get; set; }
        public string EstadoSolicitud { get; set; } = "Pendiente";
        public string? JefeAprobadorNombre { get; set; }
        public DateTime? FechaRespuesta { get; set; }
        public string? MotivoRechazo { get; set; }
        public string? EmpleadoOrigenNomina { get; set; }
        public string? EmpleadoDestinoNomina { get; set; }
    }

    public class PermutasListResponse
    {
        public List<PermutaListItem> Permutas { get; set; } = new();
        public int Total { get; set; }
    }
}