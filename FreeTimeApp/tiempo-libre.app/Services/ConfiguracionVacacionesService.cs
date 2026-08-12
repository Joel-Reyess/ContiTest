using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using tiempo_libre.Models;
using tiempo_libre.DTOs;

namespace tiempo_libre.Services
{
    public class ConfiguracionVacacionesService
    {
        private readonly FreeTimeDbContext _db;

        public ConfiguracionVacacionesService(FreeTimeDbContext db)
        {
            _db = db;
        }

        public async Task<ApiResponse<ConfiguracionVacaciones>> ObtenerConfiguracionActualAsync()
        {
            try
            {
                var config = await _db.ConfiguracionVacaciones
                    .OrderByDescending(c => c.Id)
                    .FirstOrDefaultAsync();

                if (config == null)
                {
                    // Crear configuración por defecto si no existe
                    config = new ConfiguracionVacaciones
                    {
                        PorcentajeAusenciaMaximo = 4.5m,
                        PeriodoActual = "Cerrado",
                        AnioVigente = DateTime.Now.Year
                    };

                    _db.ConfiguracionVacaciones.Add(config);
                    await _db.SaveChangesAsync();
                }

                return new ApiResponse<ConfiguracionVacaciones>(true, config, null);
            }
            catch (Exception ex)
            {
                return new ApiResponse<ConfiguracionVacaciones>(false, null, $"Error al obtener configuración: {ex.Message}");
            }
        }

        public async Task<ApiResponse<ConfiguracionVacaciones>> ActualizarConfiguracionAsync(ConfiguracionVacaciones nuevaConfig)
        {
            try
            {
                var configActual = await _db.ConfiguracionVacaciones
                    .OrderByDescending(c => c.Id)
                    .FirstOrDefaultAsync();

                if (configActual == null)
                {
                    // Crear nueva configuración
                    nuevaConfig.CreatedAt = DateTime.Now;
                    _db.ConfiguracionVacaciones.Add(nuevaConfig);
                }
                else
                {
                    // Actualizar configuración existente
                    configActual.PorcentajeAusenciaMaximo = nuevaConfig.PorcentajeAusenciaMaximo;
                    configActual.PeriodoActual = nuevaConfig.PeriodoActual;
                    configActual.AnioVigente = nuevaConfig.AnioVigente;
                    configActual.AnioProgramacionAnual = nuevaConfig.AnioProgramacionAnual;
                    configActual.UpdatedAt = DateTime.Now;
                }

                await _db.SaveChangesAsync();

                var configResultado = configActual ?? nuevaConfig;
                return new ApiResponse<ConfiguracionVacaciones>(true, configResultado, null);
            }
            catch (Exception ex)
            {
                return new ApiResponse<ConfiguracionVacaciones>(false, null, $"Error al actualizar configuración: {ex.Message}");
            }
        }

        public async Task<ApiResponse<List<ExcepcionesPorcentaje>>> ObtenerExcepcionesPorcentajeAsync(int? grupoId = null, DateOnly? fechaInicio = null, DateOnly? fechaFin = null)
        {
            try
            {
                var query = _db.ExcepcionesPorcentaje
                    .Include(e => e.Grupo)
                    .ThenInclude(g => g.Area)
                    .AsQueryable();

                if (grupoId.HasValue)
                    query = query.Where(e => e.GrupoId == grupoId.Value);

                if (fechaInicio.HasValue)
                    query = query.Where(e => e.Fecha >= fechaInicio.Value);

                if (fechaFin.HasValue)
                    query = query.Where(e => e.Fecha <= fechaFin.Value);

                var excepciones = await query
                    .OrderBy(e => e.Fecha)
                    .ThenBy(e => e.GrupoId)
                    .ToListAsync();

                return new ApiResponse<List<ExcepcionesPorcentaje>>(true, excepciones, null);
            }
            catch (Exception ex)
            {
                return new ApiResponse<List<ExcepcionesPorcentaje>>(false, null, $"Error al obtener excepciones: {ex.Message}");
            }
        }

        public async Task<ApiResponse<ExcepcionesPorcentaje>> CrearExcepcionPorcentajeAsync(ExcepcionesPorcentaje excepcion)
        {
            try
            {
                // Verificar que no exista ya una excepción para ese grupo y fecha
                var existeExcepcion = await _db.ExcepcionesPorcentaje
                    .AnyAsync(e => e.GrupoId == excepcion.GrupoId && e.Fecha == excepcion.Fecha);

                if (existeExcepcion)
                    return new ApiResponse<ExcepcionesPorcentaje>(false, null, "Ya existe una excepción para ese grupo y fecha.");

                excepcion.CreatedAt = DateTime.Now;

                _db.ExcepcionesPorcentaje.Add(excepcion);
                await _db.SaveChangesAsync();

                // Recargar con navegación
                var excepcionCompleta = await _db.ExcepcionesPorcentaje
                    .Include(e => e.Grupo)
                    .ThenInclude(g => g.Area)
                    .FirstOrDefaultAsync(e => e.Id == excepcion.Id);

                return new ApiResponse<ExcepcionesPorcentaje>(true, excepcionCompleta, null);
            }
            catch (Exception ex)
            {
                return new ApiResponse<ExcepcionesPorcentaje>(false, null, $"Error al crear excepción: {ex.Message}");
            }
        }

        public async Task<ApiResponse<ExcepcionesPorcentaje>> ActualizarExcepcionPorcentajeAsync(int excepcionId, ExcepcionesPorcentaje datosActualizados)
        {
            try
            {
                var excepcion = await _db.ExcepcionesPorcentaje.FindAsync(excepcionId);
                if (excepcion == null)
                    return new ApiResponse<ExcepcionesPorcentaje>(false, null, "Excepción no encontrada.");

                excepcion.PorcentajeMaximoPermitido = datosActualizados.PorcentajeMaximoPermitido;
                excepcion.Motivo = datosActualizados.Motivo;
                excepcion.UpdatedAt = DateTime.Now;

                await _db.SaveChangesAsync();

                // Recargar con navegación
                var excepcionCompleta = await _db.ExcepcionesPorcentaje
                    .Include(e => e.Grupo)
                    .ThenInclude(g => g.Area)
                    .FirstOrDefaultAsync(e => e.Id == excepcionId);

                return new ApiResponse<ExcepcionesPorcentaje>(true, excepcionCompleta, null);
            }
            catch (Exception ex)
            {
                return new ApiResponse<ExcepcionesPorcentaje>(false, null, $"Error al actualizar excepción: {ex.Message}");
            }
        }

        public async Task<ApiResponse<bool>> EliminarExcepcionPorcentajeAsync(int excepcionId)
        {
            try
            {
                var excepcion = await _db.ExcepcionesPorcentaje.FindAsync(excepcionId);
                if (excepcion == null)
                    return new ApiResponse<bool>(false, false, "Excepción no encontrada.");

                _db.ExcepcionesPorcentaje.Remove(excepcion);
                await _db.SaveChangesAsync();

                return new ApiResponse<bool>(true, true, null);
            }
            catch (Exception ex)
            {
                return new ApiResponse<bool>(false, false, $"Error al eliminar excepción: {ex.Message}");
            }
        }

        public async Task<ApiResponse<bool>> CambiarPeriodoAsync(string nuevoPeriodo)
        {
            try
            {
                var validPeriods = new[] { "ProgramacionAnual", "Reprogramacion", "Cerrado" };
                if (!validPeriods.Contains(nuevoPeriodo))
                    return new ApiResponse<bool>(false, false, "Período inválido. Debe ser: ProgramacionAnual, Reprogramacion o Cerrado.");

                var config = await _db.ConfiguracionVacaciones
                    .OrderByDescending(c => c.Id)
                    .FirstOrDefaultAsync();

                if (config == null)
                    return new ApiResponse<bool>(false, false, "No se encontró configuración del sistema.");

                config.PeriodoActual = nuevoPeriodo;
                config.UpdatedAt = DateTime.Now;

                await _db.SaveChangesAsync();

                return new ApiResponse<bool>(true, true, $"Período cambiado exitosamente a: {nuevoPeriodo}");
            }
            catch (Exception ex)
            {
                return new ApiResponse<bool>(false, false, $"Error al cambiar período: {ex.Message}");
            }
        }

        #region Métodos para ExcepcionesManning

        public async Task<ApiResponse<List<ExcepcionesManning>>> ObtenerExcepcionesManningAsync(int? areaId = null, int? anio = null, int? mes = null, bool soloActivas = true)
        {
            try
            {
                var query = _db.ExcepcionesManning
                    .Include(e => e.Area)
                    .Include(e => e.CreadoPor)
                    .AsQueryable();

                if (soloActivas)
                    query = query.Where(e => e.Activa);

                if (areaId.HasValue)
                    query = query.Where(e => e.AreaId == areaId.Value);

                if (anio.HasValue)
                    query = query.Where(e => e.Anio == anio.Value);

                if (mes.HasValue)
                    query = query.Where(e => e.Mes == mes.Value);

                var excepciones = await query
                    .OrderBy(e => e.AreaId)
                    .ThenBy(e => e.Anio)
                    .ThenBy(e => e.Mes)
                    .ToListAsync();

                return new ApiResponse<List<ExcepcionesManning>>(true, excepciones, null);
            }
            catch (Exception ex)
            {
                return new ApiResponse<List<ExcepcionesManning>>(false, null, $"Error al obtener excepciones de manning: {ex.Message}");
            }
        }

        public async Task<ApiResponse<ExcepcionesManning>> CrearExcepcionManningAsync(ExcepcionesManning excepcion, int usuarioId)
        {
            try
            {
                // Verificar si ya existe una excepción para el mismo área, año y mes
                var existente = await _db.ExcepcionesManning
                    .FirstOrDefaultAsync(e => e.AreaId == excepcion.AreaId &&
                                             e.Anio == excepcion.Anio &&
                                             e.Mes == excepcion.Mes &&
                                             e.Activa);

                if (existente != null)
                    return new ApiResponse<ExcepcionesManning>(false, null,
                        $"Ya existe una excepción activa para el área {excepcion.AreaId} en {excepcion.Mes}/{excepcion.Anio}");

                // Verificar que el área existe
                var area = await _db.Areas.FindAsync(excepcion.AreaId);
                if (area == null)
                    return new ApiResponse<ExcepcionesManning>(false, null, $"El área con ID {excepcion.AreaId} no existe");

                excepcion.CreadoPorUserId = usuarioId;
                excepcion.CreatedAt = DateTime.UtcNow;
                excepcion.Activa = true;

                _db.ExcepcionesManning.Add(excepcion);
                await _db.SaveChangesAsync();

                // Recargar con las relaciones
                await _db.Entry(excepcion)
                    .Reference(e => e.Area)
                    .LoadAsync();

                return new ApiResponse<ExcepcionesManning>(true, excepcion, "Excepción de manning creada exitosamente");
            }
            catch (Exception ex)
            {
                return new ApiResponse<ExcepcionesManning>(false, null, $"Error al crear excepción de manning: {ex.Message}");
            }
        }

        public async Task<ApiResponse<ExcepcionesManning>> ActualizarExcepcionManningAsync(int excepcionId, ExcepcionesManning datosActualizados)
        {
            try
            {
                var excepcion = await _db.ExcepcionesManning
                    .Include(e => e.Area)
                    .FirstOrDefaultAsync(e => e.Id == excepcionId);

                if (excepcion == null)
                    return new ApiResponse<ExcepcionesManning>(false, null, $"Excepción con ID {excepcionId} no encontrada");

                // Actualizar solo los campos permitidos
                excepcion.ManningRequeridoExcepcion = datosActualizados.ManningRequeridoExcepcion;
                excepcion.Motivo = datosActualizados.Motivo;
                excepcion.UpdatedAt = DateTime.UtcNow;

                await _db.SaveChangesAsync();

                return new ApiResponse<ExcepcionesManning>(true, excepcion, "Excepción actualizada exitosamente");
            }
            catch (Exception ex)
            {
                return new ApiResponse<ExcepcionesManning>(false, null, $"Error al actualizar excepción: {ex.Message}");
            }
        }

        public async Task<ApiResponse<bool>> EliminarExcepcionManningAsync(int excepcionId)
        {
            try
            {
                var excepcion = await _db.ExcepcionesManning.FindAsync(excepcionId);

                if (excepcion == null)
                    return new ApiResponse<bool>(false, false, $"Excepción con ID {excepcionId} no encontrada");

                // Marcar como inactiva en lugar de eliminar físicamente
                excepcion.Activa = false;
                excepcion.UpdatedAt = DateTime.UtcNow;

                await _db.SaveChangesAsync();

                return new ApiResponse<bool>(true, true, "Excepción eliminada exitosamente");
            }
            catch (Exception ex)
            {
                return new ApiResponse<bool>(false, false, $"Error al eliminar excepción: {ex.Message}");
            }
        }

        #endregion
    }
}
