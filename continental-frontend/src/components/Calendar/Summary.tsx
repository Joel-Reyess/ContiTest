import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "../ui/button";
import { Trash } from "lucide-react";
import { CalendarSync } from "lucide-react";
import { PeriodOptions, type Period } from "@/interfaces/Calendar.interface";

// Convierte una cadena ISO fecha-only (YYYY-MM-DD) a una Date en zona local
const parseDateToLocal = (d: string | Date | undefined | null): Date => {
    if (!d) return new Date(0);
    if (d instanceof Date) return d;
    // Manejar cadenas como '2026-03-23' o con time '2026-03-23T...'
    const onlyDateMatch = /^\d{4}-\d{2}-\d{2}$/.test(d);
    if (onlyDateMatch) {
        const [y, m, day] = d.split("-").map((s) => parseInt(s, 10));
        return new Date(y, m - 1, day);
    }
    // fallback a Date constructor para otros formatos ISO
    return new Date(d);
};

const todayStr = (() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
})();

export const Summary = ({
    assignedDays,
    availableDays,
    workedHoliday,
    selectedDays,
    handleRemoveDay,
    onSubmit,
    loading,
    isViewMode,
    handleEdit,
    period,
    isDelegadoSindicato, // ✅ Agregar este parámetro
}: {
    assignedDays: { date: string }[];
    availableDays: number;
    workedHoliday?: { date: string }[];
    vacaciones?: any[];
    selectedDays: { date: string }[];
    handleRemoveDay?: (day: string) => void;
    onSubmit?: () => void;
    loading?: boolean;
    isViewMode?: boolean;
    handleEdit?: (day: string) => void;
    period?: Period;
    isDelegadoSindicato?: boolean; // ✅ Agregar este parámetro
}) => {

    // ✅ Log para debugging
    console.log('🔍 Summary Debug:', {
        period,
        isDelegadoSindicato,
        isReprogramming: period === PeriodOptions.reprogramming,
        shouldShowButton: period === PeriodOptions.reprogramming && isDelegadoSindicato
    });

    return (
        <div className="w-full flex flex-col p-4 border border-continental-gray-4 rounded-lg h-full overflow-y-auto max-h-max">
            {assignedDays.length > 0 ? (
                <div>
                    <h1 className="text-xl font-semibold">Vacaciones asignadas</h1>
                    <div className="h-2 w-full bg-continental-blue-light "></div>
                    <div className="flex flex-col gap-2">
                        {assignedDays.map((day) => (
                            <div
                                key={day.date}
                                className="flex items-center justify-center p-2 border border-continental-gray-4"
                            >
                                <p>
                                    {format(parseDateToLocal(day.date), "EEE, d 'de' MMMM 'de' yyyy", {
                                        locale: es,
                                    })}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}

            <div className="flex flex-col gap-2 mt-4">
                {!isViewMode ? (
                    <>
                        <h1 className="text-xl font-semibold">Resumen de vacaciones</h1>
                        <h2 className="text-lg font-semibold">Revisa tu selección antes de continuar</h2>
                        <div className="flex justify-between items-center text-base">
                            <p className="text-continental-gray-1">Dias capturados</p>
                            <p className="text-gray-800 text-xl font-bold">
                                {selectedDays.length}
                            </p>
                        </div>
                        <div className="flex justify-between items-center text-base">
                            <p className="text-continental-gray-1">Dias por capturar</p>
                            <p className="text-gray-800 text-xl font-bold">
                                {availableDays - selectedDays.length}
                            </p>
                        </div>
                    </>
                ) : (
                    <>
                        <h1 className="text-xl font-semibold">Vacaciones Seleccionadas</h1>
                        <div className="h-2 w-full bg-continental-yellow "></div>
                    </>
                )}

                <div className="flex flex-col justify-between gap-2">
                    {selectedDays.map((day) => {
                        // Una vacación seleccionada ya consumida (fecha <= hoy) no
                        // puede reprogramarse desde aquí: para días perdidos por
                        // incapacidad existe el flujo "Reprogramación post-incapacidad".
                        const yaConsumida = day.date <= todayStr;
                        return (
                            <div
                                key={day.date}
                                className={`flex items-center p-2 border border-continental-gray-4 justify-between ${yaConsumida ? 'opacity-70' : ''}`}
                            >
                                <p>
                                    {format(parseDateToLocal(day.date), "EEE, d 'de' MMMM 'de' yyyy", {
                                        locale: es,
                                    })}
                                    {yaConsumida && (
                                        <span className="ml-2 text-xs text-gray-500">(ya consumida)</span>
                                    )}
                                </p>

                                {handleRemoveDay && !isViewMode ? (
                                    <Trash
                                        onClick={() => handleRemoveDay(day.date)}
                                        color="#FF0000"
                                        size={20}
                                        className="cursor-pointer"
                                    />
                                ) : period === PeriodOptions.reprogramming && isDelegadoSindicato && handleEdit && !yaConsumida ? (
                                    <CalendarSync
                                        onClick={() => handleEdit(day.date)}
                                        className="cursor-pointer"
                                        color="#004eaf"
                                        size={20}
                                    />
                                ) : null}
                            </div>
                        );
                    })}
                </div>

                {workedHoliday && workedHoliday?.length > 0 ? (
                    <div>
                        <h1 className="text-xl font-semibold">Vacaciones/Festivos Trabajados </h1>
                        <div className="h-2 w-full bg-continental-green-light "></div>
                        <div className="flex flex-col gap-2">
                            {workedHoliday.map((day) => (
                                <div
                                    key={day.date}
                                    className="flex items-center justify-center p-2 border border-continental-gray-4"
                                >
                                    <p>
                                        {format(parseDateToLocal(day.date), "EEE, d 'de' MMMM 'de' yyyy", {
                                            locale: es,
                                        })}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : null}
            </div>

            {onSubmit ? (
                <div className="flex flex-col gap-2 mt-auto">
                    <p>Revisa tu selección antes de continuar</p>

                    <Button
                        onClick={() => onSubmit()}
                        className={`w-fit ml-auto ${availableDays === selectedDays.length
                                ? "cursor-pointer"
                                : "cursor-not-allowed"
                            }`}
                        variant="continental"
                        size="lg"
                        disabled={availableDays !== selectedDays.length || loading}
                    >
                        Continuar
                    </Button>
                </div>
            ) : null}
        </div>
    );
};