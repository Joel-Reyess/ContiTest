/**
 * Reporte de días capturados por encima del porcentaje permitido del grupo.
 *
 * Sale del punto 5 de "errores durante la captura del 2026": cuando un día se
 * llenó de más hay que poder desglosar quién capturó cada día —link de
 * operador, jefe de área o superusuario— para entender por qué no se respetó
 * el porcentaje.
 */

import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { DiaRebasePorcentaje } from '@/interfaces/Api.interface';

const fechaCorta = (iso?: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso.includes('T') ? iso : `${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? '' : format(d, 'dd/MM/yyyy', { locale: es });
};

export const generarExcelDiasRebasePorcentaje = (
  filas: DiaRebasePorcentaje[],
  contexto: { anio: number; area: string }
): void => {
  const workbook = XLSX.utils.book_new();

  const resumen = [
    ['DÍAS CAPTURADOS POR ENCIMA DEL PORCENTAJE PERMITIDO'],
    [''],
    ['Año:', contexto.anio],
    ['Área:', contexto.area],
    ['Total de días:', filas.length],
    ['Empleados afectados:', new Set(filas.map((f) => f.nomina)).size],
    ['Generado:', format(new Date(), "d 'de' MMMM 'de' yyyy HH:mm", { locale: es })],
  ];
  const hojaResumen = XLSX.utils.aoa_to_sheet(resumen);
  hojaResumen['!cols'] = [{ wch: 28 }, { wch: 45 }];
  XLSX.utils.book_append_sheet(workbook, hojaResumen, 'Resumen');

  const detalle = filas.map((f) => ({
    'Fecha': fechaCorta(f.fecha),
    'Nómina': f.nomina,
    'Nombre': f.nombreEmpleado,
    'Área': f.area,
    'Grupo': f.grupo,
    '% con ese día': f.porcentajeAlCapturar ?? '',
    'Tipo de vacación': f.tipoVacacion,
    'Origen': f.origenAsignacion,
    'Capturado por': f.capturadoPor ?? 'No registrado',
    'Fecha de captura': f.fechaCaptura ? format(new Date(f.fechaCaptura), 'dd/MM/yyyy HH:mm', { locale: es }) : '',
    'Observaciones': f.observaciones ?? '',
  }));

  const hojaDetalle = XLSX.utils.json_to_sheet(
    detalle.length > 0
      ? detalle
      : [{ 'Fecha': 'Sin días capturados con rebase para los filtros seleccionados' }]
  );
  hojaDetalle['!cols'] = [
    { wch: 12 }, { wch: 12 }, { wch: 35 }, { wch: 22 }, { wch: 14 },
    { wch: 14 }, { wch: 18 }, { wch: 12 }, { wch: 28 }, { wch: 18 }, { wch: 40 },
  ];
  XLSX.utils.book_append_sheet(workbook, hojaDetalle, 'Detalle');

  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  saveAs(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `Dias_con_rebase_${contexto.anio}_${new Date().toISOString().split('T')[0]}.xlsx`
  );
};
