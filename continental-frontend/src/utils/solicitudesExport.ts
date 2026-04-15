import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { VacationRequest } from '@/components/Dashboard-Empleados/MyRequests';

interface ExcelSolicitudRow {
    'ID': string;
    'Empleado': string;
    'Area': string;
    'Grupo': string;
    'Tipo': string;
    'Estado': string;
    'Fecha Solicitud': string;
    'Fecha Original': string;
    'Fecha Nueva': string;
    'Fecha Respuesta/Atencion': string;
    'Reviso': string;
    'Solicitado por': string;
    'Motivo Rechazo': string;
}

interface ExportMeta {
    empleadoArea?: string;
    empleadoGrupo?: string;
    periodoLabel?: string;
    periodoActivo?: boolean;
    filtros?: {
        tipo?: string;
        estado?: string;
    };
}

const formatDate = (value?: string | null): string => {
    if (!value) return '';

    // Si es solo fecha (YYYY-MM-DD), parsear como local para evitar desfase UTC
    const soloFecha = /^\d{4}-\d{2}-\d{2}$/.test(value);
    if (soloFecha) {
        const [year, month, day] = value.split('-').map(Number);
        const date = new Date(year, month - 1, day); // constructor local, sin UTC
        return format(date, 'dd/MM/yyyy', { locale: es });
    }

    return format(new Date(value), 'dd/MM/yyyy', { locale: es });
};

/**
 * Genera y descarga un archivo Excel con las solicitudes de vacaciones
 */
export const exportarSolicitudesExcel = (
    solicitudes: VacationRequest[],
    empleadoNombre: string = 'Empleado',
    meta?: ExportMeta
): void => {
    try {
        const excelRows: ExcelSolicitudRow[] = solicitudes.map(solicitud => ({
            ID: solicitud.id,
            Empleado: solicitud.employeeName || empleadoNombre,
            Area: solicitud.employeeArea || meta?.empleadoArea || '',
            Grupo: solicitud.employeeGroup || meta?.empleadoGrupo || '',
            Tipo: solicitud.type === 'day_exchange' ? 'Intercambio de dia' : 'Festivo trabajado',
            Estado:
                solicitud.status === 'approved' ? 'Aprobada' :
                    solicitud.status === 'rejected' ? 'Rechazada' : 'Pendiente',
            'Fecha Solicitud': formatDate(solicitud.requestDate),
            'Fecha Original': solicitud.dayToGive
                ? formatDate(solicitud.dayToGive)
                : solicitud.workedHoliday
                    ? formatDate(solicitud.workedHoliday)
                    : '',
            'Fecha Nueva': formatDate(solicitud.requestedDay),
            'Fecha Respuesta/Atencion': formatDate(solicitud.responseDate),
            Reviso: solicitud.reviewer || '',
            'Solicitado por': solicitud.requester || '',
            'Motivo Rechazo': solicitud.rejectionReason || ''
        }));

        const workbook = XLSX.utils.book_new();

        const resumenData = [
            { Concepto: 'Empleado', Valor: empleadoNombre },
            { Concepto: 'Area', Valor: meta?.empleadoArea || '' },
            { Concepto: 'Grupo', Valor: meta?.empleadoGrupo || '' },
            { Concepto: 'Periodo', Valor: meta?.periodoLabel || '' },
            { Concepto: 'Periodo de Reprogramacion activo', Valor: meta?.periodoActivo ? 'Si' : 'No' },
            { Concepto: 'Filtro tipo', Valor: meta?.filtros?.tipo || 'Todos' },
            { Concepto: 'Filtro estado', Valor: meta?.filtros?.estado || 'Todos' },
            { Concepto: 'Total de Solicitudes', Valor: solicitudes.length },
            { Concepto: 'Aprobadas', Valor: solicitudes.filter(s => s.status === 'approved').length },
            { Concepto: 'Rechazadas', Valor: solicitudes.filter(s => s.status === 'rejected').length },
            { Concepto: 'Pendientes', Valor: solicitudes.filter(s => s.status === 'pending').length },
            { Concepto: 'Fecha de Generacion', Valor: format(new Date(), 'dd/MM/yyyy HH:mm', { locale: es }) }
        ];

        const resumenWorksheet = XLSX.utils.json_to_sheet(resumenData);
        resumenWorksheet['!cols'] = [{ wch: 28 }, { wch: 40 }];
        XLSX.utils.book_append_sheet(workbook, resumenWorksheet, 'Resumen');

        const worksheet = XLSX.utils.json_to_sheet(excelRows);
        worksheet['!cols'] = [
            { wch: 8 },   // ID
            { wch: 28 },  // Empleado
            { wch: 18 },  // Area
            { wch: 18 },  // Grupo
            { wch: 20 },  // Tipo
            { wch: 12 },  // Estado
            { wch: 16 },  // Fecha Solicitud
            { wch: 16 },  // Fecha Original
            { wch: 16 },  // Fecha Nueva
            { wch: 18 },  // Fecha Respuesta
            { wch: 18 },  // Reviso
            { wch: 18 },  // Solicitado por
            { wch: 30 },  // Motivo Rechazo
        ];
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Solicitudes');

        const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([excelBuffer], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        });

        const fileName = `Solicitudes_${empleadoNombre.replace(/\s/g, '_')}_${format(new Date(), 'yyyyMMdd_HHmmss')}.xlsx`;
        saveAs(blob, fileName);
    } catch (error) {
        console.error('Error al generar el archivo Excel:', error);
        throw new Error('No se pudo generar el archivo Excel. Por favor, intente nuevamente.');
    }
};

/**
 * Genera y descarga un archivo CSV con las solicitudes
 */
export const exportarSolicitudesCSV = (
    solicitudes: VacationRequest[],
    empleadoNombre: string = 'Empleado',
    meta?: ExportMeta
): void => {
    try {
        const headers = [
            'ID',
            'Empleado',
            'Area',
            'Grupo',
            'Tipo',
            'Estado',
            'Fecha Solicitud',
            'Fecha Original',
            'Fecha Nueva',
            'Fecha Respuesta/Atencion',
            'Reviso',
            'Solicitado por',
            'Motivo Rechazo'
        ];

        const rows = solicitudes.map(solicitud => [
            solicitud.id,
            solicitud.employeeName || empleadoNombre,
            solicitud.employeeArea || meta?.empleadoArea || '',
            solicitud.employeeGroup || meta?.empleadoGrupo || '',
            solicitud.type === 'day_exchange' ? 'Intercambio de dia' : 'Festivo trabajado',
            solicitud.status === 'approved' ? 'Aprobada' :
                solicitud.status === 'rejected' ? 'Rechazada' : 'Pendiente',
            formatDate(solicitud.requestDate),
            solicitud.dayToGive
                ? formatDate(solicitud.dayToGive)
                : solicitud.workedHoliday
                    ? formatDate(solicitud.workedHoliday)
                    : '',
            formatDate(solicitud.requestedDay),
            formatDate(solicitud.responseDate),
            solicitud.reviewer || '',
            solicitud.requester || '',
            solicitud.rejectionReason || ''
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');

        const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' });
        const fileName = `Solicitudes_${empleadoNombre.replace(/\s/g, '_')}_${format(new Date(), 'yyyyMMdd_HHmmss')}.csv`;
        saveAs(blob, fileName);
    } catch (error) {
        console.error('Error al generar el archivo CSV:', error);
        throw new Error('No se pudo generar el archivo CSV. Por favor, intente nuevamente.');
    }
};
