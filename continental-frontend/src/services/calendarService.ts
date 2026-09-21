import type { CalendarData, Group, Manning } from '../interfaces/Calendar.interface';
import { fechaLocalISO } from '@/utils/fechaLocal';
import type { ApiResponse, CalcularAusenciasRequest, CalcularAusenciasResponse } from '../interfaces/Api.interface';

/**
 * Servicio para manejar datos del calendario de manning
 */
export class CalendarService {
  private static groups: Group[] = [
    { id: 'grupo1', name: 'Grupo 1', color: '#FF6B35' },
    { id: 'grupo2', name: 'Grupo 2', color: '#F7931E' },
    { id: 'grupo3', name: 'Grupo 3', color: '#FFD23F' },
    { id: 'grupo4', name: 'Grupo 4', color: '#06FFA5' },
  ];

  /**
   * Obtiene todos los grupos disponibles
   */
  static getGroups(): Group[] {
    return this.groups;
  }

  /**
   * Genera datos mock para el calendario
   * En producción, esto haría una llamada a la API
   */
  static async getCalendarData(
    month: number,
    year: number,
    selectedGroups: string[]
  ): Promise<CalendarData> {
    // Simular delay de API
    await new Promise(resolve => setTimeout(resolve, 300));

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const manning: Manning[] = [];

      // Generar datos para cada grupo seleccionado
      selectedGroups.forEach(groupId => {
        const group = this.groups.find(g => g.id === groupId);
        
        let percentage = 3.2; // Base percentage
        
        // Variar algunos días para mostrar diferentes estados
        if (day === 13 || day === 16 || day === 23) {
          percentage = 5.2; // Días con advertencia (rojo)
        } else if (day === 22) {
          percentage = 4.8; // Día crítico
        }
        
        const required = 100; // Base para cálculo de porcentajes
        const available = Math.round((percentage / 100) * required);
        
        let status: 'normal' | 'warning' | 'critical' = 'normal';
        if (percentage < 3.0) status = 'critical';
        else if (percentage < 4.0) status = 'warning';

        manning.push({
          group: group?.name || groupId,
          required,
          available,
          percentage,
          status
        });
      });

      const averagePercentage = manning.length > 0 
        ? manning.reduce((sum, m) => sum + m.percentage, 0) / manning.length
        : 3.3; // Default

      let dayStatus: 'normal' | 'warning' | 'critical' = 'normal';
      if (averagePercentage < 3.0) dayStatus = 'critical';
      else if (averagePercentage < 4.0) dayStatus = 'warning';

      days.push({
        date,
        day,
        manning,
        averagePercentage,
        status: dayStatus
      });
    }

    return {
      month,
      year,
      days,
      groups: this.groups.filter(g => selectedGroups.includes(g.id))
    };
  }

  /**
   * Exporta los datos del calendario a CSV
   */
  static exportToCSV(calendarData: CalendarData): void {
    const headers = ['Fecha', 'Día', 'Grupo', 'Requerido', 'Disponible', 'Porcentaje', 'Estado'];
    const rows = [headers.join(',')];

    calendarData.days.forEach(day => {
      if (day.manning.length === 0) {
        rows.push([
          fechaLocalISO(day.date),
          day.day.toString(),
          'Sin datos',
          '0',
          '0',
          '0%',
          'normal'
        ].join(','));
      } else {
        day.manning.forEach(manning => {
          rows.push([
            fechaLocalISO(day.date),
            day.day.toString(),
            manning.group,
            manning.required.toString(),
            manning.available.toString(),
            `${manning.percentage}%`,
            manning.status
          ].join(','));
        });
      }
    });

    const csvContent = rows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `calendario_manning_${calendarData.month + 1}_${calendarData.year}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /**
   * Calcula estadísticas del mes
   */
  static getMonthlyStats(calendarData: CalendarData) {
    const allManning = calendarData.days.flatMap(day => day.manning);
    
    if (allManning.length === 0) {
      return {
        averagePercentage: 0,
        totalRequired: 0,
        totalAvailable: 0,
        criticalDays: 0,
        warningDays: 0,
        normalDays: 0
      };
    }

    const totalRequired = allManning.reduce((sum, m) => sum + m.required, 0);
    const totalAvailable = allManning.reduce((sum, m) => sum + m.available, 0);
    const averagePercentage = Math.round((totalAvailable / totalRequired) * 100);

    const criticalDays = calendarData.days.filter(day => day.status === 'critical').length;
    const warningDays = calendarData.days.filter(day => day.status === 'warning').length;
    const normalDays = calendarData.days.filter(day => day.status === 'normal').length;

    return {
      averagePercentage,
      totalRequired,
      totalAvailable,
      criticalDays,
      warningDays,
      normalDays
    };
  }

  // ========================================
  // FUNCIONES PREPARADAS PARA API BACKEND
  // ========================================

  /**
   * Actualiza el manning requerido para un área específica
   * TODO: Conectar con API real cuando esté disponible
   */
  static async updateManningRequerido(
    areaId: string,
    manningRequerido: number,
    month: number,
    year: number
  ): Promise<boolean> {
    try {
      // TODO: Reemplazar con llamada real a API
      /*
      const response = await fetch('/api/manning/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken()}`
        },
        body: JSON.stringify({
          areaId,
          manningRequerido,
          month,
          year
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      return result.success;
      */
      
      // Simulación de éxito por ahora
      console.log('Manning actualizado:', { areaId, manningRequerido, month, year });
      return true;
    } catch (error) {
      console.error('Error updating manning requerido:', error);
      return false;
    }
  }

  /**
   * Obtiene la configuración de manning requerido desde la API
   * TODO: Conectar con API real cuando esté disponible
   */
  static async getManningConfig(
    areaId: string,
    month: number,
    year: number
  ): Promise<number> {
    try {
      console.log('Obteniendo configuración de manning para:', { areaId, month, year });
      // TODO: Reemplazar con llamada real a API
      /*
      const response = await fetch(`/api/manning/config?areaId=${areaId}&month=${month}&year=${year}`, {
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      return result.data.manningRequerido;
      */
      
      // Valor por defecto por ahora
      return 48;
    } catch (error) {
      console.error('Error fetching manning config:', error);
      return 48; // Valor por defecto
    }
  }

  /**
   * Obtiene datos reales del calendario desde la API
   * TODO: Conectar con API real cuando esté disponible
   */
  static async getCalendarDataFromAPI(
    _month: number,
    _year: number,
    selectedGroups: string[],
    _areaId: string
  ): Promise<CalendarData> {
  console.log('Obteniendo datos del calendario para:', { month: _month, year: _year, selectedGroups, areaId: _areaId });
    try {
      // TODO: Reemplazar con llamada real a API
      /*
      const response = await fetch('/api/calendar/data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken()}`
        },
        body: JSON.stringify({
          month,
          year,
          selectedGroups,
          areaId
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result.data;
      */

      // Por ahora usar datos mock
      return this.getCalendarData(_month, _year, selectedGroups);
    } catch (error) {
      console.error('Error fetching calendar data from API:', error);
      // Fallback a datos mock en caso de error
      return this.getCalendarData(_month, _year, selectedGroups);
    }
  }

  /**
   * Obtiene el calendario de turnos para un grupo específico
   */
  static async getCalendarByGroup(
    groupId: number,
    startDate: Date,
    endDate: Date
  ): Promise<GroupCalendarData> {
    try {
      const { httpClient } = await import("@/services/httpClient");
      // Establecer las fechas a las 00:00 hrs
      const startDateAt00 = new Date(startDate);
      startDateAt00.setHours(0, 0, 0, 0);
      
      const endDateAt00 = new Date(endDate);
      endDateAt00.setHours(0, 0, 0, 0);

      const response = await httpClient.post<ApiResponse<GroupCalendarData>>(
        `/api/calendario/por-grupo/${groupId}`,
        {
          inicio: `${fechaLocalISO(startDateAt00)}T00:00:00`,
          fin: `${fechaLocalISO(endDateAt00)}T00:00:00`
        }
      );

      if (!response.data) {
        throw new Error("Invalid response from server");
      }

      return response.data as unknown as GroupCalendarData;
    } catch (error) {
      console.error('Error fetching calendar by group:', error);
      throw error;
    }
  }

  /**
   * Obtiene el calendario de turnos para un usuario específico
   * Llama a: POST /api/calendario/usuario/{userId} con body { inicio, fin }
   */
  static async getCalendarByUsuario(
    userId: number,
    startDate: Date,
    endDate: Date
  ): Promise<CalendarEntry[]> {
    try {
      const { httpClient } = await import("@/services/httpClient");
      // Establecer las fechas a las 00:00 hrs
      const startDateAt00 = new Date(startDate);
      startDateAt00.setHours(0, 0, 0, 0);
      
      const endDateAt00 = new Date(endDate);
      endDateAt00.setHours(0, 0, 0, 0);

      const response = await httpClient.post<ApiResponse<CalendarEntry[]>>(
        `/api/calendario/usuario/${userId}`,
        {
          inicio: `${fechaLocalISO(startDateAt00)}T00:00:00`,
          fin: `${fechaLocalISO(endDateAt00)}T00:00:00`
        }
      );

      if (!response.data) {
        throw new Error("Invalid response from server");
      }

      // The backend may return an object with a `calendario` array inside
      const payload: any = response.data;
      if (Array.isArray(payload)) {
        return payload as CalendarEntry[];
      }

      if (payload && Array.isArray(payload.calendario)) {
        return payload.calendario as CalendarEntry[];
      }

      throw new Error('Unexpected calendar payload shape');
    } catch (error) {
      console.error('Error fetching calendar for usuario:', error);
      throw error;
    }
  }

    /**
   * Obtiene el schedule completo de un empleado
   * Retorna el formato compatible con EventType para CSV
   */
    static async getEmployeeSchedule(
        userId: number,
        startDate: Date,
        endDate: Date
    ): Promise<Array<{ day: Date; turno: string | null; eventType: string }>> {
        try {
            const calendarEntries = await this.getCalendarByUsuario(userId, startDate, endDate);

            return calendarEntries.map(entry => ({
                day: new Date(entry.fecha + 'T00:00:00'),
                turno: entry.turno,
                eventType: entry.tipo
            }));
        } catch (error) {
            console.error('Error getting employee schedule:', error);
            return [];
        }
    }

  /**
   * Calcula los porcentajes de ausencias para un grupo en un rango de fechas
   * Llama a: POST /api/ausencias/calcular
   */
  static async calcularAusencias(
    fechaInicio: string,
    fechaFin: string | undefined,
    grupoId: number
  ): Promise<CalcularAusenciasResponse> {
    try {
      const { httpClient } = await import("@/services/httpClient");
      
      const requestBody: CalcularAusenciasRequest = {
        fechaInicio,
        grupoId
      };

      // Solo agregar fechaFin si está definida
      if (fechaFin) {
        requestBody.fechaFin = fechaFin;
      }

      const response = await httpClient.post<ApiResponse<CalcularAusenciasResponse>>(
        '/api/ausencias/calcular',
        requestBody
      );


      if (!response.data) {
        throw new Error("Invalid response from server");
      }

      return response.data as unknown as CalcularAusenciasResponse;
    } catch (error) {
      console.error('Error calculating ausencias:', error);
      throw error;
    }
  }
}

// Interfaces for the new calendar API
export interface GroupCalendarData {
  grupoId: number;
  nombreGrupo: string;
  regla: string;
  fechaInicio: string;
  fechaFin: string;
  calendario: CalendarEntry[];

}

export interface CalendarEntry {
  fecha: string;
  turno: string;
  tipo: string;
  incidencia?: string;
  tipoIncidencia?: string;
}
