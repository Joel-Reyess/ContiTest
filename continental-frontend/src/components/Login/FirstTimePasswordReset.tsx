import { useState } from "react";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Button } from "../ui/button";
import { Eye, EyeOff, Lock, ArrowLeft } from "lucide-react";
import { logger } from "@/utils/logger";

interface FirstTimePasswordResetForm {
  password: string;
  confirmPassword: string;
}

interface FirstTimePasswordResetProps {
  onBack: () => void;
  onPasswordReset: (password: string) => Promise<void>;
  userIdentifier: string; // username or nomina
  isEmployee?: boolean;
}

export const FirstTimePasswordReset = ({ 
  onBack, 
  onPasswordReset, 
  userIdentifier,
  isEmployee = false 
}: FirstTimePasswordResetProps) => {
  const [formData, setFormData] = useState<FirstTimePasswordResetForm>({ 
    password: '', 
    confirmPassword: '' 
  });
  const [isVisible, setIsVisible] = useState(false);
  const [isConfirmVisible, setIsConfirmVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');

  const validatePassword = (password: string): string | null => {
    if (password.length < 8) {
      return 'La contraseña debe tener al menos 8 caracteres';
    }
    if (password.trim() === userIdentifier.trim()) {
      return 'La contraseña nueva no puede ser tu número de nómina ni tu usuario';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    // Basic validation
    if (!formData.password || !formData.confirmPassword) {
      setError('Por favor, completa todos los campos');
      return;
    }

    // Password validation
    const passwordError = validatePassword(formData.password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    // Confirm password validation
    if (formData.password !== formData.confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }

    setIsLoading(true);

    try {
      await onPasswordReset(formData.password);
      logger.info('First time password reset successful', { userIdentifier });
      
      // Clear form
      setFormData({ password: '', confirmPassword: '' });
    } catch (err: unknown) {
      logger.error('First time password reset failed', err);
      // httpClient lanza { message, status }, no un Error: sin esto el motivo del
      // servidor ("no puede ser tu número de nómina"...) no se veía.
      const errorMessage =
        (err as { message?: string } | null)?.message || 'No se pudo restablecer la contraseña. Intenta nuevamente.';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const togglePasswordVisibility = () => setIsVisible((prev) => !prev);
  const toggleConfirmVisibility = () => setIsConfirmVisible((prev) => !prev);

  return (
    <div className="w-full flex-1 flex flex-col justify-between">
      {/* Back Button */}
      <div className="w-full flex justify-start mb-4">
        <button 
          onClick={onBack}
          className="flex items-center text-continental-gray-2 hover:text-continental-gray-1 transition-colors"
          type="button"
        >
          <ArrowLeft size={20} className="mr-2" />
          <span className="text-sm">Volver al login</span>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="w-full flex-1 flex flex-col justify-between">
        <div className="space-y-6">
          {/* Title */}
          <div className="text-center space-y-2">
            <h2 className="text-xl font-semibold text-continental-gray-1">
              Establecer Nueva Contraseña
            </h2>
            <p className="text-sm text-continental-gray-2">
              Es tu primer inicio de sesión o tu contraseña se reseteó. Por seguridad, debes establecer una nueva contraseña antes de entrar.
            </p>
            <p className="text-xs text-continental-gray-2 bg-blue-50 p-2 rounded-lg">
              <strong>{isEmployee ? 'Nómina' : 'Usuario'}:</strong> {userIdentifier}
            </p>
          </div>

          {/* Password Input */}
          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-medium text-continental-gray-1">
              Nueva Contraseña
            </Label>
            <div className="relative">
              <Input
                id="password"
                placeholder="Ingresa tu nueva contraseña"
                type={isVisible ? "text" : "password"}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full pl-10 pr-10"
                required
              />
              <Lock size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-continental-gray-2" />
              <button
                className="absolute inset-y-0 right-0 flex h-full w-10 items-center justify-center text-continental-gray-2 hover:text-continental-gray-1 transition-colors"
                type="button"
                onClick={togglePasswordVisibility}
                aria-label={isVisible ? "Ocultar contraseña" : "Mostrar contraseña"}
              >
                {isVisible ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Confirm Password Input */}
          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className="text-sm font-medium text-continental-gray-1">
              Confirmar Contraseña
            </Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                placeholder="Confirma tu nueva contraseña"
                type={isConfirmVisible ? "text" : "password"}
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                className="w-full pl-10 pr-10"
                required
              />
              <Lock size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-continental-gray-2" />
              <button
                className="absolute inset-y-0 right-0 flex h-full w-10 items-center justify-center text-continental-gray-2 hover:text-continental-gray-1 transition-colors"
                type="button"
                onClick={toggleConfirmVisibility}
                aria-label={isConfirmVisible ? "Ocultar contraseña" : "Mostrar contraseña"}
              >
                {isConfirmVisible ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Password Requirements */}
          <div className="text-xs text-continental-gray-2 bg-gray-50 p-3 rounded-lg">
            <p className="font-medium mb-1">La contraseña debe contener:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Al menos 8 caracteres</li>
              <li>Distinta de tu número de nómina</li>
            </ul>
          </div>

          {/* Error Message */}
          {error && (
            <div className="text-continental-red text-sm text-center bg-red-50 p-3 rounded-lg border border-red-200">
              {error}
            </div>
          )}
        </div>

        {/* Submit Button */}
        <div className="text-center mt-6">
          <Button
            type="submit"
            variant="continental"
            className="w-full h-[45px] font-medium rounded-lg"
            disabled={isLoading}
          >
            {isLoading ? 'Estableciendo...' : 'Establecer Contraseña'}
          </Button>
        </div>
      </form>
    </div>
  );
};
