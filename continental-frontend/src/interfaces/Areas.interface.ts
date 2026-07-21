export interface AreaJefeBasic {
    id: number;
    fullName: string;
    username: string;
  }

export interface Area {
    areaId: number;
    unidadOrganizativaSap: string;
    nombreGeneral: string;
    grupos?: Grupo[];
    manning?: number;
    jefeId: number;
    jefe: BossUser;
    jefeSuplenteId: number | null;
    jefeSuplente: BossUser | null;
    /** Multi-jefes: lista completa de jefes de área (incluye JefeId y JefeSuplenteId). */
    jefes?: AreaJefeBasic[];
    /** Multi-Gerentes BT asignados al área (visibilidad restringida a estas áreas). */
    gerentes?: AreaJefeBasic[];
    /** Multi-RH asignados al área (visibilidad restringida a estas áreas). */
    rh?: AreaJefeBasic[];
  }

  // Payload para asignar Gerentes/RH a un área. Cada lista es la fuente
  // de verdad completa para su rol. Null = no tocar ese rol.
  export interface AssignGerenteRHRequest {
    GerenteIds?: number[] | null;
    RHIds?: number[] | null;
  }
  
  export interface Grupo {
    grupoId: number;
    areaId: number;
    rol: string;
    area?: Area;
    areaNombre?: string;
    areaUnidadOrganizativaSap?: string;
    personasPorTurno: number;
    duracionDeturno: number;
    identificadorSAP?: string;
    liderId?: number;
    liderSuplenteId?: number | null;
    nombreGeneral?: string;
    unidadOrganizativaSap?: string;
  }
  
  export interface GrupoDetail {
    grupoId: number;
    rol: string;
    areaId: number;
    unidadOrganizativaSap: string;
    nombreGeneral: string;
  }

  // Interfaces for area update
  export interface AreaUpdateRequest {
    UnidadOrganizativaSap: string;
    NombreGeneral: string;
    Manning?: number;
  }

  export interface AreaUpdateResponse {
    areaId: number;
    unidadOrganizativaSap: string;
    nombreGeneral: string;
  }

  // Interfaces for assign boss (multi-jefes: la lista JefeIds reemplaza a
  // AreaJefes por completo; JefeId/JefeSuplenteId se sincronizan del primero/segundo).
  export interface AssignBossRequest {
    JefeId?: number | null;
    JefeSuplenteId?: number | null;
    JefeIds?: number[];
  }

  export interface BossUser {
    id: number;
    fullName: string;
    username: string;
    passwordHash: string;
    passwordSalt: string;
    roles: Array<{
      id: number;
      name: string;
      description: string;
      abreviation: string;
    }>;
    status: number;
    createdAt: string;
    createdBy: number;
    updatedAt: string | null;
    updatedBy: number | null;
    areaId: number;
    grupoId: number;
    nomina: string | null;
    maquina: string | null;
    fechaIngreso: string | null;
    centroCoste: string | null;
    posicion: string | null;
  }

  export interface AssignBossResponse {
    areaId: number;
    unidadOrganizativaSap: string;
    nombreGeneral: string;
    jefeId: number;
    jefe: BossUser;
    jefeSuplenteId: number | null;
    jefeSuplente: BossUser | null;
    grupos: any[];
  }

  // Interfaces for role-based area access
  export interface AreaByIngenieroItem {
    id: number;
    areaId: number;
    areaNombre: string;
    ingenieroId: number;
    fullName: string;
    username: string;
    fechaAsignacion: string;
    fechaDesasignacion: string | null;
    activo: boolean;
    suplenteId?: number | null;
    suplenteFullName?: string | null;
    suplenteUsername?: string | null;
  }

  export interface AreaByLiderItem {
    areaId: number;
    nombreGeneral: string;
    unidadOrganizativaSap: string;
    manning: number;
    grupos: GrupoLider[];
  }

  export interface GrupoLider {
    grupoId: number;
    rol: string;
    identificadorSAP: string;
    personasPorTurno: number;
    duracionDeturno: number;
    liderId: number;
  }

  export interface AreaByIngenieroResponse {
    success: boolean;
    data: AreaByIngenieroItem[];
    errorMsg: string | null;
  }

  export interface AreaByLiderResponse {
    success: boolean;
    data: AreaByLiderItem[];
    errorMsg: string | null;
  }
