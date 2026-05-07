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

// Componente personalizado para las casillas del día
const CustomDateCellWrapper = ({
  children,
  value,
  schedule,
    selectedDays,
    excepciones, // ✅ AÑADIR
    groupId,
}: {
  children: React.ReactNode;
  value: Date;
  schedule: EventType[];
  selectedDays?: {date: string}[];
  excepciones?: ExcepcionPorcentaje[]; // ✅ AÑADIR
  groupId?: number;
}) => {
  const eventData = schedule.find(
    (event) => datesEqual(event.day, value)
  );

  // Verificar si este día está seleccionado para vacaciones
  const isSelectedForVacation = selectedDays?.some(
    (selectedDay) => selectedDay.date === value.toDateString()
  );

  let className = "relative custom-date-cell-wrapper";

  // Si está seleccionado para vacaciones, aplicar el estilo de holiday-day
  if (isSelectedForVacation) {
      //className += " holiday-boss-day";
      className += " holiday-day";
  } else if (eventData) {
    switch (eventData.eventType) {
      case "work":
        className += " work-day";
        break;
      case "rest":
        className += " rest-day";
        break;
      case "holiday":
        className += " holiday-day";
        break;
      case "holiday-boss":
        className += " holiday-boss-day";
        break;
      case "not-work":
        className += " not-work-day";
        break;
      case "inability":
        className += " inability-day";
        break;
      default:
        break;
    }
  }

  return (
    <div className={className}>
      {/* Turno bubble (hide if holiday or holiday-boss because we'll render next to the sun) */}
      {eventData?.turno && eventData.eventType !== 'holiday' && eventData.eventType !== 'holiday-boss' && (
        <span className="text-center m-2 text-2xl border-2 border-continental-yellow rounded-full w-6 h-6 flex items-center justify-center font-bold p-3 text-continental-yellow">
          {eventData.turno}
        </span>
      )}

      {/* Descanso marker */}
      {eventData && eventData.eventType === "rest" && (
        <span className="text-center m-2 text-xl border-2 border-continental-yellow rounded-full w-6 h-6 flex items-center justify-center font-bold p-3 text-continental-yellow">
          D
        </span>
      )}

      {/* Sun icon centered at top with turno badge when holiday or holiday-boss or when selected for vacation */}
      {( (eventData && (eventData.eventType === "holiday" || eventData.eventType === "holiday-boss")) || isSelectedForVacation) && (
        <div className="absolute top-1 left-1/4 transform -translate-x-1/2 flex items-center space-x-1">
          {eventData?.turno && (
            <span className="ml-1 text-2xl  text-yellow-400 border-2 border-continental-yellow rounded-full w-7 h-7 flex items-center justify-center font-bold">
              {eventData.turno}
            </span>
          )}
          <Sun className="text-white" />
                  {/* Indicador de tiempo extra */}
                  {excepciones.length > 0 && (
                      <OvertimeIndicator
                          fecha={value.toISOString().split('T')[0]}
                          excepciones={excepciones}
                          grupoId={groupId}
                      />
                  )}
        </div>
      )}

      {children}
    </div>
  );
};
 

const CalendarComponent = ({ month, onMonthChange, onSelectDay, onRemoveDay, selectedDays, isViewMode, groupId, userId, excepciones = [], refreshKey }: { month?: number, onMonthChange?: (month: number) => void, onSelectDay?: (day: string) => void, onRemoveDay?: (day: string) => void, selectedDays?: { date: string }[], isViewMode?: boolean, groupId?: number, userId?: number, excepciones?: ExcepcionPorcentaje[]; refreshKey?: number }) => {
  // Obtener configuración de vacaciones para determinar el año
  const { currentPeriod } = useVacationConfig();
  
  // Calcular el año apropiado basado en el período actual
  const currentYear = new Date().getFullYear();
  const targetYear = currentYear;
  
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
                    groupId }),
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
      <CalendarLegend />
    </div>
  );
};

export default CalendarComponent;

export const CalendarLegend = () => {
  return (
    <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <h3 className="text-lg font-semibold mb-4 text-gray-800">Leyenda del Calendario</h3>
        <div className="flex flex-col gap-2">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 rounded border" style={{ backgroundColor: 'var(--color-continental-white)' }}></div>
            <span className="border-2 border-yellow-500 rounded-full w-6 h-6 flex items-center justify-center font-bold text-yellow-500 text-xs">1</span>
              <span className="text-sm">Turno de trabajo (1, 2, 3)</span>
            <span className="text-sm font-medium">Trabajo</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: 'var(--color-continental-gray-3)' }}>
            </div>
              <span className="border-2 border-yellow-500 rounded-full w-6 h-6 flex items-center justify-center font-bold text-yellow-500 text-xs">D</span>
            <span className="text-sm font-medium">Descanso</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: 'var(--color-continental-yellow)' }}></div>
            <Sun className="w-4 h-4 text-yellow-500" />
            <span className="text-sm font-medium">Vacaciones</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: 'var(--color-continental-blue-light)' }}></div>
            <Sun className="w-4 h-4 text-yellow-500" />
            <span className="text-sm font-medium">Vacaciones asignadas por la empresa</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: 'var(--continental-gray-2)' }}></div>
            <span className="text-sm font-medium">Días inhábiles o no disponibles</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: 'var(--color-continental-green-dark)' }}></div>
            <span className="text-sm font-medium">Incapacidad</span>
          </div>
        </div>

      </div>
  )
}

