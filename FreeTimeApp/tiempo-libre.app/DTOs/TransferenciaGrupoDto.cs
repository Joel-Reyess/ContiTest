namespace tiempo_libre.DTOs;

public class TransferirEmpleadoRequest
{
    public int EmpleadoId { get; set; }
    public int GrupoDestinoId { get; set; }
    public string? Motivo { get; set; }
}

public class TransferirEmpleadoResponse
{
    public bool Exito { get; set; }
    public string Mensaje { get; set; } = string.Empty;
    public bool AdvertenciaManning { get; set; }
    public string? DetallesManning { get; set; }
    public int TransferenciaId { get; set; }
    public string NombreEmpleado { get; set; } = string.Empty;
    public int NominaEmpleado { get; set; }
    public string GrupoOrigen { get; set; } = string.Empty;
    public string GrupoDestino { get; set; } = string.Empty;
    public string AreaDestino { get; set; } = string.Empty;
    public int DiasCalendarioActualizados { get; set; }
}

public class HistorialTransferenciaDto
{
    public int Id { get; set; }
    public int EmpleadoId { get; set; }
    public string NombreEmpleado { get; set; } = string.Empty;
    public int NominaEmpleado { get; set; }
    public int GrupoOrigenId { get; set; }
    public string GrupoOrigen { get; set; } = string.Empty;
    public string AreaOrigen { get; set; } = string.Empty;
    public int GrupoDestinoId { get; set; }
    public string GrupoDestino { get; set; } = string.Empty;
    public string AreaDestino { get; set; } = string.Empty;
    public string NombreRealizadoPor { get; set; } = string.Empty;
    public DateTime FechaTransferencia { get; set; }
    public string? Motivo { get; set; }
    public bool HuboAdvertenciaManning { get; set; }
}
