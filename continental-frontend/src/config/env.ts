/**
 * Environment Configuration
 * Centralizes all environment variables and provides type safety
 */

export interface EnvConfig {
  NODE_ENV: 'development' | 'production' | 'test';
  API_BASE_URL: string;
  API_TIMEOUT: number;
  DEBUG_MODE: boolean;
  LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';
  APP_NAME: string;
  APP_VERSION: string;
  /** true solo en el entorno de pruebas (6173/6050 → FreeTime_Test). */
  ES_PRUEBAS: boolean;
}

const getEnvVar = (key: string, defaultValue?: string): string => {
  const value = import.meta.env[key] || defaultValue;
  if (!value && !defaultValue) {
    throw new Error(`Environment variable ${key} is required but not defined`);
  }
  return value;
};

const getBooleanEnvVar = (key: string, defaultValue: boolean = false): boolean => {
  const value = import.meta.env[key];
  if (value === undefined) return defaultValue;
  return value === 'true' || value === '1';
};

const getNumberEnvVar = (key: string, defaultValue: number): number => {
  const value = import.meta.env[key];
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
};

export const env: EnvConfig = {
  NODE_ENV: (getEnvVar('VITE_NODE_ENV', 'development') as EnvConfig['NODE_ENV']),
  API_BASE_URL: getEnvVar('VITE_API_BASE_URL', 'http://localhost:5050'), // Default API URL for development
  API_TIMEOUT: getNumberEnvVar('VITE_API_TIMEOUT', 10000),
  DEBUG_MODE: getBooleanEnvVar('VITE_DEBUG_MODE', true),
  LOG_LEVEL: (getEnvVar('VITE_LOG_LEVEL', 'debug') as EnvConfig['LOG_LEVEL']),
  APP_NAME: getEnvVar('VITE_APP_NAME', 'Continental'),
  APP_VERSION: getEnvVar('VITE_APP_VERSION', '1.0.0'),
  // Por omisión false: si alguien compila sin definirla, se ve como producción.
  ES_PRUEBAS: getBooleanEnvVar('VITE_ES_PRUEBAS', false),
};

// Validate critical environment variables
if (env.NODE_ENV === 'production' && env.API_BASE_URL === 'http://localhost:5050') {
  console.warn('⚠️  API_BASE_URL is using development default in production environment');
}

export default env;