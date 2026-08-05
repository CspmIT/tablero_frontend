// Aprovisionamiento Multivac (05/08 — bloque 2 de la Copa, parte de Lorenzo).
// La app es el CLIENTE del CLI del firmware universal: dos transportes con la
// misma terminal encima — USB serie (Web Serial: funciona HOY con el CLI por
// serie, sin tocar firmware) y Bluetooth BLE (Web Bluetooth + NUS: cuando el
// stack BLE del firmware sea/expose UART BLE). Recetas = secuencias de
// comandos con variables {{asi}}, para cargar la config de un equipo entero
// de una pasada (los comandos exactos los define el CLI de Lorenzo).
import { useEffect, useRef, useState } from 'react';
import { Bluetooth, Usb } from 'lucide-react';

// Servicios UART-BLE candidatos (Lorenzo confirmó BLE; el UUID exacto de su
// stack se detecta probando en orden — y hay campo para pegar uno custom).
const SERVICIOS_UART = [
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART (NUS) — NimBLE típico
  0xFFE0,                                  // HM-10 y clones
  0xABF0,                                  // BLE-SPP de ejemplos Espressif
];

const RECETAS_DEFAULT = [
  {
    nombre: 'Ejemplo — identidad y red (completar con el CLI real)',
    variables: ['nombre', 'ssid', 'clave'],
    comandos: 'help\n# Reemplazar por los comandos reales del CLI de Lorenzo:\n# set nombre {{nombre}}\n# set wifi {{ssid}} {{clave}}\n# save',
  },
];

export default function Multivac() {
  const [transporte, setTransporte] = useState(null); // null | 'serial' | 'ble'
  const [conectado, setConectado] = useState(false);
  const [lineas, setLineas] = useState([]); // { t: 'in'|'out'|'sys', txt }
  const [cmd, setCmd] = useState('');
  const [historial, setHistorial] = useState([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [recetas, setRecetas] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cooptech:multivac_recetas')) || RECETAS_DEFAULT; }
    catch { return RECETAS_DEFAULT; }
  });
  const [recetaSel, setRecetaSel] = useState(0);
  const [vars, setVars] = useState({});
  const [editandoReceta, setEditandoReceta] = useState(false);
  const conexion = useRef({}); // { port, reader, writer } | { device, rxChar }
  const bufferRx = useRef('');
  const finLog = useRef(null);

  const soportaSerial = typeof navigator !== 'undefined' && 'serial' in navigator;
  const soportaBle = typeof navigator !== 'undefined' && 'bluetooth' in navigator;

  const log = (t, txt) => setLineas((ls) => [...ls.slice(-500), { t, txt }]);
  useEffect(() => { finLog.current?.scrollIntoView({ behavior: 'smooth' }); }, [lineas]);

  const procesarEntrada = (chunk) => {
    bufferRx.current += chunk;
    let corte;
    while ((corte = bufferRx.current.indexOf('\n')) >= 0) {
      const linea = bufferRx.current.slice(0, corte).replace(/\r$/, '');
      bufferRx.current = bufferRx.current.slice(corte + 1);
      if (linea) log('in', linea);
    }
  };

  // ---------- Transporte USB (Web Serial): el CLI por serie, tal cual ----------
  const conectarSerial = async () => {
    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 115200 });
      const decoder = new TextDecoderStream();
      port.readable.pipeTo(decoder.writable).catch(() => {});
      const reader = decoder.readable.getReader();
      const writer = port.writable.getWriter();
      conexion.current = { port, reader, writer };
      setTransporte('serial'); setConectado(true);
      log('sys', 'Conectado por USB (115200). Probá "help" para ver los comandos del CLI.');
      (async () => {
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value) procesarEntrada(value);
          }
        } catch { /* puerto cerrado */ }
        setConectado(false); log('sys', 'Conexión USB cerrada.');
      })();
    } catch (e) { if (e?.name !== 'NotFoundError') log('sys', 'USB: ' + (e.message || e)); }
  };

  // ---------- Transporte BLE (Web Bluetooth + NUS) ----------
  const conectarBle = async () => {
    try {
      const custom = (localStorage.getItem('cooptech:multivac_uuid') || '').trim().toLowerCase();
      const candidatos = custom ? [custom, ...SERVICIOS_UART] : SERVICIOS_UART;
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true, // el equipo puede no publicitar el servicio: se elige por nombre
        optionalServices: candidatos,
      });
      const server = await device.gatt.connect();
      // Detectar el servicio UART probando candidatos, y dentro, las
      // características por PROPIEDADES (write / notify) — así los UUIDs
      // exactos del stack de Lorenzo no importan mientras el servicio matchee.
      let rxChar = null, txChar = null, svcUsado = null;
      for (const sv of candidatos) {
        try {
          const service = await server.getPrimaryService(sv);
          const chars = await service.getCharacteristics();
          const tx = chars.find((c) => c.properties.notify || c.properties.indicate);
          const rx = chars.find((c) => c.properties.writeWithoutResponse || c.properties.write);
          if (tx && rx) { txChar = tx; rxChar = rx; svcUsado = sv; break; }
        } catch { /* este candidato no está: probar el siguiente */ }
      }
      if (!txChar || !rxChar) {
        try { device.gatt.disconnect(); } catch { /* */ }
        log('sys', 'Conecté pero no encontré un servicio UART conocido. Pegá el UUID del servicio de Lorenzo en el campo de abajo y reintentá.');
        return;
      }
      await txChar.startNotifications();
      const dec = new TextDecoder();
      txChar.addEventListener('characteristicvaluechanged', (ev) => procesarEntrada(dec.decode(ev.target.value)));
      device.addEventListener('gattserverdisconnected', () => { setConectado(false); log('sys', 'BLE desconectado.'); });
      conexion.current = { device, rxChar };
      setTransporte('ble'); setConectado(true);
      log('sys', `Conectado por Bluetooth a ${device.name || 'Multivac'} (servicio ${typeof svcUsado === 'number' ? '0x' + svcUsado.toString(16).toUpperCase() : svcUsado}).`);
    } catch (e) { if (e?.name !== 'NotFoundError') log('sys', 'BLE: ' + (e.message || e)); }
  };

  const desconectar = async () => {
    const c = conexion.current;
    try { c.reader?.cancel(); c.writer?.releaseLock(); await c.port?.close(); } catch { /* */ }
    try { c.device?.gatt?.disconnect(); } catch { /* */ }
    conexion.current = {}; setConectado(false); setTransporte(null);
  };

  const enviarLinea = async (linea) => {
    const c = conexion.current;
    const data = linea + '\n';
    try {
      if (transporte === 'serial' && c.writer) {
        await c.writer.write(new TextEncoder().encode(data));
      } else if (transporte === 'ble' && c.rxChar) {
        // BLE: trozos de 20 bytes (MTU clásico); with-response si el char no
        // soporta sin-respuesta.
        const bytes = new TextEncoder().encode(data);
        const sinResp = c.rxChar.properties.writeWithoutResponse;
        for (let i = 0; i < bytes.length; i += 20) {
          const trozo = bytes.slice(i, i + 20);
          if (sinResp) await c.rxChar.writeValueWithoutResponse(trozo);
          else await c.rxChar.writeValue(trozo);
        }
      } else { log('sys', 'Sin conexión.'); return; }
      log('out', linea);
    } catch (e) { log('sys', 'Error al enviar: ' + (e.message || e)); }
  };

  const enviar = async () => {
    const linea = cmd.trim();
    if (!linea) return;
    setHistorial((h) => [linea, ...h.slice(0, 49)]); setHistIdx(-1); setCmd('');
    await enviarLinea(linea);
  };

  // ---------- Recetas ----------
  const receta = recetas[recetaSel] || recetas[0];
  const varsReceta = receta?.variables || [];
  const ejecutarReceta = async () => {
    if (!receta) return;
    const faltan = varsReceta.filter((v) => !String(vars[v] || '').trim());
    if (faltan.length) { alert('Completá: ' + faltan.join(', ')); return; }
    const lineasCmd = receta.comandos.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    for (const l of lineasCmd) {
      let final = l;
      varsReceta.forEach((v) => { final = final.split('{{' + v + '}}').join(vars[v]); });
      await enviarLinea(final);
      await new Promise((r) => setTimeout(r, 350)); // respiro entre comandos
    }
    log('sys', `Receta "${receta.nombre}" enviada (${lineasCmd.length} comandos).`);
  };
  const guardarRecetas = (rs) => {
    setRecetas(rs);
    try { localStorage.setItem('cooptech:multivac_recetas', JSON.stringify(rs)); } catch { /* */ }
  };

  return (
    <div className="p-4 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <h2 className="text-lg font-semibold text-slate-800">Aprovisionamiento Multivac</h2>
        <div className="flex gap-2">
          {!conectado && soportaSerial && (
            <button onClick={conectarSerial} title="Conectar por cable USB (CLI serie)"
              className="px-3 py-1.5 text-sm rounded-lg bg-coop-azul text-white hover:opacity-90 flex items-center gap-1.5"><Usb size={16} /> USB</button>
          )}
          {!conectado && soportaBle && (
            <button onClick={conectarBle} title="Conectar por Bluetooth (BLE)"
              className="p-2 rounded-lg border border-coop-azul text-coop-azul hover:bg-coop-azul/5"><Bluetooth size={18} /></button>
          )}
          {conectado && (
            <button onClick={desconectar} className="px-3 py-1.5 text-sm rounded-lg border border-red-300 text-red-500 hover:bg-red-50">
              Desconectar ({transporte === 'serial' ? 'USB' : 'BLE'})
            </button>
          )}
        </div>
      </div>
      <p className="text-sm text-slate-500 mb-3">
        Terminal del CLI del firmware universal: configurá una Multivac sin ingeniero, por cable USB o Bluetooth.
        {!soportaSerial && !soportaBle && ' Este navegador no soporta ninguno de los dos transportes: usá Chrome/Edge.'}
      </p>

      <div className="grid lg:grid-cols-5 gap-4">
        {/* Terminal */}
        <div className="lg:col-span-3">
          <div className="bg-slate-900 text-slate-100 rounded-xl p-3 h-96 overflow-y-auto font-mono text-[12.5px] leading-relaxed">
            {lineas.length === 0 && <p className="text-slate-500">— Conectá un equipo y escribí «help» —</p>}
            {lineas.map((l, i) => (
              <div key={i} className={l.t === 'out' ? 'text-emerald-300' : l.t === 'sys' ? 'text-amber-300' : 'text-slate-100'}>
                {l.t === 'out' ? '› ' : ''}{l.txt}
              </div>
            ))}
            <div ref={finLog} />
          </div>
          <div className="flex gap-2 mt-2">
            <input value={cmd} onChange={(e) => setCmd(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') enviar();
                if (e.key === 'ArrowUp') { e.preventDefault(); const ni = Math.min(histIdx + 1, historial.length - 1); if (historial[ni]) { setHistIdx(ni); setCmd(historial[ni]); } }
                if (e.key === 'ArrowDown') { e.preventDefault(); const ni = histIdx - 1; setHistIdx(ni); setCmd(ni >= 0 ? historial[ni] : ''); }
              }}
              placeholder={conectado ? 'Comando (Enter envía; ↑↓ historial)' : 'Conectá un equipo primero'}
              disabled={!conectado}
              className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono disabled:bg-slate-50" />
            <button onClick={enviar} disabled={!conectado}
              className="px-4 py-2 text-sm bg-coop-azul text-white rounded-lg hover:opacity-90 disabled:opacity-40">Enviar</button>
          </div>
        </div>

        {/* Recetas */}
        <div className="lg:col-span-2">
          <div className="bg-white border border-slate-200 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium text-slate-700 text-sm">Recetas de aprovisionamiento</h3>
              <button onClick={() => setEditandoReceta((v) => !v)} className="text-xs text-coop-azul hover:underline">
                {editandoReceta ? 'Cerrar edición' : 'Editar'}
              </button>
            </div>
            <select value={recetaSel} onChange={(e) => { setRecetaSel(Number(e.target.value)); setVars({}); }}
              className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm mb-2">
              {recetas.map((r, i) => <option key={i} value={i}>{r.nombre}</option>)}
            </select>

            {!editandoReceta && receta && (
              <>
                {varsReceta.map((v) => (
                  <div key={v} className="mb-2">
                    <label className="block text-xs text-slate-500 mb-0.5">{v}</label>
                    <input value={vars[v] || ''} onChange={(e) => setVars({ ...vars, [v]: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
                  </div>
                ))}
                <button onClick={ejecutarReceta} disabled={!conectado}
                  className="w-full mt-1 px-3 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:opacity-90 disabled:opacity-40">
                  ⚡ Ejecutar receta
                </button>
                <p className="text-[11px] text-slate-400 mt-2">
                  Las recetas encadenan comandos del CLI con variables. Cuando Lorenzo pase la lista de comandos, acá se cargan las de +Agua y Reconecta — y la ola siguiente las llena sola desde el planteo de CriterIA.
                </p>
              </>
            )}

            {editandoReceta && receta && (
              <>
                <input value={receta.nombre}
                  onChange={(e) => guardarRecetas(recetas.map((r, i) => i === recetaSel ? { ...r, nombre: e.target.value } : r))}
                  className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm mb-2" />
                <label className="block text-xs text-slate-500 mb-0.5">Variables (coma)</label>
                <input value={varsReceta.join(', ')}
                  onChange={(e) => guardarRecetas(recetas.map((r, i) => i === recetaSel ? { ...r, variables: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) } : r))}
                  className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm mb-2" />
                <label className="block text-xs text-slate-500 mb-0.5">Comandos (uno por línea; {'{{variable}}'}; # comenta)</label>
                <textarea rows={8} value={receta.comandos}
                  onChange={(e) => guardarRecetas(recetas.map((r, i) => i === recetaSel ? { ...r, comandos: e.target.value } : r))}
                  className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-mono" />
                <div className="flex gap-2 mt-2">
                  <button onClick={() => { guardarRecetas([...recetas, { nombre: 'Nueva receta', variables: [], comandos: '' }]); setRecetaSel(recetas.length); }}
                    className="flex-1 px-2 py-1.5 text-xs border border-slate-300 rounded-lg hover:border-coop-azul">+ Nueva</button>
                  <button onClick={() => { if (recetas.length > 1 && confirm('¿Borrar esta receta?')) { const rs = recetas.filter((_, i) => i !== recetaSel); guardarRecetas(rs); setRecetaSel(0); } }}
                    className="flex-1 px-2 py-1.5 text-xs border border-red-200 text-red-500 rounded-lg hover:bg-red-50">Borrar</button>
                </div>
              </>
            )}
          </div>
          <div className="mt-2">
            <label className="block text-[11px] text-slate-400 mb-0.5">Servicio BLE del firmware (UUID — opcional; se prueban NUS/FFE0/ABF0 solos)</label>
            <input defaultValue={typeof localStorage !== 'undefined' ? (localStorage.getItem('cooptech:multivac_uuid') || '') : ''}
              onBlur={(e) => { try { localStorage.setItem('cooptech:multivac_uuid', e.target.value.trim()); } catch { /* */ } }}
              placeholder="p.ej. 12345678-1234-1234-1234-1234567890ab"
              className="w-full border border-slate-200 rounded-lg px-2 py-1 text-[11px] font-mono" />
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            USB: Chrome/Edge de PC (el CLI por serie, sin cambios). Bluetooth: Chrome de PC y Android — el servicio UART se detecta solo por propiedades write/notify.
          </p>
        </div>
      </div>
    </div>
  );
}
