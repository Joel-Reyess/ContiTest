import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type { EmpleadosEnVacacionesResponse } from '@/interfaces/Api.interface';

export const generarExcelEmpleadosEnVacaciones = (data: EmpleadosEnVacacionesResponse): void => {
  const workbook = XLSX.utils.book_new();

  const resumen = [
    { Concepto: 'Fecha consulta', Valor: format(parseISO(String(data.fechaConsulta).slice(0, 10)), "dd/MM/yyyy", { locale: es }) },
    { Concepto: 'Total registros', Valor: data.totalRegistros },
    { Concepto: 'Total empleados', Valor: data.totalEmpleados },
    {
      Concepto: 'Fecha del reporte',
      Valor: format(new Date(data.fechaReporte), "dd/MM/yyyy HH:mm", { locale: es })
    }
  ];

  const resumenSheet = XLSX.utils.json_to_sheet(resumen);
  resumenSheet['!cols'] = [{ wch: 28 }, { wch: 32 }];
  XLSX.utils.book_append_sheet(workbook, resumenSheet, 'Resumen');

  const detalle = data.empleados
    .slice()
    .sort((a, b) => {
      const area = (a.nombreArea || '').localeCompare(b.nombreArea || '');
      if (area !== 0) return area;
      const grupo = (a.nombreGrupo || '').localeCompare(b.nombreGrupo || '');
      if (grupo !== 0) return grupo;
      return (a.nomina || '').localeCompare(b.nomina || '');
    })
    .map((empleado) => ({
      'Nomina': empleado.nomina,
      'Nombre': empleado.nombreCompleto,
      'Area': empleado.nombreArea || '',
      'Grupo': empleado.nombreGrupo || '',
      // La fecha llega como yyyy-MM-dd: con new Date() se lee en UTC y en México sale un día antes
      // (un domingo se veía como sábado en el Excel). parseISO la lee como fecha local.
      'Fecha Vacacion': format(parseISO(String(empleado.fechaVacacion).slice(0, 10)), "dd/MM/yyyy", { locale: es }),
      'Dia': format(parseISO(String(empleado.fechaVacacion).slice(0, 10)), "EEEE", { locale: es }),
      'Tipo': empleado.tipoVacacion,
      'Origen': empleado.origenAsignacion,
      'Estado': empleado.estadoVacacion,
      'Periodo': empleado.periodoProgramacion,
      'Maquina': empleado.maquina ?? '',
      'Observaciones': empleado.observaciones ?? '',
    }));

  const detalleSheet = XLSX.utils.json_to_sheet(detalle);
  detalleSheet['!cols'] = [
    { wch: 12 }, // Nomina
    { wch: 32 }, // Nombre
    { wch: 22 }, // Area
    { wch: 18 }, // Grupo
    { wch: 14 }, // Fecha vacacion
    { wch: 12 }, // Dia
    { wch: 16 }, // Tipo
    { wch: 16 }, // Origen
    { wch: 12 }, // Estado
    { wch: 16 }, // Periodo
    { wch: 14 }, // Maquina
    { wch: 40 }, // Observaciones
  ];
  XLSX.utils.book_append_sheet(workbook, detalleSheet, 'Empleados');

  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });

  const fileName = `Empleados_En_Vacaciones_${format(new Date(data.fechaConsulta), 'yyyyMMdd')}_${format(new Date(), 'HHmmss')}.xlsx`;
  saveAs(blob, fileName);
};
