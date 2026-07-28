import React from 'react';
import { Clock } from 'lucide-react';
import type { ExcepcionPorcentaje } from '@/interfaces/Api.interface';

interface OvertimeIndicatorProps {
    fecha: string;
    excepciones: ExcepcionPorcentaje[];
    grupoId?: number;
    // Esquina donde se dibuja el reloj. Se puede mover porque en el calendario
    // de Plantilla la esquina superior izquierda la ocupa el número de turno.
    posicionClassName?: string;
}

export const OvertimeIndicator: React.FC<OvertimeIndicatorProps> = ({
    fecha,
    excepciones,
    grupoId,
    posicionClassName = 'top-1 left-1'
}) => {
    const excepcionDelDia = excepciones.find(
        exc => exc.fecha === fecha && exc.grupoId === grupoId
    );

    if (!excepcionDelDia) return null;

    return (
        <div
            className={`absolute ${posicionClassName} bg-orange-500 text-white rounded-full p-1 z-10`}
            title={`Tiempo Extra: ${excepcionDelDia.porcentajeMaximoPermitido}%${excepcionDelDia.motivo ? ` - ${excepcionDelDia.motivo}` : ''}`}
        >
            <Clock size={12} />
        </div>
    );
};