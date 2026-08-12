using System;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using tiempo_libre.Models;
using tiempo_libre.DTOs;
using tiempo_libre.Models.Enums;
using tiempo_libre.Logic;

namespace tiempo_libre.Services
{
    public class GeneraReservacionTurnosService
    {
        private readonly FreeTimeDbContext _db;
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly ILogger<GeneraReservacionTurnosService> _logger;

        public GeneraReservacionTurnosService(
            FreeTimeDbContext db,
            IServiceScopeFactory scopeFactory,
            ILogger<GeneraReservacionTurnosService> logger)
        {
            _db = db;
            _scopeFactory = scopeFactory;
            _logger = logger;
        }

        public virtual async Task<ApiResponse<string>> EjecutarAsync(AsignacionDeVacacionesRequest request, int userId)
        {
            if (request.FechaInicio >= request.FechaFinal)
            {
                return new ApiResponse<string>(false, null, "La FechaInicio debe ser menor a la FechaFinal.");
            }
            if (request.FechaInicioReservaciones >= request.FechaInicio)
            {
                return new ApiResponse<string>(false, null, "La FechaInicioReservaciones debe ser menor a la FechaInicio.");
            }

            try
            {
                var anio = request.FechaInicio.Year;
                var programacion = await _db.ProgramacionesAnuales
                    .FirstOrDefaultAsync(p => p.Anio == anio);

                if (programacion == null)
                {
                    programacion = new ProgramacionesAnuales
                    {
                        IdSuperUser = userId,
                        Anio = anio,
                        FechaInicia = request.FechaInicio,
                        FechaTermina = request.FechaFinal,
                        FechaInicioReservaTurnos = request.FechaInicioReservaciones,
                        Estatus = EstatusProgramacionAnualEnum.EnProceso,
                        BorradoLogico = false
                    };
                    _db.ProgramacionesAnuales.Add(programacion);
                }
                else if (programacion.Estatus == EstatusProgramacionAnualEnum.Cerrada)
                {
                    programacion.Estatus = EstatusProgramacionAnualEnum.EnProceso;
                    programacion.FechaInicia = request.FechaInicio;
                    programacion.FechaTermina = request.FechaFinal;
                    programacion.FechaInicioReservaTurnos = request.FechaInicioReservaciones;
                    _db.ProgramacionesAnuales.Update(programacion);
                }
                else if (programacion.Estatus == EstatusProgramacionAnualEnum.EnProceso)
                {
                    programacion.FechaInicia = request.FechaInicio;
                    programacion.FechaTermina = request.FechaFinal;
                    programacion.FechaInicioReservaTurnos = request.FechaInicioReservaciones;
                    _db.ProgramacionesAnuales.Update(programacion);
                }
                else if (programacion.Estatus == EstatusProgramacionAnualEnum.Pendiente)
                {
                    programacion.Estatus = EstatusProgramacionAnualEnum.EnProceso;
                    programacion.FechaInicia = request.FechaInicio;
                    programacion.FechaTermina = request.FechaFinal;
                    programacion.FechaInicioReservaTurnos = request.FechaInicioReservaciones;
                    _db.ProgramacionesAnuales.Update(programacion);
                }

                await _db.SaveChangesAsync();

                // Ejecutar la generación de calendarios de forma asíncrona.
                // OJO: no capturar _db aquí. Es el DbContext Scoped del request y se
                // desecha en cuanto este método retorna; la tarea seguía usándolo y
                // moría con ObjectDisposedException sin dejar rastro en los logs.
                _ = Task.Run(async () =>
                {
                    using var scope = _scopeFactory.CreateScope();
                    var logger = scope.ServiceProvider.GetRequiredService<ILogger<EmployeesCalendarsGenerator>>();
                    try
                    {
                        var db = scope.ServiceProvider.GetRequiredService<FreeTimeDbContext>();
                        var generator = new EmployeesCalendarsGenerator(db, logger, request.FechaInicio, request.FechaFinal);
                        await generator.GenerateEmployeesCalendarsAsync(request.FechaInicio, request.FechaFinal);
                    }
                    catch (Exception ex)
                    {
                        logger.LogError(ex, "La generación de calendarios de empleados falló ({FechaInicio} - {FechaFinal})",
                            request.FechaInicio, request.FechaFinal);
                    }
                });

                return new ApiResponse<string>(true, "La generación de calendarios y reservaciones se ha iniciado correctamente.", null);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al ejecutar la generación de reservaciones y calendarios.");
                return new ApiResponse<string>(false, null, "Ocurrió un error al ejecutar la operación.");
            }
        }
    }
}
