import { useState, useEffect, useCallback } from 'react';
import { vacationConfigService } from '../services/vacationConfigService';
import { ApiPeriodMapping, type Period, type ApiPeriod } from '../interfaces/Calendar.interface';
import type { VacationConfig } from '../interfaces/Api.interface';

interface UseVacationConfigState {
  config: VacationConfig | null;
  currentPeriod: Period;
  /**
   * Los dos periodos NO son excluyentes y tratarlos como si lo fueran es lo que
   * dejó al delegado sin las solicitudes del año en curso en cuanto se abrió la
   * programación anual del siguiente. Mientras se prepara 2027, la
   * reprogramación de 2026 sigue viva: los permisos, incapacidades y permutas
   * del año que se está trabajando no se detienen.
   *
   * Es la misma regla que ya aplica el backend en /estado-periodo
   * (PermiteProgramacionAnual / PermiteReprogramacion); aquí se replica para no
   * meter una llamada extra en cada pantalla.
   */
  permiteAnual: boolean;
  permiteReprogramacion: boolean;
  loading: boolean;
  error: string | null;
}

interface UseVacationConfigReturn extends UseVacationConfigState {
  fetchConfig: () => Promise<void>;
  refetch: () => Promise<void>;
}

/**
 * Hook para manejar la configuración de vacaciones y el período actual
 * Obtiene la configuración desde la API y mapea el período actual
 */
export const useVacationConfig = (): UseVacationConfigReturn => {
  const [state, setState] = useState<UseVacationConfigState>({
    config: null,
    currentPeriod: 'annual', // Default fallback
    permiteAnual: true,
    permiteReprogramacion: false,
    loading: false,
    error: null,
  });

  const fetchConfig = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const config = await vacationConfigService.getVacationConfig();
      
      // Mapear el período de la API al período local
      const apiPeriod = config.periodoActual as ApiPeriod;
      const mappedPeriod = ApiPeriodMapping[apiPeriod] || 'annual';

      const cerrado = mappedPeriod === 'closed';
      // Hay captura anual si el periodo lo dice o si hay un año en preparación.
      const permiteAnual =
        !cerrado && (mappedPeriod === 'annual' || config.anioProgramacionAnual != null);
      // La reprogramación del año vigente sólo la apaga "Cerrado".
      const permiteReprogramacion = !cerrado;

      setState(prev => ({
        ...prev,
        config,
        currentPeriod: mappedPeriod,
        permiteAnual,
        permiteReprogramacion,
        loading: false,
        error: null,
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Error al obtener la configuración de vacaciones',
      }));
    }
  }, []);

  const refetch = useCallback(() => {
    return fetchConfig();
  }, [fetchConfig]);

  // Cargar configuración al montar el componente
  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  return {
    ...state,
    fetchConfig,
    refetch,
  };
};
