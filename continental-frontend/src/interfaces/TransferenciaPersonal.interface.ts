// Re-export para uso interno del componente TransferenciaPersonal

export type { ApiResponse } from './Api.interface';
export type { HistorialTransferenciaDto } from '@/services/groupService';

export interface GrupoDetail {
    grupoId: number;
    rol: string;
    areaId: number;
    areaUnidadOrganizativaSap: string;
    areaNombre: string;
    identificadorSAP: string;
    personasPorTurno: number;
    duracionDeturno: number;
    liderId: number | null;
    liderSuplenteId: number | null;
}

export interface UsuarioInfoDto {
    id: number;
    fullName: string;
    username: string;
    nomina: string;
    maquina?: string;
    area: {
        areaId: number;
        nombreGeneral: string;
        unidadOrganizativaSap: string;
    };
    grupo: {
        grupoId: number;
        rol: string;
        identificadorSAP: string;
        personasPorTurno: number;
        duracionDeturno: number;
    };
}
