// Configuración guiada — Reconecta / DNP3 Universal FW (13/08).
// Diseño congelado en Multivac_ConfigGuiada_Reconecta_diseno_13_08.md, sobre
// el flujo REAL de Leonardo (docx 13/08) + capturas de show_mqtt/show_ftp/
// set_baud/set_reco_tz del banco (13/08). Reglas:
// - Al conectar: sesión + login AUTOMÁTICOS (respuesta 1 de Leonardo). La
//   contraseña sale del campo; si está vacío, la MAC (pass de fábrica) que se
//   lee de `info` ANTES del login (info no requiere sesión según el help).
// - La lectura puebla el formulario con LO QUE LA PLACA TIENE; el usuario
//   edita (campos tocados en ámbar) y «Grabar» muestra los comandos exactos
//   y envía SOLO los cambios. Después re-lee y el formulario refleja la
//   REALIDAD, no la intención.
// - PROHIBIDO en lectura: `set_eth_ip` sin argumentos (entra al flujo guiado
//   interactivo y deja el CLI esperando). La IP estática queda "(sin leer)"
//   y solo se ESCRIBE con la forma directa: set_eth_ip <ip> <mask> <gw> <dns>
//   (confirmada por Leonardo 13/08).
// - Parsers tolerantes clave:valor — una línea nueva del FW no rompe nada.
import { useEffect, useRef, useState } from 'react';

const BAUD_OPCIONES = [
  { v: '0', t: '0 — auto-detect (default)' },
  { v: '1', t: '1 — 9600' }, { v: '2', t: '2 — 19200' }, { v: '3', t: '3 — 38400' },
  { v: '4', t: '4 — 115200' }, { v: '5', t: '5 — 57600' }, { v: '6', t: '6 — 56000' },
  { v: '7', t: '7 — 4800' }, { v: '8', t: '8 — 2400 (piso)' },
];
const MQTT_PERFILES = [
  { v: '1', t: '1 — IOT' }, { v: '2', t: '2 — ENERGIA' }, { v: '3', t: '3 — CLIENTES' },
  { v: '4', t: '4 — AGUA_EXT' }, { v: '5', t: '5 — CUSTOM' },
];

// "(vacio)", "(sin configurar)", "(raiz)", "(ninguno)", "(no configurado)" → ''
const VACIO = /\(vacio\)|\(sin configurar\)|\(raiz\)|\(ninguno\)|\(no configurado\)|\(sin perfil/i;
const limpiar = (s) => { const t = String(s ?? '').trim(); return VACIO.test(t) ? '' : t; };

const CAMPOS_DEF = {
  // Generales
  nombre: '', passNueva: '', debug: 'off', tz: '-10800',
  // Red ('' = sin leer en dhcp/static; la IP estática no es legible sin flujo guiado)
  ethDhcp: '', ethStatic: '', ethIp: '', ethMask: '', ethGw: '', ethDns: '',
  w0ssid: '', w0pass: '', w0on: 'off', w1ssid: '', w1pass: '', w1on: 'off', w2ssid: '', w2pass: '', w2on: 'off',
  failover: 'on',
  // Servidores
  mqttPerfil: '', blockPublic: 'no', ntp: 'auto', ntpFallback: 'on',
  ftpHost: '', ftpPort: '21', ftpUser: '', ftpPass: '', ftpPath: '',
  // Reconectador
  recoPerfil: '', sn: '', baud: '', recoTz: '-180',
};

const valorDe = (lineas, clave) => {
  const rx = new RegExp('^\\s*' + clave + '\\s*:\\s*(.+)$', 'i');
  for (const l of lineas) { const m = String(l).match(rx); if (m) return m[1].trim(); }
  return null;
};

export default function MultivacConfigReconecta({ conectado, enviarLinea, rxSink, terminal, log }) {
  const [campos, setCampos] = useState({ ...CAMPOS_DEF });
  const [orig, setOrig] = useState(null); // snapshot leído: base del diff
  const [estado, setEstado] = useState({}); // solo lectura (links, IPs, MQTT, hora…)
  const [perfiles, setPerfiles] = useState([]); // list_profiles REAL de la placa
  const [passLogin, setPassLogin] = useState('');
  const [leyendo, setLeyendo] = useState('');
  const [logueado, setLogueado] = useState(false);
  const [grabando, setGrabando] = useState(false);
  const [confirmar, setConfirmar] = useState(null); // { comandos, resolve }
  const [aviso, setAviso] = useState('');
  const ocupado = !!leyendo || grabando;
  const activo = useRef(true);
  useEffect(() => () => { activo.current = false; if (rxSink) rxSink.current = null; }, [rxSink]);

  // Motor: manda un comando y junta la respuesta hasta que la línea queda en
  // silencio (quietMs). El sink lo inyecta el padre en procesarEntrada.
  const consultar = (cmd, quietMs = 400, maxMs = 6000) => new Promise((resolve) => {
    const acumulado = [];
    let tQuiet = null; let tMax = null;
    const fin = () => {
      clearTimeout(tQuiet); clearTimeout(tMax);
      if (rxSink.current === sink) rxSink.current = null;
      resolve(acumulado);
    };
    const sink = (l) => { acumulado.push(l); clearTimeout(tQuiet); tQuiet = setTimeout(fin, quietMs); };
    rxSink.current = sink;
    tQuiet = setTimeout(fin, 1500); // si nunca responde, no colgarse
    tMax = setTimeout(fin, maxMs);
    enviarLinea(cmd);
  });

  // ---------- Parsers (contra los outputs REALES del docx y el txt 13/08) ----------
  const parseInfo = (ls, d, e) => {
    const nom = valorDe(ls, 'Device name'); if (nom != null) d.nombre = limpiar(nom);
    const mac = valorDe(ls, 'MAC base'); if (mac) e.mac = mac;
    const dbg = valorDe(ls, 'Debug'); if (dbg) d.debug = /on/i.test(dbg) ? 'on' : 'off';
    const fo = ls.find((l) => /Failover\s*:/i.test(l));
    if (fo) {
      d.failover = /Failover\s*:\s*on/i.test(fo) ? 'on' : 'off';
      d.blockPublic = /Block public:\s*yes/i.test(fo) ? 'yes' : 'no';
    }
    const rec = valorDe(ls, 'Recloser');
    if (rec) { e.recloserInfo = limpiar(rec) || '(sin perfil)'; const sn = rec.match(/SN[=\s:]+([\w-]+)/i); if (sn) d.sn = sn[1]; }
    const up = valorDe(ls, 'Uptime'); if (up) e.uptime = up;
  };
  const parseTime = (ls, d, e) => {
    const tz = valorDe(ls, 'TZ offset'); if (tz) { const m = tz.match(/-?\d+/); if (m) d.tz = m[0]; }
    const h = valorDe(ls, 'Hora actual'); if (h) e.hora = h;
  };
  const parseNet = (ls, d, e) => {
    e.ethLink = valorDe(ls, 'ETH link'); e.ethIp = valorDe(ls, 'ETH IP');
    e.wifiLink = valorDe(ls, 'WiFi link'); e.wifiIp = valorDe(ls, 'WiFi IP');
    e.iface = valorDe(ls, 'Iface'); e.mqttEstado = valorDe(ls, 'MQTT');
    const fo = valorDe(ls, 'Failover'); if (fo) d.failover = /on/i.test(fo) ? 'on' : 'off';
    const ntp = ls.find((l) => /^\s*NTP\s*:/i.test(l));
    if (ntp) {
      const m = ntp.match(/NTP\s*:\s*([^\s(]+)/i); if (m) d.ntp = m[1];
      d.ntpFallback = /fallback pool:\s*on/i.test(ntp) ? 'on' : 'off';
      const sy = ntp.match(/sync=([^)\s,]+)/i); if (sy) e.ntpSync = sy[1];
    }
  };
  const parseWifi = (ls, d) => {
    for (const l of ls) {
      const m = String(l).match(/\[(\d)\]\s+(on|off)\s+'([^']*)'\s+\(pass=([^)]*)\)/i);
      if (m && Number(m[1]) <= 2) {
        d[`w${m[1]}on`] = m[2].toLowerCase();
        d[`w${m[1]}ssid`] = limpiar(m[3]);
        d[`w${m[1]}pass`] = limpiar(m[4]);
      }
    }
  };
  const parseMqtt = (ls, d, e) => {
    const sel = valorDe(ls, 'Perfil sel\\.'); if (sel) { const m = sel.match(/\d/); if (m) d.mqttPerfil = m[0]; }
    const bp = valorDe(ls, 'Block public'); if (bp) d.blockPublic = /yes/i.test(bp) ? 'yes' : 'no';
    const us = valorDe(ls, 'User'); if (us != null) e.mqttUser = limpiar(us);
    e.mqttRutas = ls.filter((l) => /^\s*\[\d\]\s/.test(l)).map((l) => l.trim());
    const con = ls.find((l) => /Conectado\s*:/i.test(l)); if (con) e.mqttConectado = /Conectado\s*:\s*yes/i.test(con) ? 'sí' : 'no';
  };
  const parseFtp = (ls, d) => {
    const h = valorDe(ls, 'FTP host'); if (h != null) d.ftpHost = limpiar(h);
    const p = valorDe(ls, 'FTP port'); if (p != null) { const m = p.match(/\d+/); d.ftpPort = m ? m[0] : '21'; }
    const u = valorDe(ls, 'FTP user'); if (u != null) d.ftpUser = limpiar(u);
    const w = valorDe(ls, 'FTP pass'); if (w != null) d.ftpPass = limpiar(w);
    const r = valorDe(ls, 'FTP path'); if (r != null) d.ftpPath = limpiar(r);
  };
  const parsePerfiles = (ls, d) => {
    const lista = [];
    for (const l of ls) {
      const m = String(l).match(/id=(\d+)\s+key=(\S+)\s+brand=(\S+)\s+model=(\S+)/i);
      if (m) lista.push({ key: m[2], brand: m[3], model: m[4] });
    }
    if (lista.length) setPerfiles(lista);
    const act = ls.find((l) => /Activo\s*:/i.test(l));
    if (act) { const v = limpiar(act.replace(/.*Activo\s*:\s*/i, '')); d.recoPerfil = v ? v.split(/\s/)[0] : ''; }
  };
  const parseBaud = (ls, d) => {
    const m = ls.join(' ').match(/Baud cacheado en NVS:\s*(\d)/i); if (m) d.baud = m[1];
  };
  const parseRecoTz = (ls, d) => {
    const m = ls.join(' ').match(/vs UTC:\s*(-?\d+)\s*min/i); if (m) d.recoTz = m[1];
  };

  // ---------- Lectura completa (auto al conectar y con «Releer placa») ----------
  const leerPlaca = async (passOverride) => {
    if (!conectado || ocupado) return;
    setAviso('');
    const d = {}; const e = {};
    try {
      setLeyendo('abriendo sesión');
      await consultar('comando');
      // info ANTES del login: consigue la MAC (= contraseña de fábrica).
      setLeyendo('info');
      parseInfo(await consultar('info'), d, e);
      // Login automático (respuesta 1 de Leonardo 13/08).
      setLeyendo('login');
      const rLogin = await consultar('login');
      if (rLogin.some((l) => /password/i.test(l))) {
        const pass = String(passOverride ?? passLogin).trim() || e.mac || '';
        const rPass = await consultar(pass || 'cancel');
        const ok = rPass.some((l) => /login ok/i.test(l));
        setLogueado(ok);
        if (!ok) setAviso('Login rechazado: cargá la contraseña CLI de esta placa (en placa recién programada es la MAC) y tocá «Releer placa».');
      } else {
        // sin prompt de password: sesión ya logueada o FW sin pass
        setLogueado(true);
      }
      setLeyendo('time'); parseTime(await consultar('time'), d, e);
      setLeyendo('show_net_status'); parseNet(await consultar('show_net_status'), d, e);
      setLeyendo('list_wifi'); parseWifi(await consultar('list_wifi'), d);
      setLeyendo('show_mqtt'); parseMqtt(await consultar('show_mqtt'), d, e);
      setLeyendo('show_ftp'); parseFtp(await consultar('show_ftp'), d);
      setLeyendo('list_profiles'); parsePerfiles(await consultar('list_profiles'), d);
      // Estos dos SIN argumentos devuelven el valor actual (capturas 13/08).
      setLeyendo('set_baud'); parseBaud(await consultar('set_baud'), d);
      setLeyendo('set_reco_tz'); parseRecoTz(await consultar('set_reco_tz'), d);
      if (!activo.current) return;
      const final = { ...CAMPOS_DEF, ...d, passNueva: '' };
      setCampos(final); setOrig(final); setEstado(e);
      log('sys', '✓ Configuración leída de la placa. Editá lo que necesites y tocá «Grabar cambios».');
    } finally { if (activo.current) setLeyendo(''); }
  };

  // Auto-lectura al conectar (una vez por conexión).
  useEffect(() => {
    if (conectado && !orig && !ocupado) leerPlaca();
    if (!conectado) { setLogueado(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conectado]);

  // ---------- Diff → comandos (SOLO lo tocado) ----------
  const armarComandos = () => {
    if (!orig) return [];
    const c = []; const v = campos; const o = orig;
    const dif = (k) => String(v[k]) !== String(o[k]);
    if (dif('nombre') && v.nombre.trim()) c.push(`dev_name ${v.nombre.trim()}`);
    if (v.passNueva.trim()) c.push(`set_pass ${v.passNueva.trim()}`);
    if (dif('debug')) c.push(`debug ${v.debug}`);
    if (dif('tz') && String(v.tz).trim()) c.push(`set_tz ${String(v.tz).trim()}`);
    if (dif('ethDhcp') && v.ethDhcp) c.push(`set_eth_dhcp ${v.ethDhcp}`);
    if (dif('ethStatic') && v.ethStatic) c.push(`set_eth_static ${v.ethStatic}`);
    const ipCompleta = v.ethIp && v.ethMask && v.ethGw && v.ethDns;
    if ((dif('ethIp') || dif('ethMask') || dif('ethGw') || dif('ethDns')) && ipCompleta) {
      c.push(`set_eth_ip ${v.ethIp} ${v.ethMask} ${v.ethGw} ${v.ethDns}`);
    }
    for (const i of [0, 1, 2]) {
      const s = `w${i}ssid`; const p = `w${i}pass`; const on = `w${i}on`;
      if (dif(s) || dif(p)) {
        if (v[s].trim()) c.push(`add_wifi ${i} ${v[s].trim()} ${v[p]}`);
        else if (o[s]) c.push(`del_wifi ${i}`);
      }
      if (dif(on) && v[s].trim()) c.push(`enable_wifi ${i} ${v[on]}`);
    }
    if (dif('failover')) c.push(`set_failover ${v.failover}`);
    if (dif('mqttPerfil') && v.mqttPerfil) c.push(`change_mqtt ${v.mqttPerfil}`);
    if (dif('blockPublic')) c.push(`set_mqtt_block_public ${v.blockPublic}`);
    if (dif('ntp') && v.ntp.trim()) c.push(`set_ntp ${v.ntp.trim()}`);
    if (dif('ntpFallback')) c.push(`set_ntp_fallback ${v.ntpFallback}`);
    if (dif('ftpHost') && v.ftpHost.trim()) c.push(`set_ftp_host ${v.ftpHost.trim()}`);
    if (dif('ftpPort') && v.ftpPort.trim()) c.push(`set_ftp_port ${v.ftpPort.trim()}`);
    if (dif('ftpUser') && v.ftpUser.trim()) c.push(`set_ftp_user ${v.ftpUser.trim()}`);
    if (dif('ftpPass') && v.ftpPass.trim()) c.push(`set_ftp_pass ${v.ftpPass.trim()}`);
    if (dif('ftpPath') && v.ftpPath.trim()) c.push(`set_ftp_path ${v.ftpPath.trim()}`);
    if (dif('recoPerfil')) c.push(v.recoPerfil ? `set_recloser ${v.recoPerfil}` : 'clear_recloser');
    if (dif('sn') && v.sn.trim()) c.push(`set_sn ${v.sn.trim()}`);
    if (dif('baud') && v.baud !== '') c.push(`set_baud ${v.baud}`);
    if (dif('recoTz') && String(v.recoTz).trim()) c.push(`set_reco_tz ${String(v.recoTz).trim()}`);
    return c;
  };
  const cambios = orig ? armarComandos() : [];

  const grabar = async () => {
    const comandos = armarComandos();
    if (!comandos.length || ocupado || !conectado) return;
    // Vista previa transparente (estilo tabla sagrada): SE VE lo que se envía.
    const ok = await new Promise((res) => setConfirmar({ comandos, resolve: res }));
    setConfirmar(null);
    if (!ok) return;
    setGrabando(true);
    try {
      for (const cmd of comandos) await consultar(cmd, 500, 8000);
      log('sys', `✓ ${comandos.length} cambio(s) enviado(s). Releyendo la placa para verificar…`);
      const passNueva = campos.passNueva.trim();
      if (passNueva) setPassLogin(passNueva); // la próxima lectura loguea con la nueva
      setGrabando(false);
      await leerPlaca(passNueva || undefined);
    } finally { if (activo.current) setGrabando(false); }
  };

  const autoId = async () => {
    if (!conectado || ocupado) return;
    setLeyendo('recloser_autoid (puede tardar unos segundos)');
    try {
      const r = await consultar('recloser_autoid', 2500, 15000);
      const m = r.join(' ').match(/SN identificado y guardado:\s*(\S+)/i);
      if (m) {
        setCampos((c) => ({ ...c, sn: m[1] }));
        setOrig((o) => (o ? { ...o, sn: m[1] } : o)); // ya quedó grabado en la placa
        log('sys', `✓ SN auto-identificado: ${m[1]}`);
      } else {
        setAviso('El auto-id no devolvió un SN (¿el reconectador está conectado y con el perfil activo?).');
      }
    } finally { setLeyendo(''); }
  };

  // ---------- Piezas de formulario (funciones de render: no pierden foco) ----------
  const esDirty = (k) => orig && String(campos[k]) !== String(orig[k]);
  const claseCampo = (k) => `w-full border rounded-lg px-2 py-1.5 text-sm ${esDirty(k) ? 'border-amber-400 bg-amber-50' : 'border-slate-300'}`;
  const set = (k, val) => setCampos((c) => ({ ...c, [k]: val }));

  const campoTexto = (k, label, props = {}) => (
    <div className="mb-1.5">
      <label className="block text-xs text-slate-500 mb-0.5">{label}</label>
      <input value={campos[k]} onChange={(e2) => set(k, e2.target.value)} disabled={ocupado}
        className={claseCampo(k)} {...props} />
    </div>
  );
  const campoSelect = (k, label, opciones) => (
    <div className="mb-1.5">
      <label className="block text-xs text-slate-500 mb-0.5">{label}</label>
      <select value={campos[k]} onChange={(e2) => set(k, e2.target.value)} disabled={ocupado} className={claseCampo(k)}>
        {opciones.map((op) => <option key={op.v} value={op.v}>{op.t}</option>)}
      </select>
    </div>
  );
  const OPC_ONOFF = [{ v: 'on', t: 'on' }, { v: 'off', t: 'off' }];
  const OPC_ONOFF_SL = [{ v: '', t: '(sin leer)' }, ...OPC_ONOFF];
  // Campo IP estilo configurador de redes de Windows (pedido 13/08): 4 octetos
  // con los puntos incluidos.
  const campoIp = (k, label) => {
    const partes = String(campos[k] || '').split('.');
    const oct = [0, 1, 2, 3].map((i) => partes[i] || '');
    const setOct = (i, val) => {
      const limpio = val.replace(/[^0-9]/g, '').slice(0, 3);
      const nu = [...oct]; nu[i] = limpio;
      set(k, nu.some(Boolean) ? nu.map((x) => x || '0').join('.') : '');
    };
    return (
      <div className="mb-1.5">
        <label className="block text-xs text-slate-500 mb-0.5">{label}</label>
        <div className={`inline-flex items-center border rounded-lg px-1.5 py-1 ${esDirty(k) ? 'border-amber-400 bg-amber-50' : 'border-slate-300'}`}>
          {oct.map((v, i) => (
            <span key={i} className="flex items-center">
              <input value={v} onChange={(e2) => setOct(i, e2.target.value)} disabled={ocupado}
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

  return (
    <div className="grid lg:grid-cols-5 gap-4">
      {/* ---------- Columna del formulario ---------- */}
      <div className="lg:col-span-3">
        {/* Barra de estado / acciones de lectura */}
        <div className="bg-white border border-slate-200 rounded-xl p-3 mb-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[220px]">
              <label className="block text-xs text-slate-500 mb-0.5">Contraseña CLI de la placa (vacío = MAC, el default de fábrica)</label>
              <input type="password" value={passLogin} onChange={(e2) => setPassLogin(e2.target.value)} disabled={ocupado}
                placeholder={estado.mac ? `MAC: ${estado.mac}` : 'se lee sola al conectar'}
                className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
            </div>
            <button onClick={() => leerPlaca()} disabled={!conectado || ocupado}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg hover:border-coop-azul hover:text-coop-azul disabled:opacity-40">
              ↻ Releer placa
            </button>
            <span className={`text-[11px] pb-2 ${logueado ? 'text-emerald-600' : 'text-slate-400'}`}>
              {leyendo ? `⏳ Leyendo: ${leyendo}…` : logueado ? '✓ Sesión iniciada' : conectado ? 'Conectado' : 'Conectá la placa por USB'}
            </span>
          </div>
          {aviso && <p className="text-xs text-amber-600 mt-1.5">{aviso}</p>}
          {!orig && !leyendo && conectado && <p className="text-xs text-slate-400 mt-1.5">Al conectar, la configuración se lee sola. Si no arrancó, tocá «Releer placa».</p>}
        </div>

        {orig && (
          <>
            <div className="grid md:grid-cols-2 gap-3">
              {/* ⚙ GENERALES */}
              <div className="bg-white border border-slate-200 rounded-xl p-3">
                <h3 className="text-sm font-medium text-slate-700 mb-2">⚙ Configuraciones Generales</h3>
                {campoTexto('nombre', 'Nombre del dispositivo', { placeholder: 'DNP3_ejemplo' })}
                {campoTexto('passNueva', 'Nueva contraseña CLI (vacío = no cambiar)', { type: 'password', placeholder: '••••••••' })}
                <div className="grid grid-cols-2 gap-2">
                  {campoSelect('debug', 'Debug', OPC_ONOFF)}
                  {campoTexto('tz', 'Timezone (seg; Arg = -10800)')}
                </div>
              </div>

              {/* 🔌 RECONECTADOR */}
              <div className="bg-white border border-slate-200 rounded-xl p-3">
                <h3 className="text-sm font-medium text-slate-700 mb-2">🔌 Configuraciones del Reconectador</h3>
                {campoSelect('recoPerfil', 'Perfil (leído de la placa)', [{ v: '', t: '(sin perfil — engine DNP3 apagado)' }, ...perfiles.map((p) => ({ v: p.key, t: `${p.brand} ${p.model} (${p.key})` }))])}
                <div className="flex items-end gap-2">
                  <div className="flex-1">{campoTexto('sn', 'Número de serie')}</div>
                  <button onClick={autoId} disabled={!conectado || ocupado || !campos.recoPerfil}
                    title="recloser_autoid: consulta el SN directamente al reconectador (requiere perfil activo)"
                    className="mb-1.5 px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg hover:border-coop-azul hover:text-coop-azul disabled:opacity-40 shrink-0">🔍 Auto-identificar</button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {campoSelect('baud', 'Baud DNP3', [{ v: '', t: '(sin leer)' }, ...BAUD_OPCIONES])}
                  {campoTexto('recoTz', 'Hora del reco vs UTC (min; Arg = -180)')}
                </div>
              </div>

              {/* 🌐 RED */}
              <div className="bg-white border border-slate-200 rounded-xl p-3">
                <h3 className="text-sm font-medium text-slate-700 mb-2">🌐 Configuraciones de Red</h3>
                <div className="grid grid-cols-3 gap-2">
                  {campoSelect('ethDhcp', 'ETH DHCP', OPC_ONOFF_SL)}
                  {campoSelect('ethStatic', 'ETH estática', OPC_ONOFF_SL)}
                  {campoSelect('failover', 'Failover', OPC_ONOFF)}
                </div>
                <div className="grid grid-cols-2 gap-x-3">
                  {campoIp('ethIp', 'IP estática')}
                  {campoIp('ethMask', 'Máscara')}
                  {campoIp('ethGw', 'Gateway')}
                  {campoIp('ethDns', 'DNS')}
                </div>
                <p className="text-[10.5px] text-slate-400 mb-2">La IP estática grabada no es legible desde el CLI: los campos arrancan vacíos y solo se envían si los completás (los 4 juntos).</p>
                <div className="border-t border-slate-100 pt-2">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end mb-1">
                      <div>{campoTexto(`w${i}ssid`, i === 0 ? 'WiFi — SSID' : '', { placeholder: `perfil ${i}` })}</div>
                      <div>{campoTexto(`w${i}pass`, i === 0 ? 'Clave' : '', { type: 'password', placeholder: '••••••' })}</div>
                      <div className="mb-1.5">
                        <select value={campos[`w${i}on`]} onChange={(e2) => set(`w${i}on`, e2.target.value)} disabled={ocupado}
                          className={`border rounded-lg px-1.5 py-1.5 text-xs ${esDirty(`w${i}on`) ? 'border-amber-400 bg-amber-50' : 'border-slate-300'}`}>
                          <option value="on">on</option><option value="off">off</option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 🖥 SERVIDORES */}
              <div className="bg-white border border-slate-200 rounded-xl p-3">
                <h3 className="text-sm font-medium text-slate-700 mb-2">🖥 Configuraciones de Servidores</h3>
                <div className="grid grid-cols-2 gap-2">
                  {campoSelect('mqttPerfil', 'Perfil MQTT', [{ v: '', t: '(sin leer)' }, ...MQTT_PERFILES])}
                  {campoSelect('blockPublic', 'Bloquear rutas públicas', [{ v: 'no', t: 'no' }, { v: 'yes', t: 'yes' }])}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {campoTexto('ntp', 'NTP (auto | ip | host)')}
                  {campoSelect('ntpFallback', 'Fallback pool.ntp.org', OPC_ONOFF)}
                </div>
                <div className="border-t border-slate-100 pt-2 grid grid-cols-2 gap-2">
                  {campoTexto('ftpHost', 'FTP host', { placeholder: '(sin configurar)' })}
                  {campoTexto('ftpPort', 'FTP puerto')}
                  {campoTexto('ftpUser', 'FTP usuario')}
                  {campoTexto('ftpPass', 'FTP contraseña', { type: 'password' })}
                </div>
                {campoTexto('ftpPath', 'FTP ruta base', { placeholder: '(raíz)' })}
              </div>
            </div>

            {/* GRABAR */}
            <div className="mt-3 flex items-center gap-3 flex-wrap">
              <button onClick={grabar} disabled={!conectado || ocupado || !cambios.length}
                className="px-5 py-3 text-sm font-medium bg-coop-azul text-white rounded-xl hover:opacity-90 disabled:opacity-40">
                {grabando ? '⏳ Grabando…' : `💾 Grabar cambios${cambios.length ? ` (${cambios.length})` : ''}`}
              </button>
              {!!cambios.length && !grabando && (
                <button onClick={() => { setCampos({ ...orig }); setAviso(''); }}
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg text-slate-500 hover:border-slate-400">
                  Descartar cambios
                </button>
              )}
              <span className="text-[11px] text-slate-400">
                {cambios.length ? 'Los campos en ámbar son los que se van a grabar — antes de enviar vas a ver la lista exacta de comandos.' : 'Sin cambios pendientes: editá un campo y se marca en ámbar.'}
              </span>
            </div>

            {/* Estado leído (solo lectura) */}
            <div className="bg-white border border-slate-200 rounded-xl p-3 mt-3 text-xs">
              <h3 className="text-sm font-medium text-slate-700 mb-1.5">Estado de la placa (última lectura)</h3>
              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-0.5">
                {lineaEstado('MAC', estado.mac)}
                {lineaEstado('Hora', estado.hora)}
                {lineaEstado('ETH', estado.ethLink && `${estado.ethLink}${estado.ethIp ? ` · ${estado.ethIp}` : ''}`)}
                {lineaEstado('WiFi', estado.wifiLink && `${estado.wifiLink}${estado.wifiIp ? ` · ${estado.wifiIp}` : ''}`)}
                {lineaEstado('Interfaz activa', estado.iface)}
                {lineaEstado('MQTT', estado.mqttEstado && `${estado.mqttEstado}${estado.mqttUser ? ` · user ${estado.mqttUser}` : ''}`)}
                {lineaEstado('NTP sync', estado.ntpSync)}
                {lineaEstado('Reconectador', estado.recloserInfo)}
                {lineaEstado('Uptime', estado.uptime)}
              </div>
              {!!estado.mqttRutas?.length && (
                <div className="mt-1 text-slate-400 font-mono text-[10.5px]">{estado.mqttRutas.join('  ·  ')}</div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ---------- Columna del terminal (registro fiel) ---------- */}
      <div className="lg:col-span-2">
        <h3 className="text-sm font-medium text-slate-700 mb-1.5">Terminal de comunicaciones <span className="font-normal text-slate-400">· registro de lo enviado y recibido</span></h3>
        {terminal}
        <p className="text-[11px] text-slate-400 mt-1.5">Todo lo que el formulario lee y graba pasa por acá, comando por comando. Para operar a mano, cambiá a «Terminal libre» en el selector de firmware.</p>
      </div>

      {/* Vista previa de comandos antes de grabar (transparencia total) */}
      {confirmar && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-[60]" onClick={() => confirmar.resolve(false)}>
          <div className="bg-white rounded-xl w-full max-w-md p-5" onClick={(e2) => e2.stopPropagation()}>
            <h3 className="font-semibold mb-1">💾 Grabar {confirmar.comandos.length} cambio{confirmar.comandos.length === 1 ? '' : 's'}</h3>
            <p className="text-xs text-slate-400 mb-2">Estos comandos exactos se envían a la placa, en este orden:</p>
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 font-mono text-[11px] text-slate-700 max-h-56 overflow-y-auto">
              {confirmar.comandos.map((cmd, i) => <div key={i}>{cmd.replace(/(set_pass|set_ftp_pass)\s+\S+/, '$1 ••••••')}</div>)}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => confirmar.resolve(false)}
                className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button onClick={() => confirmar.resolve(true)}
                className="px-4 py-2 text-sm font-medium bg-coop-azul text-white rounded-lg hover:opacity-90">Grabar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
