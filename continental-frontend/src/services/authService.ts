/**
 * Authentication Service
 * Handles all authentication-related operations
 */

import { httpClient } from './httpClient';
import { logger } from '@/utils/logger';
import { globalEmpleadosCache } from '@/utils/globalEmpleadosCache';
import { UserRole, UserStatus, type Rol, type User } from '@/interfaces/User.interface';
import { isUnionCommitteeNomina } from '@/config/unionCommittee';
import type {
    LoginRequest,
    LoginResponse,
    RegisterRequest,
    RefreshTokenResponse,
    ResetPasswordRequest,
    ChangePasswordRequest,
    ChangeUserPasswordRequest,
    FirstTimePasswordResetRequest,
    ApiResponse,
    ApiError,
} from '@/interfaces/Api.interface';

export interface AuthState {
    user: User | null;
    token: string | null;
    expiration: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;
}

class AuthService {
    private readonly STORAGE_KEY = 'user';
    private readonly TOKEN_KEY = 'auth_token';
    private readonly EXPIRATION_KEY = 'token_expiration';

    constructor() {
        this.initializeAuth();
    }

    private initializeAuth(): void {
        try {
            const userData = localStorage.getItem(this.STORAGE_KEY);
            if (userData) {
                const user = JSON.parse(userData);
                if (this.isTokenValid(user.token)) {
                    logger.authAction('User restored from storage', { username: user.username, roles: user.roles });
                } else {
                    this.clearAuth();
                    logger.authAction('Token expired, cleared auth');
                }
            }
        } catch (error) {
            logger.error('Error initializing auth', error, 'AUTH_SERVICE');
            this.clearAuth();
        }
    }

    private isTokenValid(token: string): boolean {
        if (!token) return false;

        try {
            // For mock tokens, just check if it starts with 'token-'
            // In a real app, you'd decode JWT and check expiration
            if (token.startsWith('token-')) {
                return true;
            }

            // For real JWT tokens, check if it has 3 parts
            const parts = token.split('.');
            return parts.length === 3;
        } catch {
            return false;
        }
    }

    private saveAuth(user: User, token: string, expiration?: string): void {
        try {
            const userData = { ...user, token };
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(userData));
            localStorage.setItem(this.TOKEN_KEY, token);
            if (expiration) {
                localStorage.setItem(this.EXPIRATION_KEY, expiration);
            }
            logger.authAction('Auth data saved', { username: user.username, roles: user.roles });
        } catch (error) {
            logger.error('Error saving auth data', error, 'AUTH_SERVICE');
        }
    }

    private clearAuth(): void {
        try {
            localStorage.removeItem(this.STORAGE_KEY);
            localStorage.removeItem(this.TOKEN_KEY);
            localStorage.removeItem(this.EXPIRATION_KEY);
            // Limpiar empleado seleccionado por delegado sindical
            localStorage.removeItem('selectedEmployee');
            logger.authAction('Auth data cleared');
        } catch (error) {
            logger.error('Error clearing auth data', error, 'AUTH_SERVICE');
        }
    }



    // Public methods
    async login(credentials: LoginRequest): Promise<LoginResponse & { user: User }> {
        try {
            // Handle both username and nomina fields
            const identifier = credentials.username || credentials.nomina;
            const normalizedIdentifier = identifier?.toString().trim() || '';
            logger.authAction('Login attempt', { username: normalizedIdentifier });

            // Real API call to backend
            const response: ApiResponse<LoginResponse> = await httpClient.post<LoginResponse>('/Auth/login', {
                username: normalizedIdentifier,
                password: credentials.password
            });

            // Extract data from API response
            const loginData = response.data;

            if (!loginData) {
                throw new Error('Invalid response from server');
            }

            const token = loginData?.token || "";
            const expiration = loginData?.expiration || "";

            // Guardar el token y expiration temporalmente para que httpClient pueda acceder a Acl
            localStorage.setItem(this.TOKEN_KEY, token);
            localStorage.setItem(this.EXPIRATION_KEY, expiration);

            const userData = await this.me();
            console.log('userData from /me endpoint:', { userData });
            console.log('userData.id:', userData?.id, 'type:', typeof userData?.id);

            if (!userData?.id) {
                logger.error('User ID is missing from /me endpoint response', { userData }, 'AUTH_SERVICE');
                throw new Error('User ID is required but not provided by server');
            }

            // Normalizar roles y marcar a los integrantes del comite sindical como delegados
            const rawRoles = (userData?.roles || userData?.rols || []) as Array<string | Rol>;

            // Normalizar a solo strings para roles. Además, canonicalizar el
            // nombre a los valores de UserRole: la BD de cada ambiente puede
            // traer "Delegado_Sindical" o "DelegadoSindical" y todos los
            // componentes comparan contra UserRole.X literal.
            const normalizedRoleNames = Array.from(new Set(
                rawRoles
                    .map(role => typeof role === 'string' ? role : role.name)
                    .filter(Boolean)
                    .map(name => this.canonicalRoleName(name))
            ));

            // Normalizar a solo objetos Rol para rols (filtrando solo los que son objetos)
            const normalizedRols = rawRoles
                .filter((role): role is Rol =>
                    typeof role === 'object' && role !== null && 'name' in role
                )
                .map(role => ({ ...role, name: this.canonicalRoleName(role.name) }));

            const isCommittee = isUnionCommitteeNomina(userData?.username || normalizedIdentifier);
            if (isCommittee && !normalizedRoleNames.includes(UserRole.UNION_REPRESENTATIVE)) {
                normalizedRoleNames.push(UserRole.UNION_REPRESENTATIVE);
            }

            //TODO: Solicitar al backend que devuelva el usuario con todos los campos
            const user: User = {
                id: userData.id,
                username: userData?.username || normalizedIdentifier || '',
                nomina: userData?.username || normalizedIdentifier || '',
                roles: normalizedRoleNames,
                rols: normalizedRols.length > 0 ? normalizedRols : normalizedRoleNames,
                area: userData?.area || (isCommittee ? { areaId: userData?.area?.areaId ?? -1, nombreGeneral: 'Sindicato' } : null),
                grupo: userData?.grupo || null,
                fullName: userData?.fullName || 'USUARIO PRUEBA',
                fechaIngreso: userData?.fechaIngreso || new Date().toISOString(),
                status: userData?.status || UserStatus.Activo,
                createdAt: userData?.createdAt || new Date().toISOString(),
                updatedAt: userData?.updatedAt || new Date().toISOString(),
                isUnionCommittee: isCommittee,
            };

            this.saveAuth(user, token, expiration);
            logger.authAction('Login successful', { username: user.username, roles: user.roles || [], rols: user.rols || [] });

            // Return the complete login response with user data
            return {
                token: loginData.token,
                expiration: loginData.expiration,
                ultimoInicioSesion: loginData.ultimoInicioSesion,
                user: user as User & Record<string, unknown>
            };
        } catch (error: unknown) {
            logger.error('Login failed', error, 'AUTH_SERVICE');
            const apiError = error as ApiError;
            if (apiError?.status === 401) {
                throw new Error('Usuario o contrasena incorrectos');
            }
            if (error instanceof Error) {
                throw new Error(error.message || 'Error al iniciar sesiA3n. Intenta nuevamente.');
            }
            throw new Error('Error al iniciar sesiA3n. Intenta nuevamente.');
        }
    }

    async me(): Promise<User> {
        try {
            logger.authAction('Me attempt');

            // TODO: Call me API endpoint when available
            const response: ApiResponse<User> = await httpClient.get<User>('/api/User/profile');
            console.log({ response })

            // Mock success for now
            logger.authAction('Me successful');

            if (!response.data) {
                throw new Error('Invalid response from server');
            }
            return response.data as unknown as User;
        } catch (error) {
            logger.error('Me failed', error, 'AUTH_SERVICE');
            throw error;
        }
    }

    async logout(): Promise<void> {
        try {
            logger.authAction('Logout attempt');

            // TODO: Call logout API endpoint when available
            // await httpClient.post('/auth/logout');

            this.clearAuth();

            // Clear empleados cache on logout for security
            globalEmpleadosCache.clear();

            logger.authAction('Logout successful - cache cleared');
        } catch (error) {
            logger.error('Logout error', error, 'AUTH_SERVICE');
            // Clear auth and cache even if API call fails
            this.clearAuth();
            globalEmpleadosCache.clear();
        }
    }

    async refreshToken(): Promise<string> {
        try {
            const currentToken = this.getToken();
            if (!currentToken) {
                throw new Error('No token available for refresh');
            }

            logger.authAction('Attempting token refresh');

            // Real API call to refresh token
            const response: ApiResponse<RefreshTokenResponse> = await httpClient.post<RefreshTokenResponse>(
                '/Auth/refresh-token',
                {},
                { requiresAuth: true } // This request needs the current token
            );

            if (!response.data?.token) {
                throw new Error('Invalid refresh response from server');
            }

            const newToken = response.data.token;
            const newExpiration = response.data.expiration;

            // Update token and expiration in storage
            localStorage.setItem(this.TOKEN_KEY, newToken);
            if (newExpiration) {
                localStorage.setItem(this.EXPIRATION_KEY, newExpiration);
            }

            // Update user object with new token if it exists
            const user = this.getCurrentUser();
            if (user) {
                const updatedUser = { ...user, token: newToken };
                this.saveAuth(updatedUser, newToken, newExpiration);
            }

            logger.authAction('Token refreshed successfully');
            return newToken;
        } catch (error) {
            logger.error('Token refresh failed', error, 'AUTH_SERVICE');
            this.clearAuth();
            throw error;
        }
    }
    async register(request: RegisterRequest): Promise<{ success: boolean, data: string, errorMsg: string | null }> {
        try {
            logger.authAction('Register attempt', { username: request.username, areaId: request.areaId, roles: request.roles });

            // Real API call to backend
            const response: ApiResponse<string> = await httpClient.post<string>('/Auth/register', {
                username: request.username,
                password: request.password,
                fullName: request.fullName,
                areaId: request.areaId,
                roles: request.roles,
            });

            // Extract data from API response      
            if (!response.success) {
                throw new Error(response.errorMsg || 'Invalid response from server');
            }

            logger.authAction('Register successful', { username: request.username });

            return { success: true, data: "", errorMsg: null };
        } catch (error: unknown) {
            logger.error('Register failed', error, 'AUTH_SERVICE');
            console.log('Full error object:', error);

            // Handle validation errors from API
            if (error && typeof error === 'object') {
                // Handle ASP.NET Core validation error format
                if ('response' in error && error.response && typeof error.response === 'object') {
                    const response = error.response as { data?: { errors?: Record<string, string[]>; errorMsg?: string } };
                    if (response.data && response.data.errors) {
                        const validationErrors = response.data.errors;
                        const errorMessages: string[] = [];

                        // Extract all validation error messages
                        Object.keys(validationErrors).forEach(field => {
                            const fieldErrors = validationErrors[field];
                            if (Array.isArray(fieldErrors)) {
                                errorMessages.push(...fieldErrors);
                            }
                        });

                        if (errorMessages.length > 0) {
                            throw new Error(errorMessages.join('. '));
                        }
                    }

                    // Handle other API error formats
                    if (response.data && response.data.errorMsg) {
                        throw new Error(response.data.errorMsg);
                    }
                }

                // Handle error with details field (JSON string)
                if ('details' in error) {
                    const apiError = error as { details?: string | { errorMsg?: string } };

                    // If details is a JSON string, parse it
                    if (typeof apiError.details === 'string') {
                        try {
                            console.log('Parsing details:', apiError.details);
                            const parsedDetails = JSON.parse(apiError.details);
                            console.log('Parsed details:', parsedDetails);

                            if (parsedDetails.errors) {
                                const validationErrors = parsedDetails.errors;
                                const errorMessages: string[] = [];

                                // Extract all validation error messages
                                Object.keys(validationErrors).forEach(field => {
                                    const fieldErrors = validationErrors[field];
                                    if (Array.isArray(fieldErrors)) {
                                        errorMessages.push(...fieldErrors);
                                    }
                                });

                                console.log('Extracted error messages:', errorMessages);
                                if (errorMessages.length > 0) {
                                    throw new Error(errorMessages.join('. '));
                                }
                            }

                            // If no errors found, throw the whole parsed object as string
                            throw new Error(JSON.stringify(parsedDetails));
                        } catch (parseError) {
                            console.log('Parse error:', parseError);
                            // If parsing fails, throw the original details
                            throw new Error(apiError.details);
                        }
                    } else if (apiError.details?.errorMsg) {
                        throw new Error(apiError.details.errorMsg);
                    }
                }
            }

            if (error instanceof Error) {
                // Try to parse the error message if it's JSON
                try {
                    const parsedError = JSON.parse(error.message);
                    if (parsedError.errors) {
                        const errorMessages: string[] = [];
                        Object.keys(parsedError.errors).forEach(field => {
                            const fieldErrors = parsedError.errors[field];
                            if (Array.isArray(fieldErrors)) {
                                errorMessages.push(...fieldErrors);
                            }
                        });
                        if (errorMessages.length > 0) {
                            throw new Error(errorMessages.join('. '));
                        }
                    }
                } catch {
                    // If not JSON, use original message
                }
                throw new Error(error.message || 'Error al crear usuario');
            }
            throw new Error('Error al crear usuario');
        }
    }


    async resetPassword(_request: ResetPasswordRequest): Promise<void> {
        try {
            logger.authAction('Reset password attempt');

            // TODO: Implement real API call
            // await httpClient.post('/auth/reset-password', _request);

            // Mock success for now
            await new Promise(resolve => setTimeout(resolve, 1000));
            logger.authAction('Password reset successful');
        } catch (error) {
            logger.error('Password reset failed', error, 'AUTH_SERVICE');
            throw error;
        }
    }

    async changePassword(request: ChangePasswordRequest): Promise<ApiResponse<string>> {
        try {
            logger.authAction('Change password attempt');

            const response: ApiResponse<string> = await httpClient.post('/Auth/change-password', request);

            if (response.success) {
                logger.authAction('Password changed successfully');
            }

            return response;
        } catch (error) {
            logger.error('Password change failed', error, 'AUTH_SERVICE');
            throw error;
        }
    }

    async changeUserPassword(request: ChangeUserPasswordRequest): Promise<ApiResponse<string>> {
        try {
            logger.authAction('Change user password attempt', { userId: request.UserId });

            const response: ApiResponse<string> = await httpClient.post('/Auth/change-user-password', request);

            if (response.success) {
                logger.authAction('User password changed successfully', { userId: request.UserId });
            }

            return response;
        } catch (error) {
            logger.error('Change user password failed', error, 'AUTH_SERVICE');
            throw error;
        }
    }

    async firstTimePasswordReset(request: FirstTimePasswordResetRequest): Promise<void> {
        try {
            logger.authAction('First time password reset attempt', {
                username: request.username,
                nomina: request.nomina
            });

            // TODO: Implement real API call when endpoint is available
            // For now, show alert that password reset failed as requested
            throw new Error('El servicio de restablecimiento de contraseña no está disponible en este momento. Por favor, contacta al administrador del sistema.');

            // Future implementation:
            // const response = await httpClient.post('/auth/first-time-password-reset', {
            //   username: request.username,
            //   nomina: request.nomina,
            //   password: request.password,
            //   confirmPassword: request.confirmPassword
            // });

            // logger.authAction('First time password reset successful');
        } catch (error) {
            logger.error('First time password reset failed', error, 'AUTH_SERVICE');
            throw error;
        }
    }

    // Utility methods
    getCurrentUser(): User | null {
        try {
            const userData = localStorage.getItem(this.STORAGE_KEY);
            return userData ? JSON.parse(userData) : null;
        } catch {
            return null;
        }
    }

    getToken(): string | null {
        return localStorage.getItem(this.TOKEN_KEY);
    }

    getTokenExpiration(): string | null {
        return localStorage.getItem(this.EXPIRATION_KEY);
    }

    isAuthenticated(): boolean {
        const user = this.getCurrentUser();
        return !!(user?.token && this.isTokenValid(user.token));
    }

    /**
     * Comparación de rol tolerante a la nomenclatura de la BD del ambiente:
     * "Jefe De Area", "Jefe_De_Area" y "JefeDeArea" son el mismo rol.
     */
    private normalizeRoleName(name: string): string {
        return name.replace(/[_\-\s]/g, '').toUpperCase();
    }

    /**
     * Devuelve el valor canónico de UserRole equivalente al nombre recibido
     * (p.ej. "Delegado_Sindical" → "Delegado Sindical"). Si no matchea ningún
     * rol conocido, regresa el nombre original.
     */
    private canonicalRoleName(name: string): string {
        const normalized = this.normalizeRoleName(name);
        const canonical = Object.values(UserRole)
            .find(v => this.normalizeRoleName(v) === normalized);
        return canonical ?? name;
    }

    private roleMatches(userRole: string | Rol, expected: string): boolean {
        const roleName = typeof userRole === 'string' ? userRole : userRole.name;
        return this.normalizeRoleName(roleName) === this.normalizeRoleName(expected);
    }

    hasRole(role: UserRole): boolean {
        const user = this.getCurrentUser();
        if (!user?.roles) return false;

        return user.roles.some(userRole => this.roleMatches(userRole, role));
    }

    hasAnyRole(roles: UserRole[]): boolean {
        const user = this.getCurrentUser();
        if (!user?.roles) return false;

        return user.roles.some(userRole =>
            roles.some(expected => this.roleMatches(userRole, expected)));
    }

    getAuthState(): AuthState {
        const user = this.getCurrentUser();
        return {
            user,
            token: user?.token || null,
            expiration: this.getTokenExpiration(),
            isAuthenticated: this.isAuthenticated(),
            isLoading: false,
        };
    }
}

export const authService = new AuthService();
export default authService;





