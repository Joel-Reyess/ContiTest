using Microsoft.EntityFrameworkCore;
using tiempo_libre.Models;
using tiempo_libre.Models.Enums;
using System;
using System.Linq;

// Configurar DbContext
var builder = new DbContextOptionsBuilder<FreeTimeDbContext>();
builder.UseSqlServer("Server=CHARLYVULKAN\\SQLEXPRESS;Database=FreeTime;Trusted_Connection=True;TrustServerCertificate=True;");

using (var context = new FreeTimeDbContext(builder.Options))
{
    Console.WriteLine("Consultando reprogramaciones...");

    var total = context.ReprogramacionesDeVacaciones.Count();
    Console.WriteLine($"Total reprogramaciones en BD: {total}");

    var aceptadas = context.ReprogramacionesDeVacaciones
        .Where(r => r.Estatus == EstatusReprogramacionDeVacacionesEnum.Aceptado)
        .ToList();

    Console.WriteLine($"Reprogramaciones Aceptadas: {aceptadas.Count}");

    foreach (var r in aceptadas)
    {
        Console.WriteLine($"ID: {r.Id} | Original: {r.FechaDiasDeVacacionOriginal:yyyy-MM-dd} | Repro: {r.FechaDiasDeVacacionReprogramada:yyyy-MM-dd} | Nómina: {r.NominaEmpleadoSindical}");
    }
}
