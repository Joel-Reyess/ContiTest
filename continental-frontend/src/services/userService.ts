import { httpClient } from "@/services/httpClient";
import type { ApiResponse, RegisterRequest } from "@/interfaces/Api.interface";
import type { User, UsersListResponse, UserUpdate } from "@/interfaces/User.interface";

export const userService = {
  async getUserList(page: number = 1, pageSize: number = 10): Promise<UsersListResponse> {
    try {
      const response = await httpClient.get<ApiResponse<UsersListResponse>>(
        `/api/User/list?page=${page}&pageSize=${pageSize}`
      );

      if (!response.data) {
        throw new Error("Invalid response from server");
      }

      return response.data as unknown as UsersListResponse;
    } catch (error) {
      console.error("Error in userService.getUserList:", error);
      throw error;
    }
  },

  async getUsers(): Promise<User[]> {
    try {
      const response = await httpClient.get<ApiResponse<User[]>>("/api/User");

      // Extract data from API response
      const usersData = response.data || response;
      if (!usersData) {
        throw new Error("Invalid response from server");
      }

      return usersData as unknown as User[];
    } catch (error) {
      console.error("Error in userService.getUsers:", error);
      throw error;
    }
  },

  async getUserById(userId: number): Promise<User> {
    try {
      const response = await httpClient.get<ApiResponse<User>>(
        `/api/User/detail/${userId}`
      );

      // Extract data from API response
      const userData = response.data || response;
      if (!userData) {
        throw new Error("Invalid response from server");
      }

      return userData as unknown as User;
    } catch (error) {
      console.error("Error in userService.getUserById:", error);
      throw error;
    }
  },

  async createUser(user: RegisterRequest): Promise<User> {
    try {
      const response = await httpClient.post<ApiResponse<User>>(
        "/Auth/register",
        user
      );

      // Extract data from API response
      const userData = response.data || response;
      if (!userData) {
        throw new Error("Invalid response from server");
      }

      return userData as unknown as User;
    } catch (error) {
      console.error("Error in userService.createUser:", error);
      throw error;
    }
  },

  async getUsersByAreaId(areaId: number): Promise<User[]> {
    try {
      const response = await httpClient.get<ApiResponse<User[]>>(
        `/api/User/usuarios-por-area/${areaId}`
      );

      // Extract data from API response
      const usersData = response.data || response;
      if (!usersData) {
        throw new Error("Invalid response from server");
      }

      return usersData as unknown as User[];
    } catch (error) {
      console.error("Error in userService.getUsersByAreaId:", error);
      throw error;
    }
  },

  async getUsersByGroupId(groupId: number): Promise<User[]> {
    try {
      const response = await httpClient.get<ApiResponse<User[]>>(
        `/api/User/usuarios-por-grupo/${groupId}`
      );

      // Extract data from API response
      const usersData = response.data || response;
      if (!usersData) {
        throw new Error("Invalid response from server");
      }

      return usersData as unknown as User[];
    } catch (error) {
      console.error("Error in userService.getUsersByGroupId:", error);
      throw error;
    }
  },

  async updateUser(userId: number, userData: Partial<UserUpdate>): Promise<User> {
    try {
      const response = await httpClient.patch<ApiResponse<User>>(
        `/api/User/update/${userId}`,
        userData
      );

      // Extract data from API response
      const updatedUserData = response.data || response;
      if (!updatedUserData) {
        throw new Error("Invalid response from server");
      }

      return updatedUserData as unknown as User;
    } catch (error) {
      console.error("Error in userService.updateUser:", error);
      throw error;
    }
  },
  async getUsersByRole(role: string): Promise<User[]> {
    try {
      const response = await httpClient.post<ApiResponse<User[]>>(
        `/api/User/usuarios-por-rol`,
        {RolString: role}
      );

      // Extract data from API response
      const usersData = response.data || response;
      if (!usersData) {
        throw new Error("Invalid response from server");
      }

      return usersData as unknown as User[];
    } catch (error) {
      console.error("Error in userService.updateUser:", error);
      throw error;
    }
  },

  async getIngenierosByAreaId(areaId: number): Promise<User[]> {
    try {
      console.log(`=== API CALL: Getting ingenieros for area ${areaId} ===`);
      const response = await httpClient.get<ApiResponse<User[]>>(
        `/api/Area/${areaId}/ingenieros`
      );

      // Extract data from API response
      const usersData = response.data || response;
      if (!usersData) {
        throw new Error("Invalid response from server");
      }

      console.log(`API Response for area ${areaId}:`, usersData);
      console.log(`Found ${Array.isArray(usersData) ? usersData.length : 0} assigned ingenieros`);
      
      const result = usersData as unknown as User[];
      console.log('Processed ingenieros:', result.map(u => ({ id: u.id, name: u.fullName })));
      
      return result;
    } catch (error) {
      console.error("Error in userService.getIngenierosByAreaId:", error);
      throw error;
    }
  },

  async assignIngenieroToArea(areaId: number, ingenieroId: number): Promise<void> {
    try {
      await httpClient.post<ApiResponse<void>>(
        `/api/Area/${areaId}/assign-ingeniero`,
        {
          AreaId: areaId,
          IngenieroId: ingenieroId
        }
      );
    } catch (error) {
      console.error("Error in userService.assignIngenieroToArea:", error);
      throw error;
    }
  },

  async unassignIngenieroFromArea(areaId: number, ingenieroId: number): Promise<void> {
    try {
      await httpClient.post<ApiResponse<void>>(
        `/api/Area/${areaId}/unassign-ingeniero/${ingenieroId}`,
      );
    } catch (error) {
      console.error("Error in userService.unassignIngenieroFromArea:", error);
      throw error;
    }
  },
   async getUsersByGroup(groupId: number): Promise<User[]> {
  const response = await httpClient.get(`/api/User/grupo/${groupId}`);
  return response.data as User[];
},

    async requestSuplente(payload: {
        Rol: string;
        GrupoId?: number;
        AreaId?: number;
        SuplenteId?: number | null;
        FechaInicio: string;
        FechaFin: string;
        Comentarios?: string;
    }): Promise<{ success: boolean }>{
    try {
      const response = await httpClient.post<ApiResponse<{ success: boolean }>>(
        "/api/user/suplente",
        payload
      );
      

        if (response?.data?.success === false) {
            console.error("Error en solicitud de suplente:", response.data);
            throw new Error(response.data?.message || "Error en solicitud de suplente");
        }

      return { success: true };
    } catch (error) {
      console.error("Error in userService.requestSuplente:", error);
      throw error;
    }
  },

  async updateMaquina(userId: number, maquina: string): Promise<User> {
    try {
      const response = await httpClient.patch<ApiResponse<User>>(
        `/api/user/update-maquina/${userId}`,
        { maquina }
      );

      // Extract data from API response
      const userData = response.data || response;
      if (!userData) {
        throw new Error("Invalid response from server");
      }

      return userData as unknown as User;
    } catch (error) {
      console.error("Error in userService.updateMaquina:", error);
      throw error;
    }
  },

  // Reingresos: el superusuario captura la fecha de ingreso original para que
  // antigüedad, días programables y constancia se calculen con ella.
  async updateFechaIngreso(userId: number, fechaIngreso: string): Promise<{ id: number; fechaIngreso: string }> {
    const response = await httpClient.patch<ApiResponse<{ id: number; fechaIngreso: string }>>(
      `/api/user/update-fecha-ingreso/${userId}`,
      { fechaIngreso }
    );
    const data = response.data || response;
    if (!data) {
      throw new Error("Invalid response from server");
    }
    return data as unknown as { id: number; fechaIngreso: string };
  },

    async deleteUser(userId: number, adminPassword: string): Promise<void> {
        await httpClient.post(`/api/User/delete/${userId}`, { adminPassword });
    },

};
