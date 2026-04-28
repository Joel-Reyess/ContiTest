import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { ReporteDiasReprogramadosEmpresa } from '@/interfaces/Api.interface';

interface EdicionDiasEmpresaExcelMeta {
    area?: string;
    anio?: number;
}

const parseDateToLocal = (value: string): Date => {
    const onlyDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (onlyDate) {
        return new Date(
            parseInt(onlyDate[1], 10),
            parseInt(onlyDate[2], 10) - 1,
            parseInt(onlyDate[3], 10),
        );
    }
    return new Date(value);
};

const formatDate = (value?: string | null): string => {
    if (!value) return '';
    return format(parseDateToLocal(value), 'dd/MM/yyyy', { locale: es });
};

const formatDateTime = (value?: string | null): string => {
    if (!value) return '';
    return format(new Date(value), 'dd/MM/yyyy HH:mm', { locale: es });
};

export const exportarEdicionDiasEmpresaExcel = (
    datos: ReporteDiasReprogramadosEmpresa[],
    meta: EdicionDiasEmpresaExcelMeta = {}
): void => {
    const workbook = XLSX.utils.book_new();

    const resumenData = [
        { Concepto: 'Título', Valor: 'Reprogramación de días asignados por la empresa' },
        { Concepto: 'Área', Valor: meta.area || 'Todas' },
        { Concepto: 'Año', Valor: meta.anio ?? 'Todos' },
        { Concepto: 'Total registros', Valor: datos.length },
        { Concepto: 'Aprobadas', Valor: datos.filter(d => d.estadoSolicitud === 'Aprobada').length },
        { Concepto: 'Rechazadas', Valor: datos.filter(d => d.estadoSolicitud === 'Rechazada').length },
        { Concepto: 'Pendientes', Valor: datos.filter(d => d.estadoSolicitud === 'Pendiente').length },
        { Concepto: 'Generado el', Valor: format(new Date(), 'dd/MM/yyyy HH:mm', { locale: es }) },
    ];

    const resumenSheet = XLSX.utils.json_to_sheet(resumenData);
    resumenSheet['!cols'] = [{ wch: 26 }, { wch: 38 }];
    XLSX.utils.book_append_sheet(workbook, resumenSheet, 'Resumen');

    const detailRows = datos.map(d => ({
        'ID': d.id,
        'Nómina': d.nomina ?? '',
        'Empleado': d.nombreEmpleado,
        'Área': d.area ?? '',
        'Grupo': d.grupo ?? '',
        'Estado': d.estadoSolicitud,
        'Fecha solicitud': formatDateTime(d.fechaSolicitud),
        'Día original': formatDate(d.fechaOriginal),
        'Nueva fecha': formatDate(d.fechaNueva),
        'Fecha respuesta': formatDateTime(d.fechaRespuesta),
        'Solicitado por': d.nombreSolicitadoPor ?? '',
        'Jefe que respondió': d.nombreJefeArea ?? '',
        'Observaciones': d.observacionesEmpleado ?? '',
        'Motivo rechazo': d.motivoRechazo ?? '',
    }));

    const detailSheet = XLSX.utils.json_to_sheet(detailRows);
    detailSheet['!cols'] = [
        { wch: 8 },
        { wch: 12 },
        { wch: 32 },
        { wch: 22 },
        { wch: 18 },
        { wch: 14 },
        { wch: 18 },
        { wch: 16 },
        { wch: 16 },
        { wch: 18 },
        { wch: 28 },
        { wch: 28 },
        { wch: 40 },
        { wch: 32 },
    ];
    XLSX.utils.book_append_sheet(workbook, detailSheet, 'Días Reprogramados Empresa');

    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const safeArea = (meta.area || 'todas').replace(/\s+/g, '_');
    const safeAnio = meta.anio ?? 'todos';
    const fileName = `Reprogramacion_DiasEmpresa_${safeArea}_${safeAnio}_${format(new Date(), 'yyyyMMdd_HHmmss')}.xlsx`;
    saveAs(blob, fileName);
};
