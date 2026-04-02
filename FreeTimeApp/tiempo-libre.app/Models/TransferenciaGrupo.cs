using System.ComponentModel.DataAnnotations;

namespace tiempo_libre.Models;

public class TransferenciaGrupo
{
    [Key]
    public int Id { get; set; }

    [Required]
    public int EmpleadoId { get; set; }

    [Required]
    public int GrupoOrigenId { get; set; }

    [Required]
    public int GrupoDestinoId { get; set; }

    [Required]
    public int RealizadoPorId { get; set; }

    public DateTime FechaTransferencia { get; set; } = DateTime.UtcNow;

    [MaxLength(500)]
    public string? Motivo { get; set; }

    public bool HuboAdvertenciaManning { get; set; } = false;

    // Navigation properties
    public virtual User Empleado { get; set; } = null!;
    public virtual Grupo GrupoOrigen { get; set; } = null!;
    public virtual Grupo GrupoDestino { get; set; } = null!;
    public virtual User RealizadoPor { get; set; } = null!;
}
