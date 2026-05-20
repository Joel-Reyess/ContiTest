import { httpClient } from '@/services/httpClient';
import type { ApiResponse } from '@/interfaces/Api.interface';
import type { Area, Grupo, AreaUpdateRequest, AreaUpdateResponse, AssignBossRequest, AssignBossResponse, AreaByIngenieroResponse, AreaByLiderResponse } from '@/interfaces/Areas.interface';
import { logger } from '@/utils/logger';

export const areasService = {
  /**
   * Obtiene todas las áreas disponibles
   * @returns Promise<Area[]> Lista de áreas
   */
  async getAreas(): Promise<Area[]> {
    try {
      const response = await httpClient.get<ApiResponse<Area[]>>('/api/Area');
      console.log({response})
      // Extract data from API response
      const areasData = response.data || response;
      if (!areasData) {
        throw new Error('Invalid response from server');
      }
      
      return areasData as unknown as Area[];
      // //TODO: cuando se tenga el estandarizado de response
      // if (response.success && Array.isArray(areasData)) {
      //   return areasData;
      // }
      
      throw new Error(response.message || 'Error al obtener las áreas');
    } catch (error) {
      console.error('Error in areasService.getAreas:', error);
      throw error;
    }
  },

  /**
   * Obtiene un área específica por ID
   * @param areaId ID del área
   * @returns Promise<Area> Área encontrada
   */
  async getAreaById(areaId: number): Promise<Area> {
    try {
      const response = await httpClient.get<ApiResponse<Area>>(`/api/Area/${areaId}`);
      if (!response.success) {
        throw new Error(response.message || 'Error al obtener el área');
      }      
      // Extract data from API response
      const areaData : Area = response?.data as unknown as Area;
      if (!areaData) {
        throw new Error('Invalid response from server');
      } 

      let grupos: Grupo[] = areaData.grupos || [];
      if (!areaData.grupos || areaData.grupos.length === 0) {
        grupos = await this.getGroupsByAreaId(areaId);
      }
      
      
      return {...areaData, grupos} as unknown as Area;
      // //TODO: cuando se tenga el estandarizado de response
      // if (response.success && areaData) {
      //   return areaData as unknown as Area;
      // }
      
      throw new Error(response.message || 'Error al obtener el área');
    } catch (error) {
      console.error('Error in areasService.getAreaById:', error);
      throw error;
    }
  },

  async getGroupsByAreaId(areaId: number): Promise<Grupo[]> {
    try {
      const response = await httpClient.get<ApiResponse<Grupo[]>>(`/api/Grupo/Area/${areaId}`);
      
      if (!response.success) {
        return [];
      } 
      // Extract data from API response
      const gruposData = response.data;
      if (!gruposData) {
        return [];
      } 

      return gruposData as unknown as Grupo[];
    } catch (error) {
      console.error('Error in areasService.getGroupsByAreaId:', error);
      throw error;
    }
  },
  async getGroups(): Promise<Grupo[]> {
    try {
      const response = await httpClient.get<ApiResponse<Grupo[]>>(`/api/Grupo`);
      
      if (!response.success) {
        return [];
      } 
      // Extract data from API response
      const gruposData = response.data;
      if (!gruposData) {
        return [];
      } 

      return gruposData as unknown as Grupo[];
    } catch (error) {
      console.error('Error in areasService.getGroups:', error);
      throw error;
    }
  },



  /**
   * Actualiza un área específica
   * @param areaId ID del área a actualizar
   * @param updateData Datos a actualizar
   * @returns Promise<AreaUpdateResponse> Área actualizada
   */
  async updateArea(areaId: number, updateData: AreaUpdateRequest): Promise<AreaUpdateResponse> {
    try {
      logger.apiRequest('PUT', `/api/Area/${areaId}`, updateData);

      const response: ApiResponse<AreaUpdateResponse> = await httpClient.put<AreaUpdateResponse>(
        `/api/Area/${areaId}`,
        updateData
      );

      if (!response.success || !response.data) {
        throw new Error(response.errorMsg || 'Error al actualizar el área');
      }

      logger.apiResponse('PUT', `/api/Area/${areaId}`, 200, response.data);
      return response.data;
    } catch (error) {
      logger.error('Error updating area', error, 'AREAS_SERVICE');
      throw error;
    }
  },

  /**
   * Actualiza únicamente el manning base de un área. Disponible para
   * Ingenieros Industriales y SuperUsuario (PATCH /api/Area/{id}/manning).
   */
  async updateAreaManning(areaId: number, manning: number): Promise<AreaUpdateResponse> {
    try {
      logger.apiRequest('PATCH', `/api/Area/${areaId}/manning`, { Manning: manning });

      const response: ApiResponse<AreaUpdateResponse> = await httpClient.patch<AreaUpdateResponse>(
        `/api/Area/${areaId}/manning`,
        { Manning: manning }
      );

      if (!response.success || !response.data) {
        throw new Error(response.errorMsg || 'Error al actualizar el manning del área');
      }

      logger.apiResponse('PATCH', `/api/Area/${areaId}/manning`, 200, response.data);
      return response.data;
    } catch (error) {
      logger.error('Error updating area manning', error, 'AREAS_SERVICE');
      throw error;
    }
  },

  /**
   * Asigna un jefe a un área específica
   * @param areaId ID del área
   * @param jefeId ID del jefe a asignar
   * @returns Promise<AssignBossResponse> Área con jefe asignado
   */
  async assignBoss(areaId: number, jefeId: number): Promise<AssignBossResponse> {
    try {
      const requestData: AssignBossRequest = { JefeId: jefeId };
      logger.apiRequest('PATCH', `/api/Area/${areaId}/asignar-jefes`, requestData);

      const response: ApiResponse<AssignBossResponse> = await httpClient.patch<AssignBossResponse>(
        `/api/Area/${areaId}/asignar-jefes`,
        requestData
      );

      if (!response.success || !response.data) {
        throw new Error(response.errorMsg || 'Error al asignar jefe al área');
      }

      logger.apiResponse('PUT', `/api/Area/${areaId}/asignar-jefes`, 200, response.data);
      return response.data;
    } catch (error) {
      logger.error('Error assigning boss to area', error, 'AREAS_SERVICE');
      throw error;
    }
  },

  /**
   * Obtiene áreas asignadas a un ingeniero industrial específico
   * @param userId ID del usuario ingeniero
   * @returns Promise<AreaByIngenieroResponse> Áreas del ingeniero
   */
  async getAreasByIngeniero(userId: number): Promise<AreaByIngenieroResponse> {
    try {
      logger.apiRequest('GET', `/api/Area/by-ingeniero/${userId}`, null);

      const response = await httpClient.get<AreaByIngenieroResponse>(`/api/Area/by-ingeniero/${userId}`) as unknown as AreaByIngenieroResponse;

      logger.apiResponse('GET', `/api/Area/by-ingeniero/${userId}`, 200, response);
      return response;
    } catch (error) {
      logger.error('Error getting areas by ingeniero', error, 'AREAS_SERVICE');
      throw error;
    }
  },

  /**
   * Obtiene áreas asignadas a un líder de grupo específico
   * @param userId ID del usuario líder
   * @returns Promise<AreaByLiderResponse> Áreas del líder
   */
  async getAreasByLider(userId: number): Promise<AreaByLiderResponse> {
    try {
      logger.apiRequest('GET', `/api/Area/by-lider/${userId}`, null);

      const response = await httpClient.get<AreaByLiderResponse>(`/api/Area/by-lider/${userId}`) as unknown as AreaByLiderResponse;

      logger.apiResponse('GET', `/api/Area/by-lider/${userId}`, 200, response);
      return response;
    } catch (error) {
      logger.error('Error getting areas by lider', error, 'AREAS_SERVICE');
      throw error;
    }
  }
};
