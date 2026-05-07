import { useCallback, useState, useRef } from "react";
import type { SlotInfo } from "react-big-calendar";
import { CalendarService, type CalendarEntry } from "@/services/calendarService";
import { authService } from '@/services/authService';
import type { AusenciasPorFecha, AusenciasPorGrupo } from '@/interfaces/Api.interface';

export interface EventType {
    day: Date;
    eventType: string;
    turno?: number;
    incidencia?: string;
    tipoIncidencia?: string;
    ausencias?: AusenciasPorGrupo | null;
    razon?: string;
}

export const useCalendar = ({groupId, userId, refreshKey}: {groupId?: number; userId?: number; refreshKey?: number}) => {
    const [schedule, setSchedule] = useState<EventType[]>([]);
    const [range, setRange] = useState<{ start: Date; end: Date } | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const lastFetchKeyRef = useRef<string>('');

    const fetchEvents = useCallback(async (start: Date, end: Date): Promise<void> => {
        // Always fetch by usuario. Use provided userId or fall back to the current logged user.
        const effectiveUserId: number | undefined = typeof userId === 'number'
            ? userId
            : authService.getCurrentUser()?.id;

        if (!effectiveUserId) {
            console.warn('No userId available for calendar fetch. Skipping calendar request.');
            setSchedule([]);
            return;
        }

        const dateKey = `${start.toISOString().split('T')[0]}_${end.toISOString().split('T')[0]}_${effectiveUserId}_${groupId}_${refreshKey ?? 0}`;
        
        // Evitar llamadas duplicadas
        if (isLoading || lastFetchKeyRef.current === dateKey) {
            console.log('⏸️ Skipping fetch - already loading or duplicate key:', dateKey);
            return;
        }

        try {
            setIsLoading(true);
            lastFetchKeyRef.current = dateKey;
            console.log('🔄 Fetching calendar for user:', effectiveUserId, 'groupId:', groupId, 'from', start.toISOString(), 'to', end.toISOString(), 'key:', dateKey);
            
            const entries: CalendarEntry[] = await CalendarService.getCalendarByUsuario(effectiveUserId, start, end);

                // Obtener datos de ausencias si tenemos groupId
                let ausenciasData: AusenciasPorFecha[] | null = null;
                if (groupId) {
                    try {
                        const fechaInicio = start.toISOString().split('T')[0];
                        const fechaFin = end.toISOString().split('T')[0];
                        const response = await CalendarService.calcularAusencias(fechaInicio, fechaFin, groupId);
                        ausenciasData = response as any;
                    } catch (ausenciasError) {
                        console.warn('Error fetching ausencias data:', ausenciasError);
                        // Continuar sin datos de ausencias
                    }
                }

                if (entries && entries.length > 0) {
                    const fechas = entries.map((entry: CalendarEntry) => {
                        const date = new Date(entry.fecha + (entry.fecha.includes('Z') ? '' : 'Z'));
                        const day = new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
                        let eventType: string;
                        let turno: number | undefined;
                        let incidencia: string | undefined;
                        let tipoIncid: string | undefined;
                        let razon: string | undefined;

                        // Parse turno if present (e.g. '1','2','3'), will be undefined for 'D' etc.
                        const parsedTurno = parseInt((entry.turno || '').toString()) || undefined;
                        if (parsedTurno) turno = parsedTurno;

                        // 🔄 Lógica de Prioridades: Vacaciones (V) > Incidencias/Permisos (I) > Días inhábiles (DI) > Turno normal
                        
                        // 1. 🏖️ VACACIONES (Prioridad más alta)
                        if (entry.incidencia === 'V') {
                            // Diferentes tipos de vacaciones según tipoIncidencia
                            const tipoVacacion = (entry as any).tipoIncidencia;
                            if (tipoVacacion === "automatica" ) {
                                razon = "Vacaciones programadas";
                                eventType = "holiday-boss"; // Azul para vacaciones programadas
                            } else if (tipoVacacion === "reprogramacion" || tipoVacacion === "anual") {
                                eventType = "holiday"; // Naranja para reprogramación
                            } else if (tipoVacacion === "festivotrabajado") {
                                eventType = "holiday"; // Naranja para festivos trabajados
                                razon = "Festivo trabajado intercambiado";
                                incidencia = entry.incidencia;
                                tipoIncid = tipoVacacion;
                            } else {
                                eventType = "holiday-boss"; // Default azul
                            }
                            incidencia = entry.incidencia;
                            tipoIncid = tipoVacacion;
                            if (!turno) turno = parsedTurno;
                        } 
                        // 2. 📝 INCIDENCIAS/PERMISOS
                        else if (entry.incidencia === 'I') {
                            const tipoIncidencia = (entry as any).tipoIncidencia;
                            // Diferentes colores según el tipo de incidencia
                            if (tipoIncidencia?.includes("Incapacidad")) {
                                eventType = "inability"; // Gris para incapacidades
                            } else if (tipoIncidencia === "Suspension") {
                                eventType = "inability"; // Gris para suspensiones
                            } else {
                                eventType = "inability"; // Color por defecto para permisos
                            }
                            razon = "Incidencia o permiso";
                            incidencia = entry.incidencia;
                            tipoIncid = tipoIncidencia;
                            if (!turno) turno = parsedTurno;
                        }
                        // 3. 🚫 DÍAS INHÁBILES
                        else if (entry.incidencia === 'DI') {
                            eventType = "not-work";
                            razon = "Día inhábil"
                            incidencia = entry.incidencia;
                            tipoIncid = (entry as any).tipoIncidencia;
                            if (!turno) turno = parsedTurno;
                        }
                        // 4. 📅 DÍAS NORMALES (sin incidencia)
                        else {
                            // Días normales
                            if (entry.tipo === "Descanso") {
                                eventType = "rest";
                                razon = "Descanso";
                            } else if (entry.tipo === "Turno de trabajo") {
                                eventType = "work";
                                turno = parseInt(entry.turno) || undefined;
                            } else {
                                eventType = "not-work";
                            }
                        }

                        // Buscar datos de ausencias para esta fecha
                        const fechaString = day.toISOString().split('T')[0];
                        const ausenciasDelDia = ausenciasData?.find(
                            ausencia => ausencia.fecha === fechaString
                        )?.ausenciasPorGrupo[0] || null;

                        // 🚨 Override del eventType basado en datos de ausencias
                        let finalEventType = eventType;
                        if (ausenciasDelDia) {
                            if (ausenciasDelDia.excedeLimite || !ausenciasDelDia.puedeReservar) {
                                razon = "Día no disponible";
                                // Día con límite excedido - mostrar como inhabilitado si no hay vacacion ese dia
                                finalEventType = ['holiday-boss', 'holiday', 'not-work', 'rest'].includes(finalEventType) ? finalEventType : "not-work" ;
                            } else if (ausenciasDelDia.porcentajeAusencia >= 4.0) {
                                // Día con alta ausencia pero sin exceder límite - mantener tipo original pero será visible
                                // El componente Calendar puede usar esta info para mostrar indicadores visuales
                            }
                        }



                        return {
                            day,
                            eventType: finalEventType,
                            turno,
                            incidencia,
                            tipoIncidencia: tipoIncid,
                            ausencias: ausenciasDelDia,
                            razon
                        };
                    });
                    setSchedule(fechas);
                } else {
                    setSchedule([]);
                }
        } catch (error) {
            console.error('Error fetching calendar events:', error);
            // Reset key en caso de error para permitir retry
            lastFetchKeyRef.current = '';
            // Fallback to mock data for testing
            console.log('Using fallback mock data for testing');
            const mockSchedule = generateMockSchedule(start, end);
            setSchedule(mockSchedule);
        } finally {
            setIsLoading(false);
        }
    }, [groupId, userId, refreshKey]);

    const handleRangeChange = (
        range: Date[] | { start: Date; end: Date },
    ) => {
        const start = Array.isArray(range) ? range[0] : range.start;
        const end = Array.isArray(range) ? range[range.length - 1] : range.end;
        setRange({ start, end });
        // No llamamos fetchEvents aquí para evitar conflictos con el control manual del mes
        // fetchEvents se maneja desde CalendarComponent cuando cambia el mes
    };

    const onSelectEvent = (event: unknown) => {
        console.log("Evento seleccionado:", event);
    };

    const onSelectSlot = (slotInfo: SlotInfo) => {
        console.log("Slot seleccionado:", slotInfo);
    };

    const onNavigate = (newDate: Date) => {
        setDate(newDate);
    };

    const [date, setDate] = useState(new Date());

    // Generar eventos iniciales para el mes actual
    // Este useEffect se comenta para evitar conflictos con el control manual del mes desde CalendarComponent
    // useEffect(() => {
    //     const now = new Date();
    //     const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    //     const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    //
    //     setRange({ start: startOfMonth, end: endOfMonth });
    //     fetchEvents(startOfMonth, endOfMonth);
    // }, [fetchEvents]);

    return {
        schedule,
        range,
        fetchEvents,
        handleRangeChange,
        onSelectEvent,
        onSelectSlot,
        onNavigate,
        date,
        setDate,
        isLoading,
    };
}

// Fallback mock data generator for testing when API is not available
const generateMockSchedule = (start: Date, end: Date): EventType[] => {
    const events: EventType[] = [];
    const currentDate = new Date(start);

    while (currentDate <= end) {
        const dayOfWeek = currentDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
        const dayOfMonth = currentDate.getDate();

        let eventType: string;
        let turno: number | undefined;

        // Simple mock logic
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            // Weekend - rest
            eventType = "rest";
        } else if (dayOfMonth === 15) {
            // Special day - holiday
            eventType = "holiday";
        } else {
            // Work day
            eventType = "work";
            turno = (dayOfWeek % 3) + 1; // Rotate turns 1,2,3
        }

        const event: EventType = {
            day: new Date(currentDate),
            eventType,
            turno
        };

        events.push(event);
        currentDate.setDate(currentDate.getDate() + 1);
    }

    console.log('Generated mock schedule with', events.length, 'events');
    return events;
};