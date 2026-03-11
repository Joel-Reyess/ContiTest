/**
 * =============================================================================
 * AUSENCIAS SERVICE
 * =============================================================================
 * 
 * @description
 * Servicio para el manejo de ausencias y cálculos de porcentajes de 
 * disponibilidad del personal. Integra con el endpoint /api/ausencias/calcular
 * para obtener datos reales de ausencias por grupo y fecha.
 * 
 * @endpoints
 * - POST /api/ausencias/calcular - Calcula porcentajes de ausencia
 * 
 * @author Vulcanics Dev Team
 * @created 2025
 * =============================================================================
 */

import { httpClient } from './httpClient';
import type { 
    AusenciasResponse, 
    CalcularAusenciasRequest, 
    AusenciasFilters,
    AusenciasPorFecha 
} from '../interfaces/Ausencias.interface';
import { logger } from '@/utils/logger';

class AusenciasService {
    private readonly baseUrl = '/api/ausencias';

    /**
     * Calcula los porcentajes de ausencia para una o más fechas
     * @param request Parámetros para el cálculo de ausencias
     * @returns Promise con los datos de ausencias calculados
     */
    // Agrega signal opcional a calcularAusencias
    async calcularAusencias(request: CalcularAusenciasRequest, signal?: AbortSignal): Promise<AusenciasResponse> {
        try {
            const apiResponse = await httpClient.post<AusenciasResponse>(
                `${this.baseUrl}/calcular`,
                request,
                { signal }  // pasa el signal si tu httpClient lo soporta
            );
            return apiResponse as unknown as AusenciasResponse;
        } catch (error: any) {
            if (error?.name === 'AbortError') throw error; // re-throw para que CalendarWidget lo capture
            // ... resto del catch igual
            throw error;
        }
    }

    async calcularAusenciasParaCalendario(filters: AusenciasFilters, signal?: AbortSignal): Promise<AusenciasPorFecha[]> {
        try {
            const request = this.buildRequestFromFilters(filters);
            const response = await this.calcularAusencias(request, signal);
            if (!response.success || !response.data) {
                throw new Error(response.message || 'Error al calcular ausencias');
            }
            return response.data;
        } catch (error) {
            if ((error as any)?.name === 'AbortError') throw error;
            logger.error('Error calculating ausencias for calendar', error, 'AUSENCIAS_SERVICE');
            throw error;
        }
    }
    /**
     * Construye el request para el endpoint basado en los filtros del calendario
     * @param filters Filtros del calendario
     * @returns Request object para el endpoint
     */
    private buildRequestFromFilters(filters: AusenciasFilters): CalcularAusenciasRequest {
        // Validar que tenemos una fecha válida
        if (!filters.fechaInicio || isNaN(filters.fechaInicio.getTime())) {
            throw new Error('Fecha de inicio inválida para calcular ausencias');
        }

        const request: CalcularAusenciasRequest = {
            fechaInicio: this.formatDate(filters.fechaInicio)
        };

        // Configurar fechas según la vista
        switch (filters.view) {
            case 'daily':
                // Solo fecha de inicio para vista diaria
                break;
                
            case 'weekly':
                // Calcular el rango de la semana
                const weekStart = this.getWeekStart(filters.fechaInicio);
                const weekEnd = this.getWeekEnd(weekStart);
                request.fechaInicio = this.formatDate(weekStart);
                request.fechaFin = this.formatDate(weekEnd);
                break;
                
            case 'monthly':
                // Calcular el rango del mes
                const monthStart = this.getMonthStart(filters.fechaInicio);
                const monthEnd = this.getMonthEnd(filters.fechaInicio);
                request.fechaInicio = this.formatDate(monthStart);
                request.fechaFin = this.formatDate(monthEnd);
                break;
        }

        // Agregar filtros opcionales
        if (filters.areaId) {
            request.areaId = filters.areaId;
        }

        // Si hay un solo grupo seleccionado, usar grupoId
        // Si hay múltiples grupos, usar areaId (si está disponible) o el primer grupo como fallback
        if (filters.grupoIds && filters.grupoIds.length === 1) {
            request.grupoId = filters.grupoIds[0];
        } else if (filters.grupoIds && filters.grupoIds.length > 1) {
            // Para múltiples grupos, usar areaId si está disponible
            // Si no hay areaId, usar el primer grupo como fallback
            if (!filters.areaId && filters.grupoIds.length > 0) {
                request.grupoId = filters.grupoIds[0];
                logger.info('Multiple groups detected, using first group as fallback', { grupoId: filters.grupoIds[0], allGroups: filters.grupoIds }, 'AUSENCIAS_SERVICE');
            }
        }

        return request;
    }

    /**
     * Formatea una fecha al formato YYYY-MM-DD
     * @param date Fecha a formatear
     * @returns Fecha en formato string
     */
    private formatDate(date: Date): string {
        // Usar formateo local para evitar problemas de zona horaria
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const formatted = `${year}-${month}-${day}`;
        
        logger.info('Formatting date', { 
            original: date.toISOString(), 
            formatted,
            year,
            month: date.getMonth() + 1,
            day: date.getDate()
        }, 'AUSENCIAS_SERVICE');
        
        return formatted;
    }

    /**
     * Obtiene el inicio de la semana (domingo)
     * @param date Fecha de referencia
     * @returns Fecha del inicio de la semana
     */
    private getWeekStart(date: Date): Date {
        const start = new Date(date);
        const day = start.getDay();
        const diff = start.getDate() - day;
        start.setDate(diff);
        start.setHours(0, 0, 0, 0);
        return start;
    }

    /**
     * Obtiene el final de la semana (sábado)
     * @param weekStart Fecha del inicio de la semana
     * @returns Fecha del final de la semana
     */
    private getWeekEnd(weekStart: Date): Date {
        const end = new Date(weekStart);
        end.setDate(weekStart.getDate() + 6);
        end.setHours(23, 59, 59, 999);
        return end;
    }

    /**
     * Obtiene el primer día del mes
     * @param date Fecha de referencia
     * @returns Fecha del primer día del mes
     */
    private getMonthStart(date: Date): Date {
        const start = new Date(date.getFullYear(), date.getMonth(), 1);
        start.setHours(0, 0, 0, 0);
        return start;
    }

    /**
     * Obtiene el último día del mes
     * @param date Fecha de referencia
     * @returns Fecha del último día del mes
     */
    private getMonthEnd(date: Date): Date {
        // Obtener el último día del mes actual
        const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
        end.setHours(23, 59, 59, 999);
        
        logger.info('Calculating month end', {
            input: date.toISOString(),
            year: date.getFullYear(),
            month: date.getMonth() + 1,
            calculatedEnd: end.toISOString(),
            endDay: end.getDate(),
            endMonth: end.getMonth() + 1
        }, 'AUSENCIAS_SERVICE');
        
        return end;
    }

    /**
     * Obtiene el porcentaje de ausencia promedio para un grupo específico
     * @param data Datos de ausencias
     * @param grupoId ID del grupo
     * @returns Porcentaje promedio de ausencia
     */
    getAverageAusenciaForGroup(data: AusenciasPorFecha[], grupoId: number): number {
        const percentages: number[] = [];

        data.forEach(fechaData => {
            const grupoData = fechaData.ausenciasPorGrupo.find(g => g.grupoId === grupoId);
            if (grupoData) {
                percentages.push(grupoData.porcentajeAusencia);
            }
        });

        if (percentages.length === 0) return 0;
        
        const average = percentages.reduce((sum, p) => sum + p, 0) / percentages.length;
        return Math.round(average * 10) / 10;
    }

    /**
     * Obtiene el porcentaje de ausencia para una fecha y grupo específicos
     * @param data Datos de ausencias
     * @param fecha Fecha en formato YYYY-MM-DD
     * @param grupoId ID del grupo
     * @returns Porcentaje de ausencia
     */
    getAusenciaForDateAndGroup(data: AusenciasPorFecha[], fecha: string, grupoId: number): number {
        const fechaData = data.find(d => d.fecha === fecha);
        if (!fechaData) return 0;

        const grupoData = fechaData.ausenciasPorGrupo.find(g => g.grupoId === grupoId);
        return grupoData?.porcentajeAusencia || 0;
    }
}

export const ausenciasService = new AusenciasService();
export default ausenciasService;
