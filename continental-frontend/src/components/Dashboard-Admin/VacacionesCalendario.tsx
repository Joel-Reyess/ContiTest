import React, { useState, useMemo, useRef } from "react";
import { CalendarDays, Trash2 } from "lucide-react";
import { diasInhabilesService, type CreateDiaInhabilRequest } from "@/services/diasInhabilesService";
import { useDiasInhabiles } from "@/hooks/useDiasInhabiles";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RotacionesProgramadasPanel } from "./RotacionesProgramadasPanel";

interface PeriodDate {
  id: number;
  date: string;
  startDate: string;
  endDate: string;
}

interface HolidayPeriod {
  details: string;
  type: number;
  startDate: string;
  endDate: string;
  ids: number[];
  dates: PeriodDate[];
}

export type NotificationType = 'success' | 'info' | 'warning' | 'error';

export interface VacacionesCalendarioProps {
  onNotification?: (type: NotificationType, title: string, message?: string, duration?: number) => void;
}

export const VacacionesCalendario: React.FC<VacacionesCalendarioProps> = ({ 
  onNotification = () => {} 
}) => {
  const [motivoDescanso, setMotivoDescanso] = useState<string>('');
  const [fechaInicioInhabil, setFechaInicioInhabil] = useState<string>('');
  const [fechaFinInhabil, setFechaFinInhabil] = useState<string>('');
  const [tipoDescanso, setTipoDescanso] = useState<string>('');
  const [isCreatingDiasInhabiles, setIsCreatingDiasInhabiles] = useState(false);
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedYear, setSelectedYear] = useState<number | 'all'>('all');
  const [selectedStartDate, setSelectedStartDate] = useState<Date | null>(null);
  const [selectedEndDate, setSelectedEndDate] = useState<Date | null>(null);
  const { diasInhabiles, loading: loadingDiasInhabiles, refetch: refetchDiasInhabiles } = useDiasInhabiles();
  
  // Helper function to parse date in local timezone
  const parseLocalDate = (dateString: string): Date => {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  // Helper function to format date for API (YYYY-MM-DD format as expected by backend)
  const formatDateForAPI = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Helper function to format date for input (YYYY-MM-DD)
  const formatDateForInput = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Group holidays by year and then by period
  const groupedHolidays = useMemo(() => {
    const result: Record<number, HolidayPeriod[]> = {};
    
    // Debug: Log all incoming dates
    console.log('All holidays before processing:', diasInhabiles.map(d => {
      const localDate = parseLocalDate(d.fecha);
      return {
        id: d.id,
        fecha: d.fecha,
        fechaInicial: d.fechaInicial,
        fechaFinal: d.fechaFinal,
        detalles: d.detalles,
        tipoActividadDelDia: d.tipoActividadDelDia,
        calculatedYear: localDate.getFullYear(),
        localDate: localDate.toString()
      };
    }));
    
    // First, sort all holidays by date
    const sortedHolidays = [...diasInhabiles].sort((a, b) => 
      parseLocalDate(a.fecha).getTime() - parseLocalDate(b.fecha).getTime()
    );

    // Group by year
    const byYear: Record<number, typeof diasInhabiles> = {};
    sortedHolidays.forEach(holiday => {
      const fecha = parseLocalDate(holiday.fecha);
      const year = fecha.getFullYear();
      if (!byYear[year]) {
        byYear[year] = [];
      }
      byYear[year].push(holiday);
    });

    console.log('Holidays grouped by year:', Object.entries(byYear).map(([year, holidays]) => ({
      year,
      holidays: holidays.map(h => ({
        id: h.id,
        fecha: h.fecha,
        detalles: h.detalles,
        parsedYear: new Date(h.fecha).getFullYear()
      }))
    })));

    Object.entries(byYear).forEach(([year, holidays]) => {
      const yearNum = Number(year);
      result[yearNum] = [];
      
      // Group by holiday type and details
      const groups: Record<string, typeof holidays> = {};
      
      holidays.forEach(holiday => {
        const key = `${holiday.detalles}-${holiday.tipoActividadDelDia}`;
        if (!groups[key]) {
          groups[key] = [];
        }
        groups[key].push(holiday);
      });

      // Create periods for each group
      Object.values(groups).forEach(group => {
        if (group.length === 0) return;
        
        // Sort group by date
        group.sort((a, b) => parseLocalDate(a.fecha).getTime() - parseLocalDate(b.fecha).getTime());
        
        let currentPeriod: HolidayPeriod | null = null;
        
        group.forEach(holiday => {
          if (!currentPeriod) {
            // Start new period
            currentPeriod = {
              details: holiday.detalles,
              type: holiday.tipoActividadDelDia,
              startDate: holiday.fecha,
              endDate: holiday.fecha,
              ids: [holiday.id],
              dates: [{
                id: holiday.id,
                date: holiday.fecha,
                startDate: holiday.fechaInicial,
                endDate: holiday.fechaFinal
              }]
            };
          } else {
            const lastDate = parseLocalDate(currentPeriod.endDate);
            const currentDate = parseLocalDate(holiday.fecha);
            const nextDay = new Date(lastDate);
            nextDay.setDate(nextDay.getDate() + 1);
            
            if (currentDate.getTime() === nextDay.getTime() || 
                currentDate.getTime() === lastDate.getTime()) {
              // Extend current period
              currentPeriod.endDate = holiday.fecha;
              currentPeriod.ids.push(holiday.id);
              currentPeriod.dates.push({
                id: holiday.id,
                date: holiday.fecha,
                startDate: holiday.fechaInicial,
                endDate: holiday.fechaFinal
              });
            } else {
              // End current period and start new one
              result[yearNum].push(currentPeriod);
              currentPeriod = {
                details: holiday.detalles,
                type: holiday.tipoActividadDelDia,
                startDate: holiday.fecha,
                endDate: holiday.fecha,
                ids: [holiday.id],
                dates: [{
                  id: holiday.id,
                  date: holiday.fecha,
                  startDate: holiday.fechaInicial,
                  endDate: holiday.fechaFinal
                }]
              };
            }
          }
        });
        
        if (currentPeriod) {
          result[yearNum].push(currentPeriod);
        }
      });
      
      // Sort periods within year by start date
      result[yearNum].sort((a, b) => 
        parseLocalDate(a.startDate).getTime() - parseLocalDate(b.startDate).getTime()
      );
    });
    
    return result;
  }, [diasInhabiles]);
  
  // Get available years from grouped holidays (only years with actual data)
  const availableYears = useMemo(() => {
    return Object.keys(groupedHolidays)
      .map(Number)
      .sort((a, b) => b - a); // Descending order
  }, [groupedHolidays]);

  // Filter holidays by selected year
  const filteredHolidays = useMemo(() => {
    if (selectedYear === 'all') {
      // Get all holidays from all years
      return groupedHolidays;
    }
    // Get holidays only for the selected year
    return { [selectedYear]: groupedHolidays[selectedYear] || [] };
  }, [groupedHolidays, selectedYear]);
  
  // Group holidays by year for display
  const holidaysByYear = useMemo(() => {
    const result: Record<string, HolidayPeriod[]> = {};
    Object.entries(filteredHolidays).forEach(([year, periods]) => {
      result[year] = (periods as HolidayPeriod[]).sort((a, b) => 
        parseLocalDate(a.startDate).getTime() - parseLocalDate(b.startDate).getTime()
      );
    });
    return result;
  }, [filteredHolidays]);

  const handleCancel = () => {
    setMotivoDescanso('');
    setFechaInicioInhabil('');
    setFechaFinInhabil('');
    setTipoDescanso('');
    setSelectedStartDate(null);
    setSelectedEndDate(null);
  };

  const handleCreateDiasInhabiles = async () => {
    // fechaFinInhabil is optional now: only require start, type and motivo
    if (!fechaInicioInhabil || !tipoDescanso || !motivoDescanso) {
      onNotification?.('error', 'Error', 'Por favor completa los campos obligatorios (fecha inicio, tipo y motivo)');
      return;
    }

    setIsCreatingDiasInhabiles(true);

    try {
      const startDate = parseLocalDate(fechaInicioInhabil);
      // If end date is not provided, default to startDate (single day)
      const maybeEndDate = fechaFinInhabil ? parseLocalDate(fechaFinInhabil) : startDate;

      // Ensure we iterate from the earlier date to the later date
      let start = startDate;
      let end = maybeEndDate;
      if (end.getTime() < start.getTime()) {
        // swap
        const tmp = start;
        start = end;
        end = tmp;
      }

      // Create array of dates between start and end date (inclusive)
      const dates: string[] = [];
      const currentDate = new Date(start);

      while (currentDate <= end) {
        dates.push(formatDateForAPI(currentDate));
        currentDate.setDate(currentDate.getDate() + 1);
      }

      // Create each day as a separate holiday
      const requests = dates.map(date => {
        const request: CreateDiaInhabilRequest = {
          fechaInicial: date,
          fechaFinal: date,
          detalles: motivoDescanso,
          tipoActividadDelDia: parseInt(tipoDescanso)
        };
        return diasInhabilesService.createDiasInhabiles(request);
      });

      await Promise.all(requests);

      onNotification('success', 'Éxito', 'Días inhábiles creados correctamente');
      refetchDiasInhabiles();
      handleCancel();
    } catch (error) {
      console.error('Error creating dias inhabiles:', error);
      onNotification('error', 'Error', 'No se pudieron crear los días inhábiles');
    } finally {
      setIsCreatingDiasInhabiles(false);
    }
  };

  // Refs to programmatically open native date picker when clicking the label
  const startInputRef = useRef<HTMLInputElement | null>(null);
  const endInputRef = useRef<HTMLInputElement | null>(null);

  const handleDeletePeriod = async (period: HolidayPeriod) => {
    if (!confirm(`¿Estás seguro de eliminar este período de ${period.ids.length} día(s)?`)) {
      return;
    }
    
    try {
      await Promise.all(period.ids.map(id => 
        diasInhabilesService.deleteDiaInhabil(id)
      ));
      toast.success(`Se eliminaron ${period.ids.length} día(s) del período`);
      refetchDiasInhabiles();
    } catch (error) {
      console.error('Error deleting period:', error);
      toast.error('Error al eliminar el período');
    }
  };

  // Calendar utility functions
  const getMonthName = (date: Date): string => {
    return date.toLocaleString('es-MX', { month: 'long' });
  };

  const getDaysInMonth = (date: Date): number => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date): number => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const isDateSelected = (day: number): boolean => {
    if (!selectedStartDate) return false;
    const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    return date.getTime() === selectedStartDate.getTime() || 
           (selectedEndDate ? date.getTime() === selectedEndDate.getTime() : false);
  };

  const isDateInRange = (day: number): boolean => {
    if (!selectedStartDate || !selectedEndDate) return false;
    const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    return date > selectedStartDate && date < selectedEndDate;
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      if (direction === 'prev') {
        newDate.setMonth(prev.getMonth() - 1);
      } else {
        newDate.setMonth(prev.getMonth() + 1);
      }
      return newDate;
    });
  };

  // Format date range for display - used in the holiday list
  const formatDateRange = (startDate: string, endDate: string): string => {
    const start = parseLocalDate(startDate);
    const end = parseLocalDate(endDate);
    
    if (start.getTime() === end.getTime()) {
      // Same day
      return start.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
    } else if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
      // Same month, different days
      return `${start.getDate()}-${end.getDate()} ${start.toLocaleDateString('es-MX', { month: 'short' })}`;
    } else {
      // Different months
      return `${start.getDate()} ${start.toLocaleDateString('es-MX', { month: 'short' })} - ${end.getDate()} ${end.toLocaleDateString('es-MX', { month: 'short' })}`;
    }
  };
  
  
  // Handle date selection
  const handleDateClick = (day: number) => {
    const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    if (!selectedStartDate || (selectedStartDate && selectedEndDate)) {
      // First selection or reset selection
      setSelectedStartDate(date);
      setSelectedEndDate(null);
      setFechaInicioInhabil(formatDateForInput(date));
      setFechaFinInhabil('');
    } else if (selectedStartDate && !selectedEndDate) {
      // Second selection
      if (date >= selectedStartDate) {
        setSelectedEndDate(date);
        setFechaFinInhabil(formatDateForInput(date));
      } else {
        // If second date is earlier, swap them
        setSelectedEndDate(selectedStartDate);
        setSelectedStartDate(date);
        setFechaInicioInhabil(formatDateForInput(date));
        setFechaFinInhabil(formatDateForInput(selectedStartDate));
      }
    }
  };
  
  // Handle input date changes
  const handleInputDateChange = (type: 'start' | 'end', value: string) => {
    if (type === 'start') {
      setFechaInicioInhabil(value);
      const date = value ? parseLocalDate(value) : null;
      setSelectedStartDate(date);
      if (date && selectedEndDate && date > selectedEndDate) {
        setSelectedEndDate(null);
        setFechaFinInhabil('');
      }
    } else {
      setFechaFinInhabil(value);
      setSelectedEndDate(value ? parseLocalDate(value) : null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Título principal */}
      <div className="text-left">
        {/* ... */}
        <h2 className="text-lg font-bold text-continental-black">
          Selecciona un día o periodo inhábil para el calendario general.
        </h2>
      </div>

      {/* Input de motivo de descanso */}
      <div className="space-y-2">
        <Label htmlFor="motivoDescanso" className="text-sm font-medium text-continental-gray-1">
          Motivo de descanso
        </Label>
        <Input
          id="motivoDescanso"
          type="text"
          placeholder="Vacaciones Navidad"
          value={motivoDescanso}
          onChange={(e) => setMotivoDescanso(e.target.value)}
          className="w-full"
        />
      </div>

      {/* Input de tipo de descanso */}
      <div className="space-y-2">
        <Label htmlFor="tipoDescanso" className="text-sm font-medium text-continental-gray-1">
          Tipo de descanso
        </Label>
        <Select
          value={tipoDescanso}
          onValueChange={(value) => setTipoDescanso(value)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Selecciona un tipo de descanso" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">
              Vacaciones por Ley
            </SelectItem>
            <SelectItem value="2">
              Vacaciones por Continental
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Inputs de fechas en 2 columnas */}
      <div className="grid grid-cols-2 gap-4">
        <div className="relative">
          <label
            htmlFor="fechaInicioInhabil"
            className="block"
            onClick={() => {
              const input = startInputRef.current;
              if (!input) return;
              // Prefer showPicker when available
              // @ts-ignore - showPicker is not yet on all input types in TS lib
              if (typeof input.showPicker === 'function') {
                // @ts-ignore
                input.showPicker();
              } else {
                input.focus();
              }
            }}
          >
            <input
              id="fechaInicioInhabil"
              ref={startInputRef}
              type="date"
              value={fechaInicioInhabil}
              onChange={(e) => handleInputDateChange('start', e.target.value)}
              className="w-full h-10 pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-continental-yellow focus:border-continental-yellow"
              style={{
                colorScheme: 'light',
                color: fechaInicioInhabil ? 'inherit' : 'transparent'
              }}
            />
            <CalendarDays className="absolute left-3 top-1/2 transform -translate-y-1/2 text-continental-gray-1" size={16} />
            {!fechaInicioInhabil && (
              <span className="absolute left-10 top-1/2 transform -translate-y-1/2 text-continental-gray-1 pointer-events-none text-sm">
                Fecha de inicio
              </span>
            )}
          </label>
          {/* Ocultar el icono nativo del input date del lado derecho */}
          <style>{`
            input[type="date"]::-webkit-calendar-picker-indicator {
              display: none;
            }
            input[type="date"]::-webkit-inner-spin-button,
            input[type="date"]::-webkit-outer-spin-button {
              display: none;
            }
          `}</style>  
        </div>
        <div className="relative">
          <label
            htmlFor="fechaFinInhabil"
            className="block"
            onClick={() => {
              const input = endInputRef.current;
              if (!input) return;
              // @ts-ignore
              if (typeof input.showPicker === 'function') {
                // @ts-ignore
                input.showPicker();
              } else {
                input.focus();
              }
            }}
          >
            <input
              id="fechaFinInhabil"
              ref={endInputRef}
              type="date"
              value={fechaFinInhabil}
              onChange={(e) => handleInputDateChange('end', e.target.value)}
              className="w-full h-10 pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-continental-yellow focus:border-continental-yellow"
              style={{
                colorScheme: 'light',
                color: fechaFinInhabil ? 'inherit' : 'transparent'
              }}
            />
            <CalendarDays className="absolute left-3 top-1/2 transform -translate-y-1/2 text-continental-gray-1" size={16} />
            {!fechaFinInhabil && (
              <span className="absolute left-10 top-1/2 transform -translate-y-1/2 text-continental-gray-1 pointer-events-none text-sm">
                Fecha de fin (Opcional)
              </span>
            )}
          </label>
        </div>
      </div>

      {/* Contenedor del calendario y días inhábiles */}
      <div className="grid grid-cols-2 gap-8">
        {/* Calendario */}
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            {/* Header del calendario */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-continental-black">
                {getMonthName(currentDate)} {currentDate.getFullYear()}
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={() => navigateMonth('prev')}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <span className="text-continental-gray-1 text-4xl cursor-pointer">‹</span>
                </button>
                <button
                  onClick={() => navigateMonth('next')}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <span className="text-continental-gray-1 text-4xl cursor-pointer">›</span>
                </button>
              </div>
            </div>

            {/* Días de la semana */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map((day) => (
                <div key={day} className="h-8 flex items-center justify-center text-sm font-medium text-continental-gray-1">
                  {day}
                </div>
              ))}
            </div>

            {/* Días del calendario */}
            <div className="grid grid-cols-7 gap-1">
              {/* Espacios vacíos para el primer día del mes */}
              {Array.from({ length: getFirstDayOfMonth(currentDate) }, (_, i) => (
                <div key={`empty-${i}`} className="h-8" />
              ))}

              {/* Días del mes */}
              {Array.from({ length: getDaysInMonth(currentDate) }, (_, i) => {
                const day = i + 1;
                const isSelected = isDateSelected(day);
                const isInRange = isDateInRange(day);

                return (
                  <div key={day} className="h-8 flex items-center justify-center">
                    <button
                      onClick={() => handleDateClick(day)}
                      className={`
                        h-8 w-8 text-sm rounded-full flex items-center justify-center transition-colors
                        ${isSelected
                          ? 'bg-continental-yellow text-white font-medium'
                          : isInRange
                            ? 'text-continental-black'
                            : 'hover:bg-gray-100 text-continental-black'
                        }
                      `}
                      style={isInRange ? { backgroundColor: '#F5EDDB' } : {}}
                    >
                      {day}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Días inhábiles */}
        <div className="space-y-3 border border-gray-200 rounded-lg p-4 bg-white">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-medium text-continental-black">Días inhábiles</h3>
            <Select 
              value={selectedYear.toString()} 
              onValueChange={(value) => setSelectedYear(value === 'all' ? 'all' : Number(value))}
            >
              <SelectTrigger className="w-28 h-8">
                <SelectValue placeholder="Año" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {availableYears.map(year => (
                  <SelectItem key={year} value={year.toString()}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="h-[300px] overflow-y-auto pr-2">
            {loadingDiasInhabiles ? (
              <div className="text-center text-continental-gray-1 py-4">
                Cargando días inhábiles...
              </div>
            ) : Object.keys(holidaysByYear).length > 0 ? (
              <div className="space-y-4">
                {Object.entries(holidaysByYear).map(([year, periods]) => (
                  <div key={year} className="space-y-2">
                    {selectedYear === 'all' && (
                      <h4 className="text-sm font-semibold text-continental-black">
                        {year}
                      </h4>
                    )}
                    {periods.map((period, idx) => (
                      <div key={`${year}-${idx}`} className="flex items-center justify-between p-2 bg-white border border-gray-200 rounded-md">
                        <div className="flex-grow">
                          <div className="font-medium text-sm mb-1">{period.details}</div>
                          <div className="text-xs text-continental-gray-1">
                            {period.type === 1 ? 'Vacaciones por Ley' : 'Vacaciones por Continental'}
                          </div>
                        </div>
                        <div className="flex items-center">
                          <div className="text-right mr-2">
                            <div className="text-sm font-medium">
                              {formatDateRange(period.startDate, period.endDate)}
                            </div>
                            <div className="text-xs text-continental-gray-2">
                              {period.ids.length} día{period.ids.length !== 1 ? 's' : ''}
                            </div>
                          </div>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeletePeriod(period);
                            }}
                            className="text-gray-700 hover:text-black transition-colors p-1"
                            title="Eliminar período"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-continental-gray-1 py-8">
                No hay días inhábiles configurados
              </div>
            )}
            
            {/* Custom scrollbar styling */}
            <style>{`
              .overflow-y-auto::-webkit-scrollbar {
                width: 6px;
              }
              .overflow-y-auto::-webkit-scrollbar-track {
                background: #f1f1f1;
                border-radius: 3px;
              }
              .overflow-y-auto::-webkit-scrollbar-thumb {
                background: #c1c1c1;
                border-radius: 3px;
              }
              .overflow-y-auto::-webkit-scrollbar-thumb:hover {
                background: #a8a8a8;
              }
            `}</style>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-center gap-4 pt-6">
        <Button
          onClick={handleCancel}
          variant="outline"
          className="w-28 h-10 border-continental-black text-continental-black hover:bg-continental-gray-4"
        >
          Cancelar
        </Button>

        <Button
          onClick={handleCreateDiasInhabiles}
          variant="continental"
          className="w-28 h-10"
          disabled={isCreatingDiasInhabiles}
        >
          {isCreatingDiasInhabiles ? "Guardando..." : "Guardar"}
        </Button>
      </div>

      {/* Rotaciones programadas de reglas — feature independiente de la pestaña Reglas de turnos */}
      <RotacionesProgramadasPanel />
    </div>
  );
};

