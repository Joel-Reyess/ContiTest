import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "../ui/button";
import { logger } from "@/utils/logger";
import { showSuccess, showError, showWarning, showInfo } from "@/utils/alerts";
import { authService } from "@/services/authService";
import { UserRole } from "@/interfaces/User.interface";
import { FirstTimePasswordReset } from "./FirstTimePasswordReset";
import { TurnoValidacion } from "../Auth/TurnoValidacion";
import { BloquesReservacionService } from "@/services/bloquesReservacionService";
import { vacacionesService } from "@/services/vacacionesService";
import type { BloqueReservacion, EmpleadoBloque } from "@/interfaces/Api.interface";
import Logo from "../../assets/Logo.webp";

interface EmployeeCredentials {
    nomina: string;
    password: string;
}

export const LoginEmployee = () => {
    const navigate = useNavigate();
    const [showForgotPassword, setShowForgotPassword] = useState(false);
    const [showFirstTimeReset, setShowFirstTimeReset] = useState(false);
    const [employeeCredentials, setEmployeeCredentials] = useState<EmployeeCredentials>({ nomina: '', password: '' });
    const [validationState, setValidationState] = useState<'cerrado' | 'turno-actual' | 'turno-siguiente' | 'sin-turno' | 'esperando-antiguedad' | null>(null);
    const [bloqueActual, setBloqueActual] = useState<BloqueReservacion | null>(null);
    const [bloqueSiguiente, setBloqueSiguiente] = useState<BloqueReservacion | null>(null);
    const [bloqueAsignado, setBloqueAsignado] = useState<BloqueReservacion | null>(null);
    const [empleadosPendientes, setEmpleadosPendientes] = useState<EmpleadoBloque[]>([]);
    const [_, setIsValidatingTurn] = useState(false);

    const handleFirstTimePasswordReset = async (password: string) => {
        try {
            // For first-time password reset, use the change-password endpoint
            // with the login password as current password
            const response = await authService.changePassword({
                CurrentPassword: employeeCredentials.password, // Use the login password as current
                NewPassword: password,
                ConfirmNewPassword: password
            });

            if (response.success) {
                logger.info('First time password reset successful for employee', { nomina: employeeCredentials.nomina });

                // Check if user is still authenticated after password change
                if (authService.isAuthenticated()) {
                    // User is still logged in, now validate their turn
                    showSuccess('Contraseña establecida correctamente. Validando turno...');
                    setShowFirstTimeReset(false);

                    // Validate employee turn after successful password reset
                    await validateEmployeeTurn();
                } else {
                    // User needs to login again
                    showSuccess('Contraseña establecida correctamente. Por favor, inicia sesión con tu nueva contraseña.');
                    setShowFirstTimeReset(false);
                    setEmployeeCredentials({ nomina: employeeCredentials.nomina, password: '' });
                }
            } else {
                throw new Error(response.errorMsg || 'Error al establecer la contraseña');
            }
        } catch (error) {
            logger.error('First time password reset failed for employee', error);
            throw error;
        }
    };

    const handleBackToLogin = () => {
        setShowFirstTimeReset(false);
        setShowForgotPassword(false);
        setEmployeeCredentials({ nomina: '', password: '' });
    };

    const validateEmployeeTurn = async () => {
        try {
            setIsValidatingTurn(true);

            // Obtener información del usuario actual
            const user = authService.getCurrentUser();
            if (!user) {
                throw new Error('No se pudo obtener la información del usuario');
            }

            // Verificar roles del usuario
            const userRoles = user.roles || user.rols || [];
            const hasRole = (roleName: string) => {
                return userRoles.some(role => {
                    if (typeof role === 'string') {
                        return role === roleName;
                    }
                    return role.name === roleName;
                });
            };

            const isEmpleadoSindicalizado = hasRole('Empleado Sindicalizado');

            // Si tiene rol Delegado Sindical o su area es "Sindicato" 
            const isDelegadoSindical = hasRole('Delegado Sindical') || user.area?.nombreGeneral === 'Sindicato';

            // Obtener configuración de vacaciones
            const config = await vacacionesService.getConfig();

            // Si el periodo está cerrado, cerrar sesión
            if (config.periodoActual === 'Cerrado') {
                logger.info('Periodo cerrado, cerrando sesión');
                setValidationState('cerrado');
                // Cerrar sesión después de mostrar el mensaje
                setTimeout(() => {
                    authService.logout();
                    window.location.reload();
                }, 10000);
                return;
            }

            // Año de los bloques de captura: el que se está preparando cuando la
            // programación anual del siguiente año convive con la reprogramación
            // del año en curso, y el vigente en el flujo normal.
            const anioCaptura = config.anioProgramacionAnual ?? config.anioVigente;

            // Durante la coexistencia el periodo sigue siendo Reprogramacion —
            // el sindicalizado entra a capturar su año preparado y el delegado
            // sigue haciendo reprogramaciones del año en curso.
            const usarFlujoAnual =
                config.periodoActual === 'ProgramacionAnual' ||
                (config.anioProgramacionAnual != null && isEmpleadoSindicalizado && !isDelegadoSindical);

            if (usarFlujoAnual) {
                // Solo empleados sindicalizados pueden acceder en programación anual
                if (!isEmpleadoSindicalizado) {
                    showWarning('Acceso denegado', 'Solo empleados sindicalizados pueden acceder durante la programación anual.');
                    authService.logout();
                    window.location.reload();
                    return;
                }

                // Obtener el grupo del usuario
                const grupoId = user.grupo?.grupoId;
                if (!grupoId) {
                    showError('Error', 'No se pudo determinar tu grupo. Contacta a Recursos Humanos.');
                    setValidationState('cerrado');
                    setTimeout(() => {
                        authService.logout();
                        window.location.reload();
                    }, 10000);
                    return;
                }

                const now = new Date()
                // Crear fecha con hora local (no UTC)
                const year = now.getFullYear()
                const month = String(now.getMonth() + 1).padStart(2, '0')
                const day = String(now.getDate()).padStart(2, '0')
                const hours = String(now.getHours()).padStart(2, '0')
                const minutes = String(now.getMinutes()).padStart(2, '0')
                const seconds = String(now.getSeconds()).padStart(2, '0')
                const fechaActual = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`

                // Obtener bloques por fecha
                const bloquesPorFecha = await BloquesReservacionService.obtenerBloquesPorFecha(
                    fechaActual,
                    { grupoId },
                    anioCaptura
                );

                console.log({ bloquesPorFecha })

                // Verificar si el empleado está en el bloque actual
                if (bloquesPorFecha.bloquesPorGrupo.length > 0) {
                    const bloquesGrupo = bloquesPorFecha.bloquesPorGrupo[0];

                    // Verificar si el empleado está en el bloque actual
                    const estaEnBloqueActual = bloquesGrupo.bloqueActual?.empleadosAsignados.some(
                        emp => emp.empleadoId === user.id
                    );

                    if (estaEnBloqueActual && bloquesGrupo.bloqueActual) {
                        // Validar si es su turno según antigüedad
                        const bloque = bloquesGrupo.bloqueActual;

                        // Ordenar empleados por antigüedad (más viejo primero)
                        const empleadosOrdenados = [...bloque.empleadosAsignados].sort((a, b) => {
                            const antiguedadA = new Date(a.fechaIngreso).getTime();
                            const antiguedadB = new Date(b.fechaIngreso).getTime();
                            if (antiguedadA === antiguedadB) {
                                return parseInt(a.nomina) - parseInt(b.nomina);
                            }
                            return antiguedadA - antiguedadB;
                        });

                        // Encontrar la posición del empleado actual
                        const posicionEmpleado = empleadosOrdenados.findIndex(emp => emp.empleadoId === user.id);

                        // Verificar si hay empleados con mayor antigüedad que aún no han reservado.
                        // 'Saltado' no bloquea: el jefe lo saltó precisamente para
                        // desbloquear al siguiente (el saltado aún puede capturar
                        // mientras el bloque siga abierto).
                        const hayEmpleadosPendientes = empleadosOrdenados.slice(0, posicionEmpleado).some(emp =>
                            emp.estado !== 'Reservado' && emp.estado !== 'Completado' && emp.estado !== 'Saltado'
                        );

                        if (hayEmpleadosPendientes) {
                            // Hay empleados con mayor antigüedad pendientes de reservar
                            const empleadosPendientes = empleadosOrdenados.slice(0, posicionEmpleado).filter(emp =>
                                emp.estado !== 'Reservado' && emp.estado !== 'Completado' && emp.estado !== 'Saltado'
                            );

                            setBloqueActual(bloque);
                            setValidationState('esperando-antiguedad');
                            setEmpleadosPendientes(empleadosPendientes);
                            setTimeout(() => {
                                authService.logout();
                                window.location.reload();
                            }, 10000);
                            return;
                        }

                        // Es su turno para reservar
                        setBloqueActual(bloque);
                        setValidationState('turno-actual');
                        return;
                    }

                    // Verificar si está en el bloque siguiente
                    const estaEnBloqueSiguiente = bloquesGrupo.bloqueSiguiente?.empleadosAsignados.some(
                        emp => emp.empleadoId === user.id
                    );

                    if (estaEnBloqueSiguiente) {
                        setBloqueSiguiente(bloquesGrupo.bloqueSiguiente);
                        setValidationState('turno-siguiente');
                        // Cerrar sesión después de mostrar el mensaje
                        setTimeout(() => {
                            authService.logout();
                            window.location.reload();
                        }, 10000);
                        return;
                    }
                }

                // Si no está en ningún bloque actual o siguiente, buscar su bloque asignado
                const bloquesEmpleado = await BloquesReservacionService.obtenerBloquesPorEmpleado(
                    user.id,
                    anioCaptura
                );

                if (bloquesEmpleado.bloques.length > 0) {
                    setBloqueAsignado(bloquesEmpleado.bloques[0]);
                    setValidationState('sin-turno');
                    // Cerrar sesión después de mostrar el mensaje
                    setTimeout(() => {
                        authService.logout();
                        window.location.reload();
                    }, 10000);
                } else {
                    // No tiene turno asignado
                    showWarning('Sin turno asignado', 'No tienes un turno asignado para programar vacaciones. Contacta a Recursos Humanos.');
                    setValidationState('cerrado');
                    setTimeout(() => {
                        authService.logout();
                        window.location.reload();
                    }, 10000);
                }
            } else if (config.periodoActual === 'Reprogramacion') {
                // En periodo de Reprogramacion
                logger.info('Periodo de reprogramación activo');

                // Solo delegados sindicales pueden acceder durante la reprogramación
                if (!isDelegadoSindical) {
                    showInfo(
                        'Periodo de Reprogramación',
                        'Durante el proceso de reprogramación, solo los delegados sindicales pueden hacer modificaciones. Por favor, acércate a un delegado sindical para solicitar un cambio de vacaciones.'
                    );
                    // Cerrar sesión después de 10 segundos
                    setTimeout(() => {
                        authService.logout();
                        window.location.reload();
                    }, 10000);
                    return;
                }

                // Si es delegado sindical, ir a selección de representante
                logger.info('Delegado sindical detectado, redirigiendo a selección de representante');
                navigate('/empleados');
            } else {
                // Periodo desconocido o no configurado
                showError('Error de configuración', 'El periodo de vacaciones no está configurado correctamente.');
                setValidationState('cerrado');
                setTimeout(() => {
                    console.log('Redirigiendo a login vacaciones');
                    authService.logout();
                    //reload page
                    window.location.reload();

                }, 10000);
            }
        } catch (error) {
            logger.error('Error al validar turno del empleado', error);
            showError('Error al validar turno', 'No se pudo verificar tu turno de programación. Por favor intenta nuevamente.');
            setValidationState('cerrado');
            setTimeout(() => {
                authService.logout();
                window.location.reload();
            }, 10000);
        } finally {
            setIsValidatingTurn(false);
        }
    };

    const handleContinuarTurno = () => {
        // Permitir el acceso al home cuando es su turno
        const user = authService.getCurrentUser();
        const userRoles = user?.roles || [];
        const firstRole = userRoles.length > 0 ? (typeof userRoles[0] === 'string' ? userRoles[0] : userRoles[0].name) : '';

        if (firstRole === UserRole.UNION_REPRESENTATIVE) {
            navigate('/empleados');
        } else {
            navigate('/empleados');
        }
    };

    // Si está validando el turno, mostrar el componente de validación
    if (validationState && validationState !== 'turno-actual') {
        return (
            <TurnoValidacion
                estado={validationState}
                bloqueActual={bloqueActual}
                bloqueSiguiente={bloqueSiguiente}
                bloqueAsignado={bloqueAsignado}
                empleadosPendientes={empleadosPendientes}
                onContinuar={handleContinuarTurno}
            />
        );
    }

    // Si es turno actual, mostrar validación y permitir continuar
    if (validationState === 'turno-actual') {
        return (
            <TurnoValidacion
                estado="turno-actual"
                bloqueActual={bloqueActual}
                empleadosPendientes={empleadosPendientes}
                onContinuar={handleContinuarTurno}
            />
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-continental-yellow">
            <div className="w-[500px] min-h-[520px] bg-continental-white rounded-lg shadow-lg flex flex-col items-center p-8">
                {/* Logo - 1/3 del contenedor */}
                <div className="h-1/3 flex items-center justify-center mb-6">
                    <img
                        src={Logo}
                        alt="Continental Logo"
                        className="max-h-full max-w-full object-contain"
                    />
                </div>

                {/* Form Container */}
                {showFirstTimeReset ? (
                    <FirstTimePasswordReset
                        onBack={handleBackToLogin}
                        onPasswordReset={handleFirstTimePasswordReset}
                        userIdentifier={employeeCredentials.nomina}
                        isEmployee={true}
                    />
                ) : showForgotPassword ? (
                    <ForgotPassword setShowForgotPassword={setShowForgotPassword} />
                ) : (
                    <FormLoginEmployee
                        setShowForgotPassword={setShowForgotPassword}
                        setShowFirstTimeReset={setShowFirstTimeReset}
                        employeeCredentials={employeeCredentials}
                        setEmployeeCredentials={setEmployeeCredentials}
                        validateEmployeeTurn={validateEmployeeTurn}
                    />
                )}
            </div>
        </div>
    );
};

const ForgotPassword = ({ setShowForgotPassword }: { setShowForgotPassword: (show: boolean) => void }) => {
    return (
        <div className="flex flex-col   h-full">
            <h1 className="text-xl font-medium">¿Olvidaste tu contraseña?</h1>
            <p className="text-base">Por seguridad, si olvidaste tu contraseña, debes acudir con tu jefe de área y proporcionar tu número de nómina para solicitar una nueva.</p>
            <p className="text-base">No hay recuperación automática en línea.</p>
            <div className="flex justify-start mt-6">
                <Button className="w-fit cursor-pointer" variant="continentalOutline" onClick={() => setShowForgotPassword(false)}>Regresar</Button>
            </div>
        </div>
    );
}

const FormLoginEmployee = ({
    setShowForgotPassword,
    setShowFirstTimeReset,
    employeeCredentials,
    setEmployeeCredentials,
    validateEmployeeTurn
}: {
    setShowForgotPassword: (show: boolean) => void;
    setShowFirstTimeReset: (show: boolean) => void;
    employeeCredentials: EmployeeCredentials;
    setEmployeeCredentials: (credentials: EmployeeCredentials) => void;
    validateEmployeeTurn: () => Promise<void>;
}) => {
    const navigate = useNavigate();
    const [isVisible, setIsVisible] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string>('');


    const toggleVisibility = () => setIsVisible((prev) => !prev);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement | HTMLButtonElement>) => {
        e.preventDefault();
        setError('');

        if (!employeeCredentials.nomina || !employeeCredentials.password) {
            setError('Por favor, completa todos los campos');
            return;
        }

        setIsLoading(true);

        try {
            const response = await authService.login({
                nomina: employeeCredentials.nomina,
                password: employeeCredentials.password,
            });

            console.log('Login OK:', response);

            // Ignorar completamente validación de turnos
            // Ir directo al home
            navigate('/empleados');

        } catch (err: unknown) {
            logger.error('Employee login failed', err);
            const apiError = err as { status?: number; message?: string };
            const invalidCreds = apiError?.status === 401 || apiError?.message?.toLowerCase().includes('contrasena incorrectos');
            const errorMessage = invalidCreds
                ? 'Los datos ingresados son incorrectos.'
                : err instanceof Error
                    ? err.message
                    : 'Error al iniciar sesiA3n. Intenta nuevamente.';
            setError(errorMessage);
            if (invalidCreds) {
                showError('Datos incorrectos', 'Verifica tu nomina y contrasena.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="w-full flex-1 flex flex-col justify-between">
            <div className="space-y-6">
                {/* Nomina Input */}
                <div className="space-y-2">
                    <Label htmlFor="nomina" className="text-sm font-medium text-continental-gray-1">
                        No. Nómina
                    </Label>
                    <Input
                        id="nomina"
                        placeholder="Ingresa tu número de nómina"
                        type="text"
                        maxLength={8}
                        minLength={8}
                        value={employeeCredentials.nomina}
                        onChange={(e) => setEmployeeCredentials({ ...employeeCredentials, nomina: e.target.value.replace(/[^0-9]/g, '') })}
                        className="w-full"
                        required
                    />
                </div>

                {/* Password Input */}
                <div className="space-y-2">
                    <Label htmlFor="password" className="text-sm font-medium text-continental-gray-1">
                        Contraseña
                    </Label>
                    <div className="relative">
                        <Input
                            id="password"
                            placeholder="Ingresa tu contraseña"
                            type={isVisible ? "text" : "password"}
                            value={employeeCredentials.password}
                            onChange={(e) => setEmployeeCredentials({ ...employeeCredentials, password: e.target.value })}
                            className="w-full pr-10"
                            required
                        />
                        <button
                            className="absolute inset-y-0 right-0 flex h-full w-10 items-center justify-center text-continental-gray-2 hover:text-continental-gray-1 transition-colors"
                            type="button"
                            onClick={toggleVisibility}
                            aria-label={isVisible ? "Ocultar contraseña" : "Mostrar contraseña"}
                        >
                            {isVisible ? (
                                <EyeOff size={16} />
                            ) : (
                                <Eye size={16} />
                            )}
                        </button>
                    </div>
                </div>

                {/* Error Message */}
                {error && (
                    <div className="text-continental-red text-sm text-center bg-red-50 p-3 rounded-lg border border-red-200">
                        {error}
                    </div>
                )}

                {/* Forgot Password Link */}
                <div className="text-right">
                    <button
                        type="button"
                        className="text-sm text-continental-yellow hover:underline transition-all"
                        onClick={async () => {
                            setShowForgotPassword(true);
                        }}
                    >
                        ¿Olvidaste tu contraseña?
                    </button>
                </div>
            </div>

            {/* Submit Button */}
            <div className="text-right mt-6">
                <Button
                    type="submit"
                    variant="continental"
                    className="w-[70px] h-[45px] font-medium rounded-lg cursor-pointer"
                    disabled={isLoading}
                >
                    {isLoading ? 'Entrando...' : 'Entrar'}
                </Button>
            </div>
        </form>
    )
}
