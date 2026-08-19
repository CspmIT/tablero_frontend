import { useEffect, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { useData } from '../data/DataContext.jsx';

// Grilla Típica (19/08, pedido de los colaboradores vía Leonardo):
// 1) Semana default por colaborador (estado + hora de ingreso por día hábil).
//    El default es VISUAL: la grilla lo muestra en los días sin carga y el
//    editor del día lo precarga — recién se escribe en la base cuando el día
//    se GUARDA. Feriados, vacaciones y cualquier carga real lo pisan solos.
// 2) Vacaciones por rango: crea entradas reales estado 'vacaciones' en los
//    días hábiles del rango, salteando feriados y días ya cargados (solo crea,
//    nunca pisa). Reversible día a día desde el editor de la grilla.
const DIAS = [
  { d: '1', label: 'Lunes' },
  { d: '2', label: 'Martes' },
  { d: '3', label: 'Miércoles' },
  { d: '4', label: 'Jueves' },
  { d: '5', label: 'Viernes' },
];

export default function GrillaTipica() {
  const { api, colaboradores } = useData();
  // Externos no cargan grilla; el resto (internos y tercerizados) sí.
  const equipo = (colaboradores || []).filter((c) => c.tipo !== 'externo');

  const [tipica, setTipica] = useState(null); // null = cargando
  const [sucio, setSucio] = useState(false);
  const [msg, setMsg] = useState(null); // { txt, ok } | { err }

  useEffect(() => {
    api.grilla.tipica()
      .then((r) => setTipica(r?.tipica && typeof r.tipica === 'object' ? r.tipica : {}))
      .catch((e) => { setTipica({}); setMsg({ err: e.message || 'No se pudo cargar la grilla típica' }); });
  }, [api]);

  const celda = (colabId, d) => tipica?.[colabId]?.[d] || null;
  const setCelda = (colabId, d, valor) => {
    setTipica((t) => {
      const nuevo = { ...t, [colabId]: { ...(t[colabId] || {}) } };
      if (valor) nuevo[colabId][d] = valor; else delete nuevo[colabId][d];
      if (!Object.keys(nuevo[colabId]).length) delete nuevo[colabId];
      return nuevo;
    });
    setSucio(true); setMsg(null);
  };

  const guardar = async () => {
    try {
      const r = await api.grilla.guardarTipica(tipica);
      setTipica(r?.tipica || tipica);
      setSucio(false);
      setMsg({ txt: '✓ Grilla típica guardada — ya aparece como default en los días sin carga.', ok: true });
    } catch (e) { setMsg({ err: e.message || 'No se pudo guardar' }); }
  };

  // Copiar el lunes al resto de la semana (caso típico: mismo horario toda la semana).
  const copiarLunes = (colabId) => {
    const lun = celda(colabId, '1');
    if (!lun) return;
    setTipica((t) => ({ ...t, [colabId]: { 1: lun, 2: { ...lun }, 3: { ...lun }, 4: { ...lun }, 5: { ...lun } } }));
    setSucio(true);
  };

  // ---------- Vacaciones por rango ----------
  const [vacColab, setVacColab] = useState('');
  const [vacDesde, setVacDesde] = useState('');
  const [vacHasta, setVacHasta] = useState('');
  const [vacConfirmando, setVacConfirmando] = useState(false);
  const [vacMsg, setVacMsg] = useState(null);
  const [vacCargando, setVacCargando] = useState(false);
  const vacListo = vacColab && vacDesde && vacHasta && vacHasta >= vacDesde;

  const cargarVacaciones = async () => {
    if (!vacListo) return;
    setVacCargando(true); setVacMsg(null);
    try {
      const r = await api.grilla.cargarVacaciones({ colaboradorId: Number(vacColab), desde: vacDesde, hasta: vacHasta });
      const partes = [`✓ ${r.creados} día(s) de vacaciones cargados`];
      if (r.yaCargados) partes.push(`${r.yaCargados} ya tenían carga (no se tocaron)`);
      if (r.enFeriado) partes.push(`${r.enFeriado} feriado(s) salteado(s)`);
      setVacMsg({ txt: partes.join(' · '), ok: true });
      setVacConfirmando(false); setVacDesde(''); setVacHasta('');
    } catch (e) { setVacMsg({ err: e.message || 'No se pudieron cargar las vacaciones' }); setVacConfirmando(false); }
    finally { setVacCargando(false); }
  };

  const nombreVac = equipo.find((c) => String(c.id) === vacColab)?.nombre || '';

  return (
    <div className="space-y-5">
      {/* ---------- 1 · Semana típica ---------- */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5 mb-1">
          <CalendarClock size={15} className="text-coop-naranja" /> Semana típica por colaborador
        </h3>
        <p className="text-xs text-slate-500 mb-3">
          Lo definido acá aparece <b>por default</b> en los días sin carga de la grilla y precarga el editor del día.
          No escribe nada en la base hasta que el día se guarda; feriados, vacaciones y cualquier carga real lo pisan.
          Dejá un día en «—» para que quede como hasta ahora («+ cargar»).
        </p>
        {tipica === null && <p className="text-sm text-slate-500">Cargando…</p>}
        {tipica !== null && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400 bg-slate-50">
                  <th className="px-2 py-1.5 font-medium">Colaborador</th>
                  {DIAS.map((d) => <th key={d.d} className="px-2 py-1.5 font-medium">{d.label}</th>)}
                  <th className="px-2 py-1.5"></th>
                </tr>
              </thead>
              <tbody>
                {equipo.map((c) => (
                  <tr key={c.id} className="border-t border-slate-100 align-top">
                    <td className="px-2 py-2 font-medium text-slate-700 whitespace-nowrap">{c.nombre}</td>
                    {DIAS.map(({ d }) => {
                      const v = celda(c.id, d);
                      return (
                        <td key={d} className="px-2 py-2">
                          <select value={v?.estado || ''}
                            onChange={(e) => {
                              const estado = e.target.value;
                              if (!estado) setCelda(c.id, d, null);
                              else setCelda(c.id, d, estado === 'present' ? { estado, entryTime: v?.entryTime || '08:00' } : { estado });
                            }}
                            className="border border-slate-300 rounded px-1 py-0.5 text-[11px] bg-white w-full min-w-[7rem]">
                            <option value="">—</option>
                            <option value="present">Presencial</option>
                            <option value="home_office">Home office</option>
                          </select>
                          {v?.estado === 'present' && (
                            <input type="time" value={v.entryTime || '08:00'}
                              onChange={(e) => setCelda(c.id, d, { estado: 'present', entryTime: e.target.value })}
                              className="border border-slate-300 rounded px-1 py-0.5 text-[11px] mt-1 w-full" />
                          )}
                        </td>
                      );
                    })}
                    <td className="px-2 py-2 whitespace-nowrap">
                      {celda(c.id, '1') && (
                        <button onClick={() => copiarLunes(c.id)} title="Copiar el lunes a toda la semana"
                          className="text-[10.5px] text-coop-azul hover:underline">lunes → semana</button>
                      )}
                    </td>
                  </tr>
                ))}
                {!equipo.length && <tr><td colSpan={7} className="p-4 text-center text-slate-400">Sin colaboradores.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center gap-3 mt-3">
          <button onClick={guardar} disabled={!sucio}
            className="px-4 py-1.5 text-sm rounded-lg bg-coop-azul text-white disabled:opacity-40">Guardar cambios</button>
          {sucio && <span className="text-xs text-amber-600">Cambios sin guardar</span>}
          {msg?.txt && <span className="text-xs text-green-600">{msg.txt}</span>}
          {msg?.err && <span className="text-xs text-red-600">{msg.err}</span>}
        </div>
      </div>

      {/* ---------- 2 · Vacaciones por rango ---------- */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-1">Vacaciones por rango</h3>
        <p className="text-xs text-slate-500 mb-3">
          Carga <b>Vacaciones</b> en todos los días hábiles del rango, de una sola vez. Los feriados y los días que ya
          tienen algo cargado <b>no se tocan</b>. Si te equivocás, cada día se corrige desde su editor en la grilla.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-[11px] text-slate-500 mb-0.5">Colaborador</label>
            <select value={vacColab} onChange={(e) => { setVacColab(e.target.value); setVacConfirmando(false); setVacMsg(null); }}
              className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white min-w-[12rem]">
              <option value="">— Elegir —</option>
              {equipo.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-slate-500 mb-0.5">Desde</label>
            <input type="date" value={vacDesde} onChange={(e) => { setVacDesde(e.target.value); setVacConfirmando(false); }}
              className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-[11px] text-slate-500 mb-0.5">Hasta (inclusive)</label>
            <input type="date" value={vacHasta} onChange={(e) => { setVacHasta(e.target.value); setVacConfirmando(false); }}
              className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
          </div>
          {!vacConfirmando ? (
            <button onClick={() => setVacConfirmando(true)} disabled={!vacListo}
              className="px-4 py-1.5 text-sm rounded-lg bg-coop-azul text-white disabled:opacity-40">Cargar vacaciones</button>
          ) : (
            <span className="flex items-center gap-1.5">
              <span className="text-xs text-slate-600">¿Cargar vacaciones de <b>{nombreVac}</b> del {vacDesde.split('-').reverse().join('/')} al {vacHasta.split('-').reverse().join('/')}?</span>
              <button onClick={cargarVacaciones} disabled={vacCargando}
                className="px-3 py-1.5 text-sm rounded-lg bg-coop-azul text-white disabled:opacity-60">{vacCargando ? 'Cargando…' : 'Sí, cargar'}</button>
              <button onClick={() => setVacConfirmando(false)} className="px-2 py-1.5 text-sm rounded-lg border border-slate-300 text-slate-500">No</button>
            </span>
          )}
        </div>
        {vacMsg?.txt && <p className="text-xs mt-2 text-green-600">{vacMsg.txt}</p>}
        {vacMsg?.err && <p className="text-xs mt-2 text-red-600">{vacMsg.err}</p>}
      </div>
    </div>
  );
}
