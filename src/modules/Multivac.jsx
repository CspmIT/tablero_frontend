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
import { getImage, saveImage } from '../api/minio.js';

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
  const { api } = useData();
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
  const [fwAbmOpen, setFwAbmOpen] = useState(false);
  const [fwForm, setFwForm] = useState(null);
  const [fwSubiendo, setFwSubiendo] = useState(false);
  useEffect(() => {
    api.multivac.firmwares().then((r) => setFirmwares(Array.isArray(r?.firmwares) ? r.firmwares : [])).catch(() => {});
  }, [api]);

  const CHIPS_FW = [
    { id: 'esp32', label: 'ESP32 clásico (Multivac 1.0 / 7.1)' },
    { id: 'esp32s3', label: 'ESP32-S3 (Multivac 8.0)' },
    { id: 'esp32c3', label: 'ESP32-C3 mini (accesorios RS485)' },
  ];
  const normalizarChip = (nombre) => {
    const n = String(nombre || '').toUpperCase();
    if (n.includes('S3')) return 'esp32s3';
    if (n.includes('C3')) return 'esp32c3';
    if (n.includes('S2') || n.includes('C6') || n.includes('H2')) return 'otro';
    return n.includes('ESP32') ? 'esp32' : 'otro';
  };
  const fwModelos = [...new Set(firmwares.map((f) => f.modelo))];
  const fwVersiones = firmwares
    .map((f, i) => ({ ...f, _i: i }))
    .filter((f) => f.modelo === fwModeloSel)
    .sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')));
  const fwSel = firmwares[fwIdxSel] || null;

  const fwProgramar = async () => {
    if (!fwSel || flasheando) return;
    // El flasheo necesita el puerto para él solo: cerrar la sesión CLI si está abierta.
    if (conectado) { log('sys', 'Cerrando la sesión del CLI para programar…'); await desconectar(); }
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
      log('sys', `Chip detectado: ${chipNombre}`);
      if (detectado !== fwSel.chip) {
        log('sys', `⛔ ABORTADO: el firmware "${fwSel.modelo} ${fwSel.version}" es para ${fwSel.chip.toUpperCase()} y la placa conectada es ${chipNombre}. Nada se escribió.`);
        return;
      }
      if (!confirm(`Vas a programar:\n\n${fwSel.modelo} · versión ${fwSel.version}\nChip detectado: ${chipNombre} ✓\n${fwSel.segmentos.length} segmento(s), sin borrar configuración ni datos.\n\n¿Continuar?`)) {
        log('sys', 'Programación cancelada por el usuario.');
        return;
      }
      const fileArray = [];
      for (const seg of fwSel.segmentos) {
        log('sys', `Descargando ${seg.nombre || seg.key} (${seg.offset})…`);
        const objUrl = await getImage(seg.key);
        const buf = await (await fetch(objUrl)).arrayBuffer();
        URL.revokeObjectURL(objUrl);
        fileArray.push({ data: new Uint8Array(buf), address: parseInt(seg.offset, 16) });
      }
      log('sys', `Escribiendo ${fileArray.length} segmento(s)…`);
      await loader.writeFlash({
        fileArray,
        flashMode: fwSel.flash?.mode || 'keep',
        flashFreq: fwSel.flash?.freq || 'keep',
        flashSize: fwSel.flash?.size || 'keep',
        eraseAll: false,
        compress: true,
        reportProgress: (i, escrito, total) => setFlashProg({ seg: i + 1, total: fileArray.length, pct: total ? Math.round((escrito / total) * 100) : 0 }),
      });
      await loader.after('hard_reset');
      log('sys', `✅ ${fwSel.modelo} ${fwSel.version} programado. La placa se reinició: reconectá el CLI y verificá con "info".`);
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
  const fwAbrirAlta = () => {
    setFwForm({
      modelo: fwModeloSel || '', chip: 'esp32', version: '', notas: '',
      flash: { mode: 'dio', freq: '80m', size: '4MB' },
      filas: SEGMENTOS_TIPICOS.map((sg) => ({ ...sg, archivo: null })),
    });
    setFwAbmOpen(true);
  };
  const fwGuardarRelease = async () => {
    const filas = (fwForm.filas || []).filter((f) => f.archivo && /^0x[0-9a-fA-F]{1,8}$/.test(f.offset.trim()));
    if (!fwForm.modelo.trim() || !fwForm.version.trim() || !filas.length) {
      alert('Completá modelo, versión y al menos un segmento con archivo y offset hexa (0x…).'); return;
    }
    setFwSubiendo(true);
    try {
      const segmentos = [];
      for (const fila of filas) {
        const key = await saveImage(fila.archivo);
        // Referencia en el modelo Archivo (trazabilidad; el binario vive en MinIO).
        try { await api.archivos.create({ key, nombre: fila.archivo.name, mime: 'application/octet-stream', tamano: fila.archivo.size, contexto: 'firmware' }); } catch { /* la referencia es secundaria */ }
        segmentos.push({ offset: fila.offset.trim(), key, nombre: fila.archivo.name, tamano: fila.archivo.size });
      }
      const release = {
        modelo: fwForm.modelo.trim(), chip: fwForm.chip, version: fwForm.version.trim(),
        notas: fwForm.notas.trim(), flash: fwForm.flash, segmentos,
      };
      const r = await api.multivac.guardarFirmwares([...firmwares, release]);
      setFirmwares(Array.isArray(r?.firmwares) ? r.firmwares : [...firmwares, release]);
      setFwAbmOpen(false); setFwForm(null);
      setFwModeloSel(release.modelo);
    } catch (e) { alert(e.message || 'No se pudo subir el release'); }
    finally { setFwSubiendo(false); }
  };
  const fwBorrarRelease = async (idx) => {
    if (!confirm('¿Quitar este release del catálogo? (los binarios quedan en el almacenamiento)')) return;
    const nuevos = firmwares.filter((_, i) => i !== idx);
    try {
      const r = await api.multivac.guardarFirmwares(nuevos);
      setFirmwares(Array.isArray(r?.firmwares) ? r.firmwares : nuevos);
      if (fwIdxSel === idx) setFwIdxSel(-1);
    } catch (e) { alert(e.message || 'No se pudo actualizar el catálogo'); }
  };
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
      const decoder = new TextDecoderStream();
      // Guardar la promesa del pipe: para cerrar el puerto de verdad hay que
      // esperar a que el pipe suelte port.readable (ver desconectar).
      const pipe = port.readable.pipeTo(decoder.writable).catch(() => {});
      const reader = decoder.readable.getReader();
      const writer = port.writable.getWriter();
      conexion.current = { port, reader, writer, pipe };
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
    conexion.current = {}; setConectado(false); setTransporte(null);
    // Cierre serial en orden y ESPERANDO cada paso (hotfix 07/08): antes se
    // llamaba port.close() con los streams todavía bloqueados por el pipe →
    // close() rechazaba en silencio y Chrome retenía el puerto ("Port Busy"
    // en Arduino hasta desenchufar la placa o cerrar la pestaña).
    try { await c.reader?.cancel(); } catch { /* */ }
    try { await c.pipe; } catch { /* */ }             // suelta port.readable
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

  return (
    <div className="p-4 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <h2 className="text-lg font-semibold text-slate-800">AutonomIA <span className="text-sm font-normal text-slate-400">· aprovisionamiento Multivac</span></h2>
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
          {/* LA SOLDADURA (ola B): planteo CriterIA → aprovisionamiento */}
          <div className="bg-white border-2 border-coop-azul/30 rounded-xl p-3 mb-4">
            <h3 className="font-medium text-coop-azul text-sm mb-1">⚡ Aprovisionar desde CriterIA</h3>
            <p className="text-[11px] text-slate-400 mb-2">Elegí el proyecto: la secuencia se arma sola desde la asignación de recursos del planteo.</p>
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

          {/* GESTOR DE FIRMWARES (ola C): programar sin Arduino */}
          <div className="bg-white border border-slate-200 rounded-xl p-3 mt-4">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-medium text-slate-700 text-sm flex items-center gap-1.5"><HardDriveDownload size={15} className="text-coop-naranja" /> Firmware</h3>
              <button onClick={fwAbrirAlta} className="text-xs text-coop-azul hover:underline">+ Subir release</button>
            </div>
            <p className="text-[11px] text-slate-400 mb-2">Programá la placa desde acá, sin Arduino: elegí equipo y versión. No borra configuración ni mediciones (escribe solo los segmentos del release).</p>
            {fwModelos.length === 0 && <p className="text-xs text-slate-400">Catálogo vacío. Subí el primer release con los .bin por partición (los exporta Lorenzo).</p>}
            {fwModelos.length > 0 && (
              <>
                <select value={fwModeloSel} onChange={(e) => { setFwModeloSel(e.target.value); setFwIdxSel(-1); }}
                  className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm mb-2">
                  <option value="">— Equipo —</option>
                  {fwModelos.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                {fwModeloSel && (
                  <select value={fwIdxSel} onChange={(e) => setFwIdxSel(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm mb-2">
                    <option value={-1}>— Versión —</option>
                    {fwVersiones.map((f) => <option key={f._i} value={f._i}>{f.version} · {String(f.fecha || '').slice(0, 10)}{f.subidoPor ? ` · ${f.subidoPor}` : ''}</option>)}
                  </select>
                )}
                {fwSel && (
                  <>
                    {fwSel.notas && <p className="text-xs text-slate-500 mb-2 whitespace-pre-wrap">{fwSel.notas}</p>}
                    <p className="text-[11px] text-slate-400 mb-2">{CHIPS_FW.find((c) => c.id === fwSel.chip)?.label || fwSel.chip} · {fwSel.segmentos.length} segmento(s)</p>
                    <button onClick={fwProgramar} disabled={flasheando || !soportaSerial}
                      className="w-full px-3 py-2 text-sm font-medium bg-coop-naranja text-white rounded-lg hover:opacity-90 disabled:opacity-40">
                      {flasheando ? 'Programando…' : `🔌 Programar ${fwSel.version} por USB`}
                    </button>
                    {flashProg && (
                      <div className="mt-2">
                        <div className="flex justify-between text-[11px] text-slate-500 mb-0.5">
                          <span>Segmento {flashProg.seg}/{flashProg.total}</span><span>{flashProg.pct}%</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-coop-naranja transition-all" style={{ width: `${flashProg.pct}%` }} />
                        </div>
                      </div>
                    )}
                    <p className="text-[11px] text-slate-400 mt-1.5">La placa entra al bootloader por auto-reset (DTR/RTS): se verifica el chip ANTES de escribir. Si el CLI está conectado, se cierra solo.</p>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ABM de releases de firmware (ola C) */}
      {fwAbmOpen && fwForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => !fwSubiendo && setFwAbmOpen(false)}>
          <div className="bg-white rounded-xl w-full max-w-2xl p-5 max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-1">Subir release de firmware</h3>
            <p className="text-xs text-slate-400 mb-3">Los .bin POR PARTICIÓN que exporta Lorenzo (no el merged: pisaría configuración y mediciones). Offsets típicos precargados — ajustalos según el manifiesto de la versión.</p>
            <div className="grid sm:grid-cols-2 gap-2 mb-2">
              <div>
                <label className="block text-xs text-slate-500 mb-0.5">Equipo / modelo</label>
                <input value={fwForm.modelo} onChange={(e) => setFwForm((f) => ({ ...f, modelo: e.target.value }))} list="fw-modelos"
                  placeholder="Multivac 1.0/7.1" className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
                <datalist id="fw-modelos">
                  {['Multivac 1.0/7.1', 'Multivac 8.0', 'Lector de pulsos RS485', 'Sensor ultrasónico RS485', 'Lector de bombas RS485', ...fwModelos].map((m) => <option key={m} value={m} />)}
                </datalist>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-0.5">Chip</label>
                <select value={fwForm.chip} onChange={(e) => setFwForm((f) => ({ ...f, chip: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
                  {CHIPS_FW.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-0.5">Versión</label>
                <input value={fwForm.version} onChange={(e) => setFwForm((f) => ({ ...f, version: e.target.value }))}
                  placeholder="agua_0.3.0" className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-0.5">Flash (mode · freq · size)</label>
                <div className="flex gap-1">
                  {['mode', 'freq', 'size'].map((k) => (
                    <input key={k} value={fwForm.flash[k]} onChange={(e) => setFwForm((f) => ({ ...f, flash: { ...f.flash, [k]: e.target.value } }))}
                      className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-mono" />
                  ))}
                </div>
              </div>
            </div>
            <label className="block text-xs text-slate-500 mb-0.5">Notas de la versión</label>
            <textarea rows={2} value={fwForm.notas} onChange={(e) => setFwForm((f) => ({ ...f, notas: e.target.value }))}
              className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm mb-2" />
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

            {firmwares.length > 0 && (
              <details className="mt-3">
                <summary className="text-xs text-slate-500 cursor-pointer">Releases existentes ({firmwares.length})</summary>
                <div className="mt-1 space-y-1">
                  {firmwares.map((f, i) => (
                    <div key={i} className="flex items-center justify-between text-xs text-slate-600 border-t border-slate-100 py-1">
                      <span>{f.modelo} · {f.version} · {f.chip} · {String(f.fecha || '').slice(0, 10)}</span>
                      <button onClick={() => fwBorrarRelease(i)} className="text-slate-400 hover:text-red-500 px-1">×</button>
                    </div>
                  ))}
                </div>
              </details>
            )}

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
