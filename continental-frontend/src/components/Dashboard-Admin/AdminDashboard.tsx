import type { JSX } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { Navbar } from '../Navbar/Navbar';
import { Calendar, Factory, FileChartColumn, User2, Users, ArrowLeftRight, CalendarClock, BarChart2 } from 'lucide-react';
import { Areas } from './Areas';
import { Vacaciones } from './Vacaciones';
import { Plantilla } from './Plantilla';
import { Reportes } from './Reportes';
import { Usuarios } from './Usuarios';
import { DetallesEmpleado } from '../Empleado/DetallesEmpleado';
import { useState } from 'react';
import { PeriodOptions, type Period } from '@/interfaces/Calendar.interface';
import { DetallesUsuario } from './DetallesUsuario';
import WeeklyRoles from "../Dashboard-Empleados/WeeklyRoles";
/*import { TransferenciaPersonal } from '../TransferenciaPersonal/TransferenciaPersonal';*/
import { Dashboard } from './Dashboard';

const navItems = [
    { to: "/admin/areas", label: "Areas", icon: <Factory /> },
    { to: "/admin/vacaciones", label: "Vacaciones", icon: <Calendar /> },
    { to: "/admin/plantilla", label: "Plantilla", icon: <Users /> },
    { to: "/admin/reportes", label: "Reportes", icon: <FileChartColumn /> },
    { to: "/admin/usuarios", label: "Usuarios", icon: <User2 /> },
    { to: "/admin/roles-semanales", label: "Roles semanales", icon: <CalendarClock /> },
    /*{ to: "/admin/transferencia-personal", label: "Transferencia", icon: <ArrowLeftRight /> },*/
    { to: "/admin/dashboard", label: "Dashboard", icon: <BarChart2 /> },
];

const AdminDashboard = (): JSX.Element => {
    const [currentPeriod] = useState<Period>(PeriodOptions.reprogramming);
    const location = useLocation();

    return (
        <div className="flex flex-col min-h-screen w-full bg-continental-bg">
            <Navbar>
                <nav className="flex gap-1 h-full items-stretch">
                    {navItems.map((item) => {
                        const isActive = location.pathname === item.to ||
                            (location.pathname === '/admin' && item.to === '/admin/areas');

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
                                    className={`absolute left-2 right-2 -bottom-px h-0.5 rounded-t-sm transition-colors ${isActive ? 'bg-continental-yellow' : 'bg-transparent group-hover:bg-continental-gray-3'}`}
                                />
                            </Link>
                        );
                    })}
                </nav>
            </Navbar>

            {/* Main Content */}
            <div className="flex-1">
                <Routes>
                    <Route index element={<Areas />} />
                    <Route path="areas" element={<Areas />} />
                    <Route path="vacaciones" element={<Vacaciones />} />
                    <Route path="roles-semanales" element={<WeeklyRoles />} />
                    <Route path="plantilla" element={<Plantilla />} />
                    <Route path="plantilla/:id" element={<DetallesEmpleado currentPeriod={currentPeriod} />} />
                    <Route path="reportes" element={<Reportes />} />
                    <Route path="usuarios" element={<Usuarios />} />
                    <Route path="usuarios/:id" element={<DetallesUsuario />} />
                    <Route path="dashboard" element={<Dashboard />} />
                    {/*<Route path="transferencia-personal" element={<TransferenciaPersonal />} />*/}
                </Routes>
            </div>
        </div>
    );
};

export default AdminDashboard;