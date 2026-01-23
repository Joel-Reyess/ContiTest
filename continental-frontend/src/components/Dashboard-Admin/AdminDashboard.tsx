import type { JSX } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { Navbar } from '../Navbar/Navbar';
import { Calendar, Factory, FileChartColumn, User2, Users } from 'lucide-react';
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
import { CalendarClock } from "lucide-react";

const navItems = [
  { to: "/admin/areas", label: "Areas", icon: <Factory /> },
  { to: "/admin/vacaciones", label: "Vacaciones", icon: <Calendar /> },
  { to: "/admin/plantilla", label: "Plantilla", icon: <Users /> },
  { to: "/admin/reportes", label: "Reportes", icon: <FileChartColumn /> },
  { to: "/admin/usuarios", label: "Usuarios", icon: <User2 /> },
  { to: "/admin/roles-semanales", label: "Roles semanales", icon: <CalendarClock /> },
];

const AdminDashboard = (): JSX.Element => {
  const [currentPeriod] = useState<Period>(PeriodOptions.reprogramming);
  const location = useLocation();

  return (
    <div className="flex flex-col min-h-screen w-full">
      <Navbar>
        <nav className="flex gap-2">
          {navItems.map((item) => {
            const isActive = location.pathname === item.to || 
              (location.pathname === '/admin' && item.to === '/admin/areas');
            
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`rounded-lg flex items-center gap-2 px-4 py-2 transition-colors ${
                  isActive 
                    ? 'bg-continental-yellow text-continental-black' 
                    : 'hover:bg-continental-yellow hover:text-continental-black'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </Navbar>

      {/* Main Content */}
      <div className="flex-1 bg-white">
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
        </Routes>
      </div>
    </div>
  );
};

export default AdminDashboard;