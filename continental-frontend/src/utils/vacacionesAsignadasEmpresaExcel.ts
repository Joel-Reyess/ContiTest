import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type { VacacionesAsignadasEmpresaResponse } from '@/interfaces/Api.interface';

export const generarExcelVacacionesAsignadasEmpresa = (data: VacacionesAsignadasEmpresaResponse): void => {
  const workbook = XLSX.utils.book_new();

  const resumen = [
    { Concepto: 'Año', Valor: data.anio },
    { Concepto: 'Total vacaciones', Valor: data.totalVacaciones },
    { Concepto: 'Total empleados', Valor: data.totalEmpleados },
    {
      Concepto: 'Fecha del reporte',
      Valor: format(new Date(data.fechaReporte), "dd/MM/yyyy HH:mm", { locale: es })
    }
  ];

  const resumenSheet = XLSX.utils.json_to_sheet(resumen);
  resumenSheet['!cols'] = [{ wch: 28 }, { wch: 35 }];
  XLSX.utils.book_append_sheet(workbook, resumenSheet, 'Resumen');

  const detalle = data.vacaciones
    .slice()
    .sort((a, b) => {
      const area = (a.nombreArea || '').localeCompare(b.nombreArea || '');
      if (area !== 0) return area;
      const grupo = (a.nombreGrupo || '').localeCompare(b.nombreGrupo || '');
      if (grupo !== 0) return grupo;
      return (a.nomina || '').localeCompare(b.nomina || '');
    })
    .map((vacacion) => ({
      'Nomina': vacacion.nomina,
      'Nombre': vacacion.nombreCompleto,
      'Area': vacacion.nombreArea || '',
      'Grupo': vacacion.nombreGrupo || '',
      // La fecha llega como yyyy-MM-dd: con new Date() se lee en UTC y en México sale un día antes
      // (un domingo se veía como sábado en el Excel). parseISO la lee como fecha local.
      'Fecha Vacacion': format(parseISO(String(vacacion.fechaVacacion).slice(0, 10)), "dd/MM/yyyy", { locale: es }),
      'Dia': format(parseISO(String(vacacion.fechaVacacion).slice(0, 10)), "EEEE", { locale: es }),
      'Tipo': vacacion.tipoVacacion,
      'Origen': vacacion.origenAsignacion,
      'Estado': vacacion.estadoVacacion,
      'Periodo': vacacion.periodoProgramacion,
      'Fecha Programacion': format(new Date(vacacion.fechaProgramacion), "dd/MM/yyyy HH:mm", { locale: es }),
      'Maquina': vacacion.maquina ?? '',
      'Observaciones': vacacion.observaciones ?? '',
    }));

  const detalleSheet = XLSX.utils.json_to_sheet(detalle);
  detalleSheet['!cols'] = [
    { wch: 12 }, // Nomina
    { wch: 32 }, // Nombre
    { wch: 22 }, // Area
    { wch: 18 }, // Grupo
    { wch: 14 }, // Fecha vacacion
    { wch: 12 }, // Dia
    { wch: 18 }, // Tipo
    { wch: 16 }, // Origen
    { wch: 12 }, // Estado
    { wch: 16 }, // Periodo
    { wch: 22 }, // Fecha programacion
    { wch: 14 }, // Maquina
    { wch: 40 }, // Observaciones
  ];
  XLSX.utils.book_append_sheet(workbook, detalleSheet, 'Vacaciones');

  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });

  const fileName = `Vacaciones_Asignadas_Empresa_${data.anio}_${format(new Date(), 'yyyyMMdd_HHmmss')}.xlsx`;
  saveAs(blob, fileName);
};
