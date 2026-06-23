import * as XLSX from 'xlsx';
import { UNIDADES, sumUnidades } from './costosUtils.js';

const enc = XLSX.utils.encode_cell;
const FMT_MONEY = '"$"\\ #,##0.00;[Red]\\-"$"\\ #,##0.00';
const FMT_USD = '"USD" #,##0.00';
const FMT_P2 = '0.00%';
const FMT_P0 = '0%';

const MES_ABR = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function fmt(ws, r, c, z) {
  const cell = ws[enc({ r, c })];
  if (cell && typeof cell.v === 'number') cell.z = z;
}
function setCell(ws, r, c, v, z) {
  const ref = enc({ r, c });
  ws[ref] = { t: typeof v === 'number' ? 'n' : 's', v };
  if (z && typeof v === 'number') ws[ref].z = z;
}

// Exporta una hoja "Resumen mensual" calcando la planilla de referencia: tabla por colaborador
// (fecha, nombre, Costo Laboral %, Horas asignadas, Asignado $$ operacion, 8 unidades con
// Hs. Asignadas / Impacto $$, fila de $ por unidad arriba, semanas en columnas) y el bloque
// inferior (operacion, cooptech y desglose I+D / gasto). Sin columna Cooptech en la tabla.
export function exportarMesXlsx({
  mesLabel, mesKey, clMes, cdMes, usdMes, dist, asignaciones, weeks,
  totAsignOp, totCooptechPct, totImpactoUnidad, promOp, promCoop, idDPct, residualPct,
}) {
  const N = UNIDADES.length;
  const W = weeks?.length || 0;
  const hayCl = clMes > 0;
  const hayUsd = clMes > 0 && cdMes > 0;

  // Columnas: 0 fecha · 1 nombre · 2 Costo Lab. % · 3 Horas asig. · 4 Asignado op.
  //           unidad i: 5+2i (Hs. Asignadas) y 6+2i (Impacto $$) · 21 separador · 22+ semanas
  const cUni = (i) => 5 + 2 * i;
  const cSemana = (i) => 22 + i;

  // Filas: 0 = $ por unidad · 1 = encabezado nivel 1 · 2 = subencabezado · 3 = semanas · 4 = primer dato
  const R_DINERO = 0, R_H1 = 1, R_H2 = 2, R_SEM = 3, R_DATA = 4;
  const rows = dist.rows;
  const dataEnd = R_DATA + rows.length - 1;
  const R_TOT = dataEnd + 1;

  const ws = {};
  const merges = [];

  // ---- Fila 0: $ por unidad ----
  UNIDADES.forEach((u, i) => {
    setCell(ws, R_DINERO, cUni(i), hayCl ? totImpactoUnidad[u.id] * clMes : 0, FMT_MONEY);
    merges.push({ s: { r: R_DINERO, c: cUni(i) }, e: { r: R_DINERO, c: cUni(i) + 1 } });
  });

  // ---- Encabezados ----
  setCell(ws, R_H1, 2, 'Costo Laboral %');
  setCell(ws, R_H1, 3, 'Horas asignadas');
  setCell(ws, R_H1, 4, 'Asignado $$ operación');
  [2, 3, 4].forEach((c) => merges.push({ s: { r: R_H1, c }, e: { r: R_H2, c } }));
  UNIDADES.forEach((u, i) => {
    setCell(ws, R_H1, cUni(i), u.label);
    merges.push({ s: { r: R_H1, c: cUni(i) }, e: { r: R_H1, c: cUni(i) + 1 } });
    setCell(ws, R_H2, cUni(i), 'Hs. Asignadas');
    setCell(ws, R_H2, cUni(i) + 1, 'Impacto $$');
  });
  // Encabezado de semanas (fila 3)
  weeks?.forEach((w, i) => {
    const ini = w.monday, fin = w.sunday;
    const dd = (d) => String(d.getDate()).padStart(2, '0');
    setCell(ws, R_SEM, cSemana(i), `Semana ${w.num} - ${dd(ini)} al ${dd(fin)}`);
  });

  // ---- Filas por colaborador ----
  rows.forEach((r, ri) => {
    const rr = R_DATA + ri;
    const sumU = sumUnidades(r.unidades);
    setCell(ws, rr, 1, r.nombre);
    setCell(ws, rr, 2, r.peso, FMT_P2);
    setCell(ws, rr, 3, sumU, FMT_P0);
    setCell(ws, rr, 4, sumU * r.peso, FMT_P0);
    UNIDADES.forEach((u, i) => {
      const hs = r.unidades[u.id] || 0;
      setCell(ws, rr, cUni(i), hs, FMT_P0);
      setCell(ws, rr, cUni(i) + 1, hs * r.peso, FMT_P0);
    });
    const wks = asignaciones?.[r.id]?.weeks || [];
    weeks?.forEach((w, i) => {
      const s = wks[i]?.summary?.trim();
      if (s) setCell(ws, rr, cSemana(i), s);
    });
  });
  // Columna de fecha (mes) a la izquierda, combinada sobre las filas de datos
  if (mesKey && rows.length) {
    const [y, m] = mesKey.split('-').map(Number);
    setCell(ws, R_DATA, 0, `${MES_ABR[m - 1]}-${String(y).slice(2)}`);
    merges.push({ s: { r: R_DATA, c: 0 }, e: { r: dataEnd, c: 0 } });
  }

  // ---- Fila de totales ----
  const sumHorasOp = rows.reduce((s, r) => s + sumUnidades(r.unidades), 0);
  setCell(ws, R_TOT, 3, sumHorasOp, FMT_P0);
  UNIDADES.forEach((u, i) => setCell(ws, R_TOT, cUni(i) + 1, totImpactoUnidad[u.id], FMT_P2));

  // ---- Bloque inferior ----
  // "HORAS" = promedio simple de las jornadas asignadas; "$$$" = ponderado por costo (impacto en dinero).
  const opUsd = hayUsd ? (clMes * totAsignOp) / cdMes : null;
  const coUsd = hayUsd ? (clMes * totCooptechPct) / cdMes : null;
  const propID = totCooptechPct > 0 ? idDPct / totCooptechPct : 0; // I+D como fraccion del Cooptech
  const cooptDinero = clMes * totCooptechPct;
  const idDinero = clMes * idDPct;          // = cooptDinero * propID
  const gastoDinero = clMes * residualPct;  // = cooptDinero * (1 - propID)

  let r = R_TOT + 1;
  // Costo laboral del mes
  setCell(ws, r, 0, `Costo laboral ${mesLabel}`); merges.push({ s: { r, c: 0 }, e: { r, c: 2 } });
  setCell(ws, r, 3, hayCl ? clMes : 0, FMT_MONEY); merges.push({ s: { r, c: 3 }, e: { r, c: 5 } });
  r += 1;
  // Cotizacion
  setCell(ws, r, 9, 'Cotización dólar'); merges.push({ s: { r, c: 9 }, e: { r, c: 11 } });
  setCell(ws, r, 12, cdMes || 0, '#,##0.00');
  if (mesKey) {
    const [y, m] = mesKey.split('-').map(Number);
    const fin = new Date(y, m, 0);
    setCell(ws, r, 13, `${String(fin.getDate()).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`);
    merges.push({ s: { r, c: 13 }, e: { r, c: 14 } });
  }
  r += 1;
  // Operacion
  setCell(ws, r, 0, 'ASIGNACION TOTAL HORAS OPERACION');
  setCell(ws, r, 4, promOp, FMT_P2); merges.push({ s: { r, c: 4 }, e: { r, c: 5 } });
  r += 1;
  setCell(ws, r, 0, 'ASIGNACION TOTAL $$$ OPERACION');
  setCell(ws, r, 4, totAsignOp, FMT_P2); merges.push({ s: { r, c: 4 }, e: { r, c: 5 } });
  setCell(ws, r, 7, hayCl ? clMes * totAsignOp : 0, FMT_MONEY); merges.push({ s: { r, c: 7 }, e: { r, c: 9 } });
  if (opUsd != null) { setCell(ws, r, 11, opUsd, FMT_USD); merges.push({ s: { r, c: 11 }, e: { r, c: 13 } }); }
  r += 2;
  // Cooptech
  setCell(ws, r, 0, 'ASIGNACION TOTAL HORAS COOPTECH');
  setCell(ws, r, 4, promCoop, FMT_P2); merges.push({ s: { r, c: 4 }, e: { r, c: 5 } });
  r += 1;
  setCell(ws, r, 0, 'ASIGNACION TOTAL $$$ COOPTECH');
  setCell(ws, r, 4, totCooptechPct, FMT_P2); merges.push({ s: { r, c: 4 }, e: { r, c: 5 } });
  setCell(ws, r, 7, hayCl ? cooptDinero : 0, FMT_MONEY); merges.push({ s: { r, c: 7 }, e: { r, c: 9 } });
  if (coUsd != null) { setCell(ws, r, 11, coUsd, FMT_USD); merges.push({ s: { r, c: 11 }, e: { r, c: 13 } }); }
  r += 2;
  // Desglose
  setCell(ws, r, 0, 'HORAS I+D A ACTIVAR');
  setCell(ws, r, 4, propID, FMT_P2); merges.push({ s: { r, c: 4 }, e: { r, c: 5 } });
  setCell(ws, r, 7, hayCl ? idDinero : 0, FMT_MONEY); merges.push({ s: { r, c: 7 }, e: { r, c: 9 } });
  if (hayUsd) { setCell(ws, r, 11, idDinero / cdMes, FMT_USD); merges.push({ s: { r, c: 11 }, e: { r, c: 13 } }); }
  setCell(ws, r, 14, 'LAS HORAS A ACTIVAR SON UN PORCENTAJE DE LAS HORAS DESIGNADAS A PROYECTOS DE COOPTECH');
  merges.push({ s: { r, c: 14 }, e: { r: r + 1, c: 18 } });
  r += 1;
  setCell(ws, r, 0, 'HORAS ASIGNADAS A GASTO');
  setCell(ws, r, 7, hayCl ? gastoDinero : 0, FMT_MONEY); merges.push({ s: { r, c: 7 }, e: { r, c: 9 } });
  if (hayUsd) { setCell(ws, r, 11, gastoDinero / cdMes, FMT_USD); merges.push({ s: { r, c: 11 }, e: { r, c: 13 } }); }

  // ---- Rango, merges, anchos ----
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: r + 1, c: Math.max(20, 21 + W) } });
  ws['!merges'] = merges;
  ws['!cols'] = [
    { wch: 8 }, { wch: 24 }, { wch: 9 }, { wch: 9 }, { wch: 11 },
    ...UNIDADES.flatMap(() => [{ wch: 10 }, { wch: 9 }]),
    { wch: 3 },
    ...Array.from({ length: W }, () => ({ wch: 40 })),
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Resumen mensual');
  XLSX.writeFile(wb, `Resumen_mensual_${mesLabel.replace(/\s+/g, '_')}.xlsx`);
}
