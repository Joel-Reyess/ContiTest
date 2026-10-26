/**
 * =============================================================================
 * APPROVE MODAL
 * =============================================================================
 * 
 * @description
 * Modal de confirmación para aprobar solicitudes de vacaciones o reprogramaciones.
 * Muestra los detalles de la solicitud y permite al jefe de área confirmar la aprobación.
 * 
 * @inputs (Props del componente)
 * - show: boolean - Controla la visibilidad del modal
 * - onClose: () => void - Callback para cerrar el modal
 * - onConfirm: () => void - Callback cuando se confirma la aprobación
 * - solicitudId: string - ID único de la solicitud a aprobar
 * - nombreEmpleado: string - Nombre del empleado solicitante
 * - tipoSolicitud: string - Tipo de solicitud (vacaciones, reprogramación, etc.)
 * - fechaActual: string - Fecha actual de la solicitud
 * - fechaReprogramacion: string - Nueva fecha propuesta en caso de reprogramación
 * 
 * @used_in (Componentes padre)
 * - src/components/Dashboard-Area/SolicitudDetalle.tsx
 * - src/components/Dashboard-Area/SolicitudesComponent.tsx
 * 
 * @user_roles (Usuarios que acceden)
 * - Jefe de Área
 * 
 * @dependencies
 * - React: Framework base del componente
 * - @/components/ui/button: Componente de botón reutilizable
 * - lucide-react: Iconos (CheckCircle)
 * 
 * @author Vulcanics Dev Team
 * @created 2024
 * @last_modified 2025-08-20
 * =============================================================================
 */

import React from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle } from 'lucide-react';

interface ApproveModalProps {
    show: boolean;
    onClose: () => void;
    onConfirm: () => void;
    solicitudId: string;
    nombreEmpleado: string;
    tipoSolicitud: string;
    fechaActual: string;
    fechaReprogramacion: string;
    /** Por defecto "Fecha actual" / "Nueva fecha"; en permisos, "Desde" / "Hasta". */
    etiquetaFechaActual?: string;
    etiquetaFechaNueva?: string;
}

const ApproveModal: React.FC<ApproveModalProps> = ({
    show,
    onClose,
    onConfirm,
    solicitudId,
    nombreEmpleado,
    tipoSolicitud,
    fechaActual,
    fechaReprogramacion,
    etiquetaFechaActual = 'Fecha actual',
    etiquetaFechaNueva = 'Nueva fecha'
}) => {
    const onSubmit = () => {
        onConfirm();
        console.log("Solicitud aprobada exitosamente");
        onClose();
    };

    const onCancel = () => {
        onClose();
    };

    return (
        <div
            className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 ${show ? "block" : "hidden"
                }`}
        >
            <div className="fixed inset-0 -z-10" onClick={onClose} />
            <div className="relative z-50 w-full max-w-lg p-4">
                <div className="bg-white rounded-lg shadow-lg">
                    <div className="p-4">
                        <div className="flex items-center gap-2 mb-3">
                            <CheckCircle className="w-5 h-5 text-emerald-500" />
                            <h2 className="text-lg font-semibold text-gray-900">Aprobar Solicitud</h2>
                        </div>

                        <p className="text-sm text-gray-600 mb-4">
                            ¿Estás seguro de que deseas aprobar esta solicitud?
                        </p>

                        <div className="mb-4 p-4 bg-emerald-50 rounded-lg border border-emerald-200">
                            <div className="space-y-2">
                                <div className="text-sm">
                                    <span className="font-medium text-gray-700">Solicitud:</span>
                                    <span className="ml-1 text-gray-900">#{solicitudId}</span>
                                </div>
                                <div className="text-sm">
                                    <span className="font-medium text-gray-700">Empleado:</span>
                                    <span className="ml-1 text-gray-900">{nombreEmpleado}</span>
                                </div>
                                <div className="text-sm">
                                    <span className="font-medium text-gray-700">Tipo:</span>
                                    <span className="ml-1 text-gray-900">{tipoSolicitud}</span>
                                </div>
                                <div className="border-t border-emerald-200 pt-2 mt-2">
                                    <div className="text-sm">
                                        <span className="font-medium text-gray-700">{etiquetaFechaActual}:</span>
                                        <span className="ml-1 text-red-600 font-medium">{fechaActual}</span>
                                    </div>
                                    <div className="text-sm mt-1">
                                        <span className="font-medium text-gray-700">{etiquetaFechaNueva}:</span>
                                        <span className="ml-1 text-blue-600 font-medium">{fechaReprogramacion}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="p-4 flex justify-end gap-2 border-t border-gray-200">
                        <Button
                            className="cursor-pointer"
                            variant="outline"
                            size="lg"
                            onClick={onCancel}
                        >
                            Cancelar
                        </Button>
                        <Button
                            className="cursor-pointer text-black"
                            style={{ backgroundColor: 'var(--color-continental-yellow)' }}
                            size="lg"
                            onClick={onSubmit}
                        >
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Aprobar
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ApproveModal;
