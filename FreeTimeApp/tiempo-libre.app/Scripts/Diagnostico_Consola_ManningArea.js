// =============================================================================
// DIAGNÓSTICO DESDE EL NAVEGADOR (27-nov-2026). SOLO LEE: no guarda ni cambia nada.
//
// Para qué: saber por qué un área no deja capturar días ni recibe días por la
// empresa (Herramental, Mtto. A), sin entrar a la base de datos.
//
// Cómo: entrar a la app con un Super Usuario, F12 -> pestaña "Console", pegar
// TODO este archivo y Enter. (Si Chrome no deja pegar, escribir antes:
// allow pasting). Al terminar, mandar captura o copiar el texto que salió.
//
// Qué revisa por área y por fecha:
//   * manning (personal requerido), plantilla (personas activas) y ausentes;
//   * si el candado de manning deja faltar a una persona más ese día;
//   * quién está ausente ese día;
//   * (solo SIMULA) qué pasaría al asignar los días por la empresa a esa área
//     y el motivo de cada empleado al que no se le pueden asignar.
// =============================================================================
(async () => {
  const API = 'http://slas052a:5050';
  const AREAS = ['herramental', 'mtto. a'];            // parte del nombre, en minúsculas
  const FECHAS = ['2027-03-15', '2027-04-02', '2027-09-12', '2027-12-16', '2027-12-18'];
  const SIMULAR_EMPRESA_EN = ['herramental'];          // áreas donde simular la asignación ([] = ninguna)
  const ANIO = 2027;

  const h = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('auth_token') };
  const pedir = async (url, body) => {
    const r = await fetch(API + url, body ? { method: 'POST', headers: h, body: JSON.stringify(body) } : { headers: h });
    const j = await r.json().catch(() => ({}));
    if (!r.ok && !j.data) throw new Error(`${r.status} ${j.errorMsg || j.message || ''}`.trim());
    return j.data ?? j;
  };
  const n1 = (x) => Math.round(x * 10) / 10;
  const salida = [];
  const di = (t) => { salida.push(t); console.log(t); };

  const todas = await pedir('/api/Area');
  const areas = todas.filter((a) => AREAS.some((n) => (a.nombreGeneral || '').toLowerCase().includes(n)));
  if (areas.length === 0) di('No se encontró ninguna de las áreas: ' + AREAS.join(', '));

  for (const a of areas) {
    di(`\n===== ${a.nombreGeneral} (id ${a.areaId}) — manning capturado del área: ${a.manning} =====`);
    let plantilla = 0, pct = 0, manning = a.manning;
    for (const f of FECHAS) {
      let d;
      try { d = await pedir(`/api/ausencias/fecha/${f}?areaId=${a.areaId}`); }
      catch (e) { di(`  ${f}: no se pudo consultar (${e.message})`); continue; }
      const g = d.ausenciasPorGrupo || [];
      plantilla = g.reduce((s, x) => s + x.personalTotal, 0);
      const ausentes = g.reduce((s, x) => s + x.personalNoDisponible, 0);
      pct = g.length ? Math.max(...g.map((x) => x.porcentajeMaximoPermitido)) : 0;
      manning = g.length ? Math.max(...g.map((x) => x.manningRequerido)) : a.manning;   // con excepción del mes, si hay
      const quedarian = plantilla - ausentes - 1;
      const deficit = manning > 0 ? ((manning - quedarian) / manning) * 100 : 0;
      const bloquea = manning > 0 && deficit > pct;
      di(`  ${f}: manning ${manning}, plantilla ${plantilla}, ausentes ${ausentes}. Si falta 1 más quedarían ${quedarian}` +
         ` → déficit ${n1(deficit)}% (máximo ${pct}%) → ${bloquea ? 'BLOQUEADO POR MANNING DEL ÁREA' : 'el manning sí lo permite'}`);
      const quienes = g.flatMap((x) => (x.empleadosAusentes || []).map((e) => `${e.nomina ?? ''} ${e.nombreCompleto} [${x.nombreGrupo}] ${e.tipoVacacion || e.tipoAusencia}`));
      if (quienes.length) di('      ausentes ese día: ' + quienes.join('; '));
      const gruposLlenos = g.filter((x) => !x.puedeReservar).map((x) => `${x.nombreGrupo} (${x.personalTotal} pers.)`);
      if (gruposLlenos.length) di('      grupos que ese día NO admiten a nadie más: ' + gruposLlenos.join(', '));
    }
    if (manning > 0 && plantilla > 0) {
      const maxAusentes = Math.max(0, Math.floor(plantilla - manning * (1 - pct / 100)));
      const manningTope = Math.floor((plantilla - 1) / (1 - pct / 100));
      di(`  RESUMEN: con manning ${manning}, plantilla ${plantilla} y ${pct}%, en TODA el área pueden faltar a la vez ${maxAusentes} persona(s) por día.` +
         (maxAusentes === 0 ? ` NADIE puede faltar ningún día: por eso no hay días por la empresa ni captura. Para que pueda faltar 1, el manning debe ser ${manningTope} o menos (o 0 para quitar este candado).`
                            : maxAusentes === 1 ? ' Si un compañero del área (de cualquier grupo) ya tiene ese día, a los demás se les rechaza.' : ''));
    } else if (manning === 0) {
      di('  RESUMEN: el área no tiene manning capturado; este candado no aplica. Solo rige la regla de cada grupo.');
    }

    if (SIMULAR_EMPRESA_EN.some((n) => (a.nombreGeneral || '').toLowerCase().includes(n))) {
      try {
        const grupoIds = (a.grupos || []).map((x) => x.grupoId);
        di(`  Simulando la asignación por la empresa ${ANIO} (no guarda nada), grupos: ${grupoIds.join(', ')} ...`);
        const s = await pedir('/api/asignacion-automatica/simular', { anio: ANIO, grupoIds });
        di(`  SIMULACIÓN: procesados ${s.totalEmpleadosProcesados}, con días ${s.totalEmpleadosAsignados}, días que se asignarían ${s.totalDiasAsignados}`);
        (s.resultadosPorEmpleado || []).forEach((r) =>
          di(`      ${r.nomina} ${r.nombreCompleto} [${r.nombreGrupo}]: ` +
             (r.asignacionExitosa ? `se le asignarían ${r.diasAsignados} día(s)` : `NO: ${r.motivoFallo}`)));
        (s.advertencias || []).filter((x) => x.includes('ya tenía')).forEach((x) => di('      ' + x));
      } catch (e) { di(`  No se pudo simular (${e.message}). Requiere Super Usuario.`); }
    }
  }
  di('\nListo. Copia este texto o manda captura.');
  try { await navigator.clipboard.writeText(salida.join('\n')); console.log('(El resultado ya quedó copiado: pégalo con Ctrl+V)'); } catch { /* sin permiso de portapapeles */ }
})();
