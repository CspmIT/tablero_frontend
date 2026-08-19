// Configuración guiada — DLMS Itron (SL7000 / ACE6000), 16/08.
// Contra el CLI que le agregamos a DLMS_ITRON_2.ino v2.1b (validado en banco
// 16/08): mismo protocolo que el FW DNP3 de Lorenzo, con particularidades:
// - La placa tiene VENTANA DE CONFIGURACION de 8s al boot y AutonomIA la
//   resetea al conectar (secuencia DTR/RTS) ⇒ la lectura manda `comando` con
//   REINTENTOS hasta enganchar la ventana (o un hueco entre ciclos). Con la
//   sesion abierta, el boot/ciclo queda EN PAUSA (no molesta al medidor).
// - `get_all_json` (grupos general/redes/servidores/medidor), `get_firmware`
//   y `get_hardware` responden DENTRO de la sesion, sin login.
// - Los cambios aplican con `restart`: Grabar envía los comandos, REINICIA la
//   placa sola y re-lee tras el reboot — la verificación es contra la
//   realidad post-restart, no contra la intención.
// - El modo de stack (WIFI/STATIC_IP/DHCP) era COMPILADO hasta el FW v2.3:
//   ahí se muestra solo-lectura. Desde v2.4 es runtime (set_wifi on /
//   set_eth_static on / set_eth_dhcp on, semántica 6.35) y acá es un select.
import { useEffect, useRef, useState } from 'react';

const MQTT_PERFILES = [
  { v: '1', t: '1 — VLAN_ENERGIA' }, { v: '2', t: '2 — VLAN_IOT' },
  { v: '3', t: '3 — ENERGIA_PUBLICA' }, { v: '4', t: '4 — IOT_PUBLICA' },
  { v: '5', t: '5 — IOT_PRIVADA' },
];
const INSTALACIONES = [
  { v: 'ALIMENTADOR', t: 'ALIMENTADOR' },
  { v: 'SUBESTACION', t: 'SUBESTACION' },
  { v: 'CONSUMO_INTERNO', t: 'CONSUMO_INTERNO' },
];
const COMUNICACIONES = [{ v: 'RS_232', t: 'RS-232' }, { v: 'RS_485', t: 'RS-485' }];
const MODOS_RED = [
  { v: 'STATIC_IP', t: 'Ethernet — IP estática' },
  { v: 'DHCP', t: 'Ethernet — DHCP' },
  { v: 'WIFI', t: 'WiFi' },
];
const BAUDS_SERIE = ['1200', '2400', '4800', '9600', '19200', '38400', '57600', '115200'];

const CAMPOS_DEF = {
  nombre: '', passNueva: '',
  modo: 'STATIC_IP',
  wifiSsid: '', wifiPass: '',
  ethIp: '', ethMask: '255.255.255.0', ethGw: '', ethDns: '',
  mqttPerfil: '1',
  instalacion: 'SUBESTACION', com: 'RS_232', serialBaud: '19200', meterId: '17', refreshMin: '15',
};

const sinCeros = (v) => (String(v || '') === '0.0.0.0' ? '' : String(v || ''));
// Comillas dobles si el valor lleva espacios (el CLI las soporta en one-shot).
const q = (v) => (/\s/.test(String(v)) ? `"${v}"` : String(v));

// Parser TOLERANTE del scan de redes (estándar 6.35: `discover_wifi`; el
// v2.2 de banco respondía a `scan_wifi` — mismo formato):
//   [scan] 1) "Interna 2.4"  -55dBm  ch6  WPA2
const parseScan = (ls) => {
  const redes = [];
  for (const l of ls || []) {
    const t = String(l);
    let m = t.match(/"(.+)"\s+(-?\d{2,3})\s*dBm\s*(.*)$/i);
    if (!m) m = t.match(/^\s*\d+[).:-]\s+(.+?)\s{2,}(-\d{2,3})\s*(dBm)?\s*(.*)$/i);
    if (m) {
      const resto = String(m[4] ?? m[3] ?? '');
      redes.push({ ssid: m[1].trim(), rssi: Number(m[2]), abierta: /abierta|open/i.test(resto) });
    }
  }
  const vistos = new Set();
  return redes.sort((a, b) => b.rssi - a.rssi)
    .filter((r) => r.ssid && r.ssid !== '(oculta)' // las ocultas no son elegibles
      && (vistos.has(r.ssid) ? false : (vistos.add(r.ssid), true)));
};
const senial = (rssi) => (rssi >= -60 ? '📶 buena' : rssi >= -75 ? '📶 media' : '📶 baja');

export default function MultivacConfigItron({ habilitado, conectado, enviarLinea, rxSink, terminal, log, selectorFirmware, botonesConexion }) {
  const [campos, setCampos] = useState({ ...CAMPOS_DEF });
  const [orig, setOrig] = useState(null);
  const [estado, setEstado] = useState({});
  const [passLogin, setPassLogin] = useState('');
  const [leyendo, setLeyendo] = useState('');
  const [logueado, setLogueado] = useState(false);
  const [grabando, setGrabando] = useState(false);
  const [cfgProg, setCfgProg] = useState(null); // { txt, pct } | { ok:true } | null
  const [confirmar, setConfirmar] = useState(null);
  const [aviso, setAviso] = useState('');
  const ocupado = !!leyendo || grabando;
  const bloqueado = !habilitado || !conectado || !orig || ocupado;

  // Descubrir redes WiFi (estándar 6.35): `discover_wifi`, con fallback a
  // `scan_wifi` para la placa de banco con v2.2.
  const [scan, setScan] = useState(null); // { estado:'buscando'|'ok'|'vacio', redes:[] }
  const buscarRedes = async () => {
    if (bloqueado || scan?.estado === 'buscando') return;
    setScan({ estado: 'buscando', redes: [] });
    try {
      // QUIET LARGO (fix 19/08): el escaneo bloqueante mete 2-4 s de silencio
      // en plena respuesta — con quiet de 1,8 s cortábamos antes de las redes.
      // finRx cierra rápido en el "[scan] fin" de nuestro FW.
      const FIN = /\[scan\] fin|desconocido/i;
      let redes = parseScan(await consultar('discover_wifi', 6000, 25000, FIN));
      if (!redes.length) redes = parseScan(await consultar('scan_wifi', 6000, 25000, FIN));
      setScan(redes.length ? { estado: 'ok', redes } : { estado: 'vacio', redes: [] });
    } catch { setScan({ estado: 'vacio', redes: [] }); }
  };
  // Versión del CLI de la placa (para elegir la sintaxis de credenciales:
  // v2.3+ habla el estándar `add_wifi 0 ...`; v2.1/2.2 usaban `set_wifi ssid pass`).
  const fwCliNum = (() => { const m = String(estado.fw || '').match(/(\d+)\.(\d+)/); return m ? Number(m[1]) + Number(m[2]) / 10 : 0; })();
  const activo = useRef(true);
  useEffect(() => () => { activo.current = false; if (rxSink) rxSink.current = null; }, [rxSink]);

  // finRx (19/08, bug del scan): línea terminadora — al verla se cierra a los
  // 250 ms sin esperar el silencio (para respuestas con PAUSAS largas en el
  // medio, como discover_wifi: el escaneo bloqueante mete 2-4 s de silencio
  // entre el aviso y los resultados, y el quiet corto cortaba antes).
  const consultar = (cmd, quietMs = 400, maxMs = 6000, finRx = null) => new Promise((resolve) => {
    const acumulado = [];
    let tQuiet = null; let tMax = null;
    const fin = () => {
      clearTimeout(tQuiet); clearTimeout(tMax);
      if (rxSink.current === sink) rxSink.current = null;
      resolve(acumulado);
    };
    const sink = (l) => {
      acumulado.push(l);
      clearTimeout(tQuiet);
      tQuiet = setTimeout(fin, finRx && finRx.test(String(l)) ? 250 : quietMs);
    };
    rxSink.current = sink;
    tQuiet = setTimeout(fin, Math.max(1500, quietMs));
    tMax = setTimeout(fin, maxMs);
    enviarLinea(cmd);
  });
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

  // Abrir sesion con REINTENTOS: al conectar, AutonomIA resetea la placa ⇒ hay
  // que enganchar la ventana de 8s del boot (o un hueco entre ciclos). El FW
  // responde SIEMPRE ">>> sesion CLI activa" al tomar `comando`.
  const abrirSesion = async (intentos = 15) => {
    for (let i = 0; i < intentos; i += 1) {
      setLeyendo(`abriendo sesión (intento ${i + 1}/${intentos})`);
      const r = await consultar('comando', 400, 3500);
      if (r.some((l) => /sesion CLI activa/i.test(l))) return true;
      if (!activo.current) return false;
      await esperar(1200);
    }
    return false;
  };

  const asegurarLogin = async (passOverride) => {
    const rLogin = await consultar('login');
    if (rLogin.some((l) => /password/i.test(l))) {
      const pass = String(passOverride ?? passLogin).trim() || estado.mac || '';
      const rPass = await consultar(pass || 'cancel');
      const ok = rPass.some((l) => /login ok/i.test(l));
      setLogueado(ok);
      return ok;
    }
    setLogueado(true);
    return true;
  };

  // ---------- Parsers (contra el get_all_json REAL del .INO v2.1) ----------
  const parseAllJson = (ls, d, e) => {
    const texto = ls.join('\n');
    const ini = texto.indexOf('{'); const fin = texto.lastIndexOf('}');
    if (ini < 0 || fin <= ini) return false;
    let j; try { j = JSON.parse(texto.slice(ini, fin + 1)); } catch { return false; }
    const g = j.general || {}; const r = j.redes || {}; const s = j.servidores || {}; const md = j.medidor || {};
    if (g.dev_name != null) d.nombre = String(g.dev_name);
    if (g.mac) e.mac = String(g.mac);
    if (g.fw) e.fw = `${g.fw}${g.supported ? ` · ${g.supported}` : ''}`;
    if (g.hw) e.hw = String(g.hw);
    if (g.uptime_s != null) e.uptime = `${g.uptime_s} s`;
    if (r.modo) { e.modo = String(r.modo); d.modo = String(r.modo); }  // v2.4: también editable
    const w0 = Array.isArray(r.wifi) ? r.wifi[0] : null;
    if (w0 && w0.ssid != null) { d.wifiSsid = String(w0.ssid); d.wifiPass = ''; }
    const et = r.eth || {};
    if (et.ip != null) d.ethIp = sinCeros(et.ip);
    if (et.mask != null) d.ethMask = sinCeros(et.mask) || '255.255.255.0';
    if (et.gw != null) d.ethGw = sinCeros(et.gw);
    if (et.dns != null) d.ethDns = sinCeros(et.dns);
    if (r.iface_activa) e.iface = String(r.iface_activa);
    const mq = s.mqtt || {};
    if (mq.profile_idx != null) d.mqttPerfil = String(mq.profile_idx);
    if (mq.perfil) e.mqttPerfil = String(mq.perfil);
    if (mq.host) e.mqttHost = `${mq.host}:${mq.port ?? ''}`;
    if (mq.user != null) e.mqttUser = String(mq.user);
    if (mq.conectado != null) e.mqttConectado = mq.conectado ? 'sí' : 'no';
    const nt = s.ntp || {};
    if (nt.server) e.ntp = String(nt.server);
    if (nt.sincronizado != null) e.ntpSync = nt.sincronizado ? 'ok' : 'pendiente';
    if (md.instalacion) d.instalacion = String(md.instalacion);
    if (md.comunicacion) d.com = String(md.comunicacion);
    if (md.serial_baud != null) d.serialBaud = String(md.serial_baud);
    if (md.meter_id != null) d.meterId = String(md.meter_id);
    if (md.refresh_min != null) d.refreshMin = String(md.refresh_min);
    const ver = String(md.version || '').trim(); const snm = String(md.sn ?? '').trim(); const fwm = String(md.fw_medidor || '').trim();
    e.medidor = (ver || (snm && snm !== '0')) ? `${ver || '?'} · SN ${snm}${fwm ? ` · fw ${fwm}` : ''}` : '(sin identificar — ¿medidor conectado?)';
    return true;
  };
  const parseFirmware = (ls, e) => {
    const build = ls.join(' ').match(/build:\s*(.+?)(\s{2,}|$)/i);
    if (build) e.fwBuild = build[1].trim();
  };
  const parseHardware = (ls, e) => {
    const fl = ls.join('\n').match(/flash:\s*(.+)/i); if (fl) e.flash = fl[1].trim();
    const sk = ls.join('\n').match(/sketch:\s*(.+)/i); if (sk) e.sketch = sk[1].trim();
  };

  // ---------- Lectura (auto al conectar; sin login — solo sesion) ----------
  const leerPlaca = async (passOverride) => {
    if (!conectado || !habilitado || ocupado) return;
    setAviso('');
    const d = {}; const e = {};
    try {
      const ok = await abrirSesion();
      if (!ok) {
        setAviso('No se pudo abrir la sesión CLI: verificá que la placa tenga el firmware v2.1+ con CLI y reintentá con «Releer placa».');
        return;
      }
      setLeyendo('get_all_json');
      const esJson = parseAllJson(await consultar('get_all_json', 500, 8000), d, e);
      if (!esJson) {
        setAviso('La placa no respondió el JSON de configuración: ¿firmware sin CLI o versión vieja? Actualizala desde «Actualizaciones de firmware».');
        return;
      }
      setLeyendo('get_firmware'); parseFirmware(await consultar('get_firmware'), e);
      setLeyendo('get_hardware'); parseHardware(await consultar('get_hardware'), e);
      if (e.fw && !/itron|dlms/i.test(e.fw)) setAviso(`La placa reporta firmware "${e.fw}" — no parece DLMS Itron: verificá el selector de firmware.`);
      if (!activo.current) return;
      const final = { ...CAMPOS_DEF, ...d, passNueva: '' };
      setCampos(final); setOrig(final); setEstado(e);
      log('sys', '✓ Configuración leída (boot en pausa mientras la sesión esté abierta). Editá y tocá «Grabar cambios».');
    } finally { if (activo.current) setLeyendo(''); }
  };

  useEffect(() => {
    if (habilitado && conectado && !orig && !ocupado) leerPlaca();
    if (!conectado) setLogueado(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conectado, habilitado]);

  // ---------- Diff → comandos ----------
  const armarComandos = () => {
    if (!orig) return [];
    const c = []; const v = campos; const o = orig;
    const dif = (k) => String(v[k]) !== String(o[k]);
    if (dif('nombre') && v.nombre.trim()) c.push(`dev_name ${q(v.nombre.trim())}`);
    if (v.passNueva.trim()) c.push(`set_pass ${q(v.passNueva.trim())}`);
    // WiFi: el CLI pide ssid Y clave juntos (la clave no es legible: si cambiás
    // el SSID, completala — sin clave el comando no se arma).
    if ((dif('wifiSsid') || dif('wifiPass')) && v.wifiSsid.trim() && v.wifiPass.trim()) {
      // Estándar 6.35 (CLI v2.3+): credenciales por add_wifi. Las placas de
      // banco con v2.1/2.2 siguen entendiendo la sintaxis vieja set_wifi.
      c.push(fwCliNum >= 2.3
        ? `add_wifi 0 ${q(v.wifiSsid.trim())} ${q(v.wifiPass.trim())}`
        : `set_wifi ${q(v.wifiSsid.trim())} ${q(v.wifiPass.trim())}`);
    }
    const ipOk = (x) => /^\d{1,3}(\.\d{1,3}){3}$/.test(String(x || ''));
    const ipCompleta = ipOk(v.ethIp) && ipOk(v.ethMask) && ipOk(v.ethGw) && ipOk(v.ethDns);
    if ((dif('ethIp') || dif('ethMask') || dif('ethGw') || dif('ethDns')) && ipCompleta) {
      c.push(`set_eth_ip ${v.ethIp} ${v.ethMask} ${v.ethGw} ${v.ethDns}`);
    }
    // Modo de red (FW v2.4+, semántica 6.35): un solo comando "on" del modo destino.
    if (dif('modo') && fwCliNum >= 2.4) {
      c.push(v.modo === 'WIFI' ? 'set_wifi on' : v.modo === 'DHCP' ? 'set_eth_dhcp on' : 'set_eth_static on');
    }
    if (dif('mqttPerfil')) c.push(`change_mqtt ${v.mqttPerfil}`);
    if (dif('instalacion')) c.push(`set_instalacion ${v.instalacion}`);
    if (dif('com')) c.push(`set_com ${v.com}`);
    if (dif('serialBaud')) c.push(`set_serial_baud ${v.serialBaud}`);
    if (dif('meterId')) c.push(`set_meter_id ${v.meterId}`);
    if (dif('refreshMin')) c.push(`set_refresh ${v.refreshMin}`);
    return c;
  };
  const cambios = orig ? armarComandos() : [];

  const grabar = async () => {
    const comandos = armarComandos();
    if (!comandos.length || ocupado || !conectado) return;
    const ok = await new Promise((res) => setConfirmar({ comandos, resolve: res }));
    setConfirmar(null);
    if (!ok) return;
    setGrabando(true);
    setCfgProg({ txt: 'Iniciando sesión en la placa…', pct: 5 });
    try {
      const okLogin = await asegurarLogin();
      if (!okLogin) {
        setAviso('Login rechazado: cargá la contraseña CLI (placa nueva = la MAC) y volvé a Grabar.');
        setCfgProg(null);
        return;
      }
      for (let i = 0; i < comandos.length; i += 1) {
        setCfgProg({ txt: `Grabando — comando ${i + 1}/${comandos.length}`, pct: 10 + Math.round(((i + 1) / comandos.length) * 55) });
        await consultar(comandos[i], 500, 8000);
      }
      // En este firmware los cambios aplican con restart: se reinicia SOLA y
      // se re-lee tras el reboot — verificación contra la realidad aplicada.
      setCfgProg({ txt: 'Reiniciando la placa para aplicar…', pct: 72 });
      log('sys', `✓ ${comandos.length} cambio(s) enviado(s). Reiniciando la placa para aplicar…`);
      await consultar('restart', 600, 4000);
      const passNueva = campos.passNueva.trim();
      if (passNueva) setPassLogin(passNueva);
      await esperar(2500); // boot + banner de la ventana
      setCfgProg({ txt: 'Verificando: releyendo tras el reinicio…', pct: 85 });
      setGrabando(false);
      setOrig(null); // fuerza estado limpio: la lectura repuebla todo
      await leerPlaca(passNueva || undefined);
      if (activo.current) setCfgProg({ ok: true });
    } finally { if (activo.current) setGrabando(false); }
  };

  // ---------- Piezas de formulario ----------
  const esDirty = (k) => orig && String(campos[k]) !== String(orig[k]);
  const claseCampo = (k) => `w-full border rounded-lg px-2 py-1.5 text-sm disabled:bg-slate-50 disabled:text-slate-400 ${esDirty(k) ? 'border-amber-400 bg-amber-50' : 'border-slate-300'}`;
  const set = (k, val) => setCampos((c) => ({ ...c, [k]: val }));
  const campoTexto = (k, label, props = {}) => (
    <div className="mb-1.5">
      <label className="block text-xs text-slate-500 mb-0.5">{label}</label>
      <input value={campos[k]} onChange={(e2) => set(k, e2.target.value)} disabled={bloqueado}
        className={claseCampo(k)} {...props} />
    </div>
  );
  const campoSelect = (k, label, opciones) => (
    <div className="mb-1.5">
      <label className="block text-xs text-slate-500 mb-0.5">{label}</label>
      <select value={campos[k]} onChange={(e2) => set(k, e2.target.value)} disabled={bloqueado} className={claseCampo(k)}>
        {opciones.map((op) => <option key={op.v} value={op.v}>{op.t}</option>)}
      </select>
    </div>
  );
  const campoIp = (k, label) => {
    const partes = String(campos[k] || '').split('.');
    const oct = [0, 1, 2, 3].map((i) => partes[i] || '');
    const setOct = (i, val) => {
      const limpio = val.replace(/[^0-9]/g, '').slice(0, 3);
      const nu = [...oct]; nu[i] = limpio;
      set(k, nu.every((x) => x === '') ? '' : nu.join('.'));
    };
    return (
      <div className="mb-1.5">
        <label className="block text-xs text-slate-500 mb-0.5">{label}</label>
        <div className={`inline-flex items-center border rounded-lg px-1.5 py-1 ${bloqueado ? 'bg-slate-50' : ''} ${esDirty(k) ? 'border-amber-400 bg-amber-50' : 'border-slate-300'}`}>
          {oct.map((v, i) => (
            <span key={i} className="flex items-center">
              <input value={v} onChange={(e2) => setOct(i, e2.target.value)} disabled={bloqueado}
                inputMode="numeric" placeholder="0"
                className="w-10 text-center text-sm outline-none bg-transparent disabled:text-slate-400" />
              {i < 3 && <span className="text-slate-400 px-0.5">.</span>}
            </span>
          ))}
        </div>
      </div>
    );
  };
  const lineaEstado = (label, valor) => (valor ? <div className="flex justify-between gap-2"><span className="text-slate-400">{label}</span><span className="text-slate-600 text-right">{valor}</span></div> : null);

  const mensajePasos = !habilitado
    ? 'Pasos: 1️⃣ Elegí el firmware de la placa → 2️⃣ Conectala por USB → 3️⃣ la app engancha la ventana de configuración del boot y lee sola.'
    : !conectado
      ? 'Firmware elegido ✓ — conectá la placa por USB: se reinicia sola y la app entra en su ventana de configuración.'
      : leyendo
        ? `⏳ ${leyendo}…`
        : orig
          ? '✓ Configuración leída — el boot está EN PAUSA mientras la sesión siga abierta. Editá y bajá a «Grabar cambios» (la placa se reinicia sola para aplicar).'
          : 'Conectado — si la lectura no arrancó sola, tocá «Releer placa».';

  return (
    <div>
      {/* ============ 1 · CONEXIÓN Y ELECCIÓN DE VERSIÓN ============ */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 mb-3">
        <h3 className="text-sm font-semibold text-slate-700 mb-2">1 · Conexión y elección de versión</h3>
        <div className="flex flex-wrap items-end gap-3">
          {selectorFirmware}
          <div className="flex gap-2 items-end pb-0.5">{botonesConexion}</div>
          <div className="flex-1 min-w-[240px]">
            <label className="block text-xs text-slate-500 mb-0.5">Contraseña CLI de la placa (vacío = MAC, el default de fábrica)</label>
            <input type="password" value={passLogin} onChange={(e2) => setPassLogin(e2.target.value)} disabled={!habilitado || ocupado}
              placeholder={estado.mac ? `MAC: ${estado.mac}` : 'se usa sola al grabar'}
              className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm disabled:bg-slate-50" />
          </div>
          <button onClick={() => leerPlaca()} disabled={!habilitado || !conectado || ocupado}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg hover:border-coop-azul hover:text-coop-azul disabled:opacity-40">
            ↻ Releer placa
          </button>
        </div>
        <p className={`text-xs mt-2 ${!habilitado || !conectado ? 'text-coop-azul' : 'text-slate-500'}`}>
          {mensajePasos}{logueado && !leyendo ? '  ·  ✓ Sesión iniciada' : ''}
        </p>
        {aviso && <p className="text-xs text-amber-600 mt-1">{aviso}</p>}
      </div>

      {/* ============ 2 · CONFIGURACIONES ============ */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 mb-3">
        <h3 className="text-sm font-semibold text-slate-700 mb-2">2 · Configuraciones</h3>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {/* Columna 1: Generales + Medidor */}
          <div>
            <div className="border border-slate-100 rounded-lg p-2.5 mb-3">
              <h4 className="text-sm font-medium text-slate-700 mb-2">⚙ Configuraciones Generales</h4>
              {campoTexto('nombre', 'Nombre del dispositivo', { placeholder: 'SETA_45' })}
              {campoTexto('passNueva', 'Nueva contraseña CLI (vacío = no cambiar)', { type: 'password', placeholder: '••••••••' })}
            </div>
            <div className="border border-slate-100 rounded-lg p-2.5">
              <h4 className="text-sm font-medium text-slate-700 mb-2">📟 Configuraciones del Medidor</h4>
              {campoSelect('instalacion', 'Tipo de instalación', INSTALACIONES)}
              <div className="grid grid-cols-2 gap-2">
                {campoSelect('com', 'Comunicación', COMUNICACIONES)}
                {campoSelect('serialBaud', 'Baud serie (19200 típico)', BAUDS_SERIE.map((b) => ({ v: b, t: b })))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {campoTexto('meterId', 'ID del medidor (1..250)', { inputMode: 'numeric' })}
                {campoTexto('refreshMin', 'Refresco de datos (min)', { inputMode: 'numeric' })}
              </div>
              <p className="text-[10.5px] text-slate-400">Medidor identificado: {estado.medidor || '—'}</p>
            </div>
          </div>

          {/* Columna 2: Red */}
          <div className="border border-slate-100 rounded-lg p-2.5">
            <h4 className="text-sm font-medium text-slate-700 mb-2">🌐 Configuraciones de Red</h4>
            {fwCliNum >= 2.4 ? (
              <>
                {campoSelect('modo', 'Modo de conexión (por dónde sale TODO: MQTT y NTP)', MODOS_RED)}
                {campos.modo === 'WIFI' && String(campos.modo) !== String(orig?.modo) && !campos.wifiSsid.trim() && (
                  <p className="text-[10.5px] text-amber-600 mb-1.5">Para pasar a WiFi cargá también SSID y clave acá abajo (sin red guardada la placa queda sin conexión).</p>
                )}
              </>
            ) : (
              <p className="text-[10.5px] text-slate-400 mb-2">Modo de conexión: <b>{estado.modo || '(se lee al conectar)'}</b> — en este firmware es compilado; desde el FW v2.4 se cambia por CLI (actualizá desde «Actualizaciones de firmware»).</p>
            )}
            <div className="grid sm:grid-cols-2 gap-x-3">
              {campoIp('ethIp', 'IP estática')}
              {campoIp('ethMask', 'Máscara')}
              {campoIp('ethGw', 'Gateway')}
              {campoIp('ethDns', 'DNS')}
            </div>
            <div className="border-t border-slate-100 pt-2">
              {campoTexto('wifiSsid', 'WiFi — SSID', { placeholder: 'red del lugar' })}
              {/* Descubrir redes (19/08, FW v2.2): elegir sin tipear el SSID. */}
              <button onClick={buscarRedes} disabled={bloqueado || scan?.estado === 'buscando'}
                className="text-[11px] px-2.5 py-1 mb-1 rounded-lg border border-slate-300 bg-white text-slate-600 hover:border-coop-azul hover:text-coop-azul disabled:opacity-40">
                {scan?.estado === 'buscando' ? 'Buscando redes… (hasta ~10 s)' : '🔍 Buscar redes disponibles'}
              </button>
              {scan?.estado === 'vacio' && (
                <p className="text-[10.5px] text-amber-600 mb-1">La placa no devolvió redes: el descubrimiento llegó con el CLI v2.2+ (<code>discover_wifi</code> desde v2.3, estándar 6.35) o no hay redes al alcance. El SSID se puede tipear igual.</p>
              )}
              {scan?.estado === 'ok' && (
                <div className="mb-1 border border-slate-200 rounded-lg divide-y divide-slate-100 bg-slate-50">
                  {scan.redes.map((r) => (
                    <button key={r.ssid} onClick={() => { set('wifiSsid', r.ssid); setScan(null); }}
                      className="w-full flex flex-wrap items-center gap-1.5 px-2 py-1 text-[11px] text-left hover:bg-white">
                      <span className="font-medium text-slate-700 flex-1 min-w-[8rem] truncate" title={r.ssid}>{r.ssid}</span>
                      <span className="text-slate-400">{senial(r.rssi)} · {r.rssi} dBm{r.abierta ? ' · abierta' : ''}</span>
                    </button>
                  ))}
                  <div className="px-2 py-1"><button onClick={() => setScan(null)} className="text-[10.5px] text-slate-400 hover:text-slate-600">cerrar</button></div>
                </div>
              )}
              {campoTexto('wifiPass', 'WiFi — Clave', { type: 'password', placeholder: '••••••' })}
              <p className="text-[10.5px] text-slate-400">La clave no es legible: para cambiar el WiFi completá SSID y clave juntos.</p>
            </div>
          </div>

          {/* Columna 3: Servidores */}
          <div className="border border-slate-100 rounded-lg p-2.5">
            <h4 className="text-sm font-medium text-slate-700 mb-2">🖥 Configuraciones de Servidores</h4>
            {campoSelect('mqttPerfil', 'Perfil MQTT', MQTT_PERFILES)}
            <div className="text-xs text-slate-500 space-y-0.5 mt-2">
              {lineaEstado('Ruta activa', estado.mqttHost)}
              {lineaEstado('Usuario', estado.mqttUser)}
              {lineaEstado('Conectado', estado.mqttConectado)}
              {lineaEstado('NTP', estado.ntp && `${estado.ntp}${estado.ntpSync ? ` · sync ${estado.ntpSync}` : ''}`)}
            </div>
            <p className="text-[10.5px] text-slate-400 mt-2">El perfil define servidor, puerto y credenciales (la tabla compilada del firmware). NTP acompaña al modo de red.</p>
          </div>
        </div>
      </div>

      {/* ============ 3 · CONFIGURAR ============ */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 mb-3">
        <h3 className="text-sm font-semibold text-slate-700 mb-2">3 · Configurar</h3>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <button onClick={grabar} disabled={bloqueado || !cambios.length}
            className="px-6 py-3 text-sm font-medium bg-coop-azul text-white rounded-xl hover:opacity-90 disabled:opacity-40">
            {grabando ? '⏳ Grabando…' : `💾 Grabar cambios${cambios.length ? ` (${cambios.length})` : ''}`}
          </button>
          {!!cambios.length && !grabando && (
            <button onClick={() => { setCampos({ ...orig }); setAviso(''); }}
              className="px-3 py-2 text-xs border border-slate-300 rounded-lg text-slate-500 hover:border-slate-400">
              Descartar cambios
            </button>
          )}
          <span className="text-[11px] text-slate-400">
            {bloqueado && !orig ? 'Se habilita al conectar y leer la placa.' : cambios.length ? 'Vas a ver la lista exacta de comandos; al grabar, la placa se reinicia sola para aplicar y se verifica.' : 'Sin cambios pendientes: editá un campo y se marca en ámbar.'}
          </span>
        </div>
        <div className="mt-3">
          <div className="flex justify-between text-[11px] mb-0.5">
            <span className={cfgProg?.ok ? 'text-emerald-600 font-medium' : 'text-slate-500'}>
              {cfgProg?.ok ? '✓ Finalizado exitosamente — configuración aplicada y verificada tras el reinicio' : cfgProg ? cfgProg.txt : 'Sin grabado en curso'}
            </span>
            <span className={cfgProg?.ok ? 'text-emerald-600 font-medium' : 'text-slate-500'}>
              {cfgProg?.ok ? '100%' : cfgProg ? `${cfgProg.pct}%` : '—'}
            </span>
          </div>
          <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full transition-all ${cfgProg?.ok ? 'bg-emerald-500' : 'bg-coop-azul'}`}
              style={{ width: cfgProg?.ok ? '100%' : `${cfgProg?.pct || 0}%` }} />
          </div>
        </div>
        {orig && (
          <div className="mt-3 border-t border-slate-100 pt-2 text-xs">
            <div className="grid sm:grid-cols-3 gap-x-6 gap-y-0.5">
              {lineaEstado('MAC', estado.mac)}
              {lineaEstado('Firmware', estado.fw && `${estado.fw}${estado.fwBuild ? ` · build ${estado.fwBuild}` : ''}`)}
              {lineaEstado('Hardware', estado.hw && `${estado.hw}${estado.flash ? ` · flash ${estado.flash}` : ''}`)}
              {lineaEstado('Modo de red', estado.modo)}
              {lineaEstado('Interfaz', estado.iface)}
              {lineaEstado('MQTT', estado.mqttPerfil && `${estado.mqttPerfil}${estado.mqttConectado ? ` · conectado: ${estado.mqttConectado}` : ''}`)}
              {lineaEstado('Medidor', estado.medidor)}
              {lineaEstado('Sketch', estado.sketch)}
              {lineaEstado('Uptime', estado.uptime)}
            </div>
          </div>
        )}
      </div>

      {/* ============ 4 · MODO AVANZADO: MONITOR ============ */}
      <div className="bg-white border border-slate-200 rounded-xl p-3">
        <h3 className="text-sm font-semibold text-slate-700 mb-2">4 · Modo avanzado: monitor del proceso de lectura y configuración</h3>
        {terminal}
        <p className="text-[11px] text-slate-400 mt-1.5">Todo lo que el formulario lee y graba pasa por acá, comando por comando. Para operar a mano, cambiá a «Terminal libre» en el selector de firmware.</p>
      </div>

      {/* Vista previa de comandos antes de grabar */}
      {confirmar && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-[60]" onClick={() => confirmar.resolve(false)}>
          <div className="bg-white rounded-xl w-full max-w-md p-5" onClick={(e2) => e2.stopPropagation()}>
            <h3 className="font-semibold mb-1">💾 Grabar {confirmar.comandos.length} cambio{confirmar.comandos.length === 1 ? '' : 's'}</h3>
            <p className="text-xs text-slate-400 mb-2">Estos comandos se envían a la placa y al final se ejecuta <b>restart</b> (los cambios aplican con el reinicio):</p>
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 font-mono text-[11px] text-slate-700 max-h-56 overflow-y-auto">
              {confirmar.comandos.map((cmd, i) => <div key={i}>{cmd.replace(/(set_pass|(?:set_wifi|add_wifi\s+0)\s+(?:"[^"]*"|\S+))\s+(?:"[^"]*"|\S+)$/, '$1 ••••••')}</div>)}
              <div>restart</div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => confirmar.resolve(false)}
                className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button onClick={() => confirmar.resolve(true)}
                className="px-4 py-2 text-sm font-medium bg-coop-azul text-white rounded-lg hover:opacity-90">Grabar y reiniciar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
