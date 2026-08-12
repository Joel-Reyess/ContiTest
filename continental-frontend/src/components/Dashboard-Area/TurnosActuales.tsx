import React, { useEffect, useState, useMemo } from 'react'
import { ChevronRight, SkipForward } from 'lucide-react'
import { BloquesReservacionService } from '../../services/bloquesReservacionService'
import { useAuth } from '../../hooks/useAuth'
import { EmpleadoEstado, type BloquesPorFechaResponse } from '../../interfaces/Api.interface'
import { UserRole, type User } from '@/interfaces/User.interface'
import { userService } from '@/services/userService'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import ReasignacionTurnoModal from './ReasignacionTurnoModal'

interface Empleado {
    id: string
    codigo: string
    nombre: string
    estado: EmpleadoEstado
    fechaIngreso: string,
    antiguedadAnios: number
}

interface BloqueHorario {
    id: string
    fecha: string
    fechaFin?: string
    horaInicio: string
    horaFin: string
    empleados: Empleado[]
    endAt?: Date | null
    numeroBloque?: number
}

interface GrupoTurnos {
    id: string
    nombre: string
    bloqueActual: BloqueHorario
    siguienteBloque: BloqueHorario
}

function useCountdown(targetDate?: Date | null): string {
    const [remaining, setRemaining] = React.useState('')

    React.useEffect(() => {
        if (!targetDate) {
            setRemaining('00:00:00')
            return
        }

        const update = () => {
            const now = new Date()
            const left = targetDate.getTime() - now.getTime()

            if (left <= 0) {
                setRemaining('00:00:00')
                return
            }

            const hh = String(Math.floor(left / 3600000)).padStart(2, '0')
            const mm = String(Math.floor((left % 3600000) / 60000)).padStart(2, '0')
            const ss = String(Math.floor((left % 60000) / 1000)).padStart(2, '0')
            setRemaining(`${hh}:${mm}:${ss}`)
        }

        update()
        const interval = setInterval(update, 1000)
        return () => clearInterval(interval)
    }, [targetDate])

    return remaining
}

function EmpleadoRow({
    empleado,
    variant,
    showActions,
    onSkip,
    onSaltar,
    groupId,
}: {
    empleado: Empleado
    variant: 'actual' | 'siguiente'
    showActions?: boolean
    onSkip: (empleadoId: string, groupId: string) => void
    /** Salto en sitio: desbloquea al siguiente sin mover al empleado de bloque. */
    onSaltar: (empleadoId: string, groupId: string) => void
    groupId: string
}) {
const rail = variant === 'actual'
  ? empleado.estado === EmpleadoEstado.COMPLETADO ||
    empleado.estado === EmpleadoEstado.RESERVADO ||
    empleado.estado === EmpleadoEstado.MANUAL // ✅ nuevo estado manual
    ? 'bg-[#30a30a]' // verde
    : empleado.estado === EmpleadoEstado.SALTADO
      ? 'bg-amber-500' // ámbar: saltado, aún puede capturar en la ventana
      : 'bg-[#0A4AA3]' // azul
  : 'bg-gray-400';

    const esAccionable =
        empleado.estado !== EmpleadoEstado.COMPLETADO &&
        empleado.estado !== EmpleadoEstado.RESERVADO;

    return (
        <div className="relative flex items-stretch gap-2">
            <div className={`w-4 rounded-sm ${rail}`} />
            <div className="group relative flex-1 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                <div className="text-sm font-semibold text-gray-900">{empleado.codigo}</div>
                <div className="text-xs text-gray-600 pr-16">
                    {empleado.nombre}
                    {empleado.estado === EmpleadoEstado.SALTADO && (
                        <span className="ml-2 inline-block px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-medium">
                            Saltado
                        </span>
                    )}
                </div>

                {showActions && esAccionable && (
                    <div
                        className="
                            absolute top-1 right-1 flex gap-1
                            opacity-0 pointer-events-none
                            transition-opacity duration-150
                            group-hover:opacity-100 group-hover:pointer-events-auto
                            focus-within:opacity-100 focus-within:pointer-events-auto
                        "
                    >
                        {empleado.estado !== EmpleadoEstado.SALTADO && (
                            <button
                                onClick={() => onSaltar(empleado.id, groupId)}
                                className="
                                    inline-flex items-center gap-1 px-2 py-0.5
                                    rounded-md border border-amber-300 bg-white
                                    text-amber-700 text-[11px] leading-none shadow-sm cursor-pointer
                                "
                                title="Saltar turno: desbloquea al siguiente empleado; el saltado aún puede capturar mientras el bloque siga abierto"
                                aria-label="Saltar turno (desbloquear siguiente)"
                            >
                                <SkipForward className="w-3.5 h-3.5" />
                                <span>Saltar</span>
                            </button>
                        )}
                        <button
                            onClick={() => onSkip(empleado.id, groupId)}
                            className="
                                inline-flex items-center gap-1 px-2 py-0.5
                                rounded-md border border-blue-300 bg-white
                                text-blue-700 text-[11px] leading-none shadow-sm cursor-pointer
                            "
                            title="Reasignar a otro bloque (HU54)"
                            aria-label="Reasignar a otro bloque"
                        >
                            <span>Reasignar</span>
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}

function GrupoCol({
    titulo,
    bloque,
    variant,
    onSkip,
    onSaltar,
    groupId,
    canSkip = false,
}: {
    titulo: string
    bloque: BloqueHorario
    variant: 'actual' | 'siguiente'
    onSkip: (empleadoId: string, groupId: string) => void
    onSaltar: (empleadoId: string, groupId: string) => void
    groupId: string
    canSkip?: boolean
}) {
    //bloque ordenado por antiguedad y si son iguales por codigo
    const empleadosOrdenados = [...bloque.empleados].sort((a, b) => {
        const antiguedadA = new Date(a.fechaIngreso).getTime()
        const antiguedadB = new Date(b.fechaIngreso).getTime()
        if (antiguedadA === antiguedadB) {
            return parseInt(a.codigo) - parseInt(b.codigo)
        }
        return antiguedadA - antiguedadB
    })



    return (
        <div className="space-y-2">
            <h3 className="text-base font-semibold text-gray-900">{titulo}</h3>
            <div className="space-y-2">
                {empleadosOrdenados.map((e) => (
                    <EmpleadoRow
                        key={e.id}
                        empleado={e}
                        variant={variant}
                        showActions={canSkip && variant === 'actual'}
                        onSkip={onSkip}
                        onSaltar={onSaltar}
                        groupId={groupId}
                    />
                ))}
            </div>
        </div>
    )
}
type UserData = User;
export function TurnosActuales({ anioVigente }: { anioVigente: number }) {
    const { user, hasRole } = useAuth()
    const [data, setData] = React.useState<GrupoTurnos[]>([])
    const [userData, setUserData] = React.useState<UserData | null>(null)
    const [loading, setLoading] = useState(true)
    const [_, setError] = useState<string | null>(null)
    
    // Estados para el selector de área y grupo
    const [selectedAreaId, setSelectedAreaId] = useState<number | null>(null)
    const [selectedGrupoId, setSelectedGrupoId] = useState<number | null>(null)
    
    // Estados para el modal de reasignación
    const [showReasignacionModal, setShowReasignacionModal] = useState(false)
    const [empleadoSeleccionado, setEmpleadoSeleccionado] = useState<Empleado | null>(null)
    const [bloqueActualSeleccionado, setBloqueActualSeleccionado] = useState<BloqueHorario | null>(null)
    const [originalSelectedGrupoId, setOriginalSelectedGrupoId] = useState<number | null>(null)

    // Determinar si el usuario puede hacer skip (solo jefe de área)
    const canSkip = hasRole(UserRole.AREA_ADMIN)

    const fetchUserData = async () => {
      if (!user?.id) {
        setError("ID de usuario no proporcionado");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const userDetail = await userService.getUserById(user?.id);
        console.log({ userDetail });
        setUserData(userDetail);
        
        // Establecer valores por defecto para área y grupo
        if (userDetail?.areas && userDetail.areas.length > 0) {
          const firstArea = userDetail.areas[0];
          setSelectedAreaId(firstArea.areaId);
          
          if (firstArea.grupos && firstArea.grupos.length > 0) {
            setSelectedGrupoId(firstArea.grupos[0].grupoId);
          }
        }
      } catch (error) {
        console.error("Error fetching user:", error);
        setError(
          error instanceof Error ? error.message : "Error al cargar el usuario"
        );
      } finally {
        setLoading(false);
      }
    };

    // Función separada para obtener bloques basada en la selección
    const fetchBloques = async () => {
        if (!selectedAreaId && !selectedGrupoId) {
            return; // No hacer nada si no hay selección
        }
        console.log({ selectedAreaId, selectedGrupoId })

        try {
            setLoading(true)
            setError(null)

            const now = new Date()
            // Crear fecha con hora local (no UTC)
            const year = now.getFullYear()
            const month = String(now.getMonth() + 1).padStart(2, '0')
            const day = String(now.getDate()).padStart(2, '0')
            const hours = String(now.getHours()).padStart(2, '0')
            const minutes = String(now.getMinutes()).padStart(2, '0')
            const seconds = String(now.getSeconds()).padStart(2, '0')
            const fechaActual = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`

            let bloqueData: BloquesPorFechaResponse | null = null

            // Usar los valores seleccionados para obtener los datos
            if (selectedGrupoId) {
                // Si hay un grupo específico seleccionado, usar ese
                bloqueData = await BloquesReservacionService.obtenerBloquesPorFecha(
                    fechaActual,
                    { grupoId: selectedGrupoId },
                    anioVigente
                )
            } else if (selectedAreaId) {
                // Si solo hay área seleccionada, usar toda el área
                bloqueData = await BloquesReservacionService.obtenerBloquesPorFecha(
                    fechaActual,
                    { areaId: selectedAreaId },
                    anioVigente
                )
            }

            // Transformar los datos al formato esperado por el componente
            if (bloqueData) {
                const gruposTransformados = transformarBloques(bloqueData)
                setData(gruposTransformados)
            }
        } catch (err) {
            console.error('Error al obtener bloques:', err)
            setError('Error al cargar los turnos')
        } finally {
            setLoading(false)
        }
    }

    // Cargar datos del usuario al montar
    useEffect(() => {
        fetchUserData()
    }, [user?.id])

    // Cargar bloques cuando cambie la selección
    useEffect(() => {
        if (selectedAreaId || selectedGrupoId) {
            fetchBloques()
        }
    }, [selectedAreaId, selectedGrupoId])

    // Función para transformar los datos del API al formato del componente
    const transformarBloques = (response: BloquesPorFechaResponse): GrupoTurnos[] => {
        if (!response?.bloquesPorGrupo || response.bloquesPorGrupo.length === 0) {
            return [];
        }

        return response.bloquesPorGrupo.map((grupo) => {
            // Función helper para transformar empleados
            const transformarEmpleados = (empleadosAsignados: any[] = []) => {
                return empleadosAsignados.map((emp) => ({
                    id: emp.empleadoId?.toString() || emp.id?.toString() || 'unknown',
                    codigo: emp.nomina || emp.numeroNomina || emp.codigo || 'N/A',
                    nombre: emp.nombreCompleto || emp.nombre || 'Sin nombre',
                    estado: emp.estado || 'N/A',
                    fechaIngreso: emp.fechaIngreso || 'N/A',
                    antiguedadAnios: emp.antiguedadAnios || 0
                }));
            };

            // Función helper para extraer hora de fecha ISO
            const extraerHora = (fechaISO: string) => {
                if (!fechaISO) return '00:00';
                try {
                    return new Date(fechaISO).toLocaleTimeString('es-ES', { 
                        hour: '2-digit', 
                        minute: '2-digit',
                        hour12: false 
                    });
                } catch {
                    return '00:00';
                }
            };

            // Función helper para calcular endAt del bloque actual
            const calcularEndAt = (fechaHoraFin: string) => {
                if (!fechaHoraFin) return null;
                try {
                    return new Date(fechaHoraFin);
                } catch {
                    return null;
                }
            };

            return {
                id: grupo.grupoId.toString(),
                nombre: grupo.nombreGrupo,
                bloqueActual: {
                    id: grupo.bloqueActual?.id?.toString() || 'no-block',
                    fecha: grupo.bloqueActual?.fechaHoraInicio 
                        ? new Date(grupo.bloqueActual.fechaHoraInicio).toLocaleDateString('es-ES')
                        : new Date().toLocaleDateString('es-ES'),
                    horaInicio: extraerHora(grupo.bloqueActual?.fechaHoraInicio || ''),
                    horaFin: extraerHora(grupo.bloqueActual?.fechaHoraFin || ''),
                    fechaFin: grupo.bloqueActual?.fechaHoraFin 
                        ? new Date(grupo.bloqueActual.fechaHoraFin).toLocaleDateString('es-ES')
                        : grupo.bloqueActual?.fechaHoraInicio 
                            ? new Date(grupo.bloqueActual.fechaHoraInicio).toLocaleDateString('es-ES')
                            : new Date().toLocaleDateString('es-ES'),
                    endAt: calcularEndAt(grupo.bloqueActual?.fechaHoraFin || ''),
                    empleados: transformarEmpleados(grupo.bloqueActual?.empleadosAsignados || []),
                    numeroBloque: grupo.bloqueActual?.numeroBloque
                },
                siguienteBloque: {
                    id: grupo.bloqueSiguiente?.id?.toString() || 'no-next-block',
                    fecha: grupo.bloqueSiguiente?.fechaHoraInicio 
                        ? new Date(grupo.bloqueSiguiente.fechaHoraInicio).toLocaleDateString('es-ES')
                        : new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString('es-ES'),
                    horaInicio: extraerHora(grupo.bloqueSiguiente?.fechaHoraInicio || ''),
                    horaFin: extraerHora(grupo.bloqueSiguiente?.fechaHoraFin || ''),
                    empleados: transformarEmpleados(grupo.bloqueSiguiente?.empleadosAsignados || [])
                }
            };
        });
    }

    const activeGroupIndex = useMemo(
        () => data.findIndex(g => g.bloqueActual.empleados.length > 0),
        [data]
    )
    const activeGroup = activeGroupIndex >= 0 ? data[activeGroupIndex] : undefined

    const remaining = useCountdown(activeGroup?.bloqueActual.endAt)

    const handleSkip = async (empleadoId: string, groupId: string) => {
        // Solo permitir si es jefe de área
        if (!canSkip) {
            console.warn('Solo el jefe de área puede saltar turnos')
            return
        }

        // Encontrar el empleado y su bloque actual
        const grupo = data.find(g => g.id === groupId)
        if (!grupo) return

        const empleado = grupo.bloqueActual.empleados.find(emp => emp.id === empleadoId)
        if (!empleado) return

        // Configurar datos para el modal
        setEmpleadoSeleccionado(empleado)
        setBloqueActualSeleccionado(grupo.bloqueActual)
        
        // Guardar el estado original del grupo seleccionado
        setOriginalSelectedGrupoId(selectedGrupoId)
        
        // Establecer el grupo específico para el modal
        setSelectedGrupoId(parseInt(groupId))
        setShowReasignacionModal(true)
    }

    // Salto en sitio: marca al empleado como "Saltado" para desbloquear al
    // siguiente por antigüedad. No lo mueve de bloque: puede capturar mientras
    // el bloque siga abierto y, si no lo hace, el sistema lo manda a la cola.
    const handleSaltarTurno = async (empleadoId: string, groupId: string) => {
        if (!canSkip) return

        const grupo = data.find(g => g.id === groupId)
        if (!grupo) return
        const empleado = grupo.bloqueActual.empleados.find(emp => emp.id === empleadoId)
        if (!empleado) return

        const bloqueId = parseInt(grupo.bloqueActual.id)
        if (!Number.isFinite(bloqueId)) return

        const confirmado = window.confirm(
            `¿Saltar el turno de ${empleado.nombre}?\n\n` +
            `El siguiente empleado por antigüedad quedará desbloqueado de inmediato. ` +
            `${empleado.nombre} todavía podrá capturar mientras el bloque siga abierto; ` +
            `si no lo hace, pasará automáticamente al bloque cola.`
        )
        if (!confirmado) return

        try {
            await BloquesReservacionService.saltarTurno(parseInt(empleadoId), bloqueId)
            fetchBloques()
        } catch (error) {
            console.error('Error al saltar turno:', error)
            window.alert(
                error instanceof Error ? error.message : 'No se pudo saltar el turno'
            )
        }
    }

    const handleReasignacionConfirm = async (bloqueDestinoId: number, motivo: string, observaciones?: string) => {
        if (!empleadoSeleccionado || !bloqueActualSeleccionado) return

        try {
            const request = {
                empleadoId: parseInt(empleadoSeleccionado.id),
                bloqueOrigenId: parseInt(bloqueActualSeleccionado.id),
                bloqueDestinoId,
                motivo,
                observacionesAdicionales: observaciones
            }

            const response = await BloquesReservacionService.cambiarEmpleado(request)
            
            if (response.cambioExitoso) {
                // Mostrar mensaje de éxito con información detallada
                console.log('Empleado reasignado exitosamente:', {
                    empleado: response.nombreEmpleado,
                    nomina: response.nominaEmpleado,
                    bloqueOrigen: `Bloque #${response.bloqueOrigen.numeroBloque}`,
                    bloqueDestino: `Bloque #${response.bloqueDestino.numeroBloque}`,
                    fechaCambio: response.fechaCambio
                })
                
                // Actualizar los datos refrescando la información
                fetchBloques()
                
                // Cerrar modal y restaurar estado
                setShowReasignacionModal(false)
                setEmpleadoSeleccionado(null)
                setBloqueActualSeleccionado(null)
                setSelectedGrupoId(originalSelectedGrupoId)
                setOriginalSelectedGrupoId(null)
            } else {
                throw new Error('El cambio no fue exitoso según la respuesta del servidor')
            }
            
        } catch (error) {
            console.error('Error al reasignar empleado:', error)
            throw error // Re-throw para que el modal maneje el error
        }
    }

    const handleReasignacionClose = () => {
        setShowReasignacionModal(false)
        setEmpleadoSeleccionado(null)
        setBloqueActualSeleccionado(null)
        
        // Restaurar el estado original del grupo seleccionado
        setSelectedGrupoId(originalSelectedGrupoId)
        setOriginalSelectedGrupoId(null)
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-gray-600">Cargando turnos...</div>
            </div>
        )
    }

    // if (error) {
    //     return (
    //         <div className="flex items-center justify-center h-64">
    //             <div className="text-red-600">{error}</div>
    //         </div>
    //     )
    // }

    // Obtener opciones para los selectores
    const areaOptions = userData?.areas || []
    const grupoOptions = selectedAreaId 
        ? userData?.areas?.find(area => area.areaId === selectedAreaId)?.grupos || []
        : []

    if (data.length === 0 && !loading) {
        return (
            <div className="space-y-4">
                {/* Selectores */}
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Seleccionar Área y Grupo</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Selector de Área */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700">Área</label>
                            <Select 
                                value={selectedAreaId?.toString() || ""} 
                                onValueChange={(value) => {
                                    const areaId = parseInt(value)
                                    setSelectedAreaId(areaId)
                                    setSelectedGrupoId(null) // Reset grupo cuando cambia área
                                }}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecciona un área" />
                                </SelectTrigger>
                                <SelectContent>
                                    {areaOptions.map((area) => (
                                        <SelectItem key={area.areaId} value={area.areaId.toString()}>
                                            {area.nombreGeneral}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Selector de Grupo */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700">Grupo</label>
                            <Select 
                                value={selectedGrupoId?.toString() || "all"} 
                                onValueChange={(value) => {
                                    if (value === "all") {
                                        setSelectedGrupoId(null)
                                    } else {
                                        const grupoId = parseInt(value)
                                        setSelectedGrupoId(grupoId)
                                    }
                                }}
                                disabled={!selectedAreaId}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecciona un grupo" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todos los grupos</SelectItem>
                                    {grupoOptions.map((grupo) => (
                                        <SelectItem key={grupo.grupoId} value={grupo.grupoId.toString()}>
                                            {grupo.rol}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-lg p-8">
                    <div className="text-center text-gray-600">
                        No hay turnos disponibles para mostrar
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {/* Selectores */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Seleccionar Área y Grupo</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Selector de Área */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">Área</label>
                        <Select 
                            value={selectedAreaId?.toString() || ""} 
                            onValueChange={(value) => {
                                const areaId = parseInt(value)
                                setSelectedAreaId(areaId)
                                setSelectedGrupoId(null) // Reset grupo cuando cambia área
                            }}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Selecciona un área" />
                            </SelectTrigger>
                            <SelectContent>
                                {areaOptions.map((area) => (
                                    <SelectItem key={area.areaId} value={area.areaId.toString()}>
                                        {area.nombreGeneral}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Selector de Grupo */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">Grupo</label>
                        <Select 
                            value={selectedGrupoId?.toString() || "all"} 
                            onValueChange={(value) => {
                                if (value === "all") {
                                    setSelectedGrupoId(null)
                                } else {
                                    const grupoId = parseInt(value)
                                    setSelectedGrupoId(grupoId)
                                }
                            }}
                            disabled={!selectedAreaId}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Selecciona un grupo" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todos los grupos</SelectItem>
                                {grupoOptions.map((grupo) => (
                                    <SelectItem key={grupo.grupoId} value={grupo.grupoId.toString()}>
                                        {grupo.rol}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            {/* Secciones de turnos */}
            <section className="rounded-lg border-2 border-[#0A4AA3] bg-white">
                <div className="px-4 pt-3">
                    <h2 className="text-base font-semibold text-[#0A4AA3]">Turnos actuales</h2>
                    <div className="text-[11px] text-gray-700 mt-1 mb-2 space-y-1">
                        <div className="flex items-center gap-4">
                            <span className="font-semibold">Tiempo restante:</span> 
                            <span className="text-[#0A4AA3] font-mono text-sm">{remaining}</span>
                        </div>
                        {activeGroup && (
                            <div className="flex items-center gap-6 text-xs">
                                <div className="flex items-center gap-2">
                                    <span className="font-semibold">Inicio:</span>
                                    <span>{activeGroup.bloqueActual.fecha} - {activeGroup.bloqueActual.horaInicio}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="font-semibold">Fin:</span>
                                    <span>{activeGroup.bloqueActual.fechaFin || activeGroup.bloqueActual.fecha} - {activeGroup.bloqueActual.horaFin}</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="px-3 pb-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-8">
                        {data.map(g => (
                            <GrupoCol
                                key={g.id}
                                titulo={g.nombre}
                                bloque={g.bloqueActual}
                                variant="actual"
                                onSkip={handleSkip}
                                onSaltar={handleSaltarTurno}
                                groupId={g.id}
                                canSkip={canSkip}
                            />
                        ))}
                    </div>
                </div>
            </section>

            <section className="rounded-lg border-2 border-gray-400 bg-white">
                <div className="px-4 pt-3">
                    <div className="flex items-center gap-2 text-gray-900">
                        <span className="text-base font-semibold">Siguientes turnos</span>
                        <ChevronRight className="w-4 h-4" />
                    </div>
                </div>

                <div className="px-3 pb-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-8">
                        {data.map((g) => (
                            <GrupoCol
                                key={`next-${g.id}`}
                                titulo={g.nombre}
                                bloque={g.siguienteBloque}
                                variant="siguiente"
                                onSkip={() => { }}
                                onSaltar={() => { }}
                                groupId={''}
                                canSkip={false}
                            />
                        ))}
                    </div>
                </div>
            </section>

            {/* Modal de reasignación */}
            {showReasignacionModal && empleadoSeleccionado && bloqueActualSeleccionado && selectedGrupoId && (
                <ReasignacionTurnoModal
                    show={showReasignacionModal}
                    empleado={empleadoSeleccionado}
                    bloqueActual={{
                        id: bloqueActualSeleccionado.id,
                        fecha: bloqueActualSeleccionado.fecha,
                        fechaFin: bloqueActualSeleccionado.fechaFin,
                        horaInicio: bloqueActualSeleccionado.horaInicio,
                        horaFin: bloqueActualSeleccionado.horaFin,
                        bloque: bloqueActualSeleccionado.numeroBloque?.toString() || bloqueActualSeleccionado.id
                    }}
                    grupoId={selectedGrupoId}
                    anioVigente={anioVigente}
                    onClose={handleReasignacionClose}
                    onConfirm={handleReasignacionConfirm}
                />
            )}
        </div>
    )
}