// Configuración guiada — +Agua / Universal_agua (07/10).
// PORT NATIVO del configurador standalone de Lorenzo (configurador_agua.html,
// adjuntado 07/10): decisión de Leonardo — «integralo de fondo, que no queden
// como cosas separadas»; los ajustes futuros de Lorenzo se continúan ACÁ.
// Mismo contrato de integración que MultivacConfigReconecta (la conexión, el
// terminal y el selector los pone Multivac.jsx); la lógica es la de Lorenzo:
// - Flujo: sesión (`comando`) → get_firmware (DEBE ser agua_x.y) → get_all_json
//   (saca la MAC) → login (pass o MAC de fábrica) → get_all_json completo →
//   precarga + lectura del schema → `end` (libera la consola para logs en vivo).
// - La sesión CLI caduca por inactividad: CADA operación (grabar/releer/
//   reiniciar) abre sesión fresca y cierra con `end` (patrón de Lorenzo).
// - Grabar: diff en ámbar → modal con los comandos EXACTOS (credenciales
//   enmascaradas en pantalla, nunca en el cable) → envío → relectura y
//   VALIDACIÓN campo por campo → reintento suave (2 s) para aplicaciones en
//   caliente demoradas → si hubo cambios de schema y siguen sin impactar,
//   último recurso: reinicio por comando `restart` y re-validación.
//   (El pulso DTR/RTS de recuperación SIN login del standalone no se porta:
//   el puerto lo administra el módulo y puede ser BLE — si el re-login falla,
//   se avisa y el reinicio físico queda manual.)
// - Schema (tópicos + sensores): el último renglón vacío es el alta; ✕ marca
//   baja (tachado); los parámetros se re-formatean según el tipo con los
//   defaults EXACTOS del firmware (espejo del Schema_Parser); las claves que
//   el spec no modela se preservan tal cual (passthru) para no perderlas.
import { useEffect, useRef, useState } from 'react';

// Comillas dobles si el valor tiene espacios (misma regla que Reconecta 19/08).
const q = (v) => (/\s/.test(String(v)) ? `"${v}"` : String(v));
const limpiar3 = (v) => ((v === '***' || v === '(none)' || v == null) ? '' : String(v));

// --- Tablas EXACTAS del CLI del firmware de agua (de Lorenzo) ---------------
const BAUD_IDX = { 1200: 1, 2400: 2, 4800: 3, 9600: 4, 19200: 5, 38400: 6, 57600: 7, 115200: 8 };
const FRAMINGS = ['', '8N1', '8E1', '8O1', '8N2', '7N1', '7E1', '7O1', '7N2']; // idx 1..8
const PORT_LABELS = { 0: 'NONE (deshabilitado)', 1: '485A Half-Duplex', 2: '485B Half-Duplex', 3: '485 Full-Duplex (A+B)', 4: '232' };
const portOptDesde = (rx, tx) => {
  if (rx === 'NONE' || rx === '' || rx == null) return '0';
  if (rx === '485A' && tx === '485A') return '1';
  if (rx === '485B' && tx === '485B') return '2';
  if (rx === '485A' && tx === '485B') return '3';
  if (rx === '232') return '4';
  return '0';
};
const PERFIL_IDX = { IOT: 1, ENERGIA: 2, CLIENTES: 3, AGUA_EXT: 4, CUSTOM: 5 };
const MQTT_PERFILES = [
  { v: '1', t: '1 — IOT' }, { v: '2', t: '2 — ENERGIA' }, { v: '3', t: '3 — CLIENTES' },
  { v: '4', t: '4 — AGUA_EXT' }, { v: '5', t: '5 — CUSTOM' },
];

// --- Specs de sensores (espejo del Schema_Parser del firmware, de Lorenzo) --
const DECODES = ['uint16_ab', 'int16_ab', 'uint16_ba', 'int16_ba', 'uint32_abcd', 'int32_abcd',
  'uint32_cdab', 'int32_cdab', 'uint32_badc', 'int32_badc', 'uint32_dcba', 'int32_dcba',
  'float_abcd', 'float_cdab', 'float_badc', 'float_dcba',
  'uint64_abcdefgh', 'uint64_hgfedcba', 'uint64_badcfehg', 'uint64_ghefcdab',
  'uint64_cdabghef', 'uint64_efghabcd'];
const COMS_OPT = ['COM1', 'COM2', 'COM3'];
export const SENSOR_SPECS = {
  modbus_master: [
    { k: 'port', l: 'Puerto', c: 'sel', opts: COMS_OPT, d: 'COM1' },
    { k: 'slave_addr', l: 'Esclavo', c: 'n', d: '' },
    { k: 'func_code', l: 'FC', c: 'sel', opts: ['3', '4'], d: '3' },
    { k: 'reg_addr', l: 'Registro', c: 'n', d: '' },
    { k: 'decode', l: 'Decode', c: 'sel', opts: DECODES, d: 'uint16_ab' },
    { k: 'scale_k', l: 'Escala k', c: 'n', d: '1' },
    { k: 'scale_c', l: 'Offset c', c: 'n', d: '0' },
  ],
  analog_loop: [
    { k: 'mux_code', l: 'Entrada (0-3 SE, 4-7 dif)', c: 'n', d: '' },
    { k: 'shunt_ohm', l: 'Shunt Ω', c: 'n', d: '100' },
    { k: 'scale_k', l: 'Fondo escala k', c: 'n', d: '1' },
    { k: 'scale_c', l: 'Offset c (valor a 4 mA)', c: 'n', d: '0' },
  ],
  analog_ac_rms: [
    { k: 'mux_code', l: 'Entrada', c: 'n', d: '' },
    { k: 'transf_ratio', l: 'Relación TI', c: 'n', d: '' },
    { k: 'vref_offset', l: 'Vref offset', c: 'n', d: '1' },
    { k: 'offset_tol_pct', l: 'Tol. offset %', c: 'n', d: '5' },
    { k: 'window_ms', l: 'Ventana ms', c: 'n', d: '200' },
    { k: 'agg_window_ms', l: 'Agregado ms (0=off)', c: 'n', d: '0' },
    { k: 'scale_k', l: 'Escala k', c: 'n', d: '1' },
    { k: 'scale_c', l: 'Offset c', c: 'n', d: '0' },
  ],
  digital_in: [
    { k: 'pin', l: 'GPIO', c: 'n', d: '' },
    { k: 'pull_up', l: 'Pull-up', c: 'b', d: 'false' },
    { k: 'debounce_ms', l: 'Antirrebote ms', c: 'n', d: '30' },
  ],
  relay_out: [
    { k: 'pin', l: 'GPIO', c: 'n', d: '' },
    { k: 'active_high', l: 'Activo alto', c: 'b', d: 'true' },
    { k: 'auto_off_ms', l: 'Auto-off ms (0=nunca)', c: 'n', d: '0' },
  ],
  bomba_3f: [
    { k: 'mux_codes', l: 'Entradas I1,I2,I3 (ej 0,1,2)', c: 's', d: '' },
    { k: 'i_nominal', l: 'I nominal A', c: 'n', d: '1' },
    { k: 'transf_ratio', l: 'Relación TI', c: 'n', d: '1' },
  ],
  gralf: [
    { k: 'port', l: 'Puerto', c: 'sel', opts: COMS_OPT, d: 'COM1' },
    { k: 'slave_addr', l: 'Esclavo', c: 'n', d: '' },
    { k: 'base_topic', l: 'Base topic', c: 's', d: '' },
  ],
  modbus_slave_pt: [
    { k: 'port', l: 'Puerto', c: 'sel', opts: COMS_OPT, d: 'COM1' },
    { k: 'slave_addr', l: 'Direccion propia', c: 'n', d: '' },
    { k: 'reg_addr', l: 'Registro', c: 'n', d: '' },
    { k: 'decode', l: 'Decode', c: 'sel', opts: DECODES, d: 'uint16_ab' },
    { k: 'source_sensor_id', l: 'Sensor fuente', c: 's', d: '' },
  ],
  modbus_slave_sink: [
    { k: 'port', l: 'Puerto', c: 'sel', opts: COMS_OPT, d: 'COM1' },
    { k: 'slave_addr', l: 'Direccion propia', c: 'n', d: '' },
    { k: 'reg_addr', l: 'Registro', c: 'n', d: '' },
    { k: 'decode', l: 'Decode', c: 'sel', opts: DECODES, d: 'uint16_ab' },
    { k: 'stale_ms', l: 'Stale ms', c: 'n', d: '' },
    { k: 'scale_k', l: 'Escala k', c: 'n', d: '1' },
    { k: 'scale_c', l: 'Offset c', c: 'n', d: '0' },
  ],
};
const TIPOS_SENSOR = Object.keys(SENSOR_SPECS);

// Fragmento JSON de un parámetro: números/bools crudos, strings entrecomilladas,
// mux_codes como array (regla de Lorenzo).
export const paramJson = (spec, val) => {
  if (spec.k === 'mux_codes') return `"mux_codes":[${val}]`;
  if (spec.c === 'n' || spec.c === 'b') return `"${spec.k}":${val}`;
  return `"${spec.k}":${JSON.stringify(val)}`;
};
// Fragmento canónico de los parámetros de una fila (params del spec + passthru).
export const serializarParams = (tipo, params, passthru) => {
  const spec = SENSOR_SPECS[tipo] || [];
  const partes = spec.filter((f) => String((params || {})[f.k] ?? '') !== '')
    .map((f) => paramJson(f, params[f.k]));
  if (passthru) partes.push(...Object.entries(passthru).map(([k, v]) => JSON.stringify(k) + ':' + JSON.stringify(v)));
  return partes.join(',');
};

const CAMPOS_DEF = {
  nombre: '', passNueva: '', debug: '', tz: '',
  c1baud: '', c1fr: '', c1port: '', c2baud: '', c2fr: '', c2port: '', c3baud: '', c3fr: '', c3port: '',
  failover: '', ethDhcp: '', ethStatic: '', ethIp: '', ethMask: '', ethGw: '', ethDns: '',
  wifiOn: '', w0ssid: '', w0pass: '', w0on: '', w1ssid: '', w1pass: '', w1on: '', w2ssid: '', w2pass: '', w2on: '',
  mqttPerfil: '', blockPublic: '', ntp: '', ntpFallback: '',
  ftpHost: '', ftpPort: '', ftpUser: '', ftpPass: '', ftpPath: '', ftpBp: '',
};

// Diff → comandos de CONFIG (función pura: se testea sin placa). Devuelve
// { cmds, avisos } — los avisos son cosas que NO viajan y se dicen con nombre.
export function armarComandosAgua(v, o) {
  const cmds = []; const avisos = [];
  const dif = (k) => String(v[k]) !== String(o[k]);
  if (dif('nombre') && v.nombre.trim()) cmds.push(`dev_name ${q(v.nombre.trim())}`);
  if (v.passNueva.trim()) cmds.push(`set_pass ${q(v.passNueva.trim())}`);
  if (dif('debug') && v.debug) cmds.push(`debug ${v.debug}`);
  if (dif('tz') && String(v.tz).trim()) cmds.push(`set_tz ${String(v.tz).trim()}`);
  for (const c of [1, 2, 3]) {
    if (dif(`c${c}baud`) && v[`c${c}baud`]) cmds.push(`set_com_baud ${c} ${v[`c${c}baud`]}`);
    if (dif(`c${c}fr`) && v[`c${c}fr`]) cmds.push(`set_com_framing ${c} ${v[`c${c}fr`]}`);
    if (dif(`c${c}port`) && v[`c${c}port`] !== '') cmds.push(`set_com_port ${c} ${v[`c${c}port`]}`);
  }
  if (dif('failover') && v.failover) cmds.push(`set_failover ${v.failover}`);
  if (dif('ethDhcp') && v.ethDhcp) cmds.push(`set_eth_dhcp ${v.ethDhcp}`);
  if (dif('ethStatic') && v.ethStatic) cmds.push(`set_eth_static ${v.ethStatic}`);
  // IP estática: los 4 campos viajan JUNTOS (set_eth_ip ip mask gw dns).
  const ipOk = (x) => /^\d{1,3}(\.\d{1,3}){3}$/.test(String(x || '')) && String(x).split('.').every((n) => +n <= 255);
  if (dif('ethIp') || dif('ethMask') || dif('ethGw') || dif('ethDns')) {
    if (ipOk(v.ethIp) && ipOk(v.ethMask) && ipOk(v.ethGw) && ipOk(v.ethDns)) {
      cmds.push(`set_eth_ip ${v.ethIp} ${v.ethMask} ${v.ethGw} ${v.ethDns}`);
    } else {
      avisos.push('IP estática: los 4 campos (IP, máscara, gateway, DNS) deben estar completos y válidos — NO se envía.');
    }
  }
  if (dif('wifiOn') && v.wifiOn) cmds.push(`set_wifi ${v.wifiOn}`);
  for (const i of [0, 1, 2]) {
    const dSsid = dif(`w${i}ssid`); const hayKey = String(v[`w${i}pass`]) !== '';
    if (dSsid || hayKey) {
      const ssid = v[`w${i}ssid`].trim(); const key = v[`w${i}pass`];
      if (ssid && key) cmds.push(`add_wifi ${i} ${q(ssid)} ${q(key)}`);
      else avisos.push(`WiFi perfil ${i}: SSID y clave se envían juntos — completá ambos. NO se envía.`);
    }
    if (dif(`w${i}on`) && v[`w${i}on`]) cmds.push(`enable_wifi ${i} ${v[`w${i}on`]}`);
  }
  if (dif('mqttPerfil') && v.mqttPerfil) cmds.push(`change_mqtt ${v.mqttPerfil}`);
  if (dif('blockPublic') && v.blockPublic) cmds.push(`set_mqtt_block_public ${v.blockPublic}`);
  if (dif('ntp') && v.ntp.trim()) cmds.push(`set_ntp ${v.ntp.trim()}`);
  if (dif('ntpFallback') && v.ntpFallback) cmds.push(`set_ntp_fallback ${v.ntpFallback}`);
  if (dif('ftpHost') && v.ftpHost.trim()) cmds.push(`set_ftp_host ${v.ftpHost.trim()}`);
  if (dif('ftpPort') && String(v.ftpPort).trim()) cmds.push(`set_ftp_port ${String(v.ftpPort).trim()}`);
  if (dif('ftpUser') && v.ftpUser.trim()) cmds.push(`set_ftp_user ${q(v.ftpUser.trim())}`);
  if (v.ftpPass.trim()) cmds.push(`set_ftp_pass ${q(v.ftpPass.trim())}`);
  if (dif('ftpPath') && v.ftpPath.trim()) cmds.push(`set_ftp_path ${v.ftpPath.trim()}`);
  if (dif('ftpBp') && v.ftpBp) cmds.push(`set_ftp_block_public ${v.ftpBp}`);
  return { cmds, avisos };
}

// --- Filas de schema (modelo de Lorenzo) ------------------------------------
const filaCompleta = (r) => {
  if ('path' in r) return !!(r.id && r.path); // tópico
  if (!(r.id && r.tipo && r.topic && r.field && String(r.tref))) return false;
  const spec = SENSOR_SPECS[r.tipo] || [];
  return spec.every((f) => f.d !== '' || String((r.params || {})[f.k] ?? '') !== '');
};
const filaCambiada = (r) => Object.keys(r.base || {}).some((k) => String(r[k] ?? '') !== String(r.base[k] ?? ''));

// Diff del schema → comandos en ORDEN SEGURO (del_sensor → del_topic →
// add_topic → add/edit_sensor_json → save_schema → reload_schema → OK).
export function armarComandosSchema(topicos, sensores, avisos) {
  const cmds = [];
  const sensDel = sensores.filter((r) => !r.nuevo && r.borrada);
  const topDel = topicos.filter((r) => !r.nuevo && r.borrada);
  const topAdd = topicos.filter((r) => r.nuevo && (r.id || r.path));
  const sensAddEdit = sensores.filter((r) => (r.nuevo && (r.id || r.field || r.tipo)) ||
    (!r.nuevo && !r.borrada && filaCambiada(r)));
  for (const r of topAdd) if (!filaCompleta(r)) avisos.push(`Tópico nuevo '${r.id || r.path}': faltan campos — NO se envía.`);
  for (const r of sensAddEdit) if (!filaCompleta(r)) avisos.push(`Sensor '${r.id || '(sin id)'}': faltan campos (id/tipo/tópico/field/t_ref o parámetros obligatorios) — NO se envía.`);
  sensDel.forEach((r) => cmds.push('del_sensor ' + r.id));
  topDel.forEach((r) => cmds.push('del_topic ' + r.id));
  topAdd.filter(filaCompleta).forEach((r) => cmds.push(`add_topic ${r.id} ${r.path}`));
  for (const r of sensAddEdit.filter(filaCompleta)) {
    const extra = r.extra ? (',' + r.extra) : '';
    const json = `{"id":"${r.id}","type":"${r.tipo}","topic_id":"${r.topic}","field":"${r.field}","t_ref":${r.tref},"retries":2${extra}}`;
    try { JSON.parse(json); } catch {
      avisos.push(`Sensor '${r.id}': los parámetros no forman JSON válido — NO se envía.`); continue;
    }
    cmds.push((r.nuevo ? 'add_sensor_json ' : `edit_sensor_json ${r.id} `) + json);
  }
  if (cmds.length) { cmds.push('save_schema', 'reload_schema', 'OK'); }
  return cmds;
}

// Enmascarado PARA PANTALLA (el comando que viaja es el original): claves de
// set_pass/set_ftp_pass y el ÚLTIMO argumento de add_wifi (la clave, nunca el SSID).
export const mostrarCmd = (c) => {
  if (c === 'OK') return 'OK   (confirmación del reload_schema)';
  if (c.startsWith('set_pass ') || c.startsWith('set_ftp_pass ')) return c.split(' ')[0] + ' ••••••';
  const m = c.match(/^(add_wifi \d+ ("[^"]*"|\S+) )("[^"]*"|\S+)$/);
  if (m) return m[1] + '••••••';
  return c;
};

// Validación post-grabado: campo → extractor sobre el get_all_json releído
// (las credenciales no son verificables: el JSON no las expone).
const sinCeros = (x) => ((String(x || '') === '0.0.0.0' || x === '***') ? '' : String(x || ''));
const VALIDA = {
  nombre: (j) => j.general?.dev_name,
  debug: (j) => (j.general?.debug ? 'on' : 'off'),
  tz: (j) => String(j.general?.tz_sistema_s ?? ''),
  failover: (j) => (j.redes?.failover ? 'on' : 'off'),
  ethDhcp: (j) => (j.redes?.eth_dhcp ? 'on' : 'off'),
  ethStatic: (j) => (j.redes?.eth_static ? 'on' : 'off'),
  ethIp: (j) => ('eth_static_ip' in (j.redes || {}) ? sinCeros(j.redes.eth_static_ip) : null),
  ethMask: (j) => ('eth_static_mask' in (j.redes || {}) ? sinCeros(j.redes.eth_static_mask) : null),
  ethGw: (j) => ('eth_static_gw' in (j.redes || {}) ? sinCeros(j.redes.eth_static_gw) : null),
  ethDns: (j) => ('eth_static_dns' in (j.redes || {}) ? sinCeros(j.redes.eth_static_dns) : null),
  wifiOn: (j) => (j.redes?.wifi_enabled ? 'on' : 'off'),
  w0ssid: (j) => limpiar3(j.redes?.wifi_perfiles?.[0]?.ssid) || null,
  w1ssid: (j) => limpiar3(j.redes?.wifi_perfiles?.[1]?.ssid) || null,
  w2ssid: (j) => limpiar3(j.redes?.wifi_perfiles?.[2]?.ssid) || null,
  w0on: (j) => (j.redes?.wifi_perfiles?.[0]?.enabled ? 'on' : 'off'),
  w1on: (j) => (j.redes?.wifi_perfiles?.[1]?.enabled ? 'on' : 'off'),
  w2on: (j) => (j.redes?.wifi_perfiles?.[2]?.enabled ? 'on' : 'off'),
  mqttPerfil: (j) => String(PERFIL_IDX[j.servidores?.mqtt_perfil] || ''),
  blockPublic: (j) => (j.servidores?.mqtt_block_public ? 'yes' : 'no'),
  ntp: (j) => j.servidores?.ntp,
  ntpFallback: (j) => (j.servidores?.ntp_fallback ? 'on' : 'off'),
  ftpHost: (j) => limpiar3(String(j.servidores?.ftp || '').split(':')[0]),
  ftpPort: (j) => String(j.servidores?.ftp || '').split(':')[1] || '',
  ftpUser: (j) => limpiar3(j.servidores?.ftp_user) || null,
  ftpPath: (j) => j.servidores?.ftp_path,
  ftpBp: (j) => (j.servidores?.ftp_block_public ? 'yes' : 'no'),
};
for (const c of [1, 2, 3]) {
  VALIDA[`c${c}baud`] = (j) => String(BAUD_IDX[j.coms?.[c - 1]?.baud] || '');
  VALIDA[`c${c}fr`] = (j) => { const i = FRAMINGS.indexOf(j.coms?.[c - 1]?.framing); return i > 0 ? String(i) : ''; };
  VALIDA[`c${c}port`] = (j) => portOptDesde(j.coms?.[c - 1]?.rx, j.coms?.[c - 1]?.tx);
}
const NO_VERIFICABLES = ['passNueva', 'w0pass', 'w1pass', 'w2pass', 'ftpPass'];

export default function MultivacConfigAgua({ habilitado, conectado, enviarLinea, rxSink, terminal, log, selectorFirmware, botonesConexion }) {
  const [campos, setCampos] = useState({ ...CAMPOS_DEF });
  const [orig, setOrig] = useState(null);
  const [estado, setEstado] = useState({}); // mac, fw, hw, uptime
  const [passLogin, setPassLogin] = useState('');
  const [leyendo, setLeyendo] = useState('');
  const [logueado, setLogueado] = useState(false);
  const [grabando, setGrabando] = useState(false);
  const [cfgProg, setCfgProg] = useState(null); // {txt,pct} | {ok:true} | null
  const [confirmar, setConfirmar] = useState(null); // { comandos, resolve }
  const [aviso, setAviso] = useState('');
  // Schema: filas con uid estable (claves de React: el foco no se pierde).
  const uidRef = useRef(1);
  const [topicos, setTopicos] = useState([]);
  const [sensores, setSensores] = useState([]);
  const ocupado = !!leyendo || grabando;
  const bloqueado = !habilitado || !conectado || !orig || ocupado;

  const activo = useRef(true);
  useEffect(() => () => { activo.current = false; if (rxSink) rxSink.current = null; }, [rxSink]);

  // Mismo motor que Reconecta: comando → respuesta hasta ventana quieta.
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

  // get_all_json: juntar desde la primer '{' balanceando llaves (de Lorenzo).
  const leerAllJson = async () => {
    const lineas = await consultar('get_all_json', 500, 8000);
    let dentro = false; let prof = 0; let buf = '';
    for (const l of lineas) {
      if (!dentro) {
        const i = String(l).indexOf('{');
        if (i < 0) continue;
        dentro = true; buf = String(l).slice(i);
      } else buf += '\n' + l;
      for (const ch of String(l)) { if (ch === '{') prof += 1; else if (ch === '}') prof -= 1; }
      if (dentro && prof <= 0) break;
    }
    if (!dentro) throw new Error('la placa no devolvió JSON');
    return JSON.parse(buf);
  };

  // Sesión FRESCA + login (la CLI caduca por inactividad — patrón de Lorenzo:
  // ninguna operación asume sesión viva). Devuelve true si quedó logueada.
  const sesionFresca = async (passOverride) => {
    await consultar('comando', 300, 3000);
    const rLogin = await consultar('login', 300, 3000);
    if (rLogin.some((l) => /password/i.test(l))) {
      const pass = String(passOverride ?? passLogin).trim() || estado.mac || '';
      const rPass = await consultar(pass || 'cancel', 400, 4000, /Login OK|incorrecta|invalid/i);
      const ok = rPass.some((l) => /login ok/i.test(l));
      setLogueado(ok);
      return ok;
    }
    setLogueado(true);
    return true;
  };
  // Cierra la sesión CLI: libera la consola para los logs en vivo de la placa.
  const cerrarSesion = async () => { await consultar('end', 250, 2000); };

  // --- Precarga desde get_all_json (estructura del FW de agua, de Lorenzo) --
  const precargar = (j) => {
    const g = j.general || {}; const r = j.redes || {}; const s = j.servidores || {};
    const d = { ...CAMPOS_DEF };
    d.nombre = limpiar3(g.dev_name); d.passNueva = '';
    d.debug = g.debug ? 'on' : 'off';
    d.tz = String(g.tz_sistema_s ?? '');
    d.failover = r.failover ? 'on' : 'off';
    d.ethDhcp = r.eth_dhcp ? 'on' : 'off';
    d.ethStatic = r.eth_static ? 'on' : 'off';
    d.ethIp = sinCeros(r.eth_static_ip);
    // FW 0.6.20+ informa máscara/gw/dns; previos no (default típico de máscara).
    d.ethMask = sinCeros(r.eth_static_mask) || '255.255.255.0';
    d.ethGw = sinCeros(r.eth_static_gw);
    d.ethDns = sinCeros(r.eth_static_dns);
    d.wifiOn = r.wifi_enabled ? 'on' : 'off';
    (r.wifi_perfiles || []).slice(0, 3).forEach((p, i) => {
      d[`w${i}ssid`] = limpiar3(p?.ssid);
      d[`w${i}pass`] = ''; // write-only: el JSON no expone claves
      d[`w${i}on`] = p?.enabled ? 'on' : 'off';
    });
    (j.coms || []).forEach((c) => {
      d[`c${c.com}baud`] = String(BAUD_IDX[c.baud] || '');
      const fi = FRAMINGS.indexOf(c.framing);
      d[`c${c.com}fr`] = fi > 0 ? String(fi) : '';
      d[`c${c.com}port`] = portOptDesde(c.rx, c.tx);
    });
    d.mqttPerfil = String(PERFIL_IDX[s.mqtt_perfil] || '');
    d.blockPublic = s.mqtt_block_public ? 'yes' : 'no';
    d.ntp = limpiar3(s.ntp); d.ntpFallback = s.ntp_fallback ? 'on' : 'off';
    const ftp = String(s.ftp || '').split(':');
    d.ftpHost = limpiar3(ftp[0]); d.ftpPort = ftp[1] || '21';
    d.ftpUser = limpiar3(s.ftp_user); d.ftpPass = '';
    d.ftpPath = limpiar3(s.ftp_path);
    d.ftpBp = s.ftp_block_public ? 'yes' : 'no';
    setCampos(d); setOrig(d);
    setEstado((e) => ({ ...e, mac: g.mac || e.mac, hw: g.hw || e.hw, uptime: g.uptime_s != null ? `${g.uptime_s} s` : e.uptime }));
  };

  // --- Lectura del schema (show_all_topics + show_all_sensors_json) ---------
  const vaciaTopico = () => ({ uid: uidRef.current++, id: '', path: '', nuevo: true, borrada: false, base: {} });
  const vaciaSensor = () => ({ uid: uidRef.current++, id: '', tipo: '', topic: '', field: '', tref: '', extra: '', params: {}, passthru: null, nuevo: true, borrada: false, base: {} });
  const conVacia = (lista, fabrica, esVacia) => (lista.some((r) => r.nuevo && esVacia(r)) ? lista : [...lista, fabrica()]);
  const topConVacia = (ls) => conVacia(ls, vaciaTopico, (r) => !r.id && !r.path);
  const senConVacia = (ls) => conVacia(ls, vaciaSensor, (r) => !r.id && !r.field && !r.extra && !r.tipo);

  const leerSchema = async () => {
    const lt = await consultar('show_all_topics', 400, 5000);
    const ts = [];
    for (const l of lt) {
      const m = String(l).match(/^\s*\[\d+\]\s+(\S+)\s+->\s+(\S+)/);
      if (m) ts.push({ uid: uidRef.current++, id: m[1], path: m[2], nuevo: false, borrada: false, base: { id: m[1], path: m[2] } });
    }
    const lsj = await consultar('show_all_sensors_json', 500, 6000);
    const ss = [];
    for (const l of lsj) {
      const t = String(l).trim();
      if (!t.startsWith('{')) continue;
      try {
        const o = JSON.parse(t);
        const comunes = ['id', 'type', 'topic_id', 'field', 't_ref', 'retries'];
        const spec = SENSOR_SPECS[o.type] || [];
        const specKeys = spec.map((f) => f.k);
        const params = {}; const passthru = {};
        for (const k of Object.keys(o)) {
          if (comunes.includes(k)) continue;
          if (specKeys.includes(k)) params[k] = Array.isArray(o[k]) ? o[k].join(',') : String(o[k]);
          else passthru[k] = o[k]; // clave no modelada: se preserva tal cual
        }
        const r = {
          uid: uidRef.current++, id: o.id, tipo: o.type, topic: o.topic_id,
          field: o.field ?? '', tref: String(o.t_ref ?? ''), params,
          passthru: Object.keys(passthru).length ? passthru : null,
          nuevo: false, borrada: false,
        };
        r.extra = serializarParams(r.tipo, r.params, r.passthru);
        r.base = { id: r.id, tipo: r.tipo, topic: r.topic, field: r.field, tref: r.tref, extra: r.extra };
        ss.push(r);
      } catch { log('sys', 'Sensor JSON no parseable: ' + t.slice(0, 60)); }
    }
    setTopicos(topConVacia(ts));
    setSensores(senConVacia(ss));
  };

  // --- Lectura completa (auto al conectar; «Releer placa») -------------------
  const leerPlaca = async (passOverride) => {
    if (!conectado || !habilitado || ocupado) return;
    setAviso('');
    try {
      setLeyendo('abriendo sesión');
      await consultar('comando', 300, 3000);
      // 1) Firmware: TIENE que ser de agua — misma guardia dura del standalone.
      setLeyendo('get_firmware');
      const fwl = await consultar('get_firmware', 400, 4000);
      const fwLinea = fwl.find((l) => /agua_[0-9.]+/.test(String(l)));
      if (!fwLinea) {
        const otro = fwl.find((l) => /dnp3_|FW_/i.test(String(l)));
        setAviso(`El firmware de la placa NO es de agua${otro ? ` (respondió: ${String(otro).trim()})` : ''} — verificá el selector de firmware. No se leyó nada.`);
        return;
      }
      const fwVer = String(fwLinea).match(/agua_[0-9.]+/)[0];
      // 2) MAC (get_all_json responde sin login) → 3) login → 4) lectura completa.
      setLeyendo('get_all_json (MAC)');
      const j0 = await leerAllJson();
      const mac = j0.general?.mac || '';
      setEstado((e) => ({ ...e, mac, fw: fwVer, hw: j0.general?.hw || '' }));
      setLeyendo('login');
      const ok = await sesionFresca(passOverride ?? (String(passLogin).trim() || mac));
      if (!ok) {
        setAviso(`Login rechazado: cargá la contraseña CLI de esta placa (recién programada es la MAC${mac ? ` ${mac}` : ''}) y tocá «Releer placa».`);
        return;
      }
      setLeyendo('get_all_json');
      const j = await leerAllJson();
      if (!activo.current) return;
      precargar(j);
      setLeyendo('schema (tópicos y sensores)');
      await leerSchema();
      await cerrarSesion();
      log('sys', `✓ ${fwVer}: configuración y schema leídos. Editá lo que necesites y tocá «Grabar cambios».`);
    } catch (e) {
      setAviso('Lectura fallida: ' + (e.message || e));
    } finally { if (activo.current) setLeyendo(''); }
  };

  useEffect(() => {
    if (habilitado && conectado && !orig && !ocupado) leerPlaca();
    if (!conectado) setLogueado(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conectado, habilitado]);

  // --- Diff y grabado --------------------------------------------------------
  const diffConfig = orig ? armarComandosAgua(campos, orig) : { cmds: [], avisos: [] };
  const avisosSch = [];
  const cmdsSch = orig ? armarComandosSchema(topicos, sensores, avisosSch) : [];
  const comandosTodos = [...diffConfig.cmds, ...cmdsSch];
  const avisosTodos = [...diffConfig.avisos, ...avisosSch];

  const grabar = async () => {
    if (!comandosTodos.length || ocupado || !conectado) return;
    const comandos = comandosTodos;
    const ok = await new Promise((res) => setConfirmar({ comandos, resolve: res }));
    setConfirmar(null);
    if (!ok) return;
    setGrabando(true);
    setCfgProg({ txt: 'Iniciando sesión en la placa…', pct: 5 });
    try {
      if (!(await sesionFresca())) {
        setAviso('La sesión expiró y el re-login falló: revisá la contraseña CLI (recién programada es la MAC) y volvé a tocar «Grabar cambios».');
        setCfgProg(null);
        return;
      }
      for (let i = 0; i < comandos.length; i += 1) {
        setCfgProg({ txt: `Grabando — comando ${i + 1}/${comandos.length}`, pct: 10 + Math.round(((i + 1) / comandos.length) * 60) });
        // reload_schema tarda: ventana más larga para no pisarle la respuesta.
        const esquema = /^(save_schema|reload_schema)$/.test(comandos[i]);
        const resp = await consultar(comandos[i], esquema ? 900 : 500, esquema ? 12000 : 8000);
        if (resp.some((l) => /ERROR|invalid|desconocido/i.test(String(l)))) {
          log('sys', `⚠ El comando '${comandos[i].split(' ')[0]}' devolvió error — ver el monitor (bloque 4).`);
        }
      }
      // Si viajó set_pass, los próximos ciclos usan la contraseña NUEVA.
      const nuevaPass = campos.passNueva.trim();
      if (nuevaPass) setPassLogin(nuevaPass);

      // --- Validación con relectura (y la escalera de recuperación de Lorenzo) ---
      setCfgProg({ txt: 'Verificando: releyendo la configuración de la placa…', pct: 75 });
      const dirtyKeys = Object.keys(campos).filter((k) => String(campos[k]) !== String(orig[k]));
      const huboSchema = comandos.includes('save_schema');
      const validar = (j) => {
        let fallas = 0; let noVerif = 0; const detalle = [];
        for (const k of dirtyKeys) {
          if (NO_VERIFICABLES.includes(k)) { noVerif += 1; continue; }
          if (!(k in VALIDA)) continue;
          const leido = VALIDA[k](j);
          if (leido == null) { noVerif += 1; continue; } // el FW no informa el campo
          const esperado = String(campos[k]);
          if (esperado !== '' && String(leido) !== esperado) { fallas += 1; detalle.push(`'${k}' esperado='${esperado}' leído='${leido}'`); }
        }
        return { fallas, noVerif, detalle };
      };
      const validarSchema = async () => {
        // Altas presentes y bajas ausentes contra la relectura del schema.
        const addsT = topicos.filter((r) => r.nuevo && filaCompleta(r)).map((r) => r.id);
        const delsT = topicos.filter((r) => !r.nuevo && r.borrada).map((r) => r.id);
        const addsS = sensores.filter((r) => r.nuevo && filaCompleta(r)).map((r) => r.id);
        const delsS = sensores.filter((r) => !r.nuevo && r.borrada).map((r) => r.id);
        if (!(addsT.length || delsT.length || addsS.length || delsS.length || sensores.some((r) => !r.nuevo && !r.borrada && filaCambiada(r)))) return [];
        await leerSchema(); // re-lee y re-arma el baseline del schema
        const errores = [];
        // Los estados de React no se actualizan en esta pasada: releer directo.
        const lt = await consultar('show_all_topics', 400, 5000);
        const idsT = lt.map((l) => (String(l).match(/^\s*\[\d+\]\s+(\S+)\s+->/) || [])[1]).filter(Boolean);
        const lsj = await consultar('show_all_sensors_json', 500, 6000);
        const idsS = lsj.map((l) => { try { return JSON.parse(String(l).trim()).id; } catch { return null; } }).filter(Boolean);
        addsT.forEach((id) => { if (!idsT.includes(id)) errores.push(`Tópico '${id}' NO quedó de alta.`); });
        delsT.forEach((id) => { if (idsT.includes(id)) errores.push(`Tópico '${id}' NO se dio de baja.`); });
        addsS.forEach((id) => { if (!idsS.includes(id)) errores.push(`Sensor '${id}' NO quedó de alta.`); });
        delsS.forEach((id) => { if (idsS.includes(id)) errores.push(`Sensor '${id}' NO se dio de baja.`); });
        return errores;
      };

      let j = await leerAllJson();
      let r = validar(j);
      let errSch = await validarSchema();
      if (r.fallas || errSch.length) {
        // 1) REINTENTO SUAVE: algunos cambios aplican en caliente con ~1 s de
        //    demora (falsos negativos de timing) — 2 s y relectura, sin tocar nada.
        setCfgProg({ txt: 'Algunos campos no impactaron — reintento suave (2 s)…', pct: 85 });
        await new Promise((res) => setTimeout(res, 2000));
        j = await leerAllJson();
        r = validar(j);
        errSch = await validarSchema();
      }
      if ((r.fallas || errSch.length) && huboSchema) {
        // 2) ÚLTIMO RECURSO (solo con cambios de schema: LittleFS a medio
        //    asentar): reinicio por comando y re-validación. Sin login no hay
        //    pulso de hardware acá (el puerto es del módulo y puede ser BLE).
        setCfgProg({ txt: 'Cambios de schema sin impactar — reiniciando la placa (restart)…', pct: 90 });
        log('sys', '⚠ Último recurso: reinicio de la placa para asentar el schema…');
        await consultar('restart', 300, 3000);
        await new Promise((res) => setTimeout(res, 5500));
        if (await sesionFresca(nuevaPass || undefined)) {
          j = await leerAllJson();
          r = validar(j);
          errSch = await validarSchema();
        } else {
          setAviso('El re-login tras el reinicio falló: revisá la contraseña CLI y tocá «Releer placa».');
        }
      }

      if (!r.fallas && !errSch.length) {
        precargar(j); // nuevo baseline: apaga los ámbar
        if (huboSchema) await leerSchema();
        await cerrarSesion();
        if (activo.current) setCfgProg({ ok: true });
        log('sys', `✓ Cambios validados en la placa${r.noVerif ? ` (${r.noVerif} campo(s) enviados sin verificación posible: credenciales, o campos que este firmware no informa)` : ''}.`);
      } else {
        await cerrarSesion();
        setCfgProg(null);
        const todos = [...r.detalle, ...errSch];
        setAviso(`${todos.length} cambio(s) no impactaron en la placa: ${todos.join(' · ')} — el detalle está en el monitor (bloque 4).`);
        log('sys', '✗ Validación con diferencias: ' + todos.join(' | '));
      }
      if (nuevaPass) setCampos((c) => ({ ...c, passNueva: '' }));
    } catch (e) {
      setCfgProg(null);
      setAviso('Grabado interrumpido: ' + (e.message || e));
    } finally { if (activo.current) setGrabando(false); }
  };

  // Reinicio a demanda (comando restart con sesión fresca + relectura).
  const reiniciar = async () => {
    if (bloqueado) return;
    setLeyendo('reiniciando (restart + boot ~5 s)');
    try {
      if (!(await sesionFresca())) { setAviso('Re-login fallido: revisá la contraseña CLI.'); return; }
      await consultar('restart', 300, 3000);
      await new Promise((res) => setTimeout(res, 5500));
      setLeyendo('');
      setOrig(null); // fuerza la re-lectura completa
      await leerPlaca();
    } finally { if (activo.current) setLeyendo(''); }
  };

  // --- Piezas de formulario (mismas convenciones visuales que Reconecta) ----
  const esDirty = (k) => orig && String(campos[k]) !== String(orig[k]);
  const claseCampo = (k) => `w-full border rounded-lg px-2 py-1.5 text-sm disabled:bg-slate-50 disabled:text-slate-400 ${esDirty(k) ? 'border-amber-400 bg-amber-50' : 'border-slate-300'}`;
  const set = (k, val) => setCampos((c) => ({ ...c, [k]: val }));
  const campoTexto = (k, label, props = {}) => (
    <div className="mb-1.5">
      {label !== '' && <label className="block text-xs text-slate-500 mb-0.5">{label}</label>}
      <input value={campos[k]} onChange={(e2) => set(k, e2.target.value)} disabled={bloqueado}
        className={claseCampo(k)} {...props} />
    </div>
  );
  const campoSelect = (k, label, opciones) => (
    <div className="mb-1.5">
      {label !== '' && <label className="block text-xs text-slate-500 mb-0.5">{label}</label>}
      <select value={campos[k]} onChange={(e2) => set(k, e2.target.value)} disabled={bloqueado} className={claseCampo(k)}>
        {opciones.map((op) => <option key={op.v} value={op.v}>{op.t}</option>)}
      </select>
    </div>
  );
  const campoCheck = (k, label) => {
    const sinLeer = campos[k] === '';
    return (
      <label title={sinLeer ? 'Sin leer de la placa todavía — tildá o destildá para definirlo' : undefined}
        className={`flex items-center gap-2 text-sm mb-1.5 select-none ${sinLeer ? 'text-slate-400' : 'text-slate-700'} ${bloqueado ? 'opacity-50' : 'cursor-pointer'} ${esDirty(k) ? 'bg-amber-50 border border-amber-300 rounded-lg px-1.5 py-0.5 -mx-1.5' : ''}`}>
        <input type="checkbox" checked={campos[k] === 'on'} disabled={bloqueado}
          ref={(el) => { if (el) el.indeterminate = sinLeer; }}
          onChange={(e2) => set(k, e2.target.checked ? 'on' : 'off')}
          className={`w-4 h-4 accent-[#1e40af] ${sinLeer ? 'opacity-40' : ''}`} />
        <span>{label}</span>
      </label>
    );
  };
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
          {oct.map((v2, i) => (
            <span key={i} className="flex items-center">
              <input value={v2} onChange={(e2) => setOct(i, e2.target.value)} disabled={bloqueado}
                inputMode="numeric" placeholder="0"
                className="w-10 text-center text-sm outline-none bg-transparent disabled:text-slate-400" />
              {i < 3 && <span className="text-slate-400 px-0.5">.</span>}
            </span>
          ))}
        </div>
      </div>
    );
  };

  // --- Edición del schema -----------------------------------------------------
  const updTopico = (uid, patch) => setTopicos((ls) => topConVacia(ls.map((r) => (r.uid === uid ? { ...r, ...patch } : r))));
  const updSensor = (uid, patch) => setSensores((ls) => senConVacia(ls.map((r) => {
    if (r.uid !== uid) return r;
    const nu = { ...r, ...patch };
    if ('tipo' in patch && patch.tipo !== r.tipo) {
      // Tipo nuevo: re-formatea los parámetros con los defaults del firmware.
      nu.params = {}; nu.passthru = null;
      (SENSOR_SPECS[nu.tipo] || []).forEach((f) => { nu.params[f.k] = f.d; });
    }
    nu.extra = serializarParams(nu.tipo, nu.params, nu.passthru);
    return nu;
  })));
  const bajaTopico = (r) => setTopicos((ls) => topConVacia(
    r.nuevo ? ls.filter((x) => x.uid !== r.uid) : ls.map((x) => (x.uid === r.uid ? { ...x, borrada: !x.borrada } : x))));
  const bajaSensor = (r) => setSensores((ls) => senConVacia(
    r.nuevo ? ls.filter((x) => x.uid !== r.uid) : ls.map((x) => (x.uid === r.uid ? { ...x, borrada: !x.borrada } : x))));
  const schDirty = (r, campo) => (r.nuevo ? String(r[campo] ?? '') !== '' : String(r[campo] ?? '') !== String(r.base[campo] ?? ''));
  const claseSch = (r, campo, extra = '') => `border rounded-lg px-1.5 py-1 text-xs disabled:bg-slate-50 disabled:text-slate-400 ${schDirty(r, campo) ? 'border-amber-400 bg-amber-50' : 'border-slate-300'} ${r.borrada ? 'line-through opacity-50' : ''} ${extra}`;

  const mensajePasos = !habilitado
    ? 'Pasos: 1️⃣ Elegí el firmware de la placa → 2️⃣ Conectala por USB → 3️⃣ la configuración y el schema se leen solos.'
    : !conectado
      ? 'Firmware elegido ✓ — ahora conectá la placa con el botón USB: la configuración se lee sola.'
      : leyendo
        ? `⏳ ${leyendo}…`
        : orig
          ? '✓ Configuración y schema leídos. Editá lo que necesites (se marca en ámbar) y bajá a «Grabar cambios».'
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
          <button onClick={reiniciar} disabled={bloqueado} title="restart con sesión fresca; tras el boot se relee todo"
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg hover:border-coop-azul hover:text-coop-azul disabled:opacity-40">
            ⏻ Reiniciar placa
          </button>
        </div>
        <p className={`text-xs mt-2 ${!habilitado || !conectado ? 'text-coop-azul' : 'text-slate-500'}`}>
          {mensajePasos}{logueado && !leyendo ? '  ·  ✓ Sesión validada' : ''}
          {estado.fw ? `  ·  ${estado.fw}${estado.hw ? ` · ${estado.hw}` : ''}${estado.mac ? ` · MAC ${estado.mac}` : ''}` : ''}
        </p>
        {aviso && <p className="text-xs text-amber-600 mt-1">{aviso}</p>}
      </div>

      {/* ============ 2 · CONFIGURACIONES ============ */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 mb-3">
        <h3 className="text-sm font-semibold text-slate-700 mb-2">2 · Configuraciones</h3>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {/* Columna 1: Generales + COMs */}
          <div className="border border-slate-100 rounded-lg p-2.5">
            <h4 className="text-sm font-medium text-slate-700 mb-2">⚙ Configuraciones Generales</h4>
            {campoTexto('nombre', 'Nombre del dispositivo', { placeholder: 'AGUA_ejemplo' })}
            {campoTexto('passNueva', 'Nueva contraseña CLI (vacío = no cambiar)', { type: 'password', placeholder: '••••••••' })}
            <div className="grid grid-cols-2 gap-2">
              <div className="pt-4">{campoCheck('debug', 'Debug')}</div>
              {campoTexto('tz', 'Timezone (seg; Arg = -10800)')}
            </div>
            <div className="border-t border-slate-100 pt-2 mt-1">
              <p className="text-xs font-medium text-slate-600 mb-1">Puertos COM</p>
              <div className="grid grid-cols-[34px_1fr_1fr_1.25fr] gap-1.5 items-center text-[10.5px] text-slate-400">
                <span /><span>Baud</span><span>Framing</span><span>Puerto físico</span>
              </div>
              {[1, 2, 3].map((c) => (
                <div key={c} className="grid grid-cols-[34px_1fr_1fr_1.25fr] gap-1.5 items-center mb-1">
                  <span className="text-[11px] text-slate-500">COM{c}</span>
                  {campoSelect(`c${c}baud`, '', [{ v: '', t: '—' }, ...Object.entries(BAUD_IDX)
                    .filter(([, i]) => !(c === 3 && i > 7)) // COM3 (SoftwareSerial): tope 57600
                    .map(([b, i]) => ({ v: String(i), t: b }))])}
                  {campoSelect(`c${c}fr`, '', [{ v: '', t: '—' }, ...FRAMINGS.map((f, i) => ({ v: String(i), t: f })).filter((x) => x.t)])}
                  {campoSelect(`c${c}port`, '', [{ v: '', t: '—' }, ...Object.entries(PORT_LABELS).map(([v2, t]) => ({ v: v2, t }))])}
                </div>
              ))}
              <p className="text-[10.5px] text-slate-400">Se aplican en caliente (set_com_baud/framing/port). COM3 admite hasta 57600.</p>
            </div>
          </div>

          {/* Columna 2: Red */}
          <div className="border border-slate-100 rounded-lg p-2.5">
            <h4 className="text-sm font-medium text-slate-700 mb-2">🌐 Configuraciones de Red</h4>
            {campoCheck('failover', 'Utilizar Failover')}
            {campoCheck('ethDhcp', 'Obtener una dirección IP automáticamente (DHCP)')}
            {campoCheck('ethStatic', 'Usar la siguiente dirección IP:')}
            <div className={`ml-5 border border-slate-200 rounded-lg px-2.5 pt-2 pb-0.5 mb-2 ${campos.ethStatic !== 'on' ? 'opacity-50 pointer-events-none' : ''}`}>
              <div className="grid sm:grid-cols-2 gap-x-3">
                {campoIp('ethIp', 'Dirección IP')}
                {campoIp('ethMask', 'Máscara de subred')}
                {campoIp('ethGw', 'Puerta de enlace (gateway)')}
                {campoIp('ethDns', 'DNS')}
              </div>
              <p className="text-[10.5px] text-slate-400 mb-1.5">Con firmware 0.6.20+ los 4 campos se leen de la placa; con previos, completalos. Los 4 se envían juntos (set_eth_ip).</p>
            </div>
            <div className="border-t border-slate-100 pt-2">
              {campoCheck('wifiOn', 'Utilizar WiFi')}
              <div className={campos.wifiOn === 'off' ? 'opacity-60' : ''}>
                <p className="text-[10.5px] text-slate-400 mb-1">El perfil 0 es la red principal. SSID y clave viajan juntos (add_wifi): para cambiar uno, completá ambos. El tilde habilita el perfil.</p>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end mb-1">
                    <div>{campoTexto(`w${i}ssid`, i === 0 ? 'SSID' : '', { placeholder: `perfil ${i}` })}</div>
                    <div>{campoTexto(`w${i}pass`, i === 0 ? 'Clave' : '', { type: 'password', placeholder: '••••••' })}</div>
                    <label title={`Perfil ${i}: tildado = usar esta red (on)`}
                      className={`mb-2 flex items-center justify-center w-8 h-8 rounded-lg select-none ${bloqueado ? 'opacity-50' : 'cursor-pointer'} ${esDirty(`w${i}on`) ? 'bg-amber-50 border border-amber-300' : ''}`}>
                      <input type="checkbox" checked={campos[`w${i}on`] === 'on'} disabled={bloqueado}
                        onChange={(e2) => set(`w${i}on`, e2.target.checked ? 'on' : 'off')}
                        className="w-4 h-4 accent-[#1e40af]" />
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Columna 3: Servidores */}
          <div className="border border-slate-100 rounded-lg p-2.5">
            <h4 className="text-sm font-medium text-slate-700 mb-2">🖥 Configuraciones de Servidores</h4>
            <div className="grid grid-cols-2 gap-2">
              {campoSelect('mqttPerfil', 'Perfil MQTT', [{ v: '', t: '(sin leer)' }, ...MQTT_PERFILES])}
              {campoSelect('blockPublic', 'Bloquear rutas públicas', [{ v: 'no', t: 'no' }, { v: 'yes', t: 'sí' }])}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {campoTexto('ntp', 'NTP (auto | ip | host)')}
              <div className="pt-4">{campoCheck('ntpFallback', 'Fallback pools públicos')}</div>
            </div>
            <div className="border-t border-slate-100 pt-2 grid grid-cols-2 gap-2">
              {campoTexto('ftpHost', 'FTP host', { placeholder: '(sin configurar)' })}
              {campoTexto('ftpPort', 'FTP puerto')}
              {campoTexto('ftpUser', 'FTP usuario')}
              {campoTexto('ftpPass', 'FTP contraseña (vacío = no cambiar)', { type: 'password' })}
            </div>
            {campoTexto('ftpPath', 'FTP ruta remota del schema', { placeholder: '/schema.json' })}
            {campoSelect('ftpBp', 'Bloquear FTP a IPs públicas', [{ v: 'yes', t: 'sí (default)' }, { v: 'no', t: 'no' }])}
          </div>
        </div>
      </div>

      {/* ============ 2b · SCHEMA: TÓPICOS Y SENSORES ============ */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 mb-3">
        <h3 className="text-sm font-semibold text-slate-700 mb-1">2b · Schema: tópicos y sensores</h3>
        <p className="text-[11px] text-slate-400 mb-2">El último renglón (vacío) es el alta: completalo y se crea el elemento (aparece otro renglón debajo). Los existentes se editan (quedan en ámbar) o se dan de baja con ✕ (quedan tachados hasta grabar). Los cambios de schema agregan solos <code>save_schema</code> + <code>reload_schema</code> al grabar.</p>

        <div className="border border-slate-100 rounded-lg p-2.5 mb-3">
          <h4 className="text-sm font-medium text-slate-700 mb-1.5">📌 Tópicos</h4>
          <div className="grid grid-cols-[170px_1fr_30px] gap-2 text-[10.5px] text-slate-400 mb-1"><span>ID</span><span>Path MQTT</span><span /></div>
          {topicos.map((r) => (
            <div key={r.uid} className="grid grid-cols-[170px_1fr_30px] gap-2 items-center mb-1">
              <input value={r.id} disabled={bloqueado || !r.nuevo} placeholder={r.nuevo ? 't_nuevo' : ''}
                onChange={(e2) => updTopico(r.uid, { id: e2.target.value.trim() })} className={claseSch(r, 'id')} />
              <input value={r.path} disabled={bloqueado || r.borrada} placeholder={r.nuevo ? 'coop/agua/red/SITIO/xxx' : ''}
                onChange={(e2) => updTopico(r.uid, { path: e2.target.value.trim() })} className={claseSch(r, 'path')} />
              <button onClick={() => bajaTopico(r)} disabled={bloqueado || (r.nuevo && !r.id && !r.path)}
                title={r.nuevo ? 'Limpiar' : (r.borrada ? 'Deshacer la baja' : 'Dar de baja (del_topic al grabar)')}
                className="text-slate-400 hover:text-red-500 disabled:opacity-30 text-sm">✕</button>
            </div>
          ))}
        </div>

        <div className="border border-slate-100 rounded-lg p-2.5">
          <h4 className="text-sm font-medium text-slate-700 mb-1.5">📡 Sensores</h4>
          <div className="hidden xl:grid grid-cols-[100px_140px_110px_120px_80px_2fr_30px] gap-2 text-[10.5px] text-slate-400 mb-1">
            <span>ID</span><span>Tipo</span><span>Tópico</span><span>Field</span><span>t_ref ms</span><span>Parámetros del tipo</span><span />
          </div>
          {sensores.map((r) => (
            <div key={r.uid} className="grid xl:grid-cols-[100px_140px_110px_120px_80px_2fr_30px] grid-cols-2 gap-2 items-start mb-2 xl:mb-1 border-b xl:border-0 border-slate-50 pb-2 xl:pb-0">
              <input value={r.id} disabled={bloqueado || !r.nuevo} placeholder={r.nuevo ? 's_nuevo' : ''}
                onChange={(e2) => updSensor(r.uid, { id: e2.target.value.trim() })} className={claseSch(r, 'id')} />
              <select value={r.tipo} disabled={bloqueado || r.borrada}
                onChange={(e2) => updSensor(r.uid, { tipo: e2.target.value })} className={claseSch(r, 'tipo')}>
                <option value="" />
                {TIPOS_SENSOR.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <input value={r.topic} disabled={bloqueado || r.borrada} list={`ag-topicos-${r.uid}`}
                onChange={(e2) => updSensor(r.uid, { topic: e2.target.value.trim() })} className={claseSch(r, 'topic')} />
              <datalist id={`ag-topicos-${r.uid}`}>
                {topicos.filter((t) => t.id && !t.borrada).map((t) => <option key={t.uid} value={t.id} />)}
              </datalist>
              <input value={r.field} disabled={bloqueado || r.borrada}
                onChange={(e2) => updSensor(r.uid, { field: e2.target.value.trim() })} className={claseSch(r, 'field')} />
              <input value={r.tref} disabled={bloqueado || r.borrada} placeholder={r.nuevo ? '60000' : ''} inputMode="numeric"
                onChange={(e2) => updSensor(r.uid, { tref: e2.target.value.trim() })} className={claseSch(r, 'tref')} />
              <div className="flex flex-wrap gap-1.5 col-span-2 xl:col-span-1">
                {(SENSOR_SPECS[r.tipo] || []).map((f) => (
                  <label key={f.k} className="text-[10px] text-slate-400 flex flex-col gap-0.5">
                    {f.l}
                    {(f.c === 'sel' || f.c === 'b') ? (
                      <select value={String(r.params?.[f.k] ?? '')} disabled={bloqueado || r.borrada}
                        onChange={(e2) => updSensor(r.uid, { params: { ...r.params, [f.k]: e2.target.value } })}
                        className={claseSch(r, 'extra', 'min-w-[70px]')}>
                        {(f.c === 'b' ? ['true', 'false'] : f.opts).map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input value={String(r.params?.[f.k] ?? '')} disabled={bloqueado || r.borrada} placeholder={f.d || 'req'}
                        onChange={(e2) => updSensor(r.uid, { params: { ...r.params, [f.k]: e2.target.value.trim() } })}
                        className={claseSch(r, 'extra', 'w-20')} />
                    )}
                  </label>
                ))}
                {r.passthru && <span className="text-[10px] text-slate-300 self-end" title={JSON.stringify(r.passthru)}>+{Object.keys(r.passthru).length} clave(s) preservada(s)</span>}
              </div>
              <button onClick={() => bajaSensor(r)} disabled={bloqueado || (r.nuevo && !r.id && !r.field && !r.extra && !r.tipo)}
                title={r.nuevo ? 'Limpiar' : (r.borrada ? 'Deshacer la baja' : 'Dar de baja (del_sensor al grabar)')}
                className="text-slate-400 hover:text-red-500 disabled:opacity-30 text-sm justify-self-end xl:justify-self-auto">✕</button>
            </div>
          ))}
          <p className="text-[10.5px] text-slate-400 mt-1">Al elegir el tipo, los parámetros se re-formatean con los campos y defaults exactos del firmware; el JSON se arma solo.</p>
        </div>
      </div>

      {/* ============ 3 · CONFIGURAR ============ */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 mb-3">
        <h3 className="text-sm font-semibold text-slate-700 mb-2">3 · Configurar</h3>
        {avisosTodos.length > 0 && (
          <div className="mb-2 text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
            {avisosTodos.map((a, i) => <div key={i}>⚠ {a}</div>)}
          </div>
        )}
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <button onClick={grabar} disabled={bloqueado || !comandosTodos.length}
            className="px-6 py-3 text-sm font-medium bg-coop-azul text-white rounded-xl hover:opacity-90 disabled:opacity-40">
            {grabando ? '⏳ Grabando…' : `💾 Grabar cambios${comandosTodos.length ? ` (${comandosTodos.length})` : ''}`}
          </button>
          {!!comandosTodos.length && !grabando && (
            <button onClick={() => { setCampos({ ...orig }); setAviso(''); leerSchema().catch(() => {}); }}
              className="px-3 py-2 text-xs border border-slate-300 rounded-lg text-slate-500 hover:border-slate-400">
              Descartar cambios
            </button>
          )}
          <span className="text-[11px] text-slate-400">
            {bloqueado && !orig ? 'Se habilita al conectar y leer la placa.' : comandosTodos.length ? 'Lo ámbar es lo que se graba — antes de enviar vas a ver la lista exacta de comandos.' : 'Sin cambios pendientes: editá un campo y se marca en ámbar.'}
          </span>
        </div>
        <div className="mt-3">
          <div className="flex justify-between text-[11px] mb-0.5">
            <span className={cfgProg?.ok ? 'text-emerald-600 font-medium' : 'text-slate-500'}>
              {cfgProg?.ok ? '✓ Finalizado exitosamente — configuración grabada y VALIDADA releyendo la placa' : cfgProg ? cfgProg.txt : 'Sin grabado en curso'}
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
      </div>

      {/* ============ 4 · MODO AVANZADO: MONITOR ============ */}
      <div className="bg-white border border-slate-200 rounded-xl p-3">
        <h3 className="text-sm font-semibold text-slate-700 mb-2">4 · Modo avanzado: monitor del proceso de lectura y configuración</h3>
        {terminal}
        <p className="text-[11px] text-slate-400 mt-1.5">Todo lo que el formulario lee y graba pasa por acá, comando por comando. Para operar a mano, cambiá a «Terminal libre» en el selector de firmware.</p>
      </div>

      {/* Vista previa de comandos antes de grabar (transparencia total; las
          credenciales van enmascaradas EN PANTALLA, nunca en el cable). */}
      {confirmar && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-[60]" onMouseDown={(e) => e.target === e.currentTarget && (confirmar.resolve(false))}>
          <div className="bg-white rounded-xl w-full max-w-lg p-5" onClick={(e2) => e2.stopPropagation()}>
            <h3 className="font-semibold mb-1">💾 Grabar {confirmar.comandos.length} cambio{confirmar.comandos.length === 1 ? '' : 's'}</h3>
            <p className="text-xs text-slate-400 mb-2">Estos comandos exactos se envían a la placa, en este orden:</p>
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 font-mono text-[11px] text-slate-700 max-h-64 overflow-y-auto">
              {confirmar.comandos.map((cmd, i) => <div key={i}>{mostrarCmd(cmd)}</div>)}
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
