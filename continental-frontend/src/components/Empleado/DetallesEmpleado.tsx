import { ArrowLeft, CalendarPlus2, Download, Key, UserCheck, Edit2, Check, X, Clock, FileText } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Button } from "../ui/button";
import CalendarComponent from "../Calendar/Calendar";
import type { Sindicalizado } from "@/interfaces/Sindicalizado";
import { Summary } from "../Calendar/Summary";
import { getVacacionesAsignadasPorEmpleado } from '@/services/vacacionesService';
import type { VacacionAsignada, VacacionesAsignadasResponse, ExcepcionPorcentaje } from '@/interfaces/Api.interface';
import { PeriodOptions, type Period } from "@/interfaces/Calendar.interface";
import { EditModal, RequestModal } from "../Dashboard-Empleados/MyVacations";
import { ChangePasswordModal } from "./ChangePasswordModal";
import { userService } from "@/services/userService";
import { UserRole } from "@/interfaces/User.interface";
import type { Rol } from "@/interfaces/User.interface";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useVacationConfig } from "@/hooks/useVacationConfig";
import ReasignacionTurnoModal from "../Dashboard-Area/ReasignacionTurnoModal";
import { BloquesReservacionService } from "@/services/bloquesReservacionService";
import { AsignacionManualModal } from "./AsignacionManualModal";
import { eliminarVacacionPorFecha } from '@/services/vacacionesService';
import { generateConstanciaPDFForEmployee } from '@/services/pdfService';
import { excepcionesService } from '@/services/excepcionesService';
import { OvertimeIndicator } from '../Dashboard-Area/OvertimeIndicator';
import { OvertimeExceptionsList } from '../Dashboard-Area/OvertimeExceptionsList';
import { CalendarService } from '@/services/calendarService';
import { OvertimeCalendar } from '../Dashboard-Area/OvertimeCalendar';
import useAuth from '@/hooks/useAuth';
import { RegistrarPermisoModal } from "@/components/Empleado/RegistrarPermisoModal";
export const DetallesEmpleado = ({
}: {
  currentPeriod: Period;
}) => {
  const params = useParams();
  const id = params.id;
  const navigate = useNavigate();
  const location = useLocation();

  const handleBack = () => {
    const from = (location.state as { from?: string } | null)?.from;
    if (from) {
      navigate(from);
      return;
    }
    const parent = location.pathname.replace(/\/\d+\/?$/, "");
    navigate(parent || "/");
  };
  const { config, currentPeriod } = useVacationConfig();
  const anioVigente = config?.anioVigente;
  
  const [month, setMonth] = useState(new Date().getMonth());
  const [sindicalizado, setSindicalizado] = useState<Sindicalizado | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [_, setAssignedDays] = useState<{ date: string }[]>([]);
  const [vacacionesData, setVacacionesData] = useState<VacacionesAsignadasResponse | null>(null);
  const [realAssignedDays, setRealAssignedDays] = useState<{ date: string }[]>([]);
  const [workedHoliday, setWorkedHoliday] = useState<{ date: string }[]>([]);
  const [selectedDays, setSelectedDays] = useState<{ date: string }[]>([]);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedVacation, setSelectedVacation] = useState<VacacionAsignada | null>(null);
  const [groupId, setGroupId] = useState<number | undefined>(undefined);
  
  // Estados para el modal de reasignación
  const [showReasignacionModal, setShowReasignacionModal] = useState(false);
  const [bloqueActualEmpleado, setBloqueActualEmpleado] = useState<any>(null);

  // Estados para edición de máquina
  const [isEditingMaquina, setIsEditingMaquina] = useState(false);
  const [maquinaValue, setMaquinaValue] = useState('');
  const [isUpdatingMaquina, setIsUpdatingMaquina] = useState(false);

  // Estados para asignación manual de vacaciones
    const [showAsignacionModal, setShowAsignacionModal] = useState(false);

    // ✅ NUEVO: Estado para fechas temporales seleccionadas desde el calendario
    const [tempSelectedDates, setTempSelectedDates] = useState<{ date: string }[]>([]);

  const [excepcionesTiempoExtra, setExcepcionesTiempoExtra] = useState<ExcepcionPorcentaje[]>([]);
  const [loadingExcepciones, setLoadingExcepciones] = useState(false);

  const [showPermisoModal, setShowPermisoModal] = useState(false);
  const { hasRole } = useAuth();
  const isLeader = hasRole(UserRole.LEADER);

  const getEmployeeDetails = useCallback(async (id: string) => {
    if (!id) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const userId = parseInt(id);
      if (isNaN(userId)) {
        throw new Error('ID de usuario inválido');
      }
      
      const userData = await userService.getUserById(userId);
      
      // Mapear datos del usuario a la interfaz Sindicalizado existente
      setSindicalizado({
        fechaIngreso: userData.fechaIngreso,
        noNomina: userData.username,
        nombre: userData.fullName,
        grupo: userData.grupo?.rol || 'Sin grupo',
        antiguedad: calculateAntiguedad(userData.fechaIngreso),
        area: userData.area?.nombreGeneral || 'Sin área',
        roles: userData.roles as Rol[] || [],
        maquina: userData?.maquina || 'Sin maquina',
      });

      // Set groupId for calendar
      setGroupId(userData.grupo?.grupoId);

        if (isLeader && userData.grupo?.grupoId && anioVigente) {
            try {
                setLoadingExcepciones(true);
                const startDate = `${anioVigente}-01-01`;
                const endDate = `${anioVigente}-12-31`;
                const excepciones = await excepcionesService.getExcepciones(
                    userData.grupo.grupoId,
                    startDate,
                    endDate
                );
                setExcepcionesTiempoExtra(excepciones);
            } catch (err) {
                console.warn('No se pudieron obtener excepciones de tiempo extra:', err);
            } finally {
                setLoadingExcepciones(false);
            }
        }

      
  // Obtener vacaciones asignadas del endpoint
  const empId = parseInt(id, 10);
  if (!isNaN(empId)) {
        try {
          const resp = await getVacacionesAsignadasPorEmpleado(empId);
          // El servicio ahora retorna directamente VacacionesAsignadasResponse
          const vacs = resp?.vacaciones ?? [];
          
          // Guardar los datos completos para el modal de edición
          setVacacionesData(resp);

          console.log('📅📅📅📅 ', {resp})

          // Separar vacaciones por tipo (igual que en MyVacations.tsx)
          const automaticas = vacs.filter(v => v.tipoVacacion === "Automatica").map(v => ({ date: v.fechaVacacion }));
          const festivosTrabajados = vacs.filter(v => v.tipoVacacion === "FestivoTrabajado").map(v => ({ date: v.fechaVacacion }));
          const reprogramacionesYAnuales = vacs.filter(v => v.tipoVacacion === "Reprogramacion" || v.tipoVacacion === "Anual").map(v => ({ date: v.fechaVacacion }));
          
          console.log('📅 Vacaciones automáticas:', automaticas);
          console.log('🎉 Festivos trabajados:', festivosTrabajados);
          console.log('🔄 Reprogramaciones y anuales:', reprogramacionesYAnuales);
          
          setRealAssignedDays(automaticas);
          setWorkedHoliday(festivosTrabajados);
          setSelectedDays(reprogramacionesYAnuales);

          const assignedFromApi = vacs.map((v: VacacionAsignada) => ({ date: v.fechaVacacion }));
          setAssignedDays(assignedFromApi);
        } catch (err) {
          // Si falla la llamada, mantener valores por defecto
          console.warn('No se pudieron obtener vacaciones asignadas:', err);
          toast.error('No se pudieron obtener vacaciones asignadas');
        }
      }
    } catch (error) {
      console.error('Error fetching employee details:', error);
      setError(error instanceof Error ? error.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, []);


const handleRemoveDay = async (fecha: string) => {
  if (!id) return;

  try {
    const empleadoId = parseInt(id);
    const response = await eliminarVacacionPorFecha(empleadoId, [fecha]);
    console.log("📌 RESPUESTA eliminarVacacionPorFecha:", response);

    if (response.success) {
      toast.success( "Vacación eliminada correctamente");
      setSelectedDays((prev) => prev.filter((d) => d.date !== fecha));
    } else {
      toast.error(response.errorMsg || "No se pudo eliminar la vacación");
    }
  } catch (error) {
    console.error("Error al eliminar vacación:", error);
    toast.error("Ocurrió un error al intentar eliminar la vacación");
  }
};

  const calculateAntiguedad = (createdAt: string): string => {
    const createdDate = new Date(createdAt);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - createdDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 30) {
      return `${diffDays} días`;
    } else if (diffDays < 365) {
      const months = Math.floor(diffDays / 30);
      return `${months} ${months === 1 ? 'mes' : 'meses'}`;
    } else {
      const years = Math.floor(diffDays / 365);
      const remainingMonths = Math.floor((diffDays % 365) / 30);
      return `${years} ${years === 1 ? 'año' : 'años'}${remainingMonths > 0 ? ` y ${remainingMonths} ${remainingMonths === 1 ? 'mes' : 'meses'}` : ''}`;
    }
  };

  const handleGeneratePassword = () => {
    setShowPasswordModal(true);
  };

  const handlePasswordChanged = () => {
    toast.success("Contraseña actualizada correctamente");
  };

  const handleReassignShift = async () => {
    if (!id || !groupId || !anioVigente) {
      toast.error("Información insuficiente para reasignar turno");
      return;
    }

    try {
      // Obtener el bloque actual del empleado
      const empleadoId = parseInt(id);
      const response = await BloquesReservacionService.obtenerBloquesPorEmpleado(empleadoId, anioVigente);
      
      if (response.bloques.length === 0) {
        toast.error("No se encontró un bloque actual para este empleado");
        return;
      }

      // // Encontrar el bloque activo (el que está en curso o próximo)
      // const now = new Date();
      // const bloqueActivo = response.bloques.find(bloque => {
      //   const fechaInicio = new Date(bloque.fechaHoraInicio);
      //   const fechaFin = new Date(bloque.fechaHoraFin);
      //   return fechaInicio <= now && fechaFin >= now; // Bloque en curso
      // }) || response.bloques.find(bloque => {
      //   const fechaInicio = new Date(bloque.fechaHoraInicio);
      //   return fechaInicio > now; // Próximo bloque
      // });

      const bloqueActivo = response.bloques[0];

      if (!bloqueActivo) {
        toast.warning("El bloque de este empleado ya terminó");
      }

      // Configurar datos para el modal
      const bloqueFormateado = {
        bloque: bloqueActivo.numeroBloque,
        id: bloqueActivo.id.toString(),
        fecha: new Date(bloqueActivo.fechaHoraInicio).toLocaleDateString('es-ES'),
        fechaFin: new Date(bloqueActivo.fechaHoraFin).toLocaleDateString('es-ES'),
        horaInicio: new Date(bloqueActivo.fechaHoraInicio).toLocaleTimeString('es-ES', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: false 
        }),
        horaFin: new Date(bloqueActivo.fechaHoraFin).toLocaleTimeString('es-ES', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: false 
        })
      };

      setBloqueActualEmpleado(bloqueFormateado);
      setShowReasignacionModal(true);
    } catch (error) {
      console.error("Error al obtener bloque del empleado:", error);
      toast.error("Error al obtener información del turno actual");
    }
  };

  const handleReasignacionConfirm = async (bloqueDestinoId: number, motivo: string, observaciones?: string) => {
    if (!id || !bloqueActualEmpleado) return;

    try {
      const request = {
        empleadoId: parseInt(id),
        bloqueOrigenId: parseInt(bloqueActualEmpleado.id),
        bloqueDestinoId,
        motivo,
        observacionesAdicionales: observaciones
      };

      const response = await BloquesReservacionService.cambiarEmpleado(request);
      
      if (response.cambioExitoso) {
        toast.success(`Turno reasignado exitosamente para ${response.nombreEmpleado}`);
        
        // Log detallado
        console.log('Empleado reasignado exitosamente:', {
          empleado: response.nombreEmpleado,
          nomina: response.nominaEmpleado,
          bloqueOrigen: `Bloque #${response.bloqueOrigen.numeroBloque}`,
          bloqueDestino: `Bloque #${response.bloqueDestino.numeroBloque}`,
          fechaCambio: response.fechaCambio
        });
      } else {
        throw new Error('El cambio no fue exitoso según la respuesta del servidor');
      }
    } catch (error) {
      console.error('Error al reasignar empleado:', error);
      throw error; // Re-throw para que el modal maneje el error
    }
  };

  const handleReasignacionClose = () => {
    setShowReasignacionModal(false);
    setBloqueActualEmpleado(null);
  };


    const handleDownloadRolesCSV = async () => {
  if (!groupId || !anioVigente) {
    toast.error('No hay información de grupo disponible');
    return;
  }

  try {
    toast.info('Generando reporte de roles del grupo...');
    
    // Obtener todos los empleados del grupo
    const usuarios = await userService.getUsersByGroupId(groupId);
    console.log(`📊 Obteniendo datos de ${usuarios.length} empleados del grupo ${sindicalizado?.grupo}`);

    // Obtener el calendario del grupo completo (más eficiente)
    let groupCalendar: any = null;
    try {
      const startDate = new Date(anioVigente, 0, 1);
      const endDate = new Date(anioVigente, 11, 31);
      groupCalendar = await CalendarService.getCalendarByGroup(groupId, startDate, endDate);
      console.log(`📅 Calendario del grupo obtenido: ${groupCalendar?.calendario?.length || 0} días`);
    } catch (error) {
      console.warn('No se pudo obtener calendario del grupo:', error);
    }

    // Crear CSV con información detallada
    const headers = [
      'Fecha',
      'Día Semana',
      'Nómina',
      'Nombre Completo',
      'Máquina',
      'Turno',
      'Tipo Día',
      'Grupo'
    ];
    const rows = [headers.join(',')];

    // Si tenemos calendario del grupo, úsalo
    if (groupCalendar?.calendario && groupCalendar.calendario.length > 0) {
      const empleadosMap = new Map(usuarios.map(u => [u.username, u]));
      
      groupCalendar.calendario.forEach((dia: any) => {
        const fecha = new Date(dia.fecha + 'T00:00:00');
        const diaSemana = format(fecha, 'EEEE', { locale: es });
        
        // Si el día tiene información específica por empleado, mostrarla
        // Si no, mostrar el turno general del grupo
        usuarios.forEach(empleado => {
          rows.push([
            format(fecha, 'yyyy-MM-dd'),
            `"${diaSemana}"`,
            empleado.username,
            `"${empleado.fullName}"`,
            `"${empleado.maquina || 'Sin máquina'}"`,
            dia.turno || '-',
            dia.tipo || 'Laboral',
            `"${sindicalizado?.grupo || 'Sin grupo'}"`
          ].join(','));
        });
      });

      console.log(`✅ CSV generado con ${rows.length - 1} registros`);
    } else {
      // Fallback: intentar obtener calendario individual de cada empleado
      console.log('⚠️ Usando método individual por empleado...');
      
      const empleadosConRoles = await Promise.all(
        usuarios.map(async (usuario) => {
          try {
            const schedule = await CalendarService.getEmployeeSchedule(
              usuario.id,
              new Date(anioVigente, 0, 1),
              new Date(anioVigente, 11, 31)
            );
            return {
              usuario,
              schedule
            };
          } catch (error) {
            console.error(`Error obteniendo calendario de ${usuario.fullName}:`, error);
            return {
              usuario,
              schedule: []
            };
          }
        })
      );

      // Agrupar por fecha para mostrar todos los empleados juntos
      const fechasMap = new Map<string, any[]>();
      
      empleadosConRoles.forEach(({ usuario, schedule }) => {
        schedule.forEach(dia => {
          const fechaStr = format(dia.day, 'yyyy-MM-dd');
          if (!fechasMap.has(fechaStr)) {
            fechasMap.set(fechaStr, []);
          }
          fechasMap.get(fechaStr)!.push({
            fecha: dia.day,
            usuario,
            turno: dia.turno,
            tipo: dia.eventType
          });
        });
      });

      // Convertir a filas ordenadas por fecha
      const fechasOrdenadas = Array.from(fechasMap.keys()).sort();
      fechasOrdenadas.forEach(fechaStr => {
        const registros = fechasMap.get(fechaStr)!;
        registros.forEach(reg => {
          const diaSemana = format(reg.fecha, 'EEEE', { locale: es });
          rows.push([
            fechaStr,
            `"${diaSemana}"`,
            reg.usuario.username,
            `"${reg.usuario.fullName}"`,
            `"${reg.usuario.maquina || 'Sin máquina'}"`,
            reg.turno || '-',
            reg.tipo,
            `"${sindicalizado?.grupo || 'Sin grupo'}"`
          ].join(','));
        });
      });
    }

    // Generar y descargar el archivo
    const csvContent = '\uFEFF' + rows.join('\n'); // BOM para Excel
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    const fileName = `roles_grupo_${sindicalizado?.grupo?.replace(/\s+/g, '_')}_${anioVigente}.csv`;
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    const totalRegistros = rows.length - 1;
    toast.success(`✅ Descargado: ${totalRegistros.toLocaleString()} registros de ${usuarios.length} empleados`);
    
  } catch (error) {
    console.error('❌ Error descargando CSV:', error);
    toast.error('Error al descargar el reporte de roles');
  }
};
  const handleEdit = (day: string) => {
    // Buscar la vacación correspondiente al día seleccionado
    const vacation = vacacionesData?.vacaciones.find(v => {
      // Convertir ambas fechas al mismo formato para comparar
      const vacationDate = new Date(v.fechaVacacion + 'T00:00:00').toDateString();
      const dayDate = new Date(day + 'T00:00:00').toDateString();
      return vacationDate === dayDate;
    });

    if (vacation) {
      setSelectedVacation(vacation);
      setSelectedDay(day);
      setShowEditModal(true);
    } else {
      toast.error("No se encontró información de la vacación");
    }
  };

  const handleRequestFestiveWorked = () => {
    setShowRequestModal(true);
    };

    // ✅ Funciones para manejar selección de fechas en el calendario
    const handleSelectDay = (day: string) => {
        // Validar que el día no exista ya en tempSelectedDates
        if (tempSelectedDates.some((d) => d.date === day)) {
            toast.info("Esta fecha ya está seleccionada");
            return;
        }

        setTempSelectedDates((prev) => [...prev, { date: day }]);
        toast.success("Fecha agregada para asignación");
    };

    const handleRemoveTempDay = (day: string) => {
        setTempSelectedDates((prev) => prev.filter((d) => d.date !== day));
        toast.info("Fecha removida de la selección");
    };

    // ✅ Función para abrir el modal con las fechas seleccionadas
    const handleOpenAsignacionModal = () => {
        if (tempSelectedDates.length === 0) {
            toast.info("Puedes seleccionar fechas en el calendario antes de abrir el modal, o agregarlas dentro del modal");
        }
        setShowAsignacionModal(true);
    };

  useEffect(() => {
    if (!id) return;
    getEmployeeDetails(id);
  }, [id, getEmployeeDetails]);

  // Funciones para edición de máquina
  const handleEditMaquina = () => {
    setIsEditingMaquina(true);
  };

  const handleCancelEditMaquina = () => {
    setIsEditingMaquina(false);
    setMaquinaValue(sindicalizado?.maquina || 'Sin maquina');
  };
    const handleCreateTestExceptions = async () => {
        if (!groupId || !anioVigente) {
            toast.error('No hay información de grupo disponible');
            return;
        }

        try {
            // Crear 3 excepciones de prueba para los próximos días
            const today = new Date();
            const testDates = [
                new Date(today.getFullYear(), today.getMonth(), today.getDate() + 5),
                new Date(today.getFullYear(), today.getMonth(), today.getDate() + 10),
                new Date(today.getFullYear(), today.getMonth(), today.getDate() + 15)
            ];

            for (const date of testDates) {
                await excepcionesService.createExcepcion({
                    grupoId: groupId,
                    fecha: format(date, 'yyyy-MM-dd'),
                    porcentajeMaximoPermitido: 8.5,
                    motivo: 'Tiempo extra de prueba - Alta demanda de producción'
                });
            }

            toast.success('Excepciones de prueba creadas');

            // Recargar excepciones
            if (id) {
                getEmployeeDetails(id);
            }
        } catch (error) {
            console.error('Error creating test exceptions:', error);
            toast.error('Error al crear excepciones de prueba');
        }
    };
  const handleSaveMaquina = async () => {
    if (!id || !maquinaValue.trim()) {
      toast.error('Por favor ingrese un valor válido para la máquina');
      return;
    }

    setIsUpdatingMaquina(true);
    try {
      const userId = parseInt(id);
      const updatedUser = await userService.updateMaquina(userId, maquinaValue.trim());
      
      // Actualizar el estado local
      setSindicalizado(prev => prev ? { ...prev, maquina: updatedUser.maquina || maquinaValue.trim() } : null);
      
      setIsEditingMaquina(false);
      toast.success('Máquina actualizada correctamente');
    } catch (error) {
      console.error('Error updating maquina:', error);
      toast.error('Error al actualizar la máquina');
    } finally {
      setIsUpdatingMaquina(false);
    }
  };

    const handleDownloadConstancia = async () => {
        if (!sindicalizado || !vacacionesData) {
            toast.error('No hay datos disponibles para generar el reporte');
            return;
        }

        try {
            // ✅ CORRECCIÓN MEJORADA: Normalizar fecha de ingreso
            let fechaIngresoNormalizada = sindicalizado.fechaIngreso || '';

            console.log('📅 Fecha ORIGINAL recibida:', fechaIngresoNormalizada);
            console.log('📅 Tipo de dato:', typeof fechaIngresoNormalizada);

            // Intentar parsear la fecha de diferentes maneras
            let fechaParseada: Date | null = null;

            // Caso 1: Ya está en formato ISO (YYYY-MM-DD o YYYY-MM-DDTHH:mm:ss)
            if (fechaIngresoNormalizada.includes('-')) {
                fechaParseada = new Date(fechaIngresoNormalizada);
            }
            // Caso 2: Formato DD/MM/YYYY
            else if (fechaIngresoNormalizada.includes('/')) {
                const partes = fechaIngresoNormalizada.split('/');
                if (partes.length === 3) {
                    // Detectar si es DD/MM/YYYY o MM/DD/YYYY
                    const [parte1, parte2, parte3] = partes.map(p => parseInt(p, 10));

                    // Si la primera parte es > 12, definitivamente es DD/MM/YYYY
                    if (parte1 > 12) {
                        fechaParseada = new Date(parte3, parte2 - 1, parte1);
                    }
                    // Si la segunda parte es > 12, es MM/DD/YYYY
                    else if (parte2 > 12) {
                        fechaParseada = new Date(parte3, parte1 - 1, parte2);
                    }
                    // Ambiguo: asumir DD/MM/YYYY (formato más común en LATAM)
                    else {
                        fechaParseada = new Date(parte3, parte2 - 1, parte1);
                    }
                }
            }
            // Caso 3: Intentar como timestamp o string genérico
            else {
                fechaParseada = new Date(fechaIngresoNormalizada);
            }

            // Validar que la fecha sea válida
            if (!fechaParseada || isNaN(fechaParseada.getTime())) {
                console.error('❌ Fecha inválida:', fechaIngresoNormalizada);
                toast.error('La fecha de ingreso del empleado no es válida');
                return;
            }

            // Convertir a formato YYYY-MM-DD
            const year = fechaParseada.getFullYear();
            const month = String(fechaParseada.getMonth() + 1).padStart(2, '0');
            const day = String(fechaParseada.getDate()).padStart(2, '0');
            fechaIngresoNormalizada = `${year}-${month}-${day}`;

            console.log('📅 Fecha NORMALIZADA:', fechaIngresoNormalizada);
            console.log('📅 Año:', year, 'Mes:', month, 'Día:', day);

            await generateConstanciaPDFForEmployee({
                empleadoData: {
                    nomina: sindicalizado.noNomina || '',
                    nombre: sindicalizado.nombre || '',
                    fechaIngreso: fechaIngresoNormalizada,
                    area: sindicalizado.area || '',
                    grupo: sindicalizado.grupo || ''
                },
                vacacionesData: {
                    diasSeleccionados: selectedDays,
                    diasAsignados: realAssignedDays,
                    vacaciones: vacacionesData.vacaciones
                },
                anioVigente: anioVigente || new Date().getFullYear()
            });
            toast.success('PDF de constancia generado exitosamente');
        } catch (error) {
            console.error('Error generating PDF:', error);
            toast.error('Error al generar el PDF de constancia');
        }
    };


  // Vista de empleado individual
  if (loading) {
    return (
      <div className="p-6 bg-white min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg text-continental-gray-1">Cargando datos del empleado...</div>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="p-6 bg-white min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-lg text-red-600">Error: {error}</div>
          <Button onClick={handleBack} variant="outline">
            <ArrowLeft size={16} className="mr-2" />
            Regresar
          </Button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="p-6 bg-white min-h-screen">
      <div className="max-w-7xl mx-auto w-full space-y-6">
        {/* Header con información del empleado y botones */}
        <div className="flex justify-between items-start">
          {/* Lado izquierdo - Información del empleado */}
          <div className="space-y-2">
            {/* 1. Botón regresar */}
            <button
              onClick={handleBack}
              className="flex items-center gap-2 text-continental-black hover:text-continental-blue-dark transition-colors"
            >
              <ArrowLeft size={20} />
              <span className="text-base">Regresar</span>
            </button>

            {/* 2. Número de nómina */}
            <div className="text-[20px] font-bold text-continental-black">
              {sindicalizado?.noNomina}
            </div>

            {/* 3. Nombre */}
            <div className="text-[16px] font-medium text-continental-black">
              {sindicalizado?.nombre}
            </div>

            {/* 4. Grupo */}
            <div className="text-[16px] font-medium text-continental-black">
              Fecha de Ingreso: {sindicalizado?.fechaIngreso ? format(new Date(sindicalizado.fechaIngreso), 'dd \'de\' MMMM \'de\' yyyy', { locale: es }) : 'No disponible'}
            </div>

            {/* 5. Antigüedad */}
            <div className="text-[16px] font-medium text-continental-black">
              Antigüedad: {sindicalizado?.antiguedad}
            </div>

            {/* 6. Líder sindical */}
            {
              sindicalizado?.roles?.some(role => role.abreviation === 'Del') || sindicalizado?.area.includes('Sindicato') && (
                <div className="text-[16px] font-bold text-continental-black">
                  Comité sindical
                </div>
              )
            }

            {/* 7. Máquina */}
            <div className="flex items-center gap-2">
              {isEditingMaquina ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={maquinaValue}
                    onChange={(e) => setMaquinaValue(e.target.value)}
                    className="text-[16px] font-medium text-continental-black border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-continental-blue-dark"
                    placeholder="Ingrese máquina"
                    disabled={isUpdatingMaquina}
                  />
                  <button
                    onClick={handleSaveMaquina}
                    disabled={isUpdatingMaquina}
                    className="text-green-600 hover:text-green-700 disabled:opacity-50"
                    title="Guardar"
                  >
                    <Check size={16} />
                  </button>
                  <button
                    onClick={handleCancelEditMaquina}
                    disabled={isUpdatingMaquina}
                    className="text-red-600 hover:text-red-700 disabled:opacity-50"
                    title="Cancelar"
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-[16px] font-medium text-continental-black">
                    {sindicalizado?.maquina || 'Sin maquina asignada'}
                  </span>
                  <button
                    onClick={handleEditMaquina}
                    className="text-continental-blue-dark hover:text-continental-blue-dark/80"
                    title="Editar máquina"
                  >
                    <Edit2 size={16} />
                  </button>
                </div>
              )}
            </div>

          </div>
          {/* Lado derecho - Botones de acción */}
          <div className="space-y-3">
            {/* 7. Botón Generar nueva contraseña */}
            <Button
              variant="outline"
              onClick={handleGeneratePassword}
              className="flex items-center gap-2 w-[225px] h-[45px] border-continental-blue-dark text-continental-blue-dark rounded-lg hover:bg-continental-blue-dark hover:text-white"
            >
              <Key size={16} />
              Generar nueva contraseña
            </Button>
            {/* NUEVO: Botón Registrar Permiso */}
            <Button
              variant="outline"
              onClick={() => setShowPermisoModal(true)}
              className="flex items-center gap-2 w-[225px] h-[45px] border-continental-blue-dark text-continental-blue-dark rounded-lg hover:bg-continental-blue-dark hover:text-white"
            >
              <FileText size={16} />
              Registrar Permiso/Incapacidad
            </Button>
                      {isLeader && (
                          <OvertimeCalendar
                              excepciones={excepcionesTiempoExtra}
                              currentMonth={new Date(anioVigente || new Date().getFullYear(), month)}
                              empleadoNombre={sindicalizado?.nombre || ''}
                          />
                      )}
            {/* 8. Botón Reasignar turno - Solo en período de programación anual */}
            {currentPeriod === 'annual' && (
              <Button
                variant="outline"
                onClick={handleReassignShift}
                className="flex items-center gap-2 w-[225px] h-[45px] border-continental-blue-dark text-continental-blue-dark rounded-lg hover:bg-continental-blue-dark hover:text-white"
              >
                <UserCheck size={16} />
                Reasignar turno
              </Button>
            )}
          </div>
        </div>

        {/* Contenido principal - Calendar y tabla de vacaciones */}
        <div className="flex gap-6 h-[700px]">
          {/* 9. Calendario */}
          <div className="flex-2">
          <CalendarComponent
            selectedDays={tempSelectedDates}
            month={month}
            onMonthChange={setMonth}
            isViewMode={false}
            onSelectDay={handleSelectDay}
            onRemoveDay={handleRemoveTempDay}
            groupId={groupId}
            userId={id ? parseInt(id) : undefined}
            excepciones={excepcionesTiempoExtra}
            //onDateSelect={handleDateSelection} // Capturar fechas seleccionadas
            //tempSelectedDates={tempSelectedDates}
          />
          {/* Overlay de indicadores de tiempo extra */}
  {excepcionesTiempoExtra.length > 0 && (
    <div className="pointer-events-none absolute inset-0">
      {/* Este overlay se sincroniza con el calendario */}
    </div>
  )}
        </div>
        <div className="flex-1 flex flex-col ">
                      <Button
                          variant="continental"
                          className="cursor-pointer w-fit my-2"
                          size="lg"
                          onClick={handleDownloadConstancia}
                      >
                          <Download className="mr-2 h-4 w-4" />
                          Constancia de Antigüedad
                      </Button>
                      
                      <Button
                          variant="outline"
                          className="cursor-pointer w-fit my-2"
                          size="lg"
                          onClick={handleDownloadRolesCSV}
                      >
                          <Download className="mr-2 h-4 w-4" />
                          Descargar Roles del Grupo
                      </Button>
           
          <Button variant="continentalOutline" className="w-fit my-2 cursor-pointer" size="lg" onClick={handleRequestFestiveWorked}>
            <Download className="mr-2 h-4 w-4" />
            Descargar 
          </Button>
 
          <Summary
            handleRemoveDay={handleRemoveDay} // ✅ <-- Esta línea nueva
            assignedDays={realAssignedDays}
            workedHoliday={workedHoliday}
            availableDays={selectedDays.length}
            selectedDays={selectedDays}
            handleEdit={handleEdit}
            isViewMode
            period={currentPeriod}
          />
          {
            currentPeriod === PeriodOptions.reprogramming && (
              <Button variant="continental" className="w-full cursor-pointer" size="lg" onClick={handleRequestFestiveWorked}>
                <CalendarPlus2 className="mr-2 h-4 w-4" />
                Solicitar Festivo Trabajado 
              </Button>
            )
          }

          {/* Asignar vacaciones: solo superusuario y jefe de area */}
          {vacacionesData && (
            <Button 
              variant="outline" 
              className="w-full cursor-pointer border-blue-300 text-blue-700 hover:bg-blue-50" 
              size="lg" 
              onClick={handleOpenAsignacionModal}
            >
              <CalendarPlus2 className="mr-2 h-4 w-4" />
              Asignar Vacaciones Manualmente
            </Button>
          )}
          
        </div>
        </div>
      </div>
      <EditModal
        show={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setSelectedVacation(null);
          setSelectedDay(null);
        }}
        selectedDay={selectedDay || ""}
        selectedVacation={selectedVacation}
        employeeId={parseInt(id || "0")}
        anioVigente={anioVigente || new Date().getFullYear() }
      />
      <RequestModal
        show={showRequestModal}
        onClose={() => setShowRequestModal(false)}
        empleadoId={parseInt(id || "0")}
        anioVigente={anioVigente || new Date().getFullYear() }
      />
      <ChangePasswordModal
        show={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
        userId={parseInt(id || "0")}
        userName={sindicalizado?.nombre || ""}
        onPasswordChanged={handlePasswordChanged}
      />

      
      {/* Modal de reasignación */}
      {showReasignacionModal && bloqueActualEmpleado && sindicalizado && groupId && anioVigente && (
        <ReasignacionTurnoModal
          show={showReasignacionModal}
          empleado={{
            id: id || "0",
            codigo: sindicalizado.noNomina?.toString() || "N/A",
            nombre: sindicalizado.nombre || "Sin nombre"
          }}
          bloqueActual={bloqueActualEmpleado}
          grupoId={groupId}
          anioVigente={anioVigente}
          onClose={handleReasignacionClose}
          onConfirm={handleReasignacionConfirm}
        />
      )}

      {/* Modal de asignación manual */}
      {showAsignacionModal && vacacionesData && sindicalizado && (
        <AsignacionManualModal
          nomina={sindicalizado.noNomina?.toString() || "N/A"}
          show={showAsignacionModal}
                  onClose={() => {
                      setShowAsignacionModal(false);
                      setTempSelectedDates([]); // Limpiar fechas al cerrar
                  }}
          empleadoId={parseInt(id || "0")}
          nombreEmpleado={sindicalizado.nombre}
          vacacionesData={vacacionesData}
          preSelectedDates={tempSelectedDates.map(d => d.date)}
          onAsignacionExitosa={() => {
            // Recargar datos del empleado
            if (id) {
              getEmployeeDetails(id);
              }
              setTempSelectedDates([]);
          }}
        />
          )}
          {showPermisoModal && sindicalizado && (
              <RegistrarPermisoModal
                  show={showPermisoModal}
                  onClose={() => setShowPermisoModal(false)}
                  nomina={parseInt(sindicalizado.noNomina?.toString() || "0")}
                  nombreEmpleado={sindicalizado.nombre}
                  onPermisoRegistrado={() => {
                      toast.success("Permiso registrado exitosamente. Se reflejará en los turnos semanales.");
                      // Recargar datos del empleado para reflejar el permiso
                      if (id) {
                          getEmployeeDetails(id);
                      }
                  }}
              />
          )}
    </div>
  );
};
