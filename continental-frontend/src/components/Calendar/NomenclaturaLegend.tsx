import { NOMENCLATURA_LEGEND_GROUPS, SAP_NOMENCLATURA } from '@/utils/sapNomenclatura';

interface NomenclaturaLegendProps {
    // 'compact' = una fila horizontal con chips (todos los códigos).
    // 'grouped' = grupos con títulos.
    variant?: 'compact' | 'grouped';
    className?: string;
}

export const NomenclaturaLegend = ({ variant = 'grouped', className = '' }: NomenclaturaLegendProps) => {
    if (variant === 'compact') {
        return (
            <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs ${className}`}>
                {Object.values(SAP_NOMENCLATURA).map((e) => (
                    <span key={e.codigo} className="inline-flex items-center gap-1">
                        <span
                            className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${e.chipBg} ${e.chipFg}`}
                        >
                            {e.codigo}
                        </span>
                        <span className="text-gray-600">{e.label}</span>
                    </span>
                ))}
            </div>
        );
    }

    return (
        <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 text-xs ${className}`}>
            {NOMENCLATURA_LEGEND_GROUPS.map((g) => (
                <div key={g.titulo}>
                    <div className="font-semibold text-gray-700 mb-1">{g.titulo}</div>
                    <div className="flex flex-wrap gap-1">
                        {g.codigos.map((c) => {
                            const e = SAP_NOMENCLATURA[c];
                            return (
                                <span key={c} className="inline-flex items-center gap-1">
                                    <span
                                        className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${e.chipBg} ${e.chipFg}`}
                                        title={e.label}
                                    >
                                        {e.codigo}
                                    </span>
                                    <span className="text-gray-600">{e.label}</span>
                                </span>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
};

export default NomenclaturaLegend;
