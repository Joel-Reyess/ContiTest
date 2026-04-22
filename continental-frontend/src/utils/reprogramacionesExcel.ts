import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Solicitud } from '@/interfaces/Solicitudes.interface';

interface ReprogramacionExportMeta {
  titulo: string;
  area?: string;
  fechaDesde?: string;
  fechaHasta?: string;
  tipo?: 'general' | 'hu57';
}

// Fechas "YYYY-MM-DD" del backend se parsean como UTC si se pasan a `new Date()`,
// lo que en zonas UTC- desplaza la fecha un día hacia atrás al formatearla en local.
// Parseamos el segmento de fecha como hora local para preservar el día original.
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

/**
 * Genera un Excel con las solicitudes de reprogramación
 */
export const exportarReprogramacionesExcel = (
  solicitudes: Solicitud[],
  meta: ReprogramacionExportMeta
): void => {
  const workbook = XLSX.utils.book_new();

  const resumenData = [
    { Concepto: 'Título', Valor: meta.titulo },
    { Concepto: 'Tipo', Valor: meta.tipo ?? 'general' },
    { Concepto: 'Área', Valor: meta.area || 'Todas' },
    { Concepto: 'Fecha desde', Valor: meta.fechaDesde ? formatDate(meta.fechaDesde) : 'Sin filtro' },
    { Concepto: 'Fecha hasta', Valor: meta.fechaHasta ? formatDate(meta.fechaHasta) : 'Sin filtro' },
    { Concepto: 'Total solicitudes', Valor: solicitudes.length },
    { Concepto: 'Aprobadas', Valor: solicitudes.filter(s => s.estadoSolicitud === 'Aprobada').length },
    { Concepto: 'Rechazadas', Valor: solicitudes.filter(s => s.estadoSolicitud === 'Rechazada').length },
    { Concepto: 'Pendientes', Valor: solicitudes.filter(s => s.estadoSolicitud === 'Pendiente').length },
    { Concepto: 'Generado el', Valor: format(new Date(), 'dd/MM/yyyy HH:mm', { locale: es }) },
  ];

  const resumenSheet = XLSX.utils.json_to_sheet(resumenData);
  resumenSheet['!cols'] = [{ wch: 26 }, { wch: 38 }];
  XLSX.utils.book_append_sheet(workbook, resumenSheet, 'Resumen');

  const detailRows = solicitudes.map((s) => ({
    ID: s.id,
    Nomina: s.nominaEmpleado,
    Empleado: s.nombreEmpleado,
    Area: s.areaEmpleado,
    Grupo: s.grupoEmpleado,
    Estado: s.estadoSolicitud,
    'Fecha solicitud': formatDate(s.fechaSolicitud),
    'Fecha original': formatDate(s.fechaOriginal),
    'Fecha nueva': formatDate(s.fechaNueva),
    'Fecha resolución': formatDate(s.fechaAprobacion || null),
    'Solicitado por': s.solicitadoPor,
    'Aprobado por': (s as any)?.aprobadoPor ?? '',
    'Motivo': s.motivo,
    'Motivo rechazo': (s as any)?.motivoRechazo ?? '',
  }));

  const detailSheet = XLSX.utils.json_to_sheet(detailRows);
  detailSheet['!cols'] = [
    { wch: 8 },
    { wch: 12 },
    { wch: 32 },
    { wch: 22 },
    { wch: 18 },
    { wch: 14 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 18 },
    { wch: 18 },
    { wch: 40 },
    { wch: 32 },
  ];
  XLSX.utils.book_append_sheet(workbook, detailSheet, 'Reprogramaciones');

  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });

  const safeArea = (meta.area || 'todas').replace(/\s+/g, '_');
  const fileName = `Reprogramaciones_${meta.tipo || 'general'}_${safeArea}_${format(new Date(), 'yyyyMMdd_HHmmss')}.xlsx`;
  saveAs(blob, fileName);
};

export default exportarReprogramacionesExcel;
