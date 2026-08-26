import { Calendar, dateFnsLocalizer, Views, type SlotInfo } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { es } from "date-fns/locale";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "./Calendar.css"; // Importar estilos personalizados
import { useEffect, useState, useRef } from "react";
import { useCalendar, type EventType } from "./useCalendar";
import { Sun } from "lucide-react";
import { toast } from "sonner";
import { useVacationConfig } from "@/hooks/useVacationConfig";
import { OvertimeIndicator } from '../Dashboard-Area/OvertimeIndicator';
import type { ExcepcionPorcentaje } from '@/interfaces/Api.interface';
import { getSAPEntry, SAP_NOMENCLATURA, type SAPEntry, type SAPCodigo } from '@/utils/sapNomenclatura';
import NomenclaturaLegend from './NomenclaturaLegend';

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales: {
    es: es,
  },
});



const messages = {
  allDay: "Todo el día",
  previous: "Anterior",
  next: "Siguiente",
  today: "Hoy",
  month: "Mes",
  week: "Semana",
  day: "Día",
  agenda: "Agenda",
  date: "Fecha",
  time: "Hora",
  event: "Evento",
  noEventsInRange: "No hay eventos en este rango.",
  showMore: (total: number) => `+ Ver más (${total})`,
};

// Función para comparar fechas ignorando la hora
const datesEqual = (date1: Date, date2: Date): boolean => {
  return date1.getFullYear() === date2.getFullYear() &&
         date1.getMonth() === date2.getMonth() &&
         date1.getDate() === date2.getDate();
};

// La nomenclatura SAP vive en @/utils/sapNomenclatura para que Calendar,
// WeeklyRoles y otros componentes compartan la misma fuente de verdad.
// Aquí se usa vía getSAPEntry(tipoIncidencia).

// Componente personalizado para las casillas del día
const CustomDateCellWrapper = ({
  children,
  value,
  schedule,
    selectedDays,
    excepciones, // ✅ AÑADIR
    groupId,
    mostrarTurnos = false,
}: {
  children: React.ReactNode;
  value: Date;
  schedule: EventType[];
  selectedDays?: {date: string}[];
  excepciones?: ExcepcionPorcentaje[]; // ✅ AÑADIR
  groupId?: number;
  // Rotación de turnos (números 1/2/3 y marca D de descanso): es la lectura del
  // rol. Va junto con la nomenclatura SAP, cada una en su esquina — el
  // sindicato pidió ver ambas. Queda apagado por defecto para las vistas que
  // solo reportan incidencias.
  mostrarTurnos?: boolean;
}) => {
  const eventData = schedule.find(
    (event) => datesEqual(event.day, value)
  );

  // Verificar si este día está seleccionado para vacaciones
  const isSelectedForVacation = selectedDays?.some(
    (selectedDay) => selectedDay.date === value.toDateString()
  );

  let className = "relative custom-date-cell-wrapper";
  let inlineStyle: React.CSSProperties | undefined;
  let title: string | undefined;
  // Dos marcas con roles distintos, ambas en nomenclatura SAP y cada una en
  // su esquina para que no se encimen:
  //   turnoChip → a qué turno pertenece el día (1, 2, 3, D). Arriba-izquierda.
  //   sapChip   → qué pasó ese día (V, F, C, E, A, M, P, G, H, O, R, S).
  // El turno se muestra también en días con incidencia: si no, no hay forma
  // de saber en qué turno está la persona cuando tiene vacaciones o permiso.
  let sapChip: SAPEntry | null = null;
  let turnoChip: SAPEntry | null = null;

  if (eventData) {
    if (mostrarTurnos) {
      if (eventData.eventType === 'rest') {
        turnoChip = SAP_NOMENCLATURA['D'];
      } else if (eventData.turno) {
        const codigoTurno = String(eventData.turno) as SAPCodigo;
        turnoChip = SAP_NOMENCLATURA[codigoTurno] ?? null;
      }
    }

    switch (eventData.eventType) {
      case "holiday":
      case "holiday-boss":
        sapChip = getSAPEntry(eventData.tipoIncidencia) ?? SAP_NOMENCLATURA['V'];
        break;
      case "inability":
        sapChip = getSAPEntry(eventData.tipoIncidencia);
        // Incidencia que no pudimos clasificar: gris neutro para que el día
        // no se vea disponible.
        if (!sapChip) className += " inability-day";
        break;
      case "not-work":
        // Sin código SAP y sin sombreado: el gris se confundía con una
        // incidencia. Queda el tooltip con la razón... salvo el día LLENO por
        // el porcentaje del grupo, que sí se tiñe: sin color se veía idéntico a
        // un día abierto y el operador se enteraba hasta el clic (el "los
        // colores de alerta no funcionaron" de la captura 2026).
        title = eventData.razon || "Día no laborable";
        if ((eventData.razon || "").includes("lleno")) className += " full-day";
        break;
      default:
        break;
    }

    // Solo la incidencia pinta el fondo. El descanso ya no se sombrea de gris:
    // lo dice la "D" de la esquina, y el gris se leía como si algo hubiera
    // pasado ese día.
    if (sapChip) {
      inlineStyle = { backgroundColor: sapChip.bg };
      className += " sap-day";
      if (eventData.eventType === 'inability') inlineStyle.cursor = 'not-allowed';
      title = title ?? sapChip.label;
    } else if (eventData.eventType === 'rest' && turnoChip) {
      title = title ?? turnoChip.label;
    }
  }

  // La selección manda sobre el fondo: es feedback de lo que el usuario acaba
  // de marcar, no una nomenclatura.
  if (isSelectedForVacation) {
    className += " holiday-day";
    inlineStyle = undefined;
  }

  return (
    <div className={className} style={inlineStyle} title={title}>
      {/* Turno del día (1, 2, 3, D) — arriba a la izquierda, del mismo tamaño
          que el chip de nomenclatura para que ambos se lean igual de fácil.
          Va en su propia esquina para que se vea aunque el día tenga
          incidencia. */}
      {turnoChip && (
        <span
          className="absolute top-1 left-1 inline-flex items-center justify-center rounded-full w-6 h-6 text-xs font-bold border bg-white z-10"
          style={{ color: turnoChip.fg, borderColor: turnoChip.fg }}
          title={turnoChip.label}
        >
          {turnoChip.codigo}
        </span>
      )}

      {/* Chip de nomenclatura SAP — abajo a la derecha. El número del día lo
          dibuja react-big-calendar arriba a la derecha: con el chip ahí se
          encimaban y no se leía ni la letra ni el día. */}
      {sapChip && (
        <span
          // Fondo blanco: la celda ya está teñida con ese mismo color SAP, y
          // un chip del mismo tono encima se perdía.
          className="absolute bottom-1 right-1 inline-flex items-center justify-center rounded-full w-6 h-6 text-xs font-bold border bg-white"
          style={{ color: sapChip.fg, borderColor: sapChip.fg }}
          title={sapChip.label}
        >
          {sapChip.codigo}
        </span>
      )}

      {/* Día marcado para vacaciones: el sol es el indicador de selección.
          Va arriba al centro, entre el reloj de tiempo extra y el número. */}
      {isSelectedForVacation && (
        <Sun className="absolute top-1 left-1/2 -translate-x-1/2 w-5 h-5 text-continental-black" />
      )}

      {/* Indicador de tiempo extra (se oculta si el día no tiene excepción).
          Baja a la esquina inferior izquierda: la superior izquierda ahora es
          del número de turno. */}
      {excepciones.length > 0 && (
        <OvertimeIndicator
          fecha={value.toISOString().split('T')[0]}
          excepciones={excepciones}
          grupoId={groupId}
          posicionClassName="bottom-1 left-1"
        />
      )}

      {children}
    </div>
  );
};
 

const CalendarComponent = ({ month, onMonthChange, onSelectDay, onRemoveDay, selectedDays, isViewMode, groupId, userId, excepciones = [], refreshKey, mostrarTurnos = false, year }: { month?: number, onMonthChange?: (month: number) => void, onSelectDay?: (day: string) => void, onRemoveDay?: (day: string) => void, selectedDays?: { date: string }[], isViewMode?: boolean, groupId?: number, userId?: number, excepciones?: ExcepcionPorcentaje[]; refreshKey?: number; mostrarTurnos?: boolean; year?: number }) => {
  // Obtener configuración de vacaciones para determinar el año
  const { currentPeriod } = useVacationConfig();
  
  // El año que se dibuja lo decide quien usa el calendario (la captura de la
  // programación anual pasa el año en preparación). Sin ese dato, el año en
  // curso. Antes era SIEMPRE el año en curso: en agosto de 2026 el operador
  // capturaba sus vacaciones de 2027 sobre un grid de 2026, y las fechas
  // guardadas salían con el año equivocado.
  const currentYear = new Date().getFullYear();
  const targetYear = year ?? currentYear;
  
  const {
    schedule,
    fetchEvents,
    handleRangeChange,
    onSelectEvent,
    onNavigate,
    date,
    setDate,
    isLoading: calendarLoading,
  } = useCalendar({groupId: groupId || 1, userId, refreshKey});

  // Ref para evitar bucles infinitos
  const lastSetDateRef = useRef<string>('');
  
  // Establecer la fecha inicial cuando el componente se monta o cuando cambia el mes prop
  useEffect(() => {
    if (month && targetYear) {
      const newDate = new Date(targetYear, month - 1, 1);
      const dateKey = `${targetYear}-${month}`;
      
      // Solo actualizar si es diferente a la última fecha establecida
      if (lastSetDateRef.current !== dateKey) {
        console.log(`📅 Setting calendar to month ${month}: ${newDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}`);
        lastSetDateRef.current = dateKey;
        setDate(newDate);
      }
    } else if (!month && targetYear) {
      // Establecer fecha inicial por defecto si no se proporciona mes
      const currentMonth = new Date().getMonth();
      const defaultDate = new Date(targetYear, currentMonth, 1);
      const dateKey = `${targetYear}-${currentMonth + 1}`;
      
      if (lastSetDateRef.current !== dateKey) {
        console.log(`📅 Setting default calendar to: ${defaultDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}`);
        lastSetDateRef.current = dateKey;
        setDate(defaultDate);
      }
    }
  }, [month, targetYear, setDate, currentPeriod]);

  const handleSelectDay = (slotInfo: SlotInfo) => {
    if (isViewMode) {
      return;
    }
    //validar que sea un dia laboral
    const eventData = schedule.find((event) => datesEqual(event.day, slotInfo.start));
    if (eventData?.eventType === "work") {
      if (selectedDays?.some((d) => d.date === slotInfo.start.toDateString())) {
        onRemoveDay?.(slotInfo.start.toDateString());
      } else {
        onSelectDay?.(slotInfo.start.toDateString());
      }
    } else {
      switch (eventData?.eventType) {
        case "rest":
          toast.error("Dia de descanso")
          break;
        case "not-work":
          toast.error(eventData.razon)
          break;
        case "holiday":
          toast.error("Ya cuentas con vacaciones asignadas este dia")
          break;
        case "holiday-boss":
          toast.error("Ya cuentas con vacaciones asignadas este dia")
          break;
        case "inability":
          toast.error("Ya cuentas con incapacidad asignada este dia")
          break;
        default:
          break;
      }
    }
  };

  // Función personalizada para manejar la navegación y actualizar el mes en el componente padre
  const handleNavigate = (newDate: Date) => {
    const newMonth = newDate.getMonth() + 1; // Convertir a formato 1-12

    // Llamar al onNavigate original para actualizar la fecha interna
    onNavigate(newDate);

    // Actualizar el mes en el componente padre si se proporciona el callback
    if (onMonthChange) {
      onMonthChange(newMonth);
    }
  };

  // Estado para forzar re-render
  const [renderKey, setRenderKey] = useState(0);

  // Ref para evitar múltiples llamadas con la misma fecha
  const lastFetchedDateRef = useRef<string>('');

  // Si el padre incrementa refreshKey, limpiar el ref para forzar refetch.
  useEffect(() => {
    lastFetchedDateRef.current = '';
  }, [refreshKey]);
  
  // Actualizar datos cuando cambie el mes o la fecha del calendario
  useEffect(() => {
    const updateCalendarData = async () => {
      // Usar la fecha actual del calendario (que puede ser de cualquier año)
      const year = date.getFullYear();
      const targetMonth = date.getMonth();
      // refreshKey forma parte del fetchKey para forzar refetch cuando el padre
      // lo incrementa tras una operación (ej. aprobar reprogramación, extender).
      const fetchKey = `${year}-${targetMonth}-${userId}-${groupId}-${refreshKey ?? 0}`;

      // Evitar llamadas duplicadas
      if (lastFetchedDateRef.current === fetchKey) {
        console.log(`⏸️ Skipping duplicate fetch for: ${date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}`);
        return;
      }

      console.log(`🔄 Updating calendar data for: ${date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}`);
      lastFetchedDateRef.current = fetchKey;

      const startOfMonth = new Date(year, targetMonth, 1);
      const endOfMonth = new Date(year, targetMonth + 1, 0);

      try {
        await fetchEvents(startOfMonth, endOfMonth);
      } catch (error) {
        console.error('Error fetching events:', error);
        // Reset en caso de error para permitir retry
        lastFetchedDateRef.current = '';
      }
    };

    // Solo actualizar si tenemos una fecha válida y userId
    if (date && userId && !calendarLoading) {
      updateCalendarData();
    }
  }, [date, fetchEvents, groupId, userId, calendarLoading, refreshKey]);

  // Forzar re-render cuando cambie el schedule
  useEffect(() => {
    setRenderKey(prev => prev + 1);
  }, [schedule]);

  return (
    <div className="relative" style={{ height: "500px", width: "100%" }}>
      {calendarLoading && (
        <>
        <div className="absolute inset-0 z-50 bg-white/50 backdrop-blur-sm flex flex-col justify-center items-center rounded-lg">
          <div className="flex flex-col items-center space-y-4">
            {/* Spinner animado */}
            <div className="relative">
              <div className="w-12 h-12 border-4 border-continental-gray-3 border-t-continental-yellow rounded-full animate-spin"></div>
              <div className="absolute inset-0 w-12 h-12 border-4 border-transparent border-r-continental-blue-light rounded-full animate-spin" style={{animationDirection: 'reverse', animationDuration: '1.5s'}}></div>
            </div>

            {/* Texto de carga */}
            <div className="text-center">
              <h3 className="text-lg font-semibold text-gray-800 mb-1">Cargando calendario</h3>
              <p className="text-sm text-gray-600">Obteniendo datos del mes...</p>
            </div>

            {/* Barra de progreso animada */}
            <div className="w-48 h-1 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-continental-yellow to-continental-blue-light rounded-full animate-pulse"></div>
            </div>
          </div>
        </div>
        <Calendar className="absolute inset-0 z-10" key={"placeholder-calendar"} localizer={localizer}/>
        </>
      )}
      <Calendar
        key={`calendar-${month}-${renderKey}`}
        localizer={localizer}
        messages={messages}
        culture="es"
        onNavigate={handleNavigate}
        date={date}
        onSelectEvent={onSelectEvent}
        onSelectSlot={handleSelectDay}
        onRangeChange={handleRangeChange}
        selectable
        views={[Views.MONTH]}
        defaultView={Views.MONTH}
        style={{ opacity: calendarLoading ? 0.5 : 1 }}
        components={{
          dateCellWrapper: (props) =>
                CustomDateCellWrapper({
                    ...props, schedule, selectedDays, excepciones, // ✅ AÑADIR
                    groupId, mostrarTurnos }),
          //   month: {
          //     dateHeader: (props) => CustomDateHeader({...props, schedule}),
          //   },
        }}
        formats={{
          dateFormat: "d",
          dayFormat: (date, culture, localizer) =>
            localizer
              ? localizer.format(date, "EEEE", culture)
              : format(date, "EEEE", { locale: es }),
          monthHeaderFormat: (date, culture, localizer) =>
            localizer
              ? localizer.format(date, "MMMM yyyy", culture)
              : format(date, "MMMM yyyy", { locale: es }),
          dayHeaderFormat: (date, culture, localizer) =>
            localizer
              ? localizer.format(date, "EEEE d/MM", culture)
              : format(date, "EEEE d/MM", { locale: es }),
          dayRangeHeaderFormat: ({ start, end }, culture, localizer) =>
            localizer
              ? `${localizer.format(
                  start,
                  "d MMM",
                  culture
                )} - ${localizer.format(end, "d MMM yyyy", culture)}`
              : `${format(start, "d MMM", { locale: es })} - ${format(
                  end,
                  "d MMM yyyy",
                  { locale: es }
                )}`,
          agendaDateFormat: (date, culture, localizer) =>
            localizer
              ? localizer.format(date, "EEEE d/MM", culture)
              : format(date, "EEEE d/MM", { locale: es }),
          agendaTimeFormat: (date, culture, localizer) =>
            localizer
              ? localizer.format(date, "HH:mm", culture)
              : format(date, "HH:mm"),
          agendaTimeRangeFormat: ({ start, end }, culture, localizer) =>
            localizer
              ? `${localizer.format(
                  start,
                  "HH:mm",
                  culture
                )} - ${localizer.format(end, "HH:mm", culture)}`
              : `${format(start, "HH:mm")} - ${format(end, "HH:mm")}`,
          timeGutterFormat: (date, culture, localizer) =>
            localizer
              ? localizer.format(date, "HH:mm", culture)
              : format(date, "HH:mm"),
        }}
      />
      <CalendarLegend incluirTurnos={mostrarTurnos} />
    </div>
  );
};

export default CalendarComponent;

export const CalendarLegend = ({ incluirTurnos = true }: { incluirTurnos?: boolean }) => {
  return (
    <div className="mt-6 p-4 bg-gray-50 rounded-lg">
      <h3 className="text-lg font-semibold mb-4 text-gray-800">Nomenclatura SAP</h3>
      <NomenclaturaLegend variant="grouped" incluirTurnos={incluirTurnos} />
    </div>
  )
}

