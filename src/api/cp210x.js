// Driver CP210x (Silicon Labs) sobre WebUSB — el puente para usar AutonomIA
// desde el CELULAR (14/08, caso de campo de Leonardo: técnicos sin notebook).
//
// Por qué existe: en Chrome de Android el picker de Web Serial APARECE pero
// solo lista puertos serie BLUETOOTH — el serie por cable USB no está
// soportado en Android ("No se encontraron dispositivos compatibles" con la
// placa enchufada). WebUSB SÍ está soportado, y nuestras placas usan el
// puente CP2102 de Silicon Labs (VID 0x10C4 / PID 0xEA60, confirmado en la
// captura de Leonardo). Este módulo habla el protocolo vendor del CP210x por
// control transfers (el mismo que usa el driver de las apps de terminal de
// Android) y expone la MISMA interfaz que un SerialPort de Web Serial:
// open({baudRate,...}) / close() / readable / writable / setSignals() /
// getInfo() — así el CLI, el sniffer y esptool-js (Transport) lo usan SIN
// tocar su código. En PC no se usa: ahí va el Web Serial nativo.
//
// Protocolo CP210x (AN571 de Silicon Labs):
//   IFC_ENABLE(0x00)  habilitar UART
//   SET_BAUDRATE(0x1E) 4 bytes LE con el baudrate
//   SET_LINE_CTL(0x03) bits: dataBits<<8 | parity<<4 | stopBits
//   SET_MHS(0x07)      DTR/RTS con máscara (bits 0/1 valor, 8/9 máscara)
//   PURGE(0x12)        limpiar FIFOs

const IFC_ENABLE = 0x00;
const SET_LINE_CTL = 0x03;
const SET_MHS = 0x07;
const PURGE = 0x12;
const SET_BAUDRATE = 0x1e;

export const soportaWebUsb = () => typeof navigator !== 'undefined' && 'usb' in navigator;

export class PuertoCp210x {
  constructor(device) {
    this.device = device;
    this.readable = null;
    this.writable = null;
    this._abierto = false;
    this._ifNum = 0;
    this._epIn = null;
    this._epOut = null;
  }

  // Compatibilidad con SerialPort.getInfo() (esptool-js lo usa para tracing).
  getInfo() {
    return { usbVendorId: this.device.vendorId, usbProductId: this.device.productId };
  }

  _ctrl(request, value, data) {
    return this.device.controlTransferOut(
      { requestType: 'vendor', recipient: 'interface', request, value, index: this._ifNum },
      data,
    );
  }

  async open({ baudRate = 115200, dataBits = 8, parity = 'none', stopBits = 1 } = {}) {
    const d = this.device;
    await d.open();
    if (d.configuration === null) await d.selectConfiguration(1);
    const intf = d.configuration.interfaces[0];
    this._ifNum = intf.interfaceNumber;
    await d.claimInterface(this._ifNum);
    const alt = intf.alternate || intf.alternates[0];
    this._epIn = alt.endpoints.find((e) => e.direction === 'in').endpointNumber;
    this._epOut = alt.endpoints.find((e) => e.direction === 'out').endpointNumber;
    await this._ctrl(IFC_ENABLE, 1);
    await this._ctrl(SET_BAUDRATE, 0, new Uint32Array([Number(baudRate) || 115200]).buffer);
    const par = parity === 'even' ? 2 : parity === 'odd' ? 1 : 0;
    const stop = Number(stopBits) === 2 ? 2 : 0;
    await this._ctrl(SET_LINE_CTL, ((Number(dataBits) || 8) << 8) | (par << 4) | stop);
    await this._ctrl(SET_MHS, 0x0300); // DTR y RTS explícitamente SUELTOS (no resetear ESP32)
    try { await this._ctrl(PURGE, 0x000f); } catch { /* opcional */ }
    this._abierto = true;
    this._armarStreams();
  }

  _armarStreams() {
    const d = this.device;
    const epIn = this._epIn;
    const epOut = this._epOut;
    const self = this;
    this.readable = new ReadableStream({
      async pull(controller) {
        try {
          const r = await d.transferIn(epIn, 4096); // resuelve cuando llegan datos
          if (r.status === 'stall') { await d.clearHalt('in', epIn); return; }
          if (r.data && r.data.byteLength) {
            controller.enqueue(new Uint8Array(r.data.buffer, r.data.byteOffset, r.data.byteLength));
          }
        } catch (e) {
          // Cierre deseado → fin prolijo. Falla real (desenchufe) → readable
          // queda en null ANTES de errar, así los loops `while (port.readable)`
          // (CLI/sniffer/esptool) salen en vez de reintentar para siempre.
          if (self._abierto) {
            self.readable = null;
            try { controller.error(e); } catch { /* ya cancelado */ }
          } else {
            try { controller.close(); } catch { /* ya cerrado */ }
          }
        }
      },
      cancel() { /* el corte real lo hace close() al cerrar el device */ },
    });
    this.writable = new WritableStream({
      async write(chunk) {
        const buf = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
        await d.transferOut(epOut, buf);
      },
    });
  }

  // SET_MHS con máscara: se puede tocar DTR y RTS por separado (igual que
  // SerialPort.setSignals). Bits 0/1 = valores, bits 8/9 = qué escribir.
  async setSignals({ dataTerminalReady, requestToSend } = {}) {
    let v = 0;
    if (dataTerminalReady !== undefined) v |= 0x0100 | (dataTerminalReady ? 0x0001 : 0);
    if (requestToSend !== undefined) v |= 0x0200 | (requestToSend ? 0x0002 : 0);
    if (v) await this._ctrl(SET_MHS, v);
  }

  async close() {
    this._abierto = false;
    // Cerrar el device rechaza cualquier transferIn pendiente (los streams
    // terminan solos); después se sueltan las referencias.
    try { await this._ctrl(IFC_ENABLE, 0); } catch { /* */ }
    try { await this.device.releaseInterface(this._ifNum); } catch { /* */ }
    try { await this.device.close(); } catch { /* */ }
    this.readable = null;
    this.writable = null;
  }
}

// Picker de WebUSB filtrado a Silicon Labs (CP2101/2/4…). Devuelve un puerto
// con cara de SerialPort, listo para el CLI, el sniffer o esptool-js.
export async function pedirPuertoCp210x() {
  const device = await navigator.usb.requestDevice({ filters: [{ vendorId: 0x10c4 }] });
  return new PuertoCp210x(device);
}
