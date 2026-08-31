/**
 * =============================================================================
 * REASIGNACION TURNO MODAL
 * =============================================================================
 * 
 * @description
 * Modal para reasignar empleados entre bloques de turnos. Permite seleccionar
 * un bloque destino disponible y proporcionar motivo para el cambio.
 * 
 * @inputs
 * - show: boolean - Controla la visibilidad del modal
 * - empleado: Empleado - Datos del empleado a reasignar
 * - bloqueActual: BloqueReservacion - Bloque actual del empleado
 * - grupoId: number - ID del grupo para obtener bloques disponibles
 * - anioVigente: number - Año vigente para la consulta
 * - onClose: () => void - Callback para cerrar el modal
 * - onConfirm: (bloqueDestinoId: number, motivo: string, observaciones?: string) => Promise<void>
 * 
 * @used_in
 * - src/components/Dashboard-Area/TurnosActuales.tsx
 * 
 * @user_roles
 * - Jefe de Área
 * 
 * @dependencies
 * - React: Framework base y hooks
 * - BloquesReservacionService: Servicio para obtener bloques disponibles
 * - useVacationConfig: Hook para obtener año vigente
 * 
 * @author Vulcanics Dev Team
 * @created 2025-09-28
 * =============================================================================
 */

import React, { useState, useEffect } from 'react'
import { X, Calendar, Clock, Users, AlertCircle } from 'lucide-react'
import { BloquesReservacionService } from '../../services/bloquesReservacionService'
import type { BloqueReservacion } from '../../interfaces/Api.interface'

interface Empleado {
    id: string
    codigo: string
    nombre: string
}

interface ReasignacionTurnoModalProps {
    show: boolean
    empleado: Empleado
    bloqueActual: {
        id: string
        fecha: string
        fechaFin?: string
        horaInicio: string
        horaFin: string
        bloque: string
    }
    grupoId: number
    anioVigente: number
    onClose: () => void
    onConfirm: (bloqueDestinoId: number, motivo: string, observaciones?: string) => Promise<void>
}

const ReasignacionTurnoModal: React.FC<ReasignacionTurnoModalProps> = ({
    show,
    empleado,
    bloqueActual,
    grupoId,
    anioVigente,
    onClose,
    onConfirm
}) => {
    const [bloquesDisponibles, setBloquesDisponibles] = useState<BloqueReservacion[]>([])
    const [bloqueSeleccionado, setBloqueSeleccionado] = useState<number | null>(null)
    const [motivo, setMotivo] = useState('')
    const [observaciones, setObservaciones] = useState('')
    const [loading, setLoading] = useState(false)
    const [loadingBloques, setLoadingBloques] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Cargar bloques disponibles cuando se abre el modal
    useEffect(() => {
        if (show && grupoId && anioVigente) {
            fetchBloquesDisponibles()
        }
    }, [show, grupoId, anioVigente])

    const fetchBloquesDisponibles = async () => {
        try {
            setLoadingBloques(true)
            setError(null)

            const response = await BloquesReservacionService.obtenerBloquesPorGrupo(anioVigente, grupoId)
            
            // Filtrar bloques: solo mayores a la fecha del bloque actual y no el bloque actual
            const bloqueActualId = parseInt(bloqueActual.id)
            
            // Convertir la fecha del bloque actual (formato DD/MM/YYYY) a Date
            const [dia, mes, año] = bloqueActual.fecha.split('/')
            const fechaBloqueActual = new Date(parseInt(año), parseInt(mes) - 1, parseInt(dia))
            
            const bloquesFiltrados = response.bloques.filter(bloque => {
                const fechaInicio = new Date(bloque.fechaHoraInicio)
                return fechaInicio > fechaBloqueActual && bloque.id !== bloqueActualId
            })

            setBloquesDisponibles(bloquesFiltrados)
        } catch (err) {
            console.error('Error al obtener bloques disponibles:', err)
            setError('Error al cargar bloques disponibles')
        } finally {
            setLoadingBloques(false)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        
        if (!bloqueSeleccionado || !motivo.trim()) {
            setError('Por favor selecciona un bloque y proporciona un motivo')
            return
        }

        try {
            setLoading(true)
            setError(null)
            
            await onConfirm(bloqueSeleccionado, motivo.trim(), observaciones.trim() || undefined)
            
            // Limpiar formulario y cerrar modal
            setBloqueSeleccionado(null)
            setMotivo('')
            setObservaciones('')
            onClose()
        } catch (err) {
            console.error('Error al reasignar turno:', err)
            setError(err instanceof Error ? err.message : 'Error al reasignar turno')
        } finally {
            setLoading(false)
        }
    }

    const handleClose = () => {
        if (!loading) {
            setBloqueSeleccionado(null)
            setMotivo('')
            setObservaciones('')
            setError(null)
            onClose()
        }
    }

    const formatearFecha = (fechaISO: string) => {
        return new Date(fechaISO).toLocaleDateString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        })
    }

    const formatearHora = (fechaISO: string) => {
        return new Date(fechaISO).toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        })
    }

    if (!show) return null

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200">
                    <h2 className="text-xl font-semibold text-gray-900">
                        Reasignar Turno
                    </h2>
                    <button
                        onClick={handleClose}
                        disabled={loading}
                        className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6">
                    {/* Información del empleado */}
                    <div className="mb-6 p-4 bg-blue-50 rounded-lg">
                        <h3 className="font-semibold text-blue-900 mb-2">Empleado a reasignar</h3>
                        <div className="text-sm text-blue-800">
                            <div><strong>Número de Nomina:</strong> {empleado.codigo }</div>
                            <div><strong>Nombre:</strong> {empleado.nombre}</div>
                        </div>
                    </div>

                    {/* Turno actual */}
                    <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                        <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                            <Calendar className="w-4 h-4" />
                            Turno Actual
                        </h3>
                        <p className='text-sm text-gray-700'>Bloque: {bloqueActual.bloque}</p>
                        <div className="text-sm text-gray-700">
                            <div className="flex items-center gap-4">
                                <span><strong>Fecha:</strong> {bloqueActual.fecha}</span>
                                {bloqueActual.fechaFin && bloqueActual.fechaFin !== bloqueActual.fecha && (
                                    <span><strong>hasta:</strong> {bloqueActual.fechaFin}</span>
                                )}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                                <Clock className="w-4 h-4" />
                                <span>{bloqueActual.horaInicio} - {bloqueActual.horaFin}</span>
                            </div>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* Selector de bloque destino */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Nuevo Turno *
                            </label>
                            
                            {loadingBloques ? (
                                <div className="p-4 text-center text-gray-500">
                                    Cargando bloques disponibles...
                                </div>
                            ) : bloquesDisponibles.length === 0 ? (
                                <div className="p-4 text-center text-gray-500 bg-gray-50 rounded-lg">
                                    No hay bloques disponibles para reasignación
                                </div>
                            ) : (
                                <div className="space-y-2 max-h-60 overflow-y-auto border border-gray-200 rounded-lg">
                                    {bloquesDisponibles.map((bloque) => {
                                        // El backend no valida el cupo al cambiar de bloque: si aquí
                                        // se deja elegir uno lleno, ese turno termina con más gente
                                        // de la que permite "personas por bloque".
                                        const sinEspacio =
                                            bloque.empleadosAsignados.length >= bloque.personasPorBloque;
                                        return (
                                        <label
                                            key={bloque.id}
                                            className={`flex items-center p-3 hover:bg-gray-50 ${
                                                sinEspacio ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                                            } ${
                                                bloqueSeleccionado === bloque.id ? 'bg-blue-50 border-blue-200' : ''
                                            }`}
                                        >
                                            <input
                                                type="radio"
                                                name="bloqueDestino"
                                                value={bloque.id}
                                                checked={bloqueSeleccionado === bloque.id}
                                                onChange={() => setBloqueSeleccionado(bloque.id)}
                                                disabled={sinEspacio}
                                                className="mr-3"
                                            />
                                            <div className="flex-1">
                                                <div className="flex items-center gap-4 text-sm">
                                                    <div className="flex items-center gap-2">
                                                        <Calendar className="w-4 h-4 text-gray-400" />
                                                        <span className="font-medium">
                                                            {formatearFecha(bloque.fechaHoraInicio)}
                                                            {bloque.fechaHoraFin && 
                                                             formatearFecha(bloque.fechaHoraFin) !== formatearFecha(bloque.fechaHoraInicio) && (
                                                                <span> - {formatearFecha(bloque.fechaHoraFin)}</span>
                                                            )}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <Clock className="w-4 h-4 text-gray-400" />
                                                        <span>
                                                            {formatearHora(bloque.fechaHoraInicio)} - {formatearHora(bloque.fechaHoraFin)}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <Users className="w-4 h-4 text-gray-400" />
                                                        <span>
                                                            {bloque.empleadosAsignados.length}/{bloque.personasPorBloque}
                                                            {sinEspacio && ' (lleno)'}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="text-xs text-gray-500 mt-1">
                                                    Bloque #{bloque.numeroBloque} - {bloque.duracionHoras}h
                                                </div>
                                            </div>
                                        </label>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Motivo */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Motivo del cambio *
                            </label>
                            <textarea
                                value={motivo}
                                onChange={(e) => setMotivo(e.target.value)}
                                placeholder="Describe el motivo de la reasignación..."
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                                rows={3}
                                required
                            />
                        </div>

                        {/* Observaciones adicionales */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Observaciones adicionales
                            </label>
                            <textarea
                                value={observaciones}
                                onChange={(e) => setObservaciones(e.target.value)}
                                placeholder="Información adicional (opcional)..."
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                                rows={2}
                            />
                        </div>

                        {/* Error */}
                        {error && (
                            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
                                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                <span className="text-sm">{error}</span>
                            </div>
                        )}

                        {/* Buttons */}
                        <div className="flex gap-3 pt-4">
                            <button
                                type="button"
                                onClick={handleClose}
                                disabled={loading}
                                className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={loading || !bloqueSeleccionado || !motivo.trim()}
                                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                {loading ? 'Reasignando...' : 'Reasignar Turno'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    )
}

export default ReasignacionTurnoModal
