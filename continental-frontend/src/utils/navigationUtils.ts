import React from "react";
import { Calendar, Factory, File, FileChartColumn, Users, User2 } from "lucide-react";
import { UserRole } from "@/interfaces/User.interface";

export interface NavItem {
    to: string;
    label: string;
    icon: React.ReactElement;
}

// Función utilitaria para obtener el rol principal del usuario
export const getUserRole = (user: any): string | null => {
    // Si el usuario tiene la propiedad 'role' (formato anterior)
    if (user?.role) {
        return user.role;
    }
    
    // Si el usuario tiene 'roles' array (formato nuevo)
    if (user?.roles && Array.isArray(user.roles) && user.roles.length > 0) {
        // Retorna el primer rol o busca por prioridad
        const roleNames = user.roles.map((r: any) => r.name || r);
        
        // Orden de prioridad de roles
        const priorityOrder = [
            UserRole.SUPER_ADMIN,
            UserRole.ADMIN,
            UserRole.GERENTE_BT,
            UserRole.RH,
            UserRole.AREA_ADMIN,
            UserRole.LEADER,
            UserRole.INDUSTRIAL,
            UserRole.UNION_REPRESENTATIVE,
            UserRole.UNIONIZED
        ];
        
        for (const priority of priorityOrder) {
            if (roleNames.includes(priority)) {
                return priority;
            }
        }
        
        return roleNames[0];
    }
    
    return null;
};

// Función para formatear el rol de manera legible
export const formatRole = (user: any): string => {
    if (!user) return 'Usuario';
    
    const role = getUserRole(user);
    
    const roleMap: Record<string, string> = {
        'admin': 'Administrador',
        'super_admin': 'Super Administrador',
        'area_admin': 'Administrador de Área',
        'group_leader': 'Líder de Grupo',
        'industrial': 'Industrial',
        'comite_sindical': 'Representante Sindical',
        'sindicalizado': 'Sindicalizado'
    };
    
    return roleMap[role || ''] || role || 'Usuario';
};

export const getNavigationItems = (userRole: string): NavItem[] => {
    switch (userRole) {
        case UserRole.SUPER_ADMIN:
        case UserRole.ADMIN:
            return [
                { to: "/admin/areas", label: "Areas", icon: React.createElement(Factory) },
                { to: "/admin/vacaciones", label: "Vacaciones", icon: React.createElement(Calendar) },
                { to: "/admin/plantilla", label: "Plantilla", icon: React.createElement(Users) },
                { to: "/admin/reportes", label: "Reportes", icon: React.createElement(FileChartColumn) },
                { to: "/admin/usuarios", label: "Usuarios", icon: React.createElement(User2) },
            ];
        
        case UserRole.AREA_ADMIN:
        case UserRole.LEADER:
        case UserRole.INDUSTRIAL:
        case UserRole.GERENTE_BT:
        case UserRole.RH:
            return [
                { to: "/area/calendario", label: "Calendario", icon: React.createElement(Calendar) },
                { to: "/area/solicitudes", label: "Solicitudes", icon: React.createElement(File) },
                { to: "/area/plantilla", label: "Plantilla", icon: React.createElement(Users) },
                { to: "/area/reportes", label: "Reportes", icon: React.createElement(FileChartColumn) },
            ];
        
        case UserRole.UNION_REPRESENTATIVE:
        case UserRole.UNIONIZED:
            return [
                { to: "/empleados/", label: "Inicio", icon: React.createElement(Calendar) },
                { to: "/empleados/mis-vacaciones", label: "Mis Vacaciones", icon: React.createElement(File) },
                { to: "/empleados/mis-solicitudes", label: "Mis Solicitudes", icon: React.createElement(Users) },
            ];
        
        default:
            return [];
    }
};

export const getBasePath = (userRole: string): string => {
    switch (userRole) {
        case UserRole.SUPER_ADMIN:
        case UserRole.ADMIN:
            return "/admin";
        
        case UserRole.AREA_ADMIN:
        case UserRole.LEADER:
        case UserRole.INDUSTRIAL:
        case UserRole.GERENTE_BT:
        case UserRole.RH:
            return "/area";
        
        case UserRole.UNION_REPRESENTATIVE:
        case UserRole.UNIONIZED:
            return "/empleados";
        
        default:
            return "/";
    }
};
