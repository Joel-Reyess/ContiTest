import { useState } from "react";
import { ChevronDown, LogOut, User, Bell, UserPlus } from "lucide-react";
import useAuth from "@/hooks/useAuth";
import { useNotifications } from "@/hooks/useNotifications";
import { useNavigate, useLocation } from "react-router-dom";
import { UserRole } from "@/interfaces/User.interface";

// Función para formatear el rol del usuario
const formatRole = (role: string): string => {
  const roleMap: Record<string, string> = {
    'admin': 'Administrador',
    'super_admin': 'Super Administrador',
    'area_admin': 'Administrador de Área',
    'leader': 'Líder',
    'industrial': 'Industrial',
    'union_representative': 'Representante Sindical',
    'unionized': 'Sindicalizado'
  };
  return roleMap[role] || role;
};

export const NavbarUser = () => {
  const { logout, user, hasAnyRole } = useAuth();
  const { unreadCount } = useNotifications();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Función para navegar a notificaciones
  const handleNotificationsClick = () => {
    navigate('/notificaciones');
    setIsDropdownOpen(false);
  };

  // Función para navegar a suplente
  const handleSuplenteClick = () => {
    navigate('/suplente');
    setIsDropdownOpen(false);
  };

  // Verificar si estamos en la vista de notificaciones
  const isNotificationsActive = location.pathname === '/notificaciones';

  // Verificar si estamos en la vista de suplente
  const isSuplenteActive = location.pathname === '/suplente';

  const handleLogout = async () => {
    try {
      await logout();
      setIsDropdownOpen(false);
      //detectar si el usuario es sindicalizado
      if ((user as any)?.roles.includes(UserRole.UNIONIZED) || (user as any)?.roles.includes(UserRole.UNION_REPRESENTATIVE)) {
        navigate('/login-vacaciones', { replace: true });
      } else {
        navigate('/login', { replace: true });
      }
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
  };

  if (!user) {
    return null;
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        className="flex items-center gap-3 pl-2 pr-3 py-1.5 rounded-md border border-transparent hover:border-continental-gray-3 hover:bg-continental-gray-5 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-continental-yellow/40"
      >
        <div className="flex items-center gap-3">
          {hasAnyRole([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.INDUSTRIAL, UserRole.AREA_ADMIN, UserRole.LEADER]) && unreadCount > 0 && (
            <div className="relative">
              <Bell className="w-4 h-4 text-continental-yellow" />
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-continental-red ring-2 ring-white" />
            </div>
          )}

          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-continental-yellow-soft border border-continental-yellow/50 text-continental-black">
            <User className="w-4 h-4" />
          </div>
          <div className="text-left leading-tight hidden sm:block">
            <div className="text-sm font-semibold text-continental-black">
              {user.username}
            </div>
            <div className="text-[11px] uppercase tracking-wider text-continental-gray-1">
              {formatRole((user as any).roles[0])}
            </div>
          </div>
        </div>
        <ChevronDown className={`w-4 h-4 text-continental-gray-1 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu */}
      {isDropdownOpen && (
        <>
          {/* Overlay para cerrar el dropdown */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsDropdownOpen(false)}
          />

          {/* Dropdown Content */}
          <div className="absolute right-0 mt-2 w-64 bg-white rounded-md shadow-industrial-lg border border-continental-gray-3 z-20 overflow-hidden">
            <div className="px-4 py-3 bg-continental-gray-5 border-b border-continental-gray-3">
              <div className="text-sm font-semibold text-continental-black truncate">
                {user.username}
              </div>
              <div className="text-[11px] uppercase tracking-wider text-continental-gray-1 mt-0.5">
                {formatRole((user as any).roles[0])}
              </div>
            </div>

            <div className="py-1">
              {hasAnyRole([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.INDUSTRIAL, UserRole.AREA_ADMIN, UserRole.LEADER]) && (
                <button
                  onClick={handleNotificationsClick}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium cursor-pointer transition-colors border-l-2 ${isNotificationsActive
                      ? 'bg-continental-yellow-soft text-continental-black border-continental-yellow'
                      : 'text-continental-black hover:bg-continental-gray-5 border-transparent'
                    }`}
                >
                  <div className="relative">
                    <Bell className="w-4 h-4" />
                    {unreadCount > 0 && (
                      <div className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 bg-continental-red text-white rounded-full flex items-center justify-center text-[10px] font-semibold ring-2 ring-white">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </div>
                    )}
                  </div>
                  Notificaciones
                </button>
              )}

              {hasAnyRole([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.INDUSTRIAL, UserRole.AREA_ADMIN]) && (
                <button
                  onClick={handleSuplenteClick}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium cursor-pointer transition-colors border-l-2 ${isSuplenteActive
                      ? 'bg-continental-yellow-soft text-continental-black border-continental-yellow'
                      : 'text-continental-black hover:bg-continental-gray-5 border-transparent'
                    }`}
                >
                  <UserPlus className="w-4 h-4" />
                  Suplente
                </button>
              )}
            </div>

            <div className="border-t border-continental-gray-3 py-1">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-continental-red hover:bg-[color-mix(in_srgb,var(--color-continental-red)_8%,white)] transition-colors cursor-pointer border-l-2 border-transparent hover:border-continental-red"
              >
                <LogOut className="w-4 h-4" />
                Cerrar sesión
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};