using System.Collections.Generic;

namespace tiempo_libre.DTOs
{
    public class DiagnosticoFestivoTrabajadoResponse
    {
        public string NominaConsultada { get; set; } = "";
        public string? NominaUsadaParaMatch { get; set; }
        public EmpleadoDiagnosticoDto? Empleado { get; set; }
        public List<UploadRecordDiagnosticoDto> UploadRecords { get; set; } = new();
        public List<SolicitudBloqueoDto> SolicitudesQueBloquean { get; set; } = new();
        public int TotalDisponibles { get; set; }
        public int TotalNoDisponibles { get; set; }
        public List<string> Notas { get; set; } = new();
    }

    public class EmpleadoDiagnosticoDto
    {
        public int Id { get; set; }
        public string? Nomina { get; set; }
        public string Username { get; set; } = "";
        public string FullName { get; set; } = "";
        public string? Area { get; set; }
        public string? Grupo { get; set; }
    }

    public class UploadRecordDiagnosticoDto
    {
        public string FechaRaw { get; set; } = "";
        public string? FechaParsed { get; set; }
        public bool ParseoExitoso { get; set; }
        public bool Expirado { get; set; }
        public bool YaSolicitado { get; set; }
        public bool Disponible { get; set; }
        public string? Motivo { get; set; }
    }

    public class SolicitudBloqueoDto
    {
        public int Id { get; set; }
        public string FestivoOriginal { get; set; } = "";
        public string FechaNuevaSolicitada { get; set; } = "";
        public string EstadoSolicitud { get; set; } = "";
        public string FechaSolicitud { get; set; } = "";
    }
}
