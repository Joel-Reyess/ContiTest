import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "../ui/button";
import { logger } from "@/utils/logger";
import { showSuccess } from "@/utils/alerts";
import { authService } from "@/services/authService";
import Logo from "../../assets/Logo.webp";
import { UserRole } from "@/interfaces/User.interface";
import { FirstTimePasswordReset } from "./FirstTimePasswordReset";

interface Credentials {
  username: string;
  password: string;
}

export const Login = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [credentials, setCredentials] = useState<Credentials>({ username: '', password: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [showFirstTimeReset, setShowFirstTimeReset] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement | HTMLButtonElement>) => {
    e.preventDefault();
    setError('');

    // Basic validation
    if (!credentials.username || !credentials.password) {
      setError('Por favor, completa todos los campos');
      return;
    }

    setIsLoading(true);

    try {
      const response = await authService.login({
        username: credentials.username,
        password: credentials.password,
      });
      console.log('🔍 Login response for admin:', {response});
      console.log('🔍 ultimoInicioSesion value:', response?.ultimoInicioSesion);
      console.log('🔍 ultimoInicioSesion type:', typeof response?.ultimoInicioSesion);

      // Check if this is the user's first login (ultimoInicioSesion is null or undefined)
      if (response && typeof response === 'object' && 'ultimoInicioSesion' in response && (response.ultimoInicioSesion === null || response.ultimoInicioSesion === undefined)) {
        logger.info('First time login detected, showing password reset', { username: credentials.username });
        setShowFirstTimeReset(true);
        return;
      } else {
        console.log('🔍 First time login NOT detected. ultimoInicioSesion:', response?.ultimoInicioSesion);
      }

      logger.info('Login successful, redirecting user', { user: response.user });

        // Check user roles and redirect accordingly
        const userRoles = response.user.roles || [];
        logger.info('User roles after login', { roles: userRoles });
        
        const hasRole = (role: string) => userRoles.some((r: string | { name: string }) => 
          typeof r === 'string' ? r === role : r.name === role
        );
      const redirectPath = hasRole(UserRole.SUPER_ADMIN) ? '/admin/areas' : '/area';
      navigate(redirectPath);
    } catch (err: unknown) {
      logger.error('Login failed', err);
      const errorMessage = err instanceof Error ? err.message : 'Error al iniciar sesión. Intenta nuevamente.';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleVisibility = () => setIsVisible((prev) => !prev);

  const handleFirstTimePasswordReset = async (password: string) => {
    try {
      // For first-time password reset, we need to use a temporary password
      // Since we don't have the current password, we'll use the change-password endpoint
      // with a special handling for first-time users
      const response = await authService.changePassword({
        CurrentPassword: credentials.password, // Use the login password as current
        NewPassword: password,
        ConfirmNewPassword: password
      });
      
      if (response.success) {
        logger.info('First time password reset successful', { username: credentials.username });
        
        // Check if user is still authenticated after password change
        if (authService.isAuthenticated()) {
          // User is still logged in, redirect to dashboard
          showSuccess('Contraseña establecida correctamente. Redirigiendo al dashboard...');
          
          // Get user roles and redirect accordingly
          const user = authService.getCurrentUser();
          const userRoles = user?.roles || [];
          
          const hasRole = (role: string) => userRoles.some((r: string | { name: string }) => 
            typeof r === 'string' ? r === role : r.name === role
          );
          
          const redirectPath = hasRole(UserRole.SUPER_ADMIN) ? '/admin/areas' : '/area';
          
          setTimeout(() => {
            navigate(redirectPath);
          }, 1500);
        } else {
          // User needs to login again
          showSuccess('Contraseña establecida correctamente. Por favor, inicia sesión con tu nueva contraseña.');
          setShowFirstTimeReset(false);
          setCredentials({ username: credentials.username, password: '' });
        }
      } else {
        throw new Error(response.errorMsg || 'Error al establecer la contraseña');
      }
    } catch (error) {
      logger.error('First time password reset failed', error);
      throw error;
    }
  };

  const handleBackToLogin = () => {
    setShowFirstTimeReset(false);
    setCredentials({ username: '', password: '' });
    setError('');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-continental-bg bg-industrial-grid p-4">
      <div className="relative w-full max-w-[460px] bg-white rounded-md shadow-industrial-lg border border-continental-gray-3 overflow-hidden">
        {/* Industrial accent rail */}
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-continental-yellow" aria-hidden="true" />

        <div className="px-10 pt-10 pb-9">
          {/* Brand header */}
          <div className="flex flex-col items-center mb-8">
            <img
              src={Logo}
              alt="Continental"
              className="h-14 object-contain mb-5"
            />
            <div className="industrial-eyebrow mb-1">Portal · Vacaciones</div>
            <h1 className="text-xl font-bold tracking-tight text-continental-black">
              Acceso administrativo
            </h1>
          </div>

          <div className="industrial-divider mb-7" aria-hidden="true" />

          {/* Form Container */}
          {showFirstTimeReset ? (
            <FirstTimePasswordReset
              onBack={handleBackToLogin}
              onPasswordReset={handleFirstTimePasswordReset}
              userIdentifier={credentials.username}
              isEmployee={false}
            />
          ) : (
            <form onSubmit={handleSubmit} className="w-full flex flex-col gap-6">
              {/* Email Input */}
              <div className="space-y-2">
                <Label htmlFor="username" className="text-xs font-semibold uppercase tracking-wider text-continental-gray-1">
                  Correo
                </Label>
                <Input
                  id="username"
                  placeholder="nombre@continental.com"
                  type="text"
                  value={credentials.username}
                  onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
                  className="w-full"
                  required
                  autoComplete="username"
                />
              </div>

              {/* Password Input */}
              <div className="space-y-2">
                <Label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-continental-gray-1">
                  Contraseña
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    placeholder="••••••••"
                    type={isVisible ? "text" : "password"}
                    value={credentials.password}
                    onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                    className="w-full pr-10"
                    required
                    autoComplete="current-password"
                  />
                  <button
                    className="absolute inset-y-0 right-0 flex h-full w-10 items-center justify-center text-continental-gray-2 hover:text-continental-black transition-colors rounded-r-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-continental-yellow/40"
                    type="button"
                    onClick={toggleVisibility}
                    aria-label={isVisible ? "Ocultar contraseña" : "Mostrar contraseña"}
                  >
                    {isVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    className="text-xs font-medium text-continental-gray-1 hover:text-continental-black underline underline-offset-4 decoration-continental-gray-3 hover:decoration-continental-yellow transition-colors"
                    onClick={async () => navigate('/restablecer-acceso')}
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2 text-sm text-continental-red bg-[color-mix(in_srgb,var(--color-continental-red)_8%,white)] p-3 rounded-md border border-[color-mix(in_srgb,var(--color-continental-red)_30%,white)]"
                >
                  <span className="mt-0.5 block h-2 w-2 rounded-full bg-continental-red shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Submit Button */}
              <Button
                type="submit"
                variant="continental"
                size="lg"
                className="w-full mt-1"
                disabled={isLoading}
              >
                {isLoading ? 'Entrando…' : 'Entrar'}
              </Button>
            </form>
          )}
        </div>

        {/* Footer strip */}
        <div className="px-10 py-3 bg-continental-gray-5 border-t border-continental-gray-3 text-[11px] uppercase tracking-wider text-continental-gray-2 flex justify-between">
          <span>Continental</span>
          <span>Secure access</span>
        </div>
      </div>
    </div>
  );
};
