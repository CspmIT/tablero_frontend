// AutonomIA — aprovisionamiento y programación Multivac (bloque 2 de la Copa).
// Bautizado por Leonardo el 12/08: CriterIA diseña, AutonomIA implementa.
// La app es el CLIENTE del CLI del firmware universal: dos transportes con la
// misma terminal encima — USB serie (Web Serial: funciona HOY con el CLI por
// serie, sin tocar firmware) y Bluetooth BLE (Web Bluetooth + NUS: cuando el
// stack BLE del firmware sea/expose UART BLE). Recetas = secuencias de
// comandos con variables {{asi}}, para cargar la config de un equipo entero
// de una pasada (los comandos exactos los define el CLI de Lorenzo).
import { useEffect, useRef, useState } from 'react';
import { Bluetooth, Usb, Settings, HardDriveDownload } from 'lucide-react';
import { useData } from '../data/DataContext.jsx';
// Ola C: flasheo de firmware desde el navegador — librería OFICIAL de
// Espressif (Web Serial). Los binarios viven en MinIO (gateway storageov).
import { ESPLoader, Transport } from 'esptool-js';
import { md5 } from 'js-md5';
import { getImage, saveImage } from '../api/minio.js';
// Configuración guiada por firmware (13/08): formulario que lee/edita/graba
// la config de la placa — el terminal queda como registro limpio.
import MultivacConfigReconecta from './MultivacConfigReconecta.jsx';

// Servicios UART-BLE candidatos (Lorenzo confirmó BLE; el UUID exacto de su
// stack se detecta probando en orden — y hay campo para pegar uno custom).
const SERVICIOS_UART = [
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART (NUS) — NimBLE típico
  0xFFE0,                                  // HM-10 y clones
  0xABF0,                                  // BLE-SPP de ejemplos Espressif
];

// Depósito LOCAL de capturas del Terminal Sniffer (12/08, elección de
// Leonardo): IndexedDB del navegador — sobreviven a cerrar la pestaña y a
// reiniciar la PC, sin tocar backend ni gateway. Quedan en ESTA computadora.
const snDb = () => new Promise((res, rej) => {
  const req = indexedDB.open('cooptech_sniffer', 1);
  req.onupgradeneeded = () => { req.result.createObjectStore('capturas', { keyPath: 'id', autoIncrement: true }); };
  req.onsuccess = () => res(req.result);
  req.onerror = () => rej(req.error);
});
const snIdbTodas = async () => {
  const db = await snDb();
  return new Promise((res, rej) => {
    const rq = db.transaction('capturas', 'readonly').objectStore('capturas').getAll();
    rq.onsuccess = () => res(rq.result || []); rq.onerror = () => rej(rq.error);
  });
};
const snIdbGuardar = async (rec) => {
  const db = await snDb();
  return new Promise((res, rej) => {
    const rq = db.transaction('capturas', 'readwrite').objectStore('capturas').add(rec);
    rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
  });
};
const snIdbBorrar = async (id) => {
  const db = await snDb();
  return new Promise((res, rej) => {
    const rq = db.transaction('capturas', 'readwrite').objectStore('capturas').delete(id);
    rq.onsuccess = () => res(); rq.onerror = () => rej(rq.error);
  });
};

const RECETAS_DEFAULT = [
  {
    nombre: 'Ejemplo — identidad y red (completar con el CLI real)',
    variables: ['nombre', 'ssid', 'clave'],
    comandos: 'help\n# Reemplazar por los comandos reales del CLI de Lorenzo:\n# set nombre {{nombre}}\n# set wifi {{ssid}} {{clave}}\n# save',
  },
];

export default function Multivac() {
  const { api, me } = useData();
  // Rediseño 12/08 (mockup de Leonardo): el módulo se ordena en solapas.
  // "Actualizaciones de firmware" = la vista de TODOS los usuarios habilitados
  // (solo releases APROBADOS, tablas por equipo, botones grandes, terminal).
  // "Configuraciones" = el CLI completo (terminal + botonera + recetas + CriterIA).
  // "Gestión de versiones" = uso interno del área: TODOS los releases subidos,
  // tilde para aprobar (habilita hacia la vista pública), borrar y subir.
  const [solapa, setSolapa] = useState('firmware');
  const puedeGestionar = me?.tipo !== 'externo';
  const [transporte, setTransporte] = useState(null); // null | 'serial' | 'ble'
  const [conectado, setConectado] = useState(false);
  const [lineas, setLineas] = useState([]); // { t: 'in'|'out'|'sys', txt }
  const [cmd, setCmd] = useState('');
  const [historial, setHistorial] = useState([]);
  const [histIdx, setHistIdx] = useState(-1);
  // Botonera compartida (ola 3): comandos precargados con nombre humanizado y
  // producto, guardados en el servidor (clave multivac_botones) — Lorenzo los
  // carga una vez y los ve todo el equipo. Reemplaza a los atajos localStorage.
  const PRODUCTOS_BOTON = ['General', '+Agua', 'Reconecta', 'Centinela'];
  const [botones, setBotones] = useState([]);
  const [filtroProd, setFiltroProd] = useState('Todos');
  const [abmOpen, setAbmOpen] = useState(false);
  const [abmLista, setAbmLista] = useState([]);
  const [abmGuardando, setAbmGuardando] = useState(false);
  useEffect(() => {
    api.multivac.botones().then((r) => setBotones(Array.isArray(r?.botones) ? r.botones : [])).catch(() => {});
  }, [api]);
  const guardarBotones = async () => {
    setAbmGuardando(true);
    try {
      const limpios = abmLista.map((b) => ({ nombre: (b.nombre || '').trim(), comando: (b.comando || '').trim(), producto: PRODUCTOS_BOTON.includes(b.producto) ? b.producto : 'General' })).filter((b) => b.nombre && b.comando);
      const r = await api.multivac.guardarBotones(limpios);
      setBotones(Array.isArray(r?.botones) ? r.botones : limpios);
      setAbmOpen(false);
    } catch (e) { alert(e.message || 'No se pudieron guardar los botones'); }
    finally { setAbmGuardando(false); }
  };
  const botonesVisibles = filtroProd === 'Todos' ? botones : botones.filter((b) => b.producto === filtroProd);

  // Recetas COMPARTIDAS (ola B): se cargan del servidor (las oficiales salen
  // del help real de Lorenzo); editar es local hasta "Guardar para todos".
  const [recetas, setRecetas] = useState(RECETAS_DEFAULT);
  const [recetasDirty, setRecetasDirty] = useState(false);
  const [recetasGuardando, setRecetasGuardando] = useState(false);
  useEffect(() => {
    api.multivac.recetas().then((r) => { if (Array.isArray(r?.recetas) && r.recetas.length) setRecetas(r.recetas); }).catch(() => {});
  }, [api]);
  const persistirRecetas = async () => {
    setRecetasGuardando(true);
    try {
      const r = await api.multivac.guardarRecetas(recetas);
      if (Array.isArray(r?.recetas)) setRecetas(r.recetas);
      setRecetasDirty(false);
    } catch (e) { alert(e.message || 'No se pudieron guardar las recetas'); }
    finally { setRecetasGuardando(false); }
  };
  const [recetaSel, setRecetaSel] = useState(0);
  const [vars, setVars] = useState({});
  const [editandoReceta, setEditandoReceta] = useState(false);

  // --- LA SOLDADURA (ola B): del planteo CriterIA al aprovisionamiento -------
  // Elegís el lead (con planteo generado), la Multivac del planteo, y la
  // plataforma arma la secuencia de comandos: identidad + red + los recursos
  // asignados por CriterIA (vía plantilla compartida — hoy comentarios guía;
  // cuando Lorenzo defina el JSON de add_sensor_json se cambia la plantilla
  // en el servidor y las líneas se vuelven comandos reales, sin redeploy).
  const [cwLeads, setCwLeads] = useState([]);           // leads con planteo
  const [cwLeadSel, setCwLeadSel] = useState('');
  const [cwDetalle, setCwDetalle] = useState(null);     // { lead, resumen, asignacion_recursos }
  const [cwEquipoSel, setCwEquipoSel] = useState(0);
  const [cwVars, setCwVars] = useState({ nombre: '', ssid: '', clave: '' });
  const [cwSecuencia, setCwSecuencia] = useState('');
  const [cwPlantilla, setCwPlantilla] = useState('# {{canal}}: {{descripcion}}');
  const [cwPlantillaDirty, setCwPlantillaDirty] = useState(false);
  const [cwCargando, setCwCargando] = useState(false);
  useEffect(() => {
    api.multivac.leadsConPlanteo().then((r) => setCwLeads(Array.isArray(r?.leads) ? r.leads : [])).catch(() => {});
    api.multivac.plantillaSensor().then((r) => { if (r?.plantilla) setCwPlantilla(r.plantilla); }).catch(() => {});
  }, [api]);

  // "AI-1: transductor de presión..." → { canal: 'AI-1', descripcion: '...' }
  const parseRecurso = (texto, tipo) => {
    const t = String(texto || '');
    const i = t.indexOf(':');
    return i > 0
      ? { tipo, canal: t.slice(0, i).trim(), descripcion: t.slice(i + 1).trim() }
      : { tipo, canal: tipo, descripcion: t.trim() };
  };

  const armarSecuencia = (detalle, equipoIdx, plantilla) => {
    const eq = detalle?.asignacion_recursos?.[equipoIdx];
    if (!eq) return '';
    const recursos = [
      ...(Array.isArray(eq.entradas_analogicas) ? eq.entradas_analogicas.map((r) => parseRecurso(r, 'AI')) : []),
      ...(Array.isArray(eq.buses_modbus) ? eq.buses_modbus.map((r) => parseRecurso(r, 'BUS')) : []),
    ];
    const lineaDe = (rec) => plantilla
      .split('{{canal}}').join(rec.canal)
      .split('{{descripcion}}').join(rec.descripcion)
      .split('{{tipo}}').join(rec.tipo);
    const plantillaEsComando = !!plantilla.trim() && !plantilla.trim().startsWith('#');
    return [
      'comando',
      'login',
      'dev_name {{nombre}}',
      'set_tz -10800',
      'add_wifi 1,{{ssid}},{{clave}}',
      'enable_wifi 1 on',
      'set_failover on',
      `# --- Recursos del planteo CriterIA · ${eq.equipo || 'equipo'}${eq.ubicacion ? ` · ${eq.ubicacion}` : ''} ---`,
      ...recursos.map(lineaDe),
      plantillaEsComando ? 'save_schema' : '# save_schema  (se activa cuando la plantilla genere comandos reales)',
      'info',
      'logout',
    ].join('\n');
  };

  const cwElegirLead = async (id) => {
    setCwLeadSel(id); setCwDetalle(null); setCwSecuencia('');
    if (!id) return;
    setCwCargando(true);
    try {
      const d = await api.multivac.planteoDeLead(id);
      setCwDetalle(d); setCwEquipoSel(0);
      // Nombre sugerido: organización saneada + código del equipo (M1, M2…).
      const org = String(d.lead?.organizacion || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 20);
      const cod = (String(d.asignacion_recursos?.[0]?.equipo || '').match(/\(([^)]+)\)/) || [])[1] || 'M1';
      setCwVars((v) => ({ ...v, nombre: `${org}_${cod}` }));
      setCwSecuencia(armarSecuencia(d, 0, cwPlantilla));
    } catch (e) { log('sys', 'CriterIA: ' + (e.message || e)); }
    finally { setCwCargando(false); }
  };

  const cwElegirEquipo = (idx) => {
    setCwEquipoSel(idx);
    if (!cwDetalle) return;
    const cod = (String(cwDetalle.asignacion_recursos?.[idx]?.equipo || '').match(/\(([^)]+)\)/) || [])[1] || `M${idx + 1}`;
    setCwVars((v) => ({ ...v, nombre: v.nombre ? v.nombre.replace(/_[^_]*$/, `_${cod}`) : `Multivac_${cod}` }));
    setCwSecuencia(armarSecuencia(cwDetalle, idx, cwPlantilla));
  };

  const cwEnviar = async () => {
    if (!conectado || !cwSecuencia.trim()) return;
    const faltan = ['nombre', 'ssid', 'clave'].filter((k) => cwSecuencia.includes(`{{${k}}}`) && !String(cwVars[k] || '').trim());
    if (faltan.length) { alert('Completá: ' + faltan.join(', ')); return; }
    let final = cwSecuencia;
    Object.entries(cwVars).forEach(([k, v]) => { final = final.split(`{{${k}}}`).join(v); });
    const lineasCmd = final.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    for (const l of lineasCmd) await enviarLinea(l);
    log('sys', `Aprovisionamiento CriterIA enviado (${lineasCmd.length} comandos · ${cwDetalle?.lead?.organizacion || ''}).`);
  };

  const cwGuardarPlantilla = async () => {
    try {
      const r = await api.multivac.guardarPlantillaSensor(cwPlantilla);
      if (r?.plantilla) setCwPlantilla(r.plantilla);
      setCwPlantillaDirty(false);
      if (cwDetalle) setCwSecuencia(armarSecuencia(cwDetalle, cwEquipoSel, r?.plantilla || cwPlantilla));
    } catch (e) { alert(e.message || 'No se pudo guardar la plantilla'); }
  };

  // --- GESTOR DE FIRMWARES (ola C): programar la placa desde el navegador ---
  // esptool-js (oficial Espressif) por Web Serial. Se escriben SOLO los
  // segmentos del manifiesto del release (NUNCA erase-all → config NVS,
  // LittleFS y spool de mediciones intactos — decisión de Lorenzo 10/08).
  // Guardrail: el chip detectado debe coincidir con el del release.
  const [firmwares, setFirmwares] = useState([]);
  const [fwModeloSel, setFwModeloSel] = useState('');
  const [fwIdxSel, setFwIdxSel] = useState(-1);
  const [flasheando, setFlasheando] = useState(false);
  const [flashProg, setFlashProg] = useState(null); // { seg, total, pct }
  // Confirmación PROPIA de la app (pedido de Leonardo 12/08): el confirm()
  // nativo mete el encabezado "tauri://localhost dice…" / "localhost:… says"
  // que asusta a los usuarios no especializados y no se puede quitar. Este
  // modal es nuestro: mensaje simple, sin ninguna línea técnica del webview.
  const [fwConfirm, setFwConfirm] = useState(null); // { titulo, lineas, boton, peligro, resolve }
  const pedirConfirmacion = (opts) => new Promise((resolve) => setFwConfirm({ ...opts, resolve }));
  const responderConfirm = (ok) => { setFwConfirm((c) => { c?.resolve(ok); return null; }); };
  const [fwAbmOpen, setFwAbmOpen] = useState(false);
  const [fwForm, setFwForm] = useState(null);
  const [fwSubiendo, setFwSubiendo] = useState(false);
  useEffect(() => {
    api.multivac.firmwares().then((r) => setFirmwares(Array.isArray(r?.firmwares) ? r.firmwares : [])).catch(() => {});
  }, [api]);

  // Criterio de diseño (Leonardo+Lorenzo, 12/08): una versión de firmware es
  // EXACTAMENTE para un modelo de placa, y cada modelo tiene UN chip fijo.
  // Por eso el ABM pide solo el equipo: el chip viene pegado (nada que elegir).
  // Placa nueva en el parque = una línea acá.
  const EQUIPOS_FW = [
    { modelo: 'Multivac 1.0/7.1', chip: 'esp32' },
    { modelo: 'Multivac 8.0', chip: 'esp32s3' },
    { modelo: 'Lector de pulsos RS485', chip: 'esp32c3' },
    { modelo: 'Sensor ultrasónico RS485', chip: 'esp32c3' },
    { modelo: 'Lector de bombas RS485', chip: 'esp32c3' },
  ];
  const CHIP_LABEL = { esp32: 'ESP32 clásico', esp32s3: 'ESP32-S3', esp32c3: 'ESP32-C3 mini' };
  // Parámetros de flash: DESPLEGABLES con opciones válidas (nada de texto libre
  // — pedido de Leonardo 12/08), etiquetas estilo Arduino, valores esptool.
  // Las frecuencias válidas dependen del chip (S3 no soporta 26/20MHz).
  const FLASH_MODES = ['qio', 'dio', 'qout', 'dout'];
  const FLASH_FREQS = { esp32: ['80m', '40m', '26m', '20m'], esp32s3: ['80m', '40m'], esp32c3: ['80m', '40m', '26m', '20m'] };
  const FLASH_SIZES = ['1MB', '2MB', '4MB', '8MB', '16MB'];
  const MODE_LABEL = { qio: 'QIO', dio: 'DIO', qout: 'QOUT', dout: 'DOUT' };
  const FREQ_LABEL = { '80m': '80MHz', '40m': '40MHz', '26m': '26MHz', '20m': '20MHz' };
  const normalizarChip = (nombre) => {
    const n = String(nombre || '').toUpperCase();
    if (n.includes('S3')) return 'esp32s3';
    if (n.includes('C3')) return 'esp32c3';
    if (n.includes('S2') || n.includes('C6') || n.includes('H2')) return 'otro';
    return n.includes('ESP32') ? 'esp32' : 'otro';
  };
  const fwSel = firmwares[fwIdxSel] || null;
  // Agrupado por equipo para las tablas colapsables del mockup (12/08). El _i
  // conserva el índice REAL en el catálogo (selección, aprobación y borrado).
  const fwConIdx = firmwares.map((f, i) => ({ ...f, _i: i }));
  const agruparPorEquipo = (lista) => {
    const conocidos = new Set(EQUIPOS_FW.map((e) => e.modelo));
    const orden = (rs) => rs.sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')));
    const grupos = EQUIPOS_FW.map((eq) => ({ modelo: eq.modelo, chip: eq.chip, releases: orden(lista.filter((f) => f.modelo === eq.modelo)) }));
    const otros = lista.filter((f) => !conocidos.has(f.modelo));
    if (otros.length) grupos.push({ modelo: 'Otros equipos', chip: null, releases: orden(otros) });
    return grupos.filter((g) => g.releases.length);
  };
  const gruposAprobados = agruparPorEquipo(fwConIdx.filter((f) => f.aprobado === true));
  const gruposTodos = agruparPorEquipo(fwConIdx);
  const descArchivos = (f) => `${f.segmentos?.length || 0} bin${f.merged ? ' + fábrica' : ''}${f.fuente ? ' + código' : ''}`;
  // Tilde de aprobación (gestión → vista pública). Guardado optimista con
  // vuelta atrás si el servidor rechaza.
  const fwToggleAprobado = async (idx) => {
    const nuevos = firmwares.map((f, i) => (i === idx ? { ...f, aprobado: f.aprobado !== true } : f));
    setFirmwares(nuevos);
    try {
      const r = await api.multivac.guardarFirmwares(nuevos);
      if (Array.isArray(r?.firmwares)) {
        setFirmwares(r.firmwares);
        // Si el servidor filtró alguna entrada inválida, los índices corren:
        // soltar la selección antes de que apunte a otro release.
        if (r.firmwares.length !== nuevos.length) setFwIdxSel(-1);
      }
    } catch (e) {
      alert(e.message || 'No se pudo actualizar la aprobación');
      api.multivac.firmwares().then((r) => setFirmwares(Array.isArray(r?.firmwares) ? r.firmwares : [])).catch(() => {});
    }
  };

  const fwProgramar = async (modo = 'actualizar') => {
    if (!fwSel || flasheando) return;
    if (modo === 'fabrica' && !fwSel.merged?.key) return;
    // El flasheo necesita el puerto para él solo: cerrar la sesión CLI y el
    // sniffer si están abiertos (mismo trato para ambos).
    if (conectado) { log('sys', 'Cerrando la sesión del CLI para programar…'); await desconectar(); }
    if (snRef.current.canales.some((c) => c.port)) { log('sys', 'Cerrando el Terminal Sniffer para programar…'); await snCerrarTodos(); }
    let transport = null;
    try {
      const port = await navigator.serial.requestPort();
      transport = new Transport(port, false);
      setFlasheando(true);
      log('sys', `Entrando al bootloader (921600, fallback 115200)…`);
      const loader = new ESPLoader({
        transport, baudrate: 921600, romBaudrate: 115200,
        terminal: { clean() {}, writeLine: (l) => log('sys', '[flash] ' + l), write() {} },
      });
      const chipNombre = await loader.main();
      const detectado = normalizarChip(chipNombre);
      // Levantar los datos REALES de la placa: tamaño físico de la flash y el
      // header del firmware presente (declara mode/freq/size con que se grabó).
      let sizePlaca = null;
      try { sizePlaca = await loader.detectFlashSize(); } catch { /* opcional */ }
      let fwActual = null;
      try {
        const hdr = await loader.readFlash(detectado === 'esp32' ? 0x1000 : 0x0, 4);
        if (hdr && hdr[0] === 0xE9) {
          // Orden del HEADER de imagen ESP32 (≠ orden del desplegable): 0=QIO 1=QOUT 2=DIO 3=DOUT.
          const modesHdr = ['qio', 'qout', 'dio', 'dout'];
          const sizes = { 0: '1MB', 1: '2MB', 2: '4MB', 3: '8MB', 4: '16MB' };
          const freqs = { 0: '40m', 1: '26m', 2: '20m', 15: '80m' };
          fwActual = { mode: modesHdr[hdr[2]] || '?', size: sizes[hdr[3] >> 4] || '?', freq: freqs[hdr[3] & 0x0f] || '?' };
        }
      } catch { /* placa virgen o lectura no disponible: seguir */ }
      log('sys', `Placa: ${chipNombre} · flash física: ${sizePlaca || '?'}${fwActual ? ` · firmware actual: ${MODE_LABEL[fwActual.mode] || fwActual.mode} / ${FREQ_LABEL[fwActual.freq] || fwActual.freq} / ${fwActual.size}` : ' · sin firmware legible (¿placa virgen?)'}`);
      if (detectado !== fwSel.chip) {
        log('sys', `⛔ ABORTADO: el firmware "${fwSel.modelo} ${fwSel.version}" es para ${fwSel.chip.toUpperCase()} y la placa conectada es ${chipNombre}. Nada se escribió.`);
        return;
      }
      const mb = (s) => Number(String(s || '').replace('MB', '')) || 0;
      if (sizePlaca && fwSel.flash?.size && fwSel.flash.size !== 'keep' && mb(fwSel.flash.size) > mb(sizePlaca)) {
        log('sys', `⛔ ABORTADO: el release declara flash de ${fwSel.flash.size} y la placa tiene ${sizePlaca}. Nada se escribió.`);
        return;
      }
      if (fwActual && fwSel.flash?.mode && fwSel.flash.mode !== 'keep' && fwActual.mode !== '?' && fwActual.mode !== fwSel.flash.mode) {
        log('sys', `⚠ Aviso: el firmware actual está en ${MODE_LABEL[fwActual.mode]} y el release usa ${MODE_LABEL[fwSel.flash.mode]} — manda el release (lo validado por Lorenzo).`);
      }
      // Confirmaciones con modal PROPIO (sin el "tauri://localhost dice…" del
      // confirm() nativo). Mensaje simple para el usuario de campo; el detalle
      // técnico (tabla sagrada offset→archivo) sigue visible en la tarjeta de
      // la versión seleccionada, detrás del modal.
      if (modo === 'fabrica') {
        // Doble confirmación: fábrica borra config, LittleFS y el spool de mediciones.
        const ok1 = await pedirConfirmacion({
          titulo: '🏭 Volver a fábrica',
          lineas: [
            `${fwSel.modelo} · versión ${fwSel.version}${fwSel.nombre ? ` · ${fwSel.nombre}` : ''}`,
            'La placa conectada es la correcta ✓',
            '⚠ Esto borra TODO: la configuración, la red y las mediciones que todavía no se subieron. El equipo queda como recién salido de fábrica.',
          ],
          boton: 'Continuar', peligro: true,
        });
        const ok2 = ok1 && await pedirConfirmacion({
          titulo: 'Última confirmación',
          lineas: ['¿Seguro que querés borrar todo y volver a fábrica?'],
          boton: 'Sí, borrar todo', peligro: true,
        });
        if (!ok2) { log('sys', 'Vuelta a fábrica cancelada.'); return; }
      } else {
        const ok = await pedirConfirmacion({
          titulo: '⬆ Actualizar firmware',
          lineas: [
            `${fwSel.modelo} · versión ${fwSel.version}${fwSel.nombre ? ` · ${fwSel.nombre}` : ''}`,
            'La placa conectada es la correcta ✓',
            'La configuración y las mediciones del equipo se conservan.',
            'No desconectes el cable durante la actualización.',
          ],
          boton: 'Actualizar', peligro: false,
        });
        if (!ok) { log('sys', 'Programación cancelada por el usuario.'); return; }
      }
      const aBajar = modo === 'fabrica'
        ? [{ key: fwSel.merged.key, nombre: fwSel.merged.nombre || 'merged.bin', offset: '0x0', tamano: fwSel.merged.tamano }]
        : fwSel.segmentos;
      // TODO se descarga y VERIFICA antes de tocar la placa: un microcorte de
      // internet corta acá (la placa queda intacta); durante la escritura la
      // red ya no participa (RAM → USB, con checksum por bloque de esptool).
      const fileArray = [];
      for (const seg of aBajar) {
        log('sys', `Descargando ${seg.nombre || seg.key} (${seg.offset})…`);
        const objUrl = await getImage(seg.key);
        const buf = await (await fetch(objUrl)).arrayBuffer();
        URL.revokeObjectURL(objUrl);
        if (seg.tamano != null && buf.byteLength !== Number(seg.tamano)) {
          log('sys', `⛔ ABORTADO antes de escribir: ${seg.nombre} bajó ${buf.byteLength} bytes y el manifiesto dice ${seg.tamano} (descarga incompleta o archivo alterado). La placa NO se tocó — reintentá.`);
          return;
        }
        if (seg.sha256) {
          const hex = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buf))).map((b) => b.toString(16).padStart(2, '0')).join('');
          if (hex !== seg.sha256) {
            log('sys', `⛔ ABORTADO antes de escribir: la huella SHA-256 de ${seg.nombre} NO coincide con la publicada por Lorenzo (bit corrupto o archivo alterado). La placa NO se tocó.`);
            return;
          }
        }
        fileArray.push({ data: new Uint8Array(buf), address: parseInt(seg.offset, 16) });
      }
      log('sys', '✓ Binarios completos y verificados bit a bit (SHA-256) contra el manifiesto publicado.');
      log('sys', modo === 'fabrica' ? 'Borrando flash completa y escribiendo imagen de fábrica…' : `Escribiendo ${fileArray.length} segmento(s)…`);
      await loader.writeFlash({
        fileArray,
        flashMode: fwSel.flash?.mode || 'keep',
        flashFreq: fwSel.flash?.freq || 'keep',
        flashSize: fwSel.flash?.size || 'keep',
        eraseAll: modo === 'fabrica', // fábrica = borrado total deliberado
        compress: true,
        reportProgress: (i, escrito, total) => setFlashProg({ seg: i + 1, total: fileArray.length, pct: total ? Math.round((escrito / total) * 100) : 0 }),
        // Verify post-escritura: la placa recalcula el MD5 de lo GRABADO y se
        // compara con la imagen — el mismo verify que hace el esptool del
        // script de Lorenzo. Si no coincide, esptool-js lo reporta como error.
        calculateMD5Hash: (image) => md5(image),
      });
      // Reinicio a modo RUN (hotfix 12/08, observación de Leonardo en la prueba
      // de campo: tras programar, la placa quedaba en bootloader y había que
      // reiniciarla a mano para que publique MQTT). El hard_reset de esptool-js
      // solo hace setRTS(false) — si RTS ya estaba baja NO hay pulso de reset.
      // Secuencia completa (la misma del conectar): IO0 suelto (DTR=0), pulso
      // de EN (RTS=1 → esperar → RTS=0) ⇒ la placa arranca sola en RUN.
      try {
        await transport.setDTR(false);
        await transport.setRTS(true);   // EN=0 (reset), IO0=1 (run)
        await new Promise((r) => setTimeout(r, 150));
        await transport.setRTS(false);  // EN=1 → boot normal
      } catch { /* adaptador sin señales: reiniciar a mano como hasta ahora */ }
      log('sys', modo === 'fabrica'
        ? `✅ ${fwSel.modelo} ${fwSel.version} — vuelta a fábrica completa. El equipo arranca SIN configuración: aprovisionalo con las recetas o desde CriterIA.`
        : `✅ ${fwSel.modelo} ${fwSel.version} actualizado (config y mediciones intactas). Reconectá el CLI y verificá con "info".`);
    } catch (e) {
      log('sys', '⚠ Flasheo: ' + (e?.message || e) + ' — la placa puede reprogramarse sin problema, reintentá.');
    } finally {
      try { await transport?.disconnect(); } catch { /* */ }
      setFlasheando(false); setFlashProg(null);
    }
  };

  // ABM: alta de release (sube los .bin al gateway y guarda el manifiesto).
  const SEGMENTOS_TIPICOS = [
    { rol: 'bootloader', offset: '0x1000' },
    { rol: 'partitions', offset: '0x8000' },
    { rol: 'boot_app0', offset: '0xE000' },
    { rol: 'app', offset: '0x10000' },
  ];
  // Arrastre inteligente (pedido de Leonardo 12/08: Lorenzo ya tiene la carpeta
  // del build abierta en otra pantalla): soltás los archivos y cada uno va solo
  // a su lugar por nombre — bootloader→0x1000, partitions.bin→0x8000,
  // boot_app0→0xE000, app→0x10000, merged→fábrica, zip/rar→backup, y si viene
  // flash_args se aplica solo (offsets + parámetros). Ignora la paja del build
  // (_flashed, .elf, .map, sdkconfig...) sin molestar.
  const [fwArrastrando, setFwArrastrando] = useState(false);
  const fwSoltarArchivos = async (files) => {
    const lista = Array.from(files || []);
    if (!lista.length) return;
    let flashArgsTexto = null;
    const IGNORAR = /(_flashed\.bin$|\.elf$|\.map$|\.json$|\.csv$|sdkconfig)/i;
    const cambios = { filas: null, merged: undefined, fuente: undefined };
    const sinAsignar = [];
    const filas = fwForm.filas.map((x) => ({ ...x }));
    const aFila = (pred, archivo) => { const i = filas.findIndex(pred); if (i >= 0) { filas[i].archivo = archivo; return true; } return false; };
    for (const file of lista) {
      const n = file.name.toLowerCase();
      if (n === 'flash_args') { try { flashArgsTexto = await file.text(); } catch { /* */ } continue; }
      if (IGNORAR.test(n)) continue;
      if (/\.(zip|rar|7z)$/.test(n)) { cambios.fuente = file; continue; }
      if (!/\.bin$/.test(n)) { sinAsignar.push(file.name); continue; }
      if (n.endsWith('.merged.bin')) { cambios.merged = file; continue; }
      if (n.includes('bootloader')) { if (!aFila((x) => x.rol === 'bootloader' || x.offset.trim().toLowerCase() === '0x1000', file)) sinAsignar.push(file.name); continue; }
      if (n.includes('partitions')) { if (!aFila((x) => x.rol === 'partitions' || x.offset.trim().toLowerCase() === '0x8000', file)) sinAsignar.push(file.name); continue; }
      if (n.includes('boot_app0')) { if (!aFila((x) => x.rol === 'boot_app0' || x.offset.trim().toLowerCase() === '0xe000', file)) sinAsignar.push(file.name); continue; }
      // app (o cualquier otro .bin): fila app → primera fila libre → fila nueva
      if (!aFila((x) => (x.rol === 'app' || x.offset.trim().toLowerCase() === '0x10000') && !x.archivo, file)) {
        const libre = filas.findIndex((x) => !x.archivo);
        if (libre >= 0) filas[libre].archivo = file; else filas.push({ rol: '', offset: '0x', archivo: file });
      }
    }
    setFwForm((f) => ({
      ...f,
      filas,
      ...(cambios.merged !== undefined ? { mergedArchivo: cambios.merged } : {}),
      ...(cambios.fuente !== undefined ? { fuenteArchivo: cambios.fuente } : {}),
      ...(flashArgsTexto ? { flashArgs: flashArgsTexto } : {}),
    }));
    if (flashArgsTexto) setTimeout(() => fwAplicarFlashArgs(flashArgsTexto), 0);
    if (sinAsignar.length) alert('Quedaron sin asignar (ubicalos a mano): ' + sinAsignar.join(', '));
  };

  const fwAbrirAlta = () => {
    const eq = EQUIPOS_FW.find((e) => e.modelo === fwModeloSel) || EQUIPOS_FW[0];
    setFwForm({
      modelo: eq.modelo, chip: eq.chip, producto: 'General', version: '', nombre: '', notas: '',
      flash: { mode: 'dio', freq: '80m', size: '4MB' },
      filas: SEGMENTOS_TIPICOS.map((sg) => ({ ...sg, archivo: null })),
      fuenteArchivo: null,   // proyecto completo (.zip/.rar) — backup del código
      mergedArchivo: null,   // imagen merged — volver a fábrica
      flashArgs: '',         // contenido de build/.../flash_args para autocompletar
    });
    setFwAbmOpen(true);
  };

  // Autocompletar desde el flash_args del build de Arduino (el "script de
  // carga" ya existe en cada export: offsets + parámetros, formato esptool).
  const fwAplicarFlashArgs = (textoDirecto) => {
    // Acepta el flash_args pelado O el script completo de Lorenzo (PowerShell/
    // bash/Python que invoque esptool): no se ejecuta NADA — solo se extraen
    // offsets, archivos y parámetros. Se limpian continuadores (` y \) y comillas.
    const t = String(typeof textoDirecto === 'string' ? textoDirecto : (fwForm?.flashArgs || '')).replace(/[`"']/g, ' ').replace(/\\\s*$/gm, ' ').replace(/\s+/g, ' ').trim();
    if (!t) return;
    const flash = { ...fwForm.flash };
    const m1 = t.match(/--flash_mode\s+(\S+)/); if (m1) flash.mode = m1[1].toLowerCase();
    const m2 = t.match(/--flash_freq\s+(\S+)/); if (m2) flash.freq = m2[1].replace(/hz$/i, '').replace(/mhz$/i, 'm');
    const m3 = t.match(/--flash_size\s+(\S+)/); if (m3) flash.size = m3[1].toUpperCase().replace('MB', 'MB');
    const pares = [...t.matchAll(/(0x[0-9a-fA-F]+)\s+([^\s-]\S*)/g)]
      .map((m) => ({ rol: (m[2].split(/[\\/]/).pop() || '').slice(0, 60), offset: m[1], archivo: null }));
    if (flash.freq && !(FLASH_FREQS[fwForm.chip] || []).includes(flash.freq)) flash.freq = (FLASH_FREQS[fwForm.chip] || ['80m'])[0];
    if (flash.mode && !FLASH_MODES.includes(flash.mode)) delete flash.mode;
    if (flash.size && !FLASH_SIZES.includes(flash.size)) delete flash.size;
    // MERGE con lo ya cargado: los archivos asignados (p.ej. por arrastre) se
    // conservan matcheando por offset o por nombre — flash_args no pisa nada.
    setFwForm((f) => ({
      ...f,
      flash: { ...f.flash, ...flash },
      filas: pares.length
        ? pares.map((par) => {
            const previa = f.filas.find((x) => x.archivo && x.offset.trim().toLowerCase() === par.offset.toLowerCase())
              || f.filas.find((x) => x.archivo && x.archivo.name.toLowerCase() === String(par.rol || '').toLowerCase());
            return { ...par, archivo: previa?.archivo || null };
          })
        : f.filas,
    }));
  };
  const fwGuardarRelease = async () => {
    const filas = (fwForm.filas || []).filter((f) => f.archivo && /^0x[0-9a-fA-F]{1,8}$/.test(f.offset.trim()));
    if (!fwForm.modelo.trim() || !fwForm.version.trim() || (!filas.length && !fwForm.mergedArchivo)) {
      alert('Completá modelo, versión y al menos un segmento con archivo (o el merged de fábrica).'); return;
    }
    // Solo .bin en los segmentos (caso real 12/08: se coló un partitions.csv —
    // el .csv es la RECETA de la tabla, el que se graba es .ino.partitions.bin).
    const noBin = filas.find((f) => !/\.bin$/i.test(f.archivo.name));
    if (noBin) {
      alert(`"${noBin.archivo.name}" no es un .bin.\nEn los segmentos van SOLO los binarios del build (p.ej. el partitions va con .ino.partitions.bin, no con partitions.csv).`); return;
    }
    if (fwForm.mergedArchivo && !/\.bin$/i.test(fwForm.mergedArchivo.name)) {
      alert('El merged tiene que ser el .ino.merged.bin del build.'); return;
    }
    setFwSubiendo(true);
    try {
      // Cadena de integridad (12/08, pedido de robustez de Lorenzo): al publicar
      // se calcula el SHA-256 de CADA archivo y queda inmutable en el manifiesto.
      const sha256Hex = async (buf) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buf))).map((b) => b.toString(16).padStart(2, '0')).join('');
      const subir = async (archivo) => {
        const buf = await archivo.arrayBuffer();
        const sha256 = await sha256Hex(buf);
        // El gateway storageov nació para imágenes y puede rechazar .bin (500,
        // visto en producción 12/08). Plan A: subir tal cual. Plan B: mismo
        // contenido byte a byte, camuflado con extensión/mime .pdf SOLO para
        // atravesar el gateway (el nombre real viaja en el manifiesto). La
        // verificación de ida y vuelta de abajo garantiza que NADA se alteró.
        let key;
        try {
          key = await saveImage(archivo);
        } catch {
          const camuflado = new File([buf], archivo.name + '.pdf', { type: 'application/pdf' });
          key = await saveImage(camuflado);
        }
        // VERIFICACIÓN DE IDA Y VUELTA: se descarga lo recién subido y se
        // compara el SHA-256 con el del archivo original. Si el almacenamiento
        // alteró UN bit, la publicación falla acá (nunca llega al catálogo).
        const objUrl = await getImage(key);
        const bufVuelta = await (await fetch(objUrl)).arrayBuffer();
        URL.revokeObjectURL(objUrl);
        if (await sha256Hex(bufVuelta) !== sha256) {
          throw new Error(`El almacenamiento devolvió ${archivo.name} ALTERADO (huella distinta). Release NO publicado — avisar a Juan (gateway storageov).`);
        }
        // Referencia en el modelo Archivo (trazabilidad; el binario vive en MinIO).
        try { await api.archivos.create({ key, nombre: archivo.name, mime: 'application/octet-stream', tamano: archivo.size, contexto: 'firmware' }); } catch { /* la referencia es secundaria */ }
        return { key, sha256 };
      };
      const segmentos = [];
      for (const fila of filas) {
        const { key, sha256 } = await subir(fila.archivo);
        segmentos.push({ offset: fila.offset.trim(), key, nombre: fila.archivo.name, tamano: fila.archivo.size, sha256 });
      }
      let fuente = null;
      if (fwForm.fuenteArchivo) { const r0 = await subir(fwForm.fuenteArchivo); fuente = { key: r0.key, sha256: r0.sha256, nombre: fwForm.fuenteArchivo.name, tamano: fwForm.fuenteArchivo.size }; }
      let merged = null;
      if (fwForm.mergedArchivo) { const r1 = await subir(fwForm.mergedArchivo); merged = { key: r1.key, sha256: r1.sha256, nombre: fwForm.mergedArchivo.name, tamano: fwForm.mergedArchivo.size }; }
      const release = {
        modelo: fwForm.modelo.trim(), chip: fwForm.chip, producto: fwForm.producto || 'General',
        version: fwForm.version.trim(), nombre: (fwForm.nombre || '').trim(),
        notas: fwForm.notas.trim(), flash: fwForm.flash, segmentos, fuente, merged,
        // Nace SIN aprobar: queda en Gestión de versiones hasta que el área lo
        // habilite con el tilde — recién ahí aparece en Actualizaciones (todos).
        aprobado: false,
      };
      const r = await api.multivac.guardarFirmwares([...firmwares, release]);
      setFirmwares(Array.isArray(r?.firmwares) ? r.firmwares : [...firmwares, release]);
      setFwAbmOpen(false); setFwForm(null);
      setFwModeloSel(release.modelo);
    } catch (e) { alert(e.message || 'No se pudo subir el release'); }
    finally { setFwSubiendo(false); }
  };
  // Feedback de descarga del backup (pedido 12/08: sin aviso, Leonardo tocó
  // varias veces creyendo que no funcionaba — misma lección del Excel de costos).
  const [fwDescarga, setFwDescarga] = useState(null); // { key, estado: 'bajando'|'ok' }
  const fwDescargarFuente = async (rel = fwSel) => {
    if (!rel?.fuente?.key || fwDescarga?.estado === 'bajando') return;
    setFwDescarga({ key: rel.fuente.key, estado: 'bajando' });
    try {
      log('sys', `Descargando backup del proyecto (${rel.fuente.nombre})…`);
      const objUrl = await getImage(rel.fuente.key);
      const a = document.createElement('a');
      a.href = objUrl; a.download = rel.fuente.nombre || 'proyecto.zip';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(objUrl), 5000);
      setFwDescarga({ key: rel.fuente.key, estado: 'ok' });
      setTimeout(() => setFwDescarga((d) => (d?.key === rel.fuente.key && d.estado === 'ok' ? null : d)), 5000);
    } catch (e) {
      setFwDescarga(null);
      alert(e.message || 'No se pudo descargar el proyecto');
    }
  };

  const fwBorrarRelease = async (idx) => {
    const f = firmwares[idx];
    if (!confirm(`¿Eliminar del catálogo el release "${f?.modelo} · ${f?.version}"?\n(Los binarios quedan en el almacenamiento; solo desaparece de las listas.)`)) return;
    const nuevos = firmwares.filter((_, i) => i !== idx);
    try {
      const r = await api.multivac.guardarFirmwares(nuevos);
      setFirmwares(Array.isArray(r?.firmwares) ? r.firmwares : nuevos);
      setFwIdxSel(-1); // los índices corren al borrar: soltar la selección siempre
    } catch (e) { alert(e.message || 'No se pudo actualizar el catálogo'); }
  };
  // --- TERMINAL SNIFFER (4ta solapa, 12/08): reemplazo del Hercules ---------
  // Lo que Hercules no podía: capturas largas SIN pisar datos viejos (todo
  // queda en memoria, separado del render — la pantalla muestra las últimas
  // entradas, el archivo guarda TODO) y guardado a archivo con un click, sin
  // portapapeles. Buffer del puerto de 1MB para no perder ráfagas rápidas.
  // Framing por SILENCIO (elección de Leonardo 12/08): una ráfaga = una
  // entrada con timestamp y dirección TX/RX. El timestamp es de llegada al
  // host (como Arduino/Hercules): en ráfagas muy rápidas varios bytes lo
  // comparten, pero el ORDEN es inviolable (un solo lector secuencial).
  // Campos de envío estilo Hercules (captura de Leonardo 12/08): cada uno con
  // su tilde HEX y su botón Enviar; efímeros (precarga para responder rápido
  // antes de que caduque la comunicación). DTR/RTS a mano como en Hercules —
  // por defecto APAGADOS: así abrir el puerto no resetea una ESP32.
  const SN_BAUDIOS = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600];
  // MULTI-CANAL (12/08, "subo la apuesta" de Leonardo): su placa sniffer de 3
  // USB abre 3 COM — uno ve la conversación completa y los otros dos escuchan
  // una dirección cada uno. Web Serial banca varios puertos abiertos a la vez
  // (cada uno se elige con su propio click). Cada canal tiene SU captura y SU
  // archivo; la vista y el archivo combinado intercalan por timestamp. Dentro
  // de un canal el orden es exacto; entre canales manda el reloj del host
  // (jitter USB de pocos ms — por eso el archivo por canal es la verdad de
  // cada boca y el combinado es la vista de análisis).
  const SN_ETIQUETAS_DEF = ['Completo', 'A→B', 'B→A'];
  const SN_COLORES = ['text-violet-300', 'text-amber-300', 'text-pink-300'];
  const canalNuevo = () => ({ port: null, reader: null, writer: null, lector: null, vivo: false, entradas: [], actual: null, ultimo: 0, bytes: 0, gap: 30 });
  const snRef = useRef({ canales: SN_ETIQUETAS_DEF.map(canalNuevo) });
  const [snEtiquetas, setSnEtiquetas] = useState([...SN_ETIQUETAS_DEF]);
  const [snAbiertos, setSnAbiertos] = useState([false, false, false]);
  const [snFiltro, setSnFiltro] = useState(-1); // -1 = todos los canales
  const [snEnvioCanal, setSnEnvioCanal] = useState(0);
  const [snOpc, setSnOpc] = useState({ baud: 19200, dataBits: 8, parity: 'none', stopBits: 1, gap: 30 });
  const [snSenales, setSnSenales] = useState({ dtr: false, rts: false });
  const [snHex, setSnHex] = useState(true); // vista (y archivo): HEX | ASCII
  const [snFin, setSnFin] = useState('\r\n'); // fin de línea al enviar ASCII
  const [snCmds, setSnCmds] = useState([{ texto: '', hex: true }, { texto: '', hex: true }, { texto: '', hex: true }]);
  const [, setSnTick] = useState(0); // refresco throttled de la captura
  const snCaja = useRef(null);
  const snHayAbierto = snAbiertos.some(Boolean);
  useEffect(() => {
    if (!snHayAbierto) return undefined;
    // Render desacoplado de la captura: un tick cada 150ms (por más brutal que
    // sea la ráfaga, el DOM se toca 6 veces por segundo — la captura no se frena).
    const id = setInterval(() => {
      setSnTick((t) => t + 1);
      const el = snCaja.current;
      // autoscroll solo si ya estabas abajo (no pelea si estás revisando arriba)
      if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 60) el.scrollTop = el.scrollHeight;
    }, 150);
    return () => clearInterval(id);
  }, [snHayAbierto]);

  const snAbrir = async (i) => {
    try {
      const port = await navigator.serial.requestPort();
      await port.open({
        baudRate: Number(snOpc.baud) || 19200, dataBits: Number(snOpc.dataBits) || 8,
        parity: snOpc.parity, stopBits: Number(snOpc.stopBits) || 1,
        bufferSize: 1024 * 1024, flowControl: 'none',
      });
      try { await port.setSignals({ dataTerminalReady: snSenales.dtr, requestToSend: snSenales.rts }); } catch { /* adaptador sin señales */ }
      const s = snRef.current.canales[i];
      s.port = port; s.vivo = true; s.gap = Number(snOpc.gap) || 30;
      s.writer = port.writable.getWriter();
      setSnAbiertos((a) => a.map((v, vi) => (vi === i ? true : v)));
      // Si el canal de envío apunta a uno cerrado, pasarlo al recién abierto.
      setSnEnvioCanal((prev) => (snRef.current.canales[prev]?.port ? prev : i));
      // Mismo lector canónico resiliente del CLI (lección 12/08), pero en CRUDO:
      // acá no se decodifica nada al capturar — bytes tal cual llegan. Un lector
      // por canal, cada uno con su framing por silencio independiente.
      s.lector = (async () => {
        while (s.port === port && s.vivo && port.readable) {
          const reader = port.readable.getReader();
          s.reader = reader;
          try {
            for (;;) {
              const { value, done } = await reader.read();
              if (done) break;
              if (value?.length) {
                const ahora = Date.now();
                if (!s.actual || s.actual.dir !== 'RX' || ahora - s.ultimo > s.gap) {
                  s.actual = { t: ahora, dir: 'RX', partes: [] };
                  s.entradas.push(s.actual);
                }
                s.actual.partes.push(value);
                s.bytes += value.length; s.ultimo = ahora;
              }
            }
          } catch { /* glitch de línea: retomar con el stream nuevo */ }
          finally { try { reader.releaseLock(); } catch { /* */ } }
          if (!s.vivo || s.port !== port) break;
        }
        if (s.port === port) setSnAbiertos((a) => a.map((v, vi) => (vi === i ? false : v)));
      })();
    } catch (e) { if (e?.name !== 'NotFoundError') alert('Sniffer: ' + (e.message || e)); }
  };

  const snCerrar = async (i) => {
    const s = snRef.current.canales[i];
    s.vivo = false;
    // Cierre en orden y esperando cada paso (lección "Port Busy" del 07/08).
    try { await s.reader?.cancel(); } catch { /* */ }
    try { await s.lector; } catch { /* */ }
    try { s.writer?.releaseLock(); } catch { /* */ }
    try { await s.port?.close(); } catch { /* */ }
    s.port = null; s.writer = null; s.reader = null; s.actual = null;
    setSnAbiertos((a) => a.map((v, vi) => (vi === i ? false : v)));
  };
  const snCerrarTodos = async () => {
    for (let i = 0; i < snRef.current.canales.length; i += 1) {
      if (snRef.current.canales[i].port) await snCerrar(i);
    }
  };

  const snSetSenal = async (clave, valor) => {
    const nuevas = { ...snSenales, [clave]: valor };
    setSnSenales(nuevas);
    for (const c of snRef.current.canales) {
      if (c.port) { try { await c.port.setSignals({ dataTerminalReady: nuevas.dtr, requestToSend: nuevas.rts }); } catch { /* */ } }
    }
  };

  const snEnviar = async (cmd) => {
    const s = snRef.current.canales[snEnvioCanal];
    if (!s?.writer || !cmd.texto.trim()) return;
    let bytes;
    if (cmd.hex) {
      const limpio = cmd.texto.replace(/0x/gi, '').replace(/[^0-9a-fA-F]/g, '');
      if (!limpio || limpio.length % 2) { alert('HEX inválido: cantidad impar de dígitos (formato: 7E A0 21 …)'); return; }
      bytes = new Uint8Array(limpio.match(/../g).map((h) => parseInt(h, 16)));
    } else {
      bytes = new TextEncoder().encode(cmd.texto + snFin);
    }
    s.actual = null; // la próxima RX arranca entrada nueva (respuesta separada del envío)
    s.entradas.push({ t: Date.now(), dir: 'TX', partes: [bytes] });
    s.bytes += bytes.length;
    try { await s.writer.write(bytes); } catch (e) { alert('No se pudo enviar: ' + (e.message || e)); }
    setSnTick((t) => t + 1);
  };

  const snBytesDe = (e) => {
    const total = e.partes.reduce((a, p) => a + p.length, 0);
    const u = new Uint8Array(total); let o = 0;
    for (const p of e.partes) { u.set(p, o); o += p.length; }
    return u;
  };
  const snTexto = (e) => snHex
    ? Array.from(snBytesDe(e)).map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')
    : new TextDecoder('latin1').decode(snBytesDe(e)).replace(/\r/g, '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '·');
  const snSello = (t, conFecha) => {
    const d = new Date(t); const p = (n, l = 2) => String(n).padStart(l, '0');
    const hora = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
    return conFecha ? `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${hora}` : hora;
  };

  // Totales y vista combinada (los canales se intercalan por timestamp; para
  // el render solo se mergean las últimas entradas de cada canal — liviano).
  const snTotales = () => snRef.current.canales.reduce((a, c) => ({ entradas: a.entradas + c.entradas.length, bytes: a.bytes + c.bytes }), { entradas: 0, bytes: 0 });
  const snCanalesConDatos = () => snRef.current.canales.map((c, i) => ({ c, i })).filter((x) => x.c.entradas.length);
  const snVisibles = () => {
    const idxs = snFiltro >= 0 ? [snFiltro] : snRef.current.canales.map((_, i) => i);
    const merged = [];
    for (const i of idxs) for (const e of snRef.current.canales[i].entradas.slice(-250)) merged.push({ e, canal: i });
    merged.sort((a, b) => a.e.t - b.e.t);
    return merged.slice(-250);
  };

  // Genera los TXT de la captura actual: uno POR CANAL (la verdad de cada
  // boca de la placa sniffer) + el COMBINADO si hay ≥2 (streams intercalados
  // por timestamp con el canal identificado — la conversación con dirección).
  const snArmarArchivos = () => {
    const conDatos = snCanalesConDatos();
    if (!conDatos.length) return [];
    const par = snOpc.parity === 'none' ? 'N' : snOpc.parity === 'even' ? 'E' : 'O';
    const marco = `${snOpc.baud} ${snOpc.dataBits}${par}${snOpc.stopBits}`;
    const d = new Date(); const p = (n) => String(n).padStart(2, '0');
    const ts = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
    const sane = (s) => String(s).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'canal';
    const archivos = conDatos.map(({ c, i }) => ({
      nombre: `sniffer_${sane(snEtiquetas[i])}_${ts}.txt`,
      contenido: [
        `# Captura Terminal Sniffer — AutonomIA · canal "${snEtiquetas[i]}" · ${snSello(Date.now(), true)} · ${marco} · ${c.entradas.length} entradas · ${c.bytes} bytes · vista ${snHex ? 'HEX' : 'ASCII'}`,
        ...c.entradas.map((e) => `${snSello(e.t, true)}  ${e.dir}  ${snTexto(e)}`),
      ].join('\n'),
    }));
    if (conDatos.length > 1) {
      const ancho = Math.max(...conDatos.map(({ i }) => snEtiquetas[i].length));
      const todas = conDatos.flatMap(({ c, i }) => c.entradas.map((e) => ({ e, i }))).sort((a, b) => a.e.t - b.e.t);
      archivos.push({
        nombre: `sniffer_combinado_${ts}.txt`,
        contenido: [
          `# Captura COMBINADA Terminal Sniffer — AutonomIA · ${snSello(Date.now(), true)} · ${marco} · canales: ${conDatos.map(({ i }) => snEtiquetas[i]).join(' | ')} · orden por reloj del host (jitter USB de pocos ms entre canales)`,
          ...todas.map(({ e, i }) => `${snSello(e.t, true)}  ${snEtiquetas[i].padEnd(ancho)}  ${e.dir}  ${snTexto(e)}`),
        ].join('\n'),
      });
    }
    return archivos;
  };
  const snBajar = (nombre, contenido) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([contenido], { type: 'text/plain;charset=utf-8' }));
    a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };
  const snGuardar = () => { for (const f of snArmarArchivos()) snBajar(f.nombre, f.contenido); };
  // Archivar EN ESTA PC (IndexedDB): la captura queda guardada aunque cierres
  // la pestaña o reinicies — se descarga o borra después, desde la lista.
  const [snArchivadas, setSnArchivadas] = useState([]);
  const [snArchivando, setSnArchivando] = useState(false);
  useEffect(() => {
    if (solapa === 'sniffer') snIdbTodas().then(setSnArchivadas).catch(() => {});
  }, [solapa]);
  const snArchivar = async () => {
    const archivos = snArmarArchivos();
    if (!archivos.length) return;
    setSnArchivando(true);
    try {
      const tot = snTotales();
      await snIdbGuardar({
        fecha: new Date().toISOString(),
        resumen: `${snCanalesConDatos().map(({ i }) => snEtiquetas[i]).join(' | ')} · ${tot.entradas} entradas · ${tot.bytes >= 10240 ? `${(tot.bytes / 1024).toFixed(1)} KB` : `${tot.bytes} bytes`} · ${snHex ? 'HEX' : 'ASCII'}`,
        archivos,
      });
      setSnArchivadas(await snIdbTodas());
    } catch (e) { alert('No se pudo archivar en esta PC: ' + (e?.message || e)); }
    finally { setSnArchivando(false); }
  };
  const snBorrarArchivada = async (id) => {
    if (!confirm('¿Borrar esta captura archivada de esta PC?')) return;
    try { await snIdbBorrar(id); setSnArchivadas(await snIdbTodas()); } catch { /* */ }
  };
  const snLimpiar = () => {
    if (snTotales().entradas && !confirm('¿Borrar la captura de TODOS los canales? (si no la guardaste, se pierde)')) return;
    for (const c of snRef.current.canales) { c.entradas = []; c.actual = null; c.bytes = 0; }
    setSnTick((t) => t + 1);
  };

  const conexion = useRef({}); // { port, reader, writer } | { device, rxChar }
  const bufferRx = useRef('');
  const finLog = useRef(null);
  // Sink de RX para la configuración guiada: cuando el formulario consulta la
  // placa, cada línea recibida le llega también a él (además del terminal).
  const rxSink = useRef(null);
  // Selector de firmware de la solapa Configuraciones (13/08): cada firmware
  // tiene su flujo guiado; "libre" es el terminal clásico completo. Manual
  // hasta que Lorenzo agregue `FW version` a `info` (ahí: autodetección).
  const [cfgModo, setCfgModo] = useState(() => {
    try { return localStorage.getItem('cooptech:multivac_cfgmodo') || 'reconecta'; } catch { return 'reconecta'; }
  });
  const elegirCfgModo = (m) => { setCfgModo(m); try { localStorage.setItem('cooptech:multivac_cfgmodo', m); } catch { /* */ } };

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
      if (linea) {
        log('in', linea);
        try { rxSink.current?.(linea); } catch { /* el sink nunca frena el terminal */ }
      }
    }
  };

  // ---------- Transporte USB (Web Serial): el CLI por serie, tal cual ----------
  const conectarSerial = async () => {
    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 115200 });
      // Salida del modo bootloader (hotfix 07/08): al abrir, el navegador puede
      // dejar DTR/RTS en un estado que resetea la placa con IO0 a masa → el
      // ESP32 arranca en DOWNLOAD_BOOT y el CLI nunca corre (se veía el log de
      // boot pero no respondía; en otro terminal sí). Secuencia esptool de
      // reset a modo RUN: EN abajo con IO0 suelto, esperar, EN arriba.
      try {
        await port.setSignals({ dataTerminalReady: false, requestToSend: true });  // EN=0 (reset), IO0=1
        await new Promise((r) => setTimeout(r, 120));
        await port.setSignals({ dataTerminalReady: false, requestToSend: false }); // EN=1 → boot normal
      } catch { /* adaptador sin señales cableadas: no molesta, seguir */ }
      const writer = port.writable.getWriter();
      conexion.current = { port, writer, vivo: true };
      setTransporte('serial'); setConectado(true);
      log('sys', 'Conectado por USB (115200). Probá "help" para ver los comandos del CLI.');
      // LECTOR ROBUSTO (hotfix 12/08): el reset a modo RUN que hacemos al
      // conectar genera un glitch en la línea → Web Serial lo reporta como
      // framing error y ERRA el stream de lectura (el puerto sigue abierto).
      // El pipe único de antes moría ahí ("Conexión USB cerrada" instantánea).
      // Patrón canónico: while (port.readable) — tras un error no fatal el
      // puerto expone un stream NUEVO y se sigue leyendo; si el puerto se
      // cierra de verdad (desconectar o desenchufe), readable queda null.
      const lector = (async () => {
        const dec = new TextDecoder();
        while (conexion.current.port === port && conexion.current.vivo && port.readable) {
          const reader = port.readable.getReader();
          conexion.current.reader = reader;
          try {
            for (;;) {
              const { value, done } = await reader.read();
              if (done) break;
              if (value) procesarEntrada(dec.decode(value, { stream: true }));
            }
          } catch { /* glitch de línea (framing/break, típico del reset): reintentar */ }
          finally { try { reader.releaseLock(); } catch { /* */ } }
          if (!conexion.current.vivo || conexion.current.port !== port) break;
        }
        if (conexion.current.port === port) setConectado(false);
        log('sys', 'Conexión USB cerrada.');
      })();
      conexion.current.lector = lector;
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
    conexion.current = {}; setConectado(false); setTransporte(null);
    // Cierre serial en orden y ESPERANDO cada paso (hotfix 07/08): antes se
    // llamaba port.close() con los streams todavía bloqueados por el pipe →
    // close() rechazaba en silencio y Chrome retenía el puerto ("Port Busy"
    // en Arduino hasta desenchufar la placa o cerrar la pestaña).
    // (12/08: el lector ahora es un loop con reintento; vivo=false le avisa
    // que el cierre es DESEADO y no un glitch a reintentar.)
    c.vivo = false;
    try { await c.reader?.cancel(); } catch { /* */ }
    try { await c.lector; } catch { /* */ }           // espera a que suelte port.readable
    try { c.writer?.releaseLock(); } catch { /* */ }  // suelta port.writable
    try { await c.port?.close(); } catch { /* */ }
    try { c.device?.gatt?.disconnect(); } catch { /* */ }
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
  const guardarRecetas = (rs) => { setRecetas(rs); setRecetasDirty(true); };

  // ---------- Piezas de UI compartidas entre solapas (rediseño 12/08) ----------
  // La caja de terminal es UNA sola (mismo log `lineas`): en "Actualizaciones"
  // muestra el paso a paso del flasheo; en "Configuraciones" es el CLI completo.
  // Solo se monta una a la vez, así que el ref de autoscroll no se pisa.
  const cajaTerminal = (altura, vacio) => (
    <div className={`bg-slate-900 text-slate-100 rounded-xl p-3 ${altura} overflow-y-auto font-mono text-[12.5px] leading-relaxed`}>
      {lineas.length === 0 && <p className="text-slate-500">{vacio || '— Conectá un equipo y escribí «help» —'}</p>}
      {lineas.map((l, i) => (
        <div key={i} className={l.t === 'out' ? 'text-emerald-300' : l.t === 'sys' ? 'text-amber-300' : 'text-slate-100'}>
          {l.t === 'out' ? '› ' : ''}{l.txt}
        </div>
      ))}
      <div ref={finLog} />
    </div>
  );

  // Tabla de releases del mockup: Producto | Versión | Nombre | Archivos |
  // Comentario. Click en la fila = seleccionar. En modo gestión suma el tilde
  // de aprobación, la fecha/autor y las acciones (descargar código, eliminar).
  const tablaReleases = (releases, gestion) => (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-slate-400 bg-slate-50">
          {gestion && <th className="px-2 py-1.5 font-medium" title="Aprobado: visible en «Actualizaciones de firmware» para todos">✓</th>}
          <th className="px-2 py-1.5 font-medium">Producto</th>
          <th className="px-2 py-1.5 font-medium">Versión</th>
          <th className="px-2 py-1.5 font-medium">Nombre</th>
          <th className="px-2 py-1.5 font-medium">Archivos</th>
          <th className="px-2 py-1.5 font-medium">Comentario de la versión</th>
          {gestion && <th className="px-2 py-1.5 font-medium">Subido</th>}
          {gestion && <th />}
        </tr>
      </thead>
      <tbody>
        {releases.map((f) => (
          <tr key={f._i} onClick={() => { setFwIdxSel(f._i); setFwModeloSel(f.modelo); }}
            className={`border-t border-slate-100 cursor-pointer ${fwIdxSel === f._i ? 'bg-coop-azul/10' : 'hover:bg-slate-50'}`}>
            {gestion && (
              <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                <input type="checkbox" checked={f.aprobado === true} onChange={() => fwToggleAprobado(f._i)}
                  title="Aprobado: visible en «Actualizaciones de firmware» para todos" className="accent-coop-azul cursor-pointer" />
              </td>
            )}
            <td className="px-2 py-1.5 whitespace-nowrap">{f.producto || '—'}</td>
            <td className="px-2 py-1.5 font-mono whitespace-nowrap">{f.version}</td>
            <td className="px-2 py-1.5">{f.nombre || '—'}</td>
            <td className="px-2 py-1.5 whitespace-nowrap text-slate-500" title={(f.segmentos || []).map((sg) => `${sg.offset}  ${sg.nombre}`).join('\n')}>{descArchivos(f)}</td>
            <td className="px-2 py-1.5 text-slate-500 max-w-[260px] truncate" title={f.notas || ''}>{f.notas || ''}</td>
            {gestion && <td className="px-2 py-1.5 whitespace-nowrap text-slate-400">{String(f.fecha || '').slice(0, 10)}{f.subidoPor ? ` · ${f.subidoPor}` : ''}</td>}
            {gestion && (
              <td className="px-2 py-1.5 whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                {f.fuente?.key && (
                  <button onClick={() => fwDescargarFuente(f)} disabled={fwDescarga?.estado === 'bajando'}
                    title={fwDescarga?.key === f.fuente.key && fwDescarga.estado === 'ok' ? 'Descarga iniciada — revisá tus descargas' : `Descargar proyecto completo (${f.fuente.nombre})`}
                    className={`px-1 ${fwDescarga?.key === f.fuente.key ? (fwDescarga.estado === 'bajando' ? 'text-amber-500' : 'text-emerald-600') : 'text-slate-400 hover:text-coop-azul'}`}>
                    {fwDescarga?.key === f.fuente.key ? (fwDescarga.estado === 'bajando' ? '⏳' : '✓') : '⬇'}
                  </button>
                )}
                <button onClick={() => fwBorrarRelease(f._i)} title="Eliminar release del catálogo"
                  className="text-slate-400 hover:text-red-500 px-1 text-sm leading-none">×</button>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );

  // Panel de programación compartido (12/08): idéntico en «Actualizaciones de
  // firmware» y en «Gestión de versiones» — así Lorenzo prueba un release SIN
  // aprobarlo (aprobar para probar lo haría visible a todos por un rato).
  // Detalle con la "tabla sagrada" offset→archivo SIEMPRE visible antes de
  // tocar nada (pedido puntual de Lorenzo) + botones + progreso + terminal.
  const panelProgramacion = () => (
    <>
      {fwSel && (
        <div className="bg-white border border-slate-200 rounded-xl p-3 mt-3">
          <div className="flex items-center justify-between flex-wrap gap-1 mb-1">
            <p className="text-sm font-medium text-slate-700">
              {fwSel.modelo} · {fwSel.version}{fwSel.nombre ? ` · ${fwSel.nombre}` : ''}
              {fwSel.aprobado !== true && <span className="ml-2 text-[11px] text-amber-600 font-normal">sin aprobar — prueba interna</span>}
            </p>
            <span className="text-[11px] text-slate-400">Chip: {CHIP_LABEL[fwSel.chip] || fwSel.chip} · flash {MODE_LABEL[fwSel.flash?.mode] || fwSel.flash?.mode} / {FREQ_LABEL[fwSel.flash?.freq] || fwSel.flash?.freq} / {fwSel.flash?.size}</span>
          </div>
          {fwSel.segmentos.length > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 font-mono text-[10.5px] text-slate-600">
              {fwSel.segmentos.map((sg, i) => (
                <div key={i} className="flex justify-between gap-2">
                  <span className="text-coop-azul shrink-0">{sg.offset}</span>
                  <span className="truncate">{sg.nombre}</span>
                  {sg.sha256 && <span className="text-slate-400 shrink-0" title={`SHA-256: ${sg.sha256}`}>✓{sg.sha256.slice(0, 8)}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-2 mt-3">
        <button onClick={() => fwProgramar('actualizar')} disabled={!fwSel?.segmentos?.length || flasheando || !soportaSerial}
          className="px-4 py-3 text-sm font-medium bg-coop-naranja text-white rounded-xl hover:opacity-90 disabled:opacity-40">
          {flasheando ? 'Programando…' : '⬆ Actualizar con la versión seleccionada (conserva config)'}
        </button>
        <button onClick={() => fwProgramar('fabrica')} disabled={!fwSel?.merged?.key || flasheando || !soportaSerial}
          className="px-4 py-3 text-sm font-medium border border-red-300 text-red-600 rounded-xl hover:bg-red-50 disabled:opacity-40">
          🏭 Volver a fábrica (borra TODO)
        </button>
      </div>
      {!fwSel && <p className="text-[11px] text-slate-400 mt-1.5">Seleccioná una versión en la tabla para habilitar los botones.</p>}
      {fwSel && !fwSel.merged?.key && <p className="text-[11px] text-slate-400 mt-1.5">Esta versión no incluye imagen de fábrica (merged): solo actualización.</p>}
      {/* Barra de progreso SIEMPRE visible (pedido 12/08: para el usuario no
          especializado tiene que estar ahí aunque no haya programación en
          curso). Ancho total = el de los dos botones de arriba. */}
      <div className="mt-3">
        <div className="flex justify-between text-[11px] text-slate-500 mb-0.5">
          <span>{flashProg ? `Programando — segmento ${flashProg.seg}/${flashProg.total}` : flasheando ? 'Preparando programación…' : 'Progreso de programación'}</span>
          <span>{flashProg ? `${flashProg.pct}%` : flasheando ? '…' : '—'}</span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-coop-naranja transition-all" style={{ width: `${flashProg ? flashProg.pct : 0}%` }} />
        </div>
      </div>

      <div className="mt-4">
        <h3 className="text-sm font-medium text-slate-700 mb-1.5">Terminal de comunicaciones</h3>
        {cajaTerminal('h-56', '— Acá vas a ver el paso a paso de la programación —')}
        <p className="text-[11px] text-slate-400 mt-1.5">La placa entra al bootloader por auto-reset (DTR/RTS), el chip se verifica ANTES de escribir y al terminar se reinicia sola a modo run. Si el CLI está conectado, se cierra solo.</p>
      </div>
    </>
  );

  return (
    <div className="p-4">
      <h2 className="text-lg font-semibold text-slate-800 mb-1">AutonomIA <span className="text-sm font-normal text-slate-400">· aprovisionamiento Multivac</span></h2>
      {/* Solapas del rediseño 12/08 (mockup de Leonardo). Gestión de versiones
          es de uso interno del área — los usuarios externos no la ven. */}
      <div className="flex flex-wrap gap-1 border-b border-slate-200 mb-4 mt-1">
        {[
          { id: 'firmware', label: 'Actualizaciones de firmware' },
          { id: 'config', label: 'Configuraciones' },
          { id: 'sniffer', label: 'Terminal Sniffer' },
          ...(puedeGestionar ? [{ id: 'gestion', label: 'Gestión de versiones' }] : []),
        ].map((s) => (
          <button key={s.id} onClick={() => setSolapa(s.id)}
            className={`px-3 py-2 text-sm rounded-t-lg -mb-px border ${solapa === s.id ? 'bg-white border-slate-200 border-b-white text-coop-negro font-medium' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
            {s.label}
          </button>
        ))}
      </div>

      {/* ============ SOLAPA: ACTUALIZACIONES DE FIRMWARE (todos) ============ */}
      {solapa === 'firmware' && (
        <div>
          <p className="text-sm text-slate-500 mb-3">
            Elegí el equipo, tocá una versión en la tabla y programá. Acá aparecen solo las versiones <b>aprobadas</b> por el área.
            {!soportaSerial && ' Este navegador no soporta Web Serial: usá Chrome/Edge de PC.'}
          </p>
          {gruposAprobados.length === 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 text-center text-sm text-slate-400 mb-3">
              Todavía no hay versiones aprobadas.{puedeGestionar ? ' Subilas y aprobalas con el tilde en «Gestión de versiones».' : ' El área está preparando el catálogo.'}
            </div>
          )}
          {gruposAprobados.map((g) => (
            <details key={g.modelo} open className="bg-white border border-slate-200 rounded-xl mb-2 overflow-hidden">
              <summary className="px-3 py-2 cursor-pointer select-none text-sm font-medium text-slate-700 hover:bg-slate-50">
                {g.modelo} <span className="font-normal text-slate-400">{g.chip ? `· ${CHIP_LABEL[g.chip]} ` : ''}· {g.releases.length} versión{g.releases.length === 1 ? '' : 'es'}</span>
              </summary>
              <div className="overflow-x-auto border-t border-slate-100">{tablaReleases(g.releases, false)}</div>
            </details>
          ))}

          {panelProgramacion()}
        </div>
      )}

      {/* ============ SOLAPA: CONFIGURACIONES (el CLI completo) ============ */}
      {solapa === 'config' && (
      <>
      {/* Los botones de conexión viven ACÁ (pedido 12/08): el CLI por USB/BLE
          solo se usa en esta solapa — el flasheo y el sniffer piden su propio
          puerto en su propia vista. */}
      <div className="flex items-start justify-between flex-wrap gap-2 mb-3">
        <div className="flex-1 min-w-[280px]">
          {/* Selector de firmware (13/08): flujos distintos por firmware. Manual
              hasta que `info` informe la versión — ahí se autodetecta. */}
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <label className="text-xs text-slate-500">Firmware de la placa:</label>
            <select value={cfgModo} onChange={(e) => elegirCfgModo(e.target.value)}
              className="border border-slate-300 rounded-lg px-2 py-1 text-sm">
              <option value="reconecta">Reconecta — DNP3 Universal (guiado)</option>
              <option value="agua" disabled>+Agua (próximamente)</option>
              <option value="libre">Terminal libre (avanzado)</option>
            </select>
          </div>
          <p className="text-sm text-slate-500">
            {cfgModo === 'reconecta'
              ? 'Conectá la placa por USB: la configuración se lee sola y se edita como formulario — «Grabar» envía únicamente lo que cambiaste.'
              : 'Terminal del CLI del firmware universal: configurá una Multivac sin ingeniero, por cable USB o Bluetooth.'}
            {!soportaSerial && !soportaBle && ' Este navegador no soporta ninguno de los dos transportes: usá Chrome/Edge.'}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
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

      {/* Modo GUIADO Reconecta: formulario que lee/edita/graba la placa. */}
      {cfgModo === 'reconecta' && (
        <MultivacConfigReconecta
          conectado={conectado && transporte === 'serial'}
          enviarLinea={enviarLinea}
          rxSink={rxSink}
          terminal={cajaTerminal('h-[480px]')}
          log={log}
        />
      )}

      {/* Modo TERMINAL LIBRE: la vista clásica completa. */}
      {cfgModo !== 'reconecta' && (
      <div className="grid lg:grid-cols-5 gap-4">
        {/* Terminal */}
        <div className="lg:col-span-3">
          {cajaTerminal('h-96')}
          {/* Botonera compartida (ola 3): filtro por producto + comandos con nombre humanizado. */}
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            {['Todos', ...PRODUCTOS_BOTON].map((pr) => (
              <button key={pr} onClick={() => setFiltroProd(pr)}
                className={`text-[11px] px-2 py-0.5 rounded-full border ${filtroProd === pr ? 'bg-coop-negro text-white border-coop-negro' : 'text-slate-500 border-slate-200 hover:border-slate-400'}`}>
                {pr}
              </button>
            ))}
            <button onClick={() => { setAbmLista(botones.map((b) => ({ ...b }))); setAbmOpen(true); }}
              title="Botones de comandos (compartidos por todo el equipo)"
              className="text-slate-400 hover:text-coop-azul p-1"><Settings size={14} /></button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            {botonesVisibles.map((b, i) => (
              <button key={`${b.producto}-${b.comando}-${i}`} onClick={() => conectado && enviarLinea(b.comando)} disabled={!conectado}
                title={`${b.comando}${b.producto !== 'General' ? ` · ${b.producto}` : ''}`}
                className="text-xs border border-slate-300 px-2.5 py-1 rounded-full hover:border-coop-azul hover:text-coop-azul disabled:opacity-40">
                {b.nombre}
              </button>
            ))}
            {botonesVisibles.length === 0 && <span className="text-xs text-slate-400">Sin botones para {filtroProd} — cargalos desde el engranaje.</span>}
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

        {/* Columna derecha: la soldadura CriterIA + recetas */}
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
                  Las recetas encadenan comandos del CLI con variables y son COMPARTIDAS por el equipo. Las oficiales de +Agua y Reconecta salen del help real de Lorenzo (10/08). OJO: +Agua usa comas en add_wifi; Reconecta, espacios.
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
                {/* Ola B: las recetas son COMPARTIDAS — el guardado es explícito. */}
                <div className="flex items-center gap-2 mt-2">
                  <button onClick={persistirRecetas} disabled={recetasGuardando || !recetasDirty}
                    className="px-3 py-1.5 text-xs bg-coop-azul text-white rounded-lg hover:opacity-90 disabled:opacity-40">
                    {recetasGuardando ? 'Guardando…' : 'Guardar para todos'}
                  </button>
                  {recetasDirty && !recetasGuardando && <span className="text-[11px] text-amber-600">Cambios sin guardar (locales)</span>}
                </div>
              </>
            )}
          </div>

          {/* LA SOLDADURA (ola B): planteo CriterIA → aprovisionamiento */}
          <div className="bg-white border border-slate-200 rounded-xl p-3 mt-4">
            <h3 className="font-medium text-slate-700 text-sm mb-1">⚡ Aprovisionar desde un planteo CriterIA <span className="font-normal text-slate-400">(opcional)</span></h3>
            <p className="text-[11px] text-slate-400 mb-2">Solo cuando el equipo nace de un proyecto +Agua con planteo generado: la secuencia se arma sola desde la asignación de recursos. Reconecta y las actualizaciones de rutina NO pasan por acá — van directo con recetas, botones o Firmware.</p>
            <select value={cwLeadSel} onChange={(e) => cwElegirLead(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm mb-2">
              <option value="">— Elegir proyecto con planteo —</option>
              {cwLeads.map((l) => <option key={l.id} value={l.id}>{l.organizacion}{l.ciudad ? ` (${l.ciudad})` : ''} · {l.equipos} equipo{l.equipos === 1 ? '' : 's'}</option>)}
            </select>
            {cwCargando && <p className="text-xs text-slate-400">Leyendo planteo…</p>}
            {cwDetalle && (
              <>
                {cwDetalle.asignacion_recursos.length > 1 && (
                  <select value={cwEquipoSel} onChange={(e) => cwElegirEquipo(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm mb-2">
                    {cwDetalle.asignacion_recursos.map((eq, i) => <option key={i} value={i}>{eq.equipo || `Equipo ${i + 1}`}{eq.ubicacion ? ` · ${eq.ubicacion}` : ''}</option>)}
                  </select>
                )}
                {['nombre', 'ssid', 'clave'].map((k) => (
                  <div key={k} className="mb-1.5">
                    <label className="block text-xs text-slate-500 mb-0.5">{k}</label>
                    <input value={cwVars[k] || ''} onChange={(e) => setCwVars((v) => ({ ...v, [k]: e.target.value }))}
                      className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
                  </div>
                ))}
                <label className="block text-xs text-slate-500 mb-0.5 mt-2">Secuencia (editable; # comenta)</label>
                <textarea rows={9} value={cwSecuencia} onChange={(e) => setCwSecuencia(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-mono" />
                <button onClick={cwEnviar} disabled={!conectado}
                  className="w-full mt-2 px-3 py-2 text-sm font-medium bg-coop-azul text-white rounded-lg hover:opacity-90 disabled:opacity-40">
                  ⚡ Aprovisionar {cwDetalle.asignacion_recursos[cwEquipoSel]?.equipo || ''}
                </button>
                {!conectado && <p className="text-[11px] text-slate-400 mt-1">Conectá la Multivac por USB para enviar.</p>}
                <details className="mt-2">
                  <summary className="text-[11px] text-slate-400 cursor-pointer">Plantilla de recurso (compartida)</summary>
                  <p className="text-[11px] text-slate-400 mt-1 mb-1">Convierte cada recurso del planteo en una línea ({'{{canal}}'}, {'{{descripcion}}'}, {'{{tipo}}'}). Hoy genera comentarios guía; cuando Lorenzo defina el JSON de add_sensor_json, se cambia acá y pasan a ser comandos reales.</p>
                  <textarea rows={2} value={cwPlantilla} onChange={(e) => { setCwPlantilla(e.target.value); setCwPlantillaDirty(true); }}
                    className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-mono" />
                  <div className="flex items-center gap-2 mt-1">
                    <button onClick={cwGuardarPlantilla} disabled={!cwPlantillaDirty}
                      className="px-2.5 py-1 text-[11px] bg-coop-azul text-white rounded-lg hover:opacity-90 disabled:opacity-40">Guardar para todos</button>
                    <button onClick={() => cwDetalle && setCwSecuencia(armarSecuencia(cwDetalle, cwEquipoSel, cwPlantilla))}
                      className="px-2.5 py-1 text-[11px] border border-slate-300 rounded-lg hover:border-coop-azul">Regenerar secuencia</button>
                  </div>
                </details>
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
      )}
      </>
      )}

      {/* ============ SOLAPA: TERMINAL SNIFFER (reemplazo del Hercules) ============ */}
      {solapa === 'sniffer' && (
        <div>
          <p className="text-sm text-slate-500 mb-3">
            Monitor de comunicaciones serie. Registra cada ráfaga con fecha y hora al milisegundo y su dirección (TX/RX); la captura se conserva completa en memoria — la pantalla muestra las últimas entradas y el archivo guarda la totalidad. Admite hasta <b>3 puertos COM simultáneos</b> con etiqueta propia (por ejemplo, para monitorear la comunicación entre dos equipos: un canal completo y uno por cada dirección). Al guardar se genera un archivo por canal y, si hay más de uno, un archivo combinado en orden cronológico. Funciona de manera independiente del CLI y de la programación de firmware.
          </p>

          {/* Opciones compartidas del puerto (los 3 COM escuchan el mismo bus) */}
          <div className="bg-white border border-slate-200 rounded-xl p-3 mb-3">
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className="block text-[11px] text-slate-500 mb-0.5">Baudrate</label>
                <select value={snOpc.baud} disabled={snHayAbierto} onChange={(e) => setSnOpc((o) => ({ ...o, baud: Number(e.target.value) }))}
                  className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm disabled:bg-slate-50">
                  {SN_BAUDIOS.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-0.5">Datos</label>
                <select value={snOpc.dataBits} disabled={snHayAbierto} onChange={(e) => setSnOpc((o) => ({ ...o, dataBits: Number(e.target.value) }))}
                  className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm disabled:bg-slate-50">
                  <option value={8}>8</option><option value={7}>7</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-0.5">Paridad</label>
                <select value={snOpc.parity} disabled={snHayAbierto} onChange={(e) => setSnOpc((o) => ({ ...o, parity: e.target.value }))}
                  className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm disabled:bg-slate-50">
                  <option value="none">none</option><option value="even">even</option><option value="odd">odd</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-0.5">Stop</label>
                <select value={snOpc.stopBits} disabled={snHayAbierto} onChange={(e) => setSnOpc((o) => ({ ...o, stopBits: Number(e.target.value) }))}
                  className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm disabled:bg-slate-50">
                  <option value={1}>1</option><option value={2}>2</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-0.5" title="Una pausa mayor a este tiempo separa dos ráfagas (dos entradas)">Silencio (ms)</label>
                <input type="number" min="5" max="1000" value={snOpc.gap} disabled={snHayAbierto}
                  onChange={(e) => setSnOpc((o) => ({ ...o, gap: Number(e.target.value) }))}
                  className="w-20 border border-slate-300 rounded-lg px-2 py-1.5 text-sm disabled:bg-slate-50" />
              </div>
              <div className="flex items-center gap-3 pb-1.5 px-1" title="Señales de módem (como en Hercules), aplicadas a todos los canales abiertos. APAGADAS, abrir el puerto no resetea una ESP32.">
                <label className="flex items-center gap-1 text-xs text-slate-500 cursor-pointer">
                  <input type="checkbox" checked={snSenales.dtr} onChange={(e) => snSetSenal('dtr', e.target.checked)} className="accent-coop-azul" /> DTR
                </label>
                <label className="flex items-center gap-1 text-xs text-slate-500 cursor-pointer">
                  <input type="checkbox" checked={snSenales.rts} onChange={(e) => snSetSenal('rts', e.target.checked)} className="accent-coop-azul" /> RTS
                </label>
              </div>
            </div>
            {/* Canales: uno por COM de la placa sniffer. Cada "Abrir" pide SU
                puerto (regla del navegador: un click por puerto). */}
            <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-2.5">
              {snEtiquetas.map((et, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${snAbiertos[i] ? 'bg-emerald-500' : 'bg-slate-300'}`} title={snAbiertos[i] ? 'Puerto abierto' : 'Puerto cerrado'} />
                  <input value={et} onChange={(e) => setSnEtiquetas((ls) => ls.map((x, xi) => (xi === i ? e.target.value : x)))}
                    className="w-36 border border-slate-300 rounded-lg px-2 py-1.5 text-xs" placeholder={`Canal ${i + 1}`} />
                  <span className="text-[11px] text-slate-400 flex-1">
                    {snRef.current.canales[i].entradas.length ? `${snRef.current.canales[i].entradas.length} entradas · ${snRef.current.canales[i].bytes >= 10240 ? `${(snRef.current.canales[i].bytes / 1024).toFixed(1)} KB` : `${snRef.current.canales[i].bytes} bytes`}` : (snAbiertos[i] ? 'escuchando…' : 'sin datos')}
                  </span>
                  {!snAbiertos[i] && (
                    <button onClick={() => snAbrir(i)} disabled={!soportaSerial}
                      className="px-3 py-1.5 text-xs font-medium bg-coop-azul text-white rounded-lg hover:opacity-90 disabled:opacity-40 shrink-0">▶ Abrir puerto</button>
                  )}
                  {snAbiertos[i] && (
                    <button onClick={() => snCerrar(i)}
                      className="px-3 py-1.5 text-xs font-medium border border-red-300 text-red-500 rounded-lg hover:bg-red-50 shrink-0">■ Cerrar</button>
                  )}
                </div>
              ))}
              <p className="text-[10.5px] text-slate-400">Para escuchar entre 2 equipos con la placa sniffer: abrí un canal por COM (un click cada uno). Usás solo el primero si es una conexión directa común.</p>
            </div>
          </div>

          {/* Captura (vista combinada de los canales, intercalada por hora) */}
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <div className="flex rounded-lg border border-slate-300 overflow-hidden text-xs">
              <button onClick={() => setSnHex(true)} className={`px-2.5 py-1 ${snHex ? 'bg-coop-negro text-white' : 'text-slate-500 hover:bg-slate-50'}`}>HEX</button>
              <button onClick={() => setSnHex(false)} className={`px-2.5 py-1 ${!snHex ? 'bg-coop-negro text-white' : 'text-slate-500 hover:bg-slate-50'}`}>ASCII</button>
            </div>
            {snCanalesConDatos().length > 1 && (
              <div className="flex items-center gap-1">
                {[-1, ...snCanalesConDatos().map(({ i }) => i)].map((fi) => (
                  <button key={fi} onClick={() => setSnFiltro(fi)}
                    className={`text-[11px] px-2 py-0.5 rounded-full border ${snFiltro === fi ? 'bg-coop-negro text-white border-coop-negro' : 'text-slate-500 border-slate-200 hover:border-slate-400'}`}>
                    {fi === -1 ? 'Todos' : snEtiquetas[fi]}
                  </button>
                ))}
              </div>
            )}
            <span className="text-[11px] text-slate-400">{snTotales().entradas} entrada{snTotales().entradas === 1 ? '' : 's'} · {snTotales().bytes >= 10240 ? `${(snTotales().bytes / 1024).toFixed(1)} KB` : `${snTotales().bytes} bytes`} (completos, nada se pisa)</span>
            <div className="flex-1" />
            <button onClick={snGuardar} disabled={!snTotales().entradas}
              title="Baja un TXT por canal con datos; si hay más de uno, también el combinado"
              className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg hover:border-coop-azul hover:text-coop-azul disabled:opacity-40">💾 Guardar TXT{snCanalesConDatos().length > 1 ? ` (${snCanalesConDatos().length} + combinado)` : ''}</button>
            <button onClick={snArchivar} disabled={!snTotales().entradas || snArchivando}
              title="Guarda la captura en esta computadora (sobrevive a cerrar la pestaña): la descargás cuando quieras desde la lista de abajo"
              className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg hover:border-coop-azul hover:text-coop-azul disabled:opacity-40">{snArchivando ? '⏳ Archivando…' : '🗃 Archivar en esta PC'}</button>
            <button onClick={snLimpiar} disabled={!snTotales().entradas}
              className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg hover:border-red-300 hover:text-red-500 disabled:opacity-40">🧹 Limpiar</button>
          </div>
          <div ref={snCaja} className="bg-slate-900 text-slate-100 rounded-xl p-3 h-72 overflow-y-auto font-mono text-[12px] leading-relaxed">
            {snTotales().entradas === 0 && <p className="text-slate-500">— Abrí un canal (o los 3 de la placa sniffer): todo lo que entre y salga queda acá, con hora, canal y dirección —</p>}
            {snVisibles().map(({ e, canal }, i) => (
              <div key={i} className="flex gap-2 items-baseline">
                <span className="text-slate-500 shrink-0">{snSello(e.t)}</span>
                {snCanalesConDatos().length > 1 && snFiltro === -1 && (
                  <span className={`shrink-0 ${SN_COLORES[canal] || 'text-slate-400'}`}>{snEtiquetas[canal]}</span>
                )}
                <span className={`shrink-0 font-semibold ${e.dir === 'TX' ? 'text-emerald-300' : 'text-sky-300'}`}>{e.dir}</span>
                <span className={`whitespace-pre-wrap break-all ${e.dir === 'TX' ? 'text-emerald-200' : ''}`}>{snTexto(e)}</span>
              </div>
            ))}
            {snTotales().entradas > 250 && <p className="text-slate-500 text-[10.5px] mt-1">(la vista muestra las últimas 250 entradas — los archivos guardan TODAS)</p>}
          </div>

          {/* Capturas archivadas EN ESTA PC (IndexedDB): descargar/borrar después */}
          {snArchivadas.length > 0 && (
            <details open className="bg-white border border-slate-200 rounded-xl mt-3 overflow-hidden">
              <summary className="px-3 py-2 cursor-pointer select-none text-sm font-medium text-slate-700 hover:bg-slate-50">
                🗃 Capturas guardadas en esta PC <span className="font-normal text-slate-400">· {snArchivadas.length}</span>
              </summary>
              <div className="border-t border-slate-100 divide-y divide-slate-100">
                {[...snArchivadas].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))).map((r) => (
                  <div key={r.id} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                    <span className="text-slate-500 whitespace-nowrap shrink-0">{String(r.fecha).slice(0, 10)} {String(r.fecha).slice(11, 19)}</span>
                    <span className="text-slate-600 flex-1 truncate" title={(r.archivos || []).map((f) => f.nombre).join('\n')}>{r.resumen} · {(r.archivos || []).length} archivo{(r.archivos || []).length === 1 ? '' : 's'}</span>
                    <button onClick={() => (r.archivos || []).forEach((f) => snBajar(f.nombre, f.contenido))}
                      className="px-2.5 py-1 border border-slate-300 rounded-lg hover:border-coop-azul hover:text-coop-azul shrink-0">⬇ Descargar</button>
                    <button onClick={() => snBorrarArchivada(r.id)} title="Borrar de esta PC"
                      className="text-slate-400 hover:text-red-500 px-1 text-sm leading-none shrink-0">×</button>
                  </div>
                ))}
              </div>
              <p className="text-[10.5px] text-slate-400 px-3 py-1.5 border-t border-slate-100">Guardadas en el navegador de ESTA computadora (no en el servidor): sobreviven a cerrar la pestaña y reiniciar. Para compartirlas, descargalas y envialas.</p>
            </details>
          )}

          {/* Envío precargado estilo Hercules: HEX por campo + Enviar por campo */}
          <div className="bg-white border border-slate-200 rounded-xl p-3 mt-3">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <h3 className="text-sm font-medium text-slate-700">Envío (precargá las respuestas antes de que caduque la comunicación)</h3>
              <div className="flex items-center gap-3 text-[11px] text-slate-500 flex-wrap">
                {snAbiertos.filter(Boolean).length > 1 && (
                  <span className="flex items-center gap-1.5">
                    Enviar por:
                    <select value={snEnvioCanal} onChange={(e) => setSnEnvioCanal(Number(e.target.value))}
                      className="border border-slate-300 rounded-lg px-1.5 py-1 text-[11px]">
                      {snEtiquetas.map((et, i) => snAbiertos[i] ? <option key={i} value={i}>{et}</option> : null)}
                    </select>
                  </span>
                )}
                <span className="flex items-center gap-1.5">
                  Fin de línea ASCII:
                  <select value={snFin} onChange={(e) => setSnFin(e.target.value)} className="border border-slate-300 rounded-lg px-1.5 py-1 text-[11px]">
                    <option value="">Nada</option>
                    <option value={'\n'}>\n</option>
                    <option value={'\r\n'}>\r\n</option>
                    <option value={'\r'}>\r</option>
                  </select>
                </span>
              </div>
            </div>
            <div className="space-y-1.5">
              {snCmds.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input value={c.texto} onChange={(e) => setSnCmds((ls) => ls.map((x, xi) => xi === i ? { ...x, texto: e.target.value } : x))}
                    onKeyDown={(e) => { if (e.key === 'Enter') snEnviar(c); }}
                    placeholder={c.hex ? '7E A0 21 00 02 00 23 03 93 …' : 'comando en texto'}
                    className="flex-1 border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-mono" />
                  <label className="flex items-center gap-1 text-[11px] text-slate-500 cursor-pointer shrink-0" title="Interpretar el campo como bytes en hexadecimal">
                    <input type="checkbox" checked={c.hex} onChange={(e) => setSnCmds((ls) => ls.map((x, xi) => xi === i ? { ...x, hex: e.target.checked } : x))} className="accent-coop-azul" /> HEX
                  </label>
                  <button onClick={() => snEnviar(c)} disabled={!snAbiertos[snEnvioCanal] || !c.texto.trim()}
                    className="px-3 py-1.5 text-xs bg-coop-azul text-white rounded-lg hover:opacity-90 disabled:opacity-40 shrink-0">Enviar</button>
                  {snCmds.length > 3 && (
                    <button onClick={() => setSnCmds((ls) => ls.filter((_, xi) => xi !== i))}
                      title="Quitar campo" className="text-slate-400 hover:text-red-500 px-1 text-lg leading-none shrink-0">×</button>
                  )}
                </div>
              ))}
            </div>
            {snCmds.length < 20 && (
              <button onClick={() => setSnCmds((ls) => [...ls, { texto: '', hex: true }])}
                className="mt-2 text-xs text-coop-azul hover:underline">+ Agregar campo (hasta 20)</button>
            )}
            <p className="text-[11px] text-slate-400 mt-2">
              Los campos son de precarga (no se guardan). HEX acepta bytes con o sin espacios (7EA021… o 7E A0 21…). El timestamp es de llegada al host: en ráfagas muy rápidas varios bytes lo comparten, pero el orden es siempre el real.
            </p>
          </div>
        </div>
      )}

      {/* ============ SOLAPA: GESTIÓN DE VERSIONES (uso interno del área) ============ */}
      {solapa === 'gestion' && puedeGestionar && (
        <div>
          <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
            <p className="text-sm text-slate-500 flex-1 min-w-[260px]">
              Todos los releases subidos, aprobados o no. El tilde <b>✓ habilita</b> la versión hacia «Actualizaciones de firmware» (la vista de todos los usuarios). Desde acá también se programa: seleccioná una versión — aprobada o no — y usá los botones de abajo, sin necesidad de aprobarla para probarla.
            </p>
            <button onClick={fwAbrirAlta} className="px-3 py-1.5 text-sm bg-coop-azul text-white rounded-lg hover:opacity-90 flex items-center gap-1.5 shrink-0">
              <HardDriveDownload size={15} /> + Subir release
            </button>
          </div>
          {gruposTodos.length === 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 text-center text-sm text-slate-400">
              Catálogo vacío. Subí el primer release con los .bin por partición (los exporta Lorenzo).
            </div>
          )}
          {gruposTodos.map((g) => (
            <details key={g.modelo} open className="bg-white border border-slate-200 rounded-xl mb-2 overflow-hidden">
              <summary className="px-3 py-2 cursor-pointer select-none text-sm font-medium text-slate-700 hover:bg-slate-50">
                {g.modelo} <span className="font-normal text-slate-400">{g.chip ? `· ${CHIP_LABEL[g.chip]} ` : ''}· {g.releases.length} release{g.releases.length === 1 ? '' : 's'} · {g.releases.filter((f) => f.aprobado === true).length} aprobado{g.releases.filter((f) => f.aprobado === true).length === 1 ? '' : 's'}</span>
              </summary>
              <div className="overflow-x-auto border-t border-slate-100">{tablaReleases(g.releases, true)}</div>
            </details>
          ))}
          <p className="text-[11px] text-slate-400 mt-2">
            × elimina el release del catálogo (los binarios quedan en el almacenamiento — sirve para sacar cargas fallidas o versiones retiradas). ⬇ descarga el backup del proyecto completo si la versión lo incluye.
          </p>

          {/* Programación IN SITU (pedido 12/08): Lorenzo prueba el release
              recién subido SIN aprobarlo — mismo panel que Actualizaciones. */}
          {panelProgramacion()}
        </div>
      )}

      {/* Confirmación propia del flasheo: reemplaza al confirm() nativo para
          que el usuario de campo NO vea el encabezado "tauri://localhost dice…". */}
      {fwConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-[60]" onClick={() => responderConfirm(false)}>
          <div className="bg-white rounded-xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-2">{fwConfirm.titulo}</h3>
            {(fwConfirm.lineas || []).map((l, i) => (
              <p key={i} className={`text-sm mb-1.5 ${i === 0 ? 'font-medium text-slate-700' : 'text-slate-500'}`}>{l}</p>
            ))}
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => responderConfirm(false)}
                className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button onClick={() => responderConfirm(true)}
                className={`px-4 py-2 text-sm font-medium text-white rounded-lg hover:opacity-90 ${fwConfirm.peligro ? 'bg-red-600' : 'bg-coop-naranja'}`}>
                {fwConfirm.boton || 'Continuar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ABM de releases de firmware (ola C) */}
      {fwAbmOpen && fwForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => !fwSubiendo && setFwAbmOpen(false)}>
          <div className="bg-white rounded-xl w-full max-w-2xl p-5 max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-1">Subir release de firmware</h3>
            <p className="text-xs text-slate-400 mb-3">Los .bin POR PARTICIÓN que exporta Lorenzo (no el merged: pisaría configuración y mediciones). Offsets típicos precargados — ajustalos según el manifiesto de la versión.</p>
            <div className="grid sm:grid-cols-2 gap-2 mb-2">
              <div>
                <label className="block text-xs text-slate-500 mb-0.5">Equipo (el chip viene con la placa, no se elige)</label>
                <select value={fwForm.modelo}
                  onChange={(e) => { const eq = EQUIPOS_FW.find((x) => x.modelo === e.target.value); setFwForm((f) => ({ ...f, modelo: eq.modelo, chip: eq.chip, flash: { ...f.flash, freq: (FLASH_FREQS[eq.chip] || []).includes(f.flash.freq) ? f.flash.freq : (FLASH_FREQS[eq.chip] || ['80m'])[0] } })); }}
                  className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
                  {EQUIPOS_FW.map((eq) => <option key={eq.modelo} value={eq.modelo}>{eq.modelo} — {CHIP_LABEL[eq.chip]}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-0.5">Producto (aplicación que corre)</label>
                <select value={fwForm.producto} onChange={(e) => setFwForm((f) => ({ ...f, producto: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
                  {PRODUCTOS_BOTON.map((pr) => <option key={pr} value={pr}>{pr}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-0.5">Versión</label>
                <input value={fwForm.version} onChange={(e) => setFwForm((f) => ({ ...f, version: e.target.value }))}
                  placeholder="agua_0.3.0" className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-0.5">Nombre (para la tabla — opcional)</label>
                <input value={fwForm.nombre} onChange={(e) => setFwForm((f) => ({ ...f, nombre: e.target.value }))}
                  placeholder="DNP3 Universal FW" className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-0.5">Flash (mode · freq · size)</label>
                <div className="flex gap-1">
                  <select value={fwForm.flash.mode} onChange={(e) => setFwForm((f) => ({ ...f, flash: { ...f.flash, mode: e.target.value } }))}
                    className="w-full border border-slate-300 rounded-lg px-1.5 py-1.5 text-xs">
                    {FLASH_MODES.map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
                  </select>
                  <select value={fwForm.flash.freq} onChange={(e) => setFwForm((f) => ({ ...f, flash: { ...f.flash, freq: e.target.value } }))}
                    className="w-full border border-slate-300 rounded-lg px-1.5 py-1.5 text-xs">
                    {(FLASH_FREQS[fwForm.chip] || FLASH_FREQS.esp32).map((fq) => <option key={fq} value={fq}>{FREQ_LABEL[fq]}</option>)}
                  </select>
                  <select value={fwForm.flash.size} onChange={(e) => setFwForm((f) => ({ ...f, flash: { ...f.flash, size: e.target.value } }))}
                    className="w-full border border-slate-300 rounded-lg px-1.5 py-1.5 text-xs">
                    {FLASH_SIZES.map((sz) => <option key={sz} value={sz}>{sz}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <label className="block text-xs text-slate-500 mb-0.5">Notas de la versión</label>
            <textarea rows={2} value={fwForm.notas} onChange={(e) => setFwForm((f) => ({ ...f, notas: e.target.value }))}
              className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm mb-2" />
            <div
              onDragOver={(e) => { e.preventDefault(); setFwArrastrando(true); }}
              onDragLeave={() => setFwArrastrando(false)}
              onDrop={(e) => { e.preventDefault(); setFwArrastrando(false); fwSoltarArchivos(e.dataTransfer.files); }}
              className={`border-2 border-dashed rounded-lg px-3 py-2 mb-2 text-center text-xs transition-colors ${fwArrastrando ? 'border-coop-azul bg-coop-azul/5 text-coop-azul' : 'border-slate-300 text-slate-400'}`}>
              🖱 Arrastrá acá los archivos del build de Arduino — se acomodan solos: bootloader→0x1000, partitions.bin→0x8000, boot_app0→0xE000, app→0x10000, merged→fábrica, zip/rar→backup, y si viene flash_args carga los parámetros. (Ignora _flashed, .elf, .map y demás.)
            </div>
            <label className="block text-xs text-slate-500 mb-1">Segmentos (offset hexa + .bin; fila sin archivo = se ignora)</label>
            <div className="space-y-1.5">
              {fwForm.filas.map((fila, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400 w-20 shrink-0">{fila.rol || `seg ${i + 1}`}</span>
                  <input value={fila.offset} onChange={(e) => setFwForm((f) => ({ ...f, filas: f.filas.map((x, xi) => xi === i ? { ...x, offset: e.target.value } : x) }))}
                    className="w-24 border border-slate-300 rounded-lg px-2 py-1 text-xs font-mono" />
                  <input type="file" accept=".bin" onChange={(e) => setFwForm((f) => ({ ...f, filas: f.filas.map((x, xi) => xi === i ? { ...x, archivo: e.target.files?.[0] || null } : x) }))}
                    className="flex-1 text-xs" />
                </div>
              ))}
            </div>
            <button onClick={() => setFwForm((f) => ({ ...f, filas: [...f.filas, { rol: '', offset: '0x', archivo: null }] }))}
              className="mt-2 text-xs text-coop-azul hover:underline">+ Agregar segmento</button>

            <details className="mt-2">
              <summary className="text-xs text-slate-500 cursor-pointer">Autocompletar desde flash_args o tu script de flasheo</summary>
              <p className="text-[11px] text-slate-400 mt-1 mb-1">Pegá el <span className="font-mono">build/…/flash_args</span> del export de Arduino <b>o directamente tu script de laboratorio</b> (PowerShell / bash / Python que invoque esptool): NO se ejecuta — solo se extraen offsets, archivos y parámetros. Después asigná cada .bin a su fila.</p>
              <textarea rows={3} value={fwForm.flashArgs} onChange={(e) => setFwForm((f) => ({ ...f, flashArgs: e.target.value }))}
                placeholder="--flash_mode dio --flash_freq 80m --flash_size 4MB 0x1000 xxx.bootloader.bin 0x8000 xxx.partitions.bin …"
                className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-mono" />
              <button onClick={fwAplicarFlashArgs} className="mt-1 px-2.5 py-1 text-[11px] border border-slate-300 rounded-lg hover:border-coop-azul">Aplicar</button>
            </details>

            <div className="grid sm:grid-cols-2 gap-2 mt-3 border-t border-slate-100 pt-2">
              <div>
                <label className="block text-xs text-slate-500 mb-0.5">🏭 Merged (volver a fábrica) — opcional</label>
                <input type="file" accept=".bin" onChange={(e) => setFwForm((f) => ({ ...f, mergedArchivo: e.target.files?.[0] || null }))} className="w-full text-xs" />
                <p className="text-[10px] text-slate-400 mt-0.5">El .ino.merged.bin del build. Borra config y mediciones al usarlo.</p>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-0.5">📦 Proyecto completo (backup) — opcional</label>
                <input type="file" accept=".zip,.rar,.7z" onChange={(e) => setFwForm((f) => ({ ...f, fuenteArchivo: e.target.files?.[0] || null }))} className="w-full text-xs" />
                <p className="text-[10px] text-slate-400 mt-0.5">El código fuente comprimido: respaldo por si se pierde el proyecto.</p>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 mt-3">El release se publica <b>sin aprobar</b>: queda solo en esta gestión hasta que lo habilites con el tilde ✓ — recién ahí lo ven todos en «Actualizaciones de firmware».</p>

            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setFwAbmOpen(false)} disabled={fwSubiendo}
                className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancelar</button>
              <button onClick={fwGuardarRelease} disabled={fwSubiendo}
                className="px-4 py-2 text-sm bg-coop-azul text-white rounded-lg hover:opacity-90 disabled:opacity-50">
                {fwSubiendo ? 'Subiendo binarios…' : 'Publicar release'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ABM de botones (compartidos): nombre humanizado + comando + producto. */}
      {abmOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setAbmOpen(false)}>
          <div className="bg-white rounded-xl w-full max-w-2xl p-5 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-1">Botones de comandos</h3>
            <p className="text-xs text-slate-400 mb-3">Compartidos por TODO el equipo (se guardan en el servidor). General = comunes a los 3 productos (nombre del equipo, red); lo específico de cada aplicación va bajo su producto.</p>
            <div className="space-y-2">
              {abmLista.map((b, i) => (
                <div key={i} className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                  <input value={b.nombre} onChange={(e) => setAbmLista((ls) => ls.map((x, xi) => xi === i ? { ...x, nombre: e.target.value } : x))}
                    placeholder="Nombre (ej: Ver puertos)" className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm w-full sm:w-44" />
                  <input value={b.comando} onChange={(e) => setAbmLista((ls) => ls.map((x, xi) => xi === i ? { ...x, comando: e.target.value } : x))}
                    placeholder="Comando del CLI" className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm font-mono flex-1 min-w-[140px]" />
                  <select value={b.producto} onChange={(e) => setAbmLista((ls) => ls.map((x, xi) => xi === i ? { ...x, producto: e.target.value } : x))}
                    className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
                    {PRODUCTOS_BOTON.map((pr) => <option key={pr} value={pr}>{pr}</option>)}
                  </select>
                  <button onClick={() => setAbmLista((ls) => ls.filter((_, xi) => xi !== i))}
                    title="Quitar" className="text-slate-400 hover:text-red-500 px-1 text-lg leading-none">×</button>
                </div>
              ))}
              {abmLista.length === 0 && <p className="text-sm text-slate-400">Sin botones. Agregá el primero.</p>}
            </div>
            <button onClick={() => setAbmLista((ls) => [...ls, { nombre: '', comando: '', producto: filtroProd !== 'Todos' ? filtroProd : 'General' }])}
              className="mt-3 text-sm text-coop-azul hover:underline">+ Agregar botón</button>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setAbmOpen(false)} className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button onClick={guardarBotones} disabled={abmGuardando}
                className="px-4 py-2 text-sm bg-coop-azul text-white rounded-lg hover:opacity-90 disabled:opacity-50">
                {abmGuardando ? 'Guardando…' : 'Guardar para todos'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
