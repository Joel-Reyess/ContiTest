/**
 * =============================================================================
 * AREA DASHBOARD
 * =============================================================================
 * 
 * @description
 * Dashboard principal para jefes de área que proporciona navegación y gestión
 * de calendario, solicitudes, plantilla y reportes. Incluye routing y layout
 * principal para todas las funcionalidades del área.
 * 
 * @inputs (Datos de endpoints)
 * - currentPeriod: Period - Período actual de gestión de vacaciones
 * - location: Location - Ubicación actual de la ruta para navegación activa
 * 
 * @used_in (Componentes padre)
 * - src/App.tsx (como ruta protegida para área)
 * 
 * @user_roles (Usuarios que acceden)
 * - Jefe de Área
 * 
 * @dependencies
 * - React: Framework base y hooks (useState, JSX)
 * - react-router-dom: Navegación y routing (Routes, Route, Link, useLocation)
 * - lucide-react: Iconos de navegación (Calendar, File, FileChartColumn, Users)
 * - ./CalendarComponent: Componente de calendario del área
 * - ./SolicitudesComponent: Gestión de solicitudes
 * - ./Plantilla: Gestión de plantilla de empleados
 * - ./Reportes: Generación de reportes
 * 
 * @author Vulcanics Dev Team
 * @created 2024
 * @last_modified 2025-08-20
 * =============================================================================
 */

import { useState, type JSX } from "react";
import { Routes, Route, Link, useLocation, Navigate } from "react-router-dom";
import { Navbar } from "../Navbar/Navbar";
import { Calendar, File, FileChartColumn, Users, CalendarClock, ArrowLeftRight, BarChart3 } from "lucide-react";
import CalendarComponent from "./CalendarComponent";
import SolicitudesComponent from "./SolicitudesComponent";
import SolicitudDetallePage from "./SolicitudDetallePage";
import SolicitudPermisoDetalle from "./SolicitudPermisoDetalle";
import { Plantilla } from "./Plantilla";
import { Reportes } from "./Reportes";
import { Dashboard as GraficosDashboard } from "../Dashboard-Admin/Dashboard";
import { DetallesEmpleado } from "../Empleado/DetallesEmpleado";
import { PeriodOptions, type Period } from "@/interfaces/Calendar.interface";
import WeeklyRoles from "../Dashboard-Empleados/WeeklyRoles";
import { useAuth } from '@/hooks/useAuth';
import { UserRole } from '@/interfaces/User.interface';
import FestivoDetallePage from './FestivoDetallePage';
//import { TransferenciaPersonal } from '../TransferenciaPersonal/TransferenciaPersonal';

// Manager subroute components

const navItems = [
    { to: "/area/calendario", label: "Calendario", icon: <Calendar /> },
    { to: "/area/roles-semanales", label: "Roles semanales", icon: <CalendarClock /> },
    { to: "/area/solicitudes", label: "Solicitudes", icon: <File /> },
    { to: "/area/plantilla", label: "Plantilla", icon: <Users /> },
    { to: "/area/reportes", label: "Reportes", icon: <FileChartColumn /> },
];

const AreaDashboard = (): JSX.Element => {
    const location = useLocation();
    const [currentPeriod] = useState<Period>(PeriodOptions.reprogramming);
    const { hasRole } = useAuth();
    const isLeader = hasRole(UserRole.LEADER);
    const isIndustrial = hasRole(UserRole.INDUSTRIAL);

    const navItems = [
        { to: "/area/calendario", label: "Calendario", icon: <Calendar /> },
        { to: "/area/roles-semanales", label: "Roles semanales", icon: <CalendarClock /> },
        // Dashboard de gráficos: Jefe e Ingeniero Industrial
        ...(!isLeader ? [{ to: "/area/dashboard", label: "Dashboard", icon: <BarChart3 /> }] : []),
        // Solo mostrar Solicitudes si NO es LEADER ni INDUSTRIAL
        ...(!isLeader && !isIndustrial ? [{ to: "/area/solicitudes", label: "Solicitudes", icon: <File /> }] : []),
        { to: "/area/plantilla", label: "Plantilla", icon: <Users /> },
        // Solo mostrar Reportes si NO es LEADER
        ...(!isLeader ? [{ to: "/area/reportes", label: "Reportes", icon: <FileChartColumn /> }] : []),
        //// Transferencia de personal solo para INDUSTRIAL
        //...(isIndustrial ? [{ to: "/area/transferencia-personal", label: "Transferencia", icon: <ArrowLeftRight /> }] : []),
    ];

    return (
        <div className="flex flex-col h-screen bg-continental-bg">
            <Navbar>
                <nav className="flex gap-1 h-full items-stretch">
                    {navItems.map((item) => {
                        const isActive = location.pathname === item.to ||
                            (location.pathname === '/area' && item.to === '/area/calendario');

                        return (
                            <Link
                                key={item.to}
                                to={item.to}
                                className={`relative flex items-center gap-2 px-3 text-sm font-medium tracking-tight transition-colors ${isActive
                                    ? 'text-continental-black'
                                    : 'text-continental-gray-1 hover:text-continental-black'
                                    }`}
                            >
                                <span className="[&_svg]:size-4">{item.icon}</span>
                                <span>{item.label}</span>
                                <span
                                    aria-hidden="true"
                                    className={`absolute left-2 right-2 -bottom-px h-0.5 rounded-t-sm transition-colors ${isActive ? 'bg-continental-yellow' : 'bg-transparent'}`}
                                />
                            </Link>
                        );
                    })}
                </nav>
            </Navbar>

            {/* Main Content */}
            <div className="flex-1 bg-continental-bg w-full overflow-x-hidden">
                <Routes>
                    <Route index element={<Navigate to="/area/calendario" replace />} />
                    <Route path="calendario" element={<CalendarComponent />} />
                    <Route path="roles-semanales" element={<WeeklyRoles />} />

                    {/* Solo LEADER e INDUSTRIAL no pueden ver */}
                    {!isLeader && !isIndustrial && (
                        <>
                            <Route path="solicitudes" element={<SolicitudesComponent />} />
                            <Route path="solicitudes/:id" element={<SolicitudDetallePage />} />
                            <Route path="solicitudes-permisos/:id" element={<SolicitudPermisoDetalle />} />
                            <Route path="festivos/:id" element={<FestivoDetallePage />} />
                        </>
                    )}

                    <Route path="plantilla" element={<Plantilla />} />
                    <Route path="plantilla/:id" element={<DetallesEmpleado currentPeriod={currentPeriod} />} />

                    {/* Dashboard de gráficos: Jefe de Área e Ingeniero Industrial */}
                    {!isLeader && <Route path="dashboard" element={<GraficosDashboard />} />}

                    {/* Solo LEADER no puede ver */}
                    {!isLeader && <Route path="reportes" element={<Reportes />} />}

                    {/* Transferencia de personal solo para INDUSTRIAL */}
                    {/*{isIndustrial && <Route path="transferencia-personal" element={<TransferenciaPersonal />} />}*/}
                </Routes>
            </div>
        </div>
    );
};

export default AreaDashboard;
