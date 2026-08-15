// Configuración guiada — Reconecta / DNP3 Universal FW (13/08).
// Diseño congelado en Multivac_ConfigGuiada_Reconecta_diseno_13_08.md, sobre
// el flujo REAL de Leonardo (docx 13/08) + capturas del banco (13/08).
// Ajuste UX 14/08 (mockup de Leonardo): la solapa se ordena en 4 secciones
// numeradas — 1. Conexión y elección de versión (selector + USB/BT + pass +
// releer, todo junto para no recorrer la vista), 2. Configuraciones (el
// formulario SIEMPRE visible, con campos bloqueados hasta elegir firmware y
// conectar), 3. Configurar (Grabar), 4. Modo avanzado (terminal a lo ancho).
// Reglas de fondo (sin cambios):
// - Al conectar: sesión + login AUTOMÁTICOS (pass del campo o la MAC de
//   fábrica, leída de `info` antes del login).
// - «Grabar» muestra los comandos exactos y envía SOLO los cambios; después
//   re-lee y el formulario refleja la REALIDAD, no la intención.
// - PROHIBIDO en lectura: `set_eth_ip` sin argumentos (flujo guiado
//   interactivo → cuelga el CLI). La IP estática es write-only con la forma
//   directa: set_eth_ip <ip> <mask> <gw> <dns>.
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

const VACIO = /\(vacio\)|\(sin configurar\)|\(raiz\)|\(ninguno\)|\(no configurado\)|\(sin perfil/i;
const limpiar = (s) => { const t = String(s ?? '').trim(); return VACIO.test(t) ? '' : t; };

const CAMPOS_DEF = {
  nombre: '', passNueva: '', debug: 'off', tz: '-10800',
  // Máscara con default 255.255.255.0 (pedido 15/08 — el caso típico; si la
  // placa informa otra al leer, se pisa con la real).
  ethDhcp: '', ethStatic: '', ethIp: '', ethMask: '255.255.255.0', ethGw: '', ethDns: '',
  w0ssid: '', w0pass: '', w0on: 'off', w1ssid: '', w1pass: '', w1on: 'off', w2ssid: '', w2pass: '', w2on: 'off',
  failover: 'on',
  mqttPerfil: '', blockPublic: 'no', ntp: 'auto', ntpFallback: 'on',
  ftpHost: '', ftpPort: '21', ftpUser: '', ftpPass: '', ftpPath: '',
  recoPerfil: '', sn: '', baud: '', recoTz: '-180',
};

const valorDe = (lineas, clave) => {
  const rx = new RegExp('^\\s*' + clave + '\\s*:\\s*(.+)$', 'i');
  for (const l of lineas) { const m = String(l).match(rx); if (m) return m[1].trim(); }
  return null;
};

export default function MultivacConfigReconecta({ habilitado, conectado, enviarLinea, rxSink, terminal, log, selectorFirmware, botonesConexion }) {
  const [campos, setCampos] = useState({ ...CAMPOS_DEF });
  const [orig, setOrig] = useState(null); // snapshot leído: base del diff
  const [estado, setEstado] = useState({}); // solo lectura (links, IPs, MQTT, hora…)
  const [perfiles, setPerfiles] = useState([]); // list_profiles REAL de la placa
  const [passLogin, setPassLogin] = useState('');
  const [leyendo, setLeyendo] = useState('');
  const [logueado, setLogueado] = useState(false);
  const [grabando, setGrabando] = useState(false);
  // Barra de progreso del bloque 3 (pedido 14/08: al finalizar debe quedar
  // claro que terminó bien — verde «Finalizado exitosamente», igual que en
  // Actualizaciones de firmware). { txt, pct } durante el grabado; { ok:true }
  // al terminar verificado; null en reposo.
  const [cfgProg, setCfgProg] = useState(null);
  const [confirmar, setConfirmar] = useState(null); // { comandos, resolve }
  const [aviso, setAviso] = useState('');
  const ocupado = !!leyendo || grabando;
  // El formulario está SIEMPRE a la vista (mockup 14/08), pero bloqueado hasta
  // que haya firmware elegido + placa conectada + primera lectura hecha.
  const bloqueado = !habilitado || !conectado || !orig || ocupado;
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
    tQuiet = setTimeout(fin, 1500);
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

  // ---- FW ≥ 6.32 (Lorenzo, 14/08): get_all_json / get_firmware / get_hardware
  // (sin login). UN comando devuelve TODA la config como JSON — incluye lo que
  // antes era ilegible (IP/máscara/GW estáticas, DHCP/estática, block_public,
  // baud, reco_tz). Las claves WiFi y FTP no viajan en el JSON (correcto):
  // quedan write-only. Si el FW no conoce el comando, cae a la secuencia clásica.
  const sinCeros = (v) => (String(v || '') === '0.0.0.0' ? '' : String(v || ''));
  const parseAllJson = (ls, d, e) => {
    const texto = ls.join('\n');
    const ini = texto.indexOf('{'); const fin = texto.lastIndexOf('}');
    if (ini < 0 || fin <= ini) return false;
    let j; try { j = JSON.parse(texto.slice(ini, fin + 1)); } catch { return false; }
    const g = j.general || {}; const r = j.redes || {}; const s = j.servidores || {}; const rc = j.reconectador || {};
    if (g.dev_name != null) d.nombre = limpiar(g.dev_name);
    if (g.mac) e.mac = String(g.mac);
    if (g.debug != null) d.debug = g.debug ? 'on' : 'off';
    if (g.tz_sistema_s != null) d.tz = String(g.tz_sistema_s);
    if (g.uptime_s != null) e.uptime = `${g.uptime_s} s`;
    if (g.fw) e.fw = `${g.fw}${g.supported ? ` · ${g.supported}` : ''}`;
    if (g.hw) e.hw = String(g.hw);
    (Array.isArray(r.wifi) ? r.wifi : []).slice(0, 3).forEach((w, i) => {
      d[`w${i}ssid`] = limpiar(w?.ssid || '');
      d[`w${i}on`] = w?.enabled ? 'on' : 'off';
      d[`w${i}pass`] = ''; // el JSON no expone claves: write-only
    });
    const et = r.eth || {};
    if (et.dhcp != null) d.ethDhcp = et.dhcp ? 'on' : 'off';
    if (et.static != null) d.ethStatic = et.static ? 'on' : 'off';
    if (et.ip != null) d.ethIp = sinCeros(et.ip);
    if (et.mask != null) d.ethMask = sinCeros(et.mask) || '255.255.255.0'; // placa sin máscara → default
    if (et.gw != null) d.ethGw = sinCeros(et.gw);
    if (r.failover != null) d.failover = r.failover ? 'on' : 'off';
    if (r.block_public != null) d.blockPublic = r.block_public ? 'yes' : 'no';
    if (r.iface_activa) e.iface = String(r.iface_activa);
    const mq = s.mqtt || {};
    if (mq.profile_idx != null) d.mqttPerfil = String(mq.profile_idx);
    if (mq.user != null) e.mqttUser = String(mq.user);
    if (mq.conectado != null) e.mqttEstado = mq.conectado ? 'connected' : 'disconnected';
    if (Array.isArray(mq.rutas)) e.mqttRutas = mq.rutas.map((x, i) => `[${i}] ${x?.host}:${x?.port}  ${x?.privada ? 'privada' : 'publica'}`);
    const nt = s.ntp || {};
    if (nt.server != null) d.ntp = /\(auto\)/i.test(String(nt.server)) ? 'auto' : (limpiar(nt.server) || 'auto');
    if (nt.pool_fallback != null) d.ntpFallback = nt.pool_fallback ? 'on' : 'off';
    if (nt.sincronizado != null) e.ntpSync = nt.sincronizado ? 'ok' : 'pendiente';
    const ft = s.ftp || {};
    if (ft.host != null) d.ftpHost = /\(none\)/i.test(String(ft.host)) ? '' : limpiar(ft.host);
    if (ft.port != null) d.ftpPort = String(ft.port);
    if (ft.user != null) d.ftpUser = limpiar(ft.user);
    if (ft.path != null) d.ftpPath = limpiar(ft.path);
    if (rc.perfil != null) d.recoPerfil = limpiar(String(rc.perfil));
    if (rc.sn != null) d.sn = limpiar(String(rc.sn));
    if (rc.baud_idx != null) d.baud = String(rc.baud_idx);
    if (rc.reco_tz_min != null) d.recoTz = String(rc.reco_tz_min);
    if (rc.event_map) e.eventMap = `${rc.event_map.origen || '?'} · ${rc.event_map.entries ?? '?'} entradas`;
    if (rc.eventos_pendientes != null) e.eventosPend = String(rc.eventos_pendientes);
    e.recloserInfo = d.recoPerfil ? `${d.recoPerfil}${d.sn ? ` · SN ${d.sn}` : ''}` : '(sin perfil)';
    return true;
  };
  const parseFirmware = (ls, e) => {
    const build = ls.join(' ').match(/build:\s*(.+?)(\s{2,}|$)/i);
    if (build) e.fwBuild = build[1].trim();
    if (!e.fw) { const v = ls.find((l) => /\S/.test(l) && !/^>+/.test(l.trim())); if (v) e.fw = v.trim(); }
  };
  const parseHardware = (ls, e) => {
    const fl = ls.join('\n').match(/flash:\s*(.+)/i); if (fl) e.flash = fl[1].trim();
    const sk = ls.join('\n').match(/sketch:\s*(.+)/i); if (sk) e.sketch = sk[1].trim();
  };

  // Re-login AUTOMÁTICO (hallazgo de campo 14/08: el protocolo del CLI cierra
  // la sesión a los pocos minutos — mientras el usuario completa el
  // formulario, el login caduca y la escritura rebota). Se llama antes de
  // CUALQUIER escritura: reabre la sesión (`comando`) y se loguea con la
  // contraseña del campo o la MAC. Si la sesión sigue viva, no molesta.
  const asegurarLogin = async (passOverride, macFallback) => {
    await consultar('comando');
    const rLogin = await consultar('login');
    if (rLogin.some((l) => /password/i.test(l))) {
      const pass = String(passOverride ?? passLogin).trim() || macFallback || estado.mac || '';
      const rPass = await consultar(pass || 'cancel');
      const ok = rPass.some((l) => /login ok/i.test(l));
      setLogueado(ok);
      return ok;
    }
    // Sin prompt de password: sesión ya logueada o FW sin contraseña.
    setLogueado(true);
    return true;
  };

  // ---------- Lectura completa (auto al conectar y con «Releer placa») ----------
  const leerPlaca = async (passOverride) => {
    if (!conectado || !habilitado || ocupado) return;
    setAviso('');
    const d = {}; const e = {};
    try {
      setLeyendo('abriendo sesión');
      await consultar('comando');
      // VÍA RÁPIDA (FW ≥ 6.32, Lorenzo 14/08): get_all_json trae TODO de una,
      // sin login. Si el FW no lo conoce, cae a la secuencia clásica.
      setLeyendo('get_all_json');
      const esJson = parseAllJson(await consultar('get_all_json', 500, 8000), d, e);
      if (esJson) {
        setLeyendo('get_firmware'); parseFirmware(await consultar('get_firmware'), e);
        setLeyendo('get_hardware'); parseHardware(await consultar('get_hardware'), e);
        setLeyendo('list_profiles'); parsePerfiles(await consultar('list_profiles'), d);
        // Guardia de flujo: si el FW reportado no es DNP3, el selector está mal.
        if (e.fw && !/dnp3/i.test(e.fw)) setAviso(`La placa reporta firmware "${e.fw}" — no parece DNP3 Universal: verificá el selector de firmware.`);
      } else {
        // SECUENCIA CLÁSICA (FW anterior): acá sí hace falta login para asegurar.
        setLeyendo('info');
        parseInfo(await consultar('info'), d, e); // la MAC de acá = pass de fábrica
        setLeyendo('login');
        const ok = await asegurarLogin(passOverride, e.mac);
        if (!ok) setAviso('Login rechazado: cargá la contraseña CLI de esta placa (en placa recién programada es la MAC) y tocá «Releer placa».');
        setLeyendo('time'); parseTime(await consultar('time'), d, e);
        setLeyendo('show_net_status'); parseNet(await consultar('show_net_status'), d, e);
        setLeyendo('list_wifi'); parseWifi(await consultar('list_wifi'), d);
        setLeyendo('show_mqtt'); parseMqtt(await consultar('show_mqtt'), d, e);
        setLeyendo('show_ftp'); parseFtp(await consultar('show_ftp'), d);
        setLeyendo('list_profiles'); parsePerfiles(await consultar('list_profiles'), d);
        setLeyendo('set_baud'); parseBaud(await consultar('set_baud'), d);
        setLeyendo('set_reco_tz'); parseRecoTz(await consultar('set_reco_tz'), d);
      }
      if (!activo.current) return;
      const final = { ...CAMPOS_DEF, ...d, passNueva: '' };
      setCampos(final); setOrig(final); setEstado(e);
      log('sys', '✓ Configuración leída de la placa. Editá lo que necesites y tocá «Grabar cambios».');
    } finally { if (activo.current) setLeyendo(''); }
  };

  // Auto-lectura al conectar con firmware elegido (una vez por conexión).
  useEffect(() => {
    if (habilitado && conectado && !orig && !ocupado) leerPlaca();
    if (!conectado) setLogueado(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conectado, habilitado]);

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
    // IP completa = los 4 campos con sus 4 octetos (15/08: antes un octeto
    // vacío en el medio, tipo "10..110.27", pasaba como "completo").
    const ipOk = (x) => /^\d{1,3}(\.\d{1,3}){3}$/.test(String(x || ''));
    const ipCompleta = ipOk(v.ethIp) && ipOk(v.ethMask) && ipOk(v.ethGw) && ipOk(v.ethDns);
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
    const ok = await new Promise((res) => setConfirmar({ comandos, resolve: res }));
    setConfirmar(null);
    if (!ok) return;
    setGrabando(true);
    setCfgProg({ txt: 'Iniciando sesión en la placa…', pct: 5 });
    try {
      // Re-login automático (14/08): la sesión CLI caduca sola mientras se
      // completa el formulario — Grabar la reabre y se loguea antes de enviar.
      const okLogin = await asegurarLogin();
      if (!okLogin) {
        setAviso('La sesión expiró y el re-login falló: revisá la contraseña CLI (en placa recién programada es la MAC) y volvé a tocar «Grabar cambios».');
        setCfgProg(null);
        return;
      }
      for (let i = 0; i < comandos.length; i += 1) {
        setCfgProg({ txt: `Grabando — comando ${i + 1}/${comandos.length}`, pct: 10 + Math.round(((i + 1) / comandos.length) * 70) });
        await consultar(comandos[i], 500, 8000);
      }
      log('sys', `✓ ${comandos.length} cambio(s) enviado(s). Releyendo la placa para verificar…`);
      setCfgProg({ txt: 'Verificando: releyendo la configuración de la placa…', pct: 85 });
      const passNueva = campos.passNueva.trim();
      if (passNueva) setPassLogin(passNueva);
      setGrabando(false);
      await leerPlaca(passNueva || undefined);
      if (activo.current) setCfgProg({ ok: true });
    } finally { if (activo.current) setGrabando(false); }
  };

  const autoId = async () => {
    if (!conectado || ocupado) return;
    setLeyendo('recloser_autoid (puede tardar unos segundos)');
    try {
      // recloser_autoid es comando de escritura [*]: re-login por las dudas
      // (la sesión CLI caduca sola — hallazgo de campo 14/08).
      if (!(await asegurarLogin())) {
        setAviso('La sesión expiró y el re-login falló: revisá la contraseña CLI y reintentá.');
        return;
      }
      const r = await consultar('recloser_autoid', 2500, 15000);
      const m = r.join(' ').match(/SN identificado y guardado:\s*(\S+)/i);
      if (m) {
        setCampos((c) => ({ ...c, sn: m[1] }));
        setOrig((o) => (o ? { ...o, sn: m[1] } : o));
        log('sys', `✓ SN auto-identificado: ${m[1]}`);
      } else {
        setAviso('El auto-id no devolvió un SN (¿el reconectador está conectado y con el perfil activo?).');
      }
    } finally { setLeyendo(''); }
  };

  // ---------- Piezas de formulario (funciones de render: no pierden foco) ----------
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
  const OPC_ONOFF = [{ v: 'on', t: 'on' }, { v: 'off', t: 'off' }];
  const OPC_ONOFF_SL = [{ v: '', t: '(sin leer)' }, ...OPC_ONOFF];
  // Campo IP estilo configurador de redes de Windows: 4 octetos con puntos.
  const campoIp = (k, label) => {
    const partes = String(campos[k] || '').split('.');
    const oct = [0, 1, 2, 3].map((i) => partes[i] || '');
    const setOct = (i, val) => {
      const limpio = val.replace(/[^0-9]/g, '').slice(0, 3);
      const nu = [...oct]; nu[i] = limpio;
      // Fix 15/08: los octetos NO tocados quedan VACÍOS (placeholder gris),
      // no se rellenan con ceros reales — antes había que borrarlos a mano y
      // se colaban 0 sin querer. Todo vacío ⇒ el campo vuelve a ''.
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

  // Mensaje de pasos (pedido 14/08: guiar al usuario desde la entrada).
  const mensajePasos = !habilitado
    ? 'Pasos: 1️⃣ Elegí el firmware de la placa → 2️⃣ Conectala por USB → 3️⃣ la configuración se lee sola y se habilitan los campos.'
    : !conectado
      ? 'Firmware elegido ✓ — ahora conectá la placa con el botón USB: la configuración se lee sola.'
      : leyendo
        ? `⏳ Leyendo la placa: ${leyendo}…`
        : orig
          ? '✓ Configuración leída. Editá los campos que necesites (se marcan en ámbar) y bajá a «Grabar cambios».'
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
              placeholder={estado.mac ? `MAC: ${estado.mac}` : 'se usa sola al conectar'}
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

      {/* ============ 2 · CONFIGURACIONES (formulario SIEMPRE visible) ============ */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 mb-3">
        <h3 className="text-sm font-semibold text-slate-700 mb-2">2 · Configuraciones</h3>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {/* Columna 1: Generales + Reconectador */}
          <div>
            <div className="border border-slate-100 rounded-lg p-2.5 mb-3">
              <h4 className="text-sm font-medium text-slate-700 mb-2">⚙ Configuraciones Generales</h4>
              {campoTexto('nombre', 'Nombre del dispositivo', { placeholder: 'DNP3_ejemplo' })}
              {campoTexto('passNueva', 'Nueva contraseña CLI (vacío = no cambiar)', { type: 'password', placeholder: '••••••••' })}
              <div className="grid grid-cols-2 gap-2">
                {campoSelect('debug', 'Debug', OPC_ONOFF)}
                {campoTexto('tz', 'Timezone (seg; Arg = -10800)')}
              </div>
            </div>
            <div className="border border-slate-100 rounded-lg p-2.5">
              <h4 className="text-sm font-medium text-slate-700 mb-2">🔌 Configuraciones del Reconectador</h4>
              {campoSelect('recoPerfil', 'Perfil (leído de la placa)', [{ v: '', t: '(sin perfil — engine DNP3 apagado)' }, ...perfiles.map((p) => ({ v: p.key, t: `${p.brand} ${p.model} (${p.key})` }))])}
              <div className="flex items-end gap-2">
                <div className="flex-1">{campoTexto('sn', 'Número de serie')}</div>
                <button onClick={autoId} disabled={bloqueado || !campos.recoPerfil}
                  title="recloser_autoid: consulta el SN directamente al reconectador (requiere perfil activo)"
                  className="mb-1.5 px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg hover:border-coop-azul hover:text-coop-azul disabled:opacity-40 shrink-0">🔍 Auto-identificar</button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {campoSelect('baud', 'Baud DNP3', [{ v: '', t: '(sin leer)' }, ...BAUD_OPCIONES])}
                {campoTexto('recoTz', 'Hora del reco vs UTC (min; Arg = -180)')}
              </div>
            </div>
          </div>

          {/* Columna 2: Red */}
          <div className="border border-slate-100 rounded-lg p-2.5">
            <h4 className="text-sm font-medium text-slate-700 mb-2">🌐 Configuraciones de Red</h4>
            {/* Responsive celu (15/08): 2 columnas en angosto, 3 en ancho —
                antes los selects quedaban con el texto cortado. */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {campoSelect('ethDhcp', 'ETH DHCP', OPC_ONOFF_SL)}
              {campoSelect('ethStatic', 'ETH estática', OPC_ONOFF_SL)}
              {campoSelect('failover', 'Failover', OPC_ONOFF)}
            </div>
            {/* Responsive celu (15/08): los campos de IP por octetos van UNO
                por fila en pantalla angosta — a dos columnas se desbordaban
                de la tarjeta (captura de Leonardo). */}
            <div className="grid sm:grid-cols-2 gap-x-3">
              {campoIp('ethIp', 'IP estática')}
              {campoIp('ethMask', 'Máscara')}
              {campoIp('ethGw', 'Gateway')}
              {campoIp('ethDns', 'DNS')}
            </div>
            <p className="text-[10.5px] text-slate-400 mb-2">Con firmware 6.32+ la IP, máscara y gateway se leen solas (el DNS no lo informa la placa: completalo para grabar cambios de IP). Los 4 campos se envían juntos.</p>
            <div className="border-t border-slate-100 pt-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end mb-1">
                  <div>{campoTexto(`w${i}ssid`, i === 0 ? 'WiFi — SSID' : '', { placeholder: `perfil ${i}` })}</div>
                  <div>{campoTexto(`w${i}pass`, i === 0 ? 'Clave' : '', { type: 'password', placeholder: '••••••' })}</div>
                  <div className="mb-1.5">
                    <select value={campos[`w${i}on`]} onChange={(e2) => set(`w${i}on`, e2.target.value)} disabled={bloqueado}
                      className={`border rounded-lg px-1.5 py-1.5 text-xs disabled:bg-slate-50 disabled:text-slate-400 ${esDirty(`w${i}on`) ? 'border-amber-400 bg-amber-50' : 'border-slate-300'}`}>
                      <option value="on">on</option><option value="off">off</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Columna 3: Servidores */}
          <div className="border border-slate-100 rounded-lg p-2.5">
            <h4 className="text-sm font-medium text-slate-700 mb-2">🖥 Configuraciones de Servidores</h4>
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
            {bloqueado && !orig ? 'Se habilita al conectar y leer la placa.' : cambios.length ? 'Los campos en ámbar son los que se van a grabar — antes de enviar vas a ver la lista exacta de comandos.' : 'Sin cambios pendientes: editá un campo y se marca en ámbar.'}
          </span>
        </div>
        {/* Barra de progreso SIEMPRE visible (misma regla que el flasheo):
            en reposo vacía; durante el grabado avanza; al terminar verificado
            queda COMPLETA EN VERDE con «Finalizado exitosamente». */}
        <div className="mt-3">
          <div className="flex justify-between text-[11px] mb-0.5">
            <span className={cfgProg?.ok ? 'text-emerald-600 font-medium' : 'text-slate-500'}>
              {cfgProg?.ok ? '✓ Finalizado exitosamente — configuración grabada y verificada en la placa' : cfgProg ? cfgProg.txt : 'Sin grabado en curso'}
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
              {lineaEstado('Hora', estado.hora)}
              {lineaEstado('ETH', estado.ethLink && `${estado.ethLink}${estado.ethIp ? ` · ${estado.ethIp}` : ''}`)}
              {lineaEstado('WiFi', estado.wifiLink && `${estado.wifiLink}${estado.wifiIp ? ` · ${estado.wifiIp}` : ''}`)}
              {lineaEstado('Interfaz activa', estado.iface)}
              {lineaEstado('MQTT', estado.mqttEstado && `${estado.mqttEstado}${estado.mqttUser ? ` · user ${estado.mqttUser}` : ''}`)}
              {lineaEstado('NTP sync', estado.ntpSync)}
              {lineaEstado('Reconectador', estado.recloserInfo)}
              {lineaEstado('Firmware', estado.fw && `${estado.fw}${estado.fwBuild ? ` · build ${estado.fwBuild}` : ''}`)}
              {lineaEstado('Hardware', estado.hw && `${estado.hw}${estado.flash ? ` · flash ${estado.flash}` : ''}`)}
              {lineaEstado('Mapa de eventos', estado.eventMap)}
              {lineaEstado('Eventos pendientes', estado.eventosPend)}
              {lineaEstado('Uptime', estado.uptime)}
            </div>
            {!!estado.mqttRutas?.length && (
              <div className="mt-1 text-slate-400 font-mono text-[10.5px]">{estado.mqttRutas.join('  ·  ')}</div>
            )}
          </div>
        )}
      </div>

      {/* ============ 4 · MODO AVANZADO: MONITOR ============ */}
      <div className="bg-white border border-slate-200 rounded-xl p-3">
        <h3 className="text-sm font-semibold text-slate-700 mb-2">4 · Modo avanzado: monitor del proceso de lectura y configuración</h3>
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
