/**
 * useEmpleadosSimple Hook
 * Simple hook that relies on service-level caching
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { empleadosService } from '@/services/empleadosService';
import { globalEmpleadosCache } from '@/utils/globalEmpleadosCache';
import { debugEmpleados } from '@/utils/empleadosDebugger';
import { logger } from '@/utils/logger';
import type { 
  EmpleadosSindicalizadosRequest, 
  UsuarioInfoDto 
} from '@/interfaces/Api.interface';

interface UseEmpleadosSimpleState {
  empleados: UsuarioInfoDto[];
  loading: boolean;
  error: string | null;
  currentPage: number;
  pageSize: number;
  totalUsers: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  filteredByArea?: number;
  filteredByGrupo?: number;
  isFromCache?: boolean;
}

interface UseEmpleadosSimpleReturn extends UseEmpleadosSimpleState {
  fetchEmpleados: (request?: EmpleadosSindicalizadosRequest) => Promise<void>;
  fetchAllAreas: (areaIds: number[], request?: Omit<EmpleadosSindicalizadosRequest, 'AreaId'>) => Promise<void>;
  refetch: () => Promise<void>;
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
  setFilters: (areaId?: number, grupoId?: number) => void;
  resetFilters: () => void;
  invalidateCache: (areaId?: number) => void;
  clearAllCache: () => void;
}

export const useEmpleadosSimple = (
  initialRequest: EmpleadosSindicalizadosRequest = {}
): UseEmpleadosSimpleReturn => {
  
  const [state, setState] = useState<UseEmpleadosSimpleState>({
    empleados: [],
    loading: false,
    error: null,
    currentPage: initialRequest.Page || 1,
    pageSize: initialRequest.PageSize || 25,
    totalUsers: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPreviousPage: false,
    filteredByArea: initialRequest.AreaId,
    filteredByGrupo: initialRequest.GrupoId,
    isFromCache: false,
  });

  const currentRequestRef = useRef<EmpleadosSindicalizadosRequest>(initialRequest);
  const isInitializedRef = useRef(false);

  const fetchEmpleados = useCallback(async (request?: EmpleadosSindicalizadosRequest) => {
    const requestToUse = request || currentRequestRef.current;
    
    debugEmpleados.logNavigationEvent('useEmpleadosSimple', 'fetchEmpleados', requestToUse);
    
    // Check if we already have this data cached
    const cachedData = globalEmpleadosCache.get(requestToUse);
    if (cachedData) {
      debugEmpleados.logApiCall(requestToUse, true);
      setState(prev => ({
        ...prev,
        empleados: cachedData.usuarios,
        currentPage: cachedData.currentPage,
        pageSize: cachedData.pageSize,
        totalUsers: cachedData.totalUsers,
        totalPages: cachedData.totalPages,
        hasNextPage: cachedData.hasNextPage,
        hasPreviousPage: cachedData.hasPreviousPage,
        filteredByArea: cachedData.filteredByArea,
        filteredByGrupo: cachedData.filteredByGrupo,
        loading: false,
        error: null,
        isFromCache: true,
      }));
      
      if (request) {
        currentRequestRef.current = request;
      }
      return;
    }
    
    debugEmpleados.logApiCall(requestToUse, false);
    setState(prev => ({ ...prev, loading: true, error: null, isFromCache: false }));
    
    try {
      logger.debug('Fetching empleados (simple hook)', requestToUse);
      
      const response = await empleadosService.getEmpleadosSindicalizados(requestToUse);
      
      setState(prev => ({
        ...prev,
        empleados: response.usuarios,
        currentPage: response.currentPage,
        pageSize: response.pageSize,
        totalUsers: response.totalUsers,
        totalPages: response.totalPages,
        hasNextPage: response.hasNextPage,
        hasPreviousPage: response.hasPreviousPage,
        filteredByArea: response.filteredByArea,
        filteredByGrupo: response.filteredByGrupo,
        loading: false,
        error: null,
        isFromCache: false,
      }));

      if (request) {
        currentRequestRef.current = request;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error al cargar empleados sindicalizados';
      logger.error('Error in useEmpleadosSimple', error, 'HOOK');
      
      setState(prev => ({
        ...prev,
        loading: false,
        error: errorMessage,
        empleados: [],
        isFromCache: false,
      }));
    }
  }, []);

    const refetch = useCallback(async () => {
        setState(prev => ({ ...prev, loading: true, error: null }));
        try {
            // Limpiar caché y recargar datos frescos directamente
            globalEmpleadosCache.clear();
            await fetchEmpleados();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Error al recargar empleados';
            setState(prev => ({ ...prev, loading: false, error: errorMessage }));
        }
    }, [fetchEmpleados]);

  const setPage = useCallback((page: number) => {
    const newRequest = { ...currentRequestRef.current, Page: page };
    fetchEmpleados(newRequest);
  }, [fetchEmpleados]);

  const setPageSize = useCallback((pageSize: number) => {
    const newRequest = { ...currentRequestRef.current, PageSize: pageSize, Page: 1 };
    fetchEmpleados(newRequest);
  }, [fetchEmpleados]);

  const setFilters = useCallback((areaId?: number, grupoId?: number) => {
    const newRequest = { 
      ...currentRequestRef.current, 
      AreaId: areaId, 
      GrupoId: grupoId, 
      Page: 1 // Reset to first page when filters change
    };
    fetchEmpleados(newRequest);
  }, [fetchEmpleados]);

  // Special function to fetch data from multiple areas and combine them
  const fetchAllAreas = useCallback(async (areaIds: number[], request: Omit<EmpleadosSindicalizadosRequest, 'AreaId'> = {}) => {
    debugEmpleados.logNavigationEvent('useEmpleadosSimple', 'fetchAllAreas', { areaIds, request });
    
    // Create a composite cache key for all areas
    const compositeKey = { ...request, AreaId: undefined, _allAreas: areaIds.sort().join(',') };
    const cachedData = globalEmpleadosCache.get(compositeKey);
    
    if (cachedData) {
      debugEmpleados.logApiCall(compositeKey, true);
      setState(prev => ({
        ...prev,
        empleados: cachedData.usuarios,
        currentPage: cachedData.currentPage,
        pageSize: cachedData.pageSize,
        totalUsers: cachedData.totalUsers,
        totalPages: cachedData.totalPages,
        hasNextPage: cachedData.hasNextPage,
        hasPreviousPage: cachedData.hasPreviousPage,
        filteredByArea: cachedData.filteredByArea,
        filteredByGrupo: cachedData.filteredByGrupo,
        loading: false,
        error: null,
        isFromCache: true,
      }));
      return;
    }

    debugEmpleados.logApiCall(compositeKey, false);
    setState(prev => ({ ...prev, loading: true, error: null, isFromCache: false }));

    try {
      logger.debug('Fetching empleados from multiple areas (all pages per area)', { areaIds, request });

      // Helper to fetch all pages for one area
      const fetchAllForArea = async (areaId: number) => {
        const pageSizePerArea = 500; // reasonable batch size
        let page = 1;
        let accumulated: UsuarioInfoDto[] = [] as any;
        let hasNext = true;
        let safetyCounter = 0;

        while (hasNext && safetyCounter < 200) { // safety to avoid infinite loop
          const resp = await empleadosService.getEmpleadosSindicalizados({
            ...request,
            AreaId: areaId,
            Page: page,
            PageSize: pageSizePerArea,
          });
          accumulated = accumulated.concat(resp.usuarios);
          hasNext = resp.hasNextPage;
          page += 1;
          safetyCounter += 1;
        }
        return accumulated;
      };

      // Fetch areas with modest concurrency (chunk size 3)
      const chunkSize = 3;
      let allEmployees: UsuarioInfoDto[] = [] as any;
      for (let i = 0; i < areaIds.length; i += chunkSize) {
        const chunk = areaIds.slice(i, i + chunkSize);
        const chunkResults = await Promise.all(chunk.map(id => fetchAllForArea(id)));
        allEmployees = allEmployees.concat(...chunkResults);
      }

      // IMPORTANT: Use actual combined count to keep pagination consistent
      const totalUsers = allEmployees.length;
      
      // Apply pagination to the combined results
      const pageSize = request.PageSize || 25;
      const currentPage = request.Page || 1;
      const startIndex = (currentPage - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      const paginatedEmployees = allEmployees.slice(startIndex, endIndex);
      const totalPages = Math.ceil(totalUsers / pageSize);

      const combinedResponse = {
        usuarios: paginatedEmployees,
        currentPage,
        pageSize,
        totalUsers,
        totalPages,
        hasNextPage: currentPage < totalPages,
        hasPreviousPage: currentPage > 1,
        filteredByArea: undefined, // Not filtered by specific area
        filteredByGrupo: request.GrupoId,
      };

  // Cache the combined result
  globalEmpleadosCache.set(compositeKey as any, combinedResponse as any);

      setState(prev => ({
        ...prev,
        empleados: combinedResponse.usuarios,
        currentPage: combinedResponse.currentPage,
        pageSize: combinedResponse.pageSize,
        totalUsers: combinedResponse.totalUsers,
        totalPages: combinedResponse.totalPages,
        hasNextPage: combinedResponse.hasNextPage,
        hasPreviousPage: combinedResponse.hasPreviousPage,
        filteredByArea: combinedResponse.filteredByArea,
        filteredByGrupo: combinedResponse.filteredByGrupo,
        loading: false,
        error: null,
        isFromCache: false,
      }));

  currentRequestRef.current = { ...request, AreaId: undefined };
    } catch (error) {
      logger.error('Error fetching empleados from multiple areas:', error);
      setState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Error al cargar empleados de múltiples áreas',
      }));
    }
  }, []);

  const resetFilters = useCallback(() => {
    const newRequest = { 
      Page: 1,
      PageSize: currentRequestRef.current.PageSize || 25
    };
    fetchEmpleados(newRequest);
  }, [fetchEmpleados]);

  const invalidateCache = useCallback((areaId?: number) => {
    globalEmpleadosCache.invalidateByArea(areaId);
    logger.debug('Cache invalidated from simple hook', { areaId });
  }, []);

  const clearAllCache = useCallback(() => {
    globalEmpleadosCache.clear();
    logger.debug('All cache cleared from simple hook');
  }, []);

  // Initialize only once and check cache first
  useEffect(() => {
    debugEmpleados.logComponentMount('useEmpleadosSimple', initialRequest);
    
    if (!isInitializedRef.current) {
      isInitializedRef.current = true;
      
      // Always try to get cached data first
      const cachedData = globalEmpleadosCache.get(initialRequest);
      if (cachedData) {
        debugEmpleados.logApiCall(initialRequest, true);
        setState(prev => ({
          ...prev,
          empleados: cachedData.usuarios,
          currentPage: cachedData.currentPage,
          pageSize: cachedData.pageSize,
          totalUsers: cachedData.totalUsers,
          totalPages: cachedData.totalPages,
          hasNextPage: cachedData.hasNextPage,
          hasPreviousPage: cachedData.hasPreviousPage,
          filteredByArea: cachedData.filteredByArea,
          filteredByGrupo: cachedData.filteredByGrupo,
          loading: false,
          error: null,
          isFromCache: true,
        }));
        currentRequestRef.current = initialRequest;
      } else {
        // Only fetch if no cached data
        debugEmpleados.logApiCall(initialRequest, false);
        logger.debug('No cached data, fetching fresh (simple hook)', initialRequest);
        fetchEmpleados(initialRequest);
      }
    }
    
    // Cleanup function
    return () => {
      debugEmpleados.logComponentUnmount('useEmpleadosSimple');
    };
  }, []); // Empty deps - truly only once

  return {
    ...state,
    fetchEmpleados,
    fetchAllAreas,
    refetch,
    setPage,
    setPageSize,
    setFilters,
    resetFilters,
    invalidateCache,
    clearAllCache,
  };
};
