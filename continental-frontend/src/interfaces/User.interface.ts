export enum UserStatus {
    Activo = 1,
    Desactivado = 0,
    Suspendido = 2
}

export interface Rol {
    id: number;
    name: string;
    abreviation: string;
}

export interface UserArea {
    areaId: number;
    nombreGeneral: string;
}

export interface UserGrupo {
    grupoId: number;
    rol: string;
}
export interface UserAreaWithGroups extends UserArea {
    grupos?: UserGrupo[];
}

export const UserRole = {
    SUPER_ADMIN: 'SuperUsuario',
    ADMIN: 'Administrador',
    AREA_ADMIN: 'Jefe De Area',
    LEADER: 'Lider De Grupo',
    INDUSTRIAL: 'Ingeniero Industrial',
    UNION_REPRESENTATIVE: 'Delegado Sindical',
    UNIONIZED: 'Empleado Sindicalizado',
    GERENTE_BT: 'Gerente BT',
    RH: 'RH'
} as const;

export type UserRole = typeof UserRole[keyof typeof UserRole];

export interface User {
    id: number;
    username: string;
    nomina?: string;
    fullName: string;
    status: UserStatus;
    area: UserArea | null;
    areaId?: number | null;
    grupo: UserGrupo | null;
    areas?: UserAreaWithGroups[];
    roles: Rol[] | string[];
    rols?: Rol[] | string[];
    createdAt: string;
    updatedAt: string | null;
    fechaIngreso: string;
    token?: string;
    maquina?: string;
    isUnionCommittee?: boolean;
    suplenciaActiva?: SuplenciaActiva;
}

export interface SuplenciaActiva {
    usuarioTitular: string;
    rolSuplente: string;
    areaId?: number;
    grupoId?: number;
    fechaInicio: string;
    fechaFin: string;
}

export interface UserUpdate {
    id: number;
    username: string;
    fullName: string;
    status: UserStatus;
    area: number | null;
    grupo: number | null;
    roles: number[];
    rols?: string[];
    areaId?: number | null;
}

export interface UsersListResponse {
    users: User[];
    currentPage: number;
    pageSize: number;
    totalUsers: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
}
