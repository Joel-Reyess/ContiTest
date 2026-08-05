import { env } from "@/config/env";

/**
 * Distintivo del entorno de pruebas.
 *
 * Se pinta solo si VITE_ES_PRUEBAS=true, que únicamente define `.env.test`
 * (el build de `npm run build:test`). En producción no renderiza nada, así
 * que este componente es inofensivo al mergear a main.
 */
export const EntornoBadge = ({ className = "" }: { className?: string }) => {
  if (!env.ES_PRUEBAS) return null;

  return (
    <span
      title="Entorno de pruebas — base FreeTime_Test. Lo que hagas aquí no afecta producción."
      className={`shrink-0 rounded-sm border border-continental-red px-2 py-0.5 text-xs font-bold uppercase tracking-[0.18em] text-continental-red ${className}`}
    >
      Test
    </span>
  );
};
