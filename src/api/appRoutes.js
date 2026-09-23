// URL del backend de cada producto de Cooptech.
//
// Mismo archivo, con el mismo nombre y la misma forma, que ya existe en
// CoopTech-2, reconecta-desktop, mas-agua-front y OvInterna. Se mantiene así a
// propósito: cuando se muda un producto de servidor hay que tocar la misma
// tabla en todos lados, y que se llamen distinto sólo complica encontrarla.
//
// Hace falta porque dar de alta un usuario no termina en Cooptech: cada
// producto guarda sus usuarios en el esquema del cliente (schema_name), y hay
// que avisarle llamando a su propio /relationUserCooptech.

const local = import.meta.env.VITE_ENTORNO === 'local';

export const front = {
  Cooptech: local ? 'http://localhost:8081' : 'https://cooptech.com.ar',
  'Oficina Virtual': local ? 'http://localhost:8082' : 'https://oficinainterna.cooptech.com.ar',
  Reconecta: local ? 'http://localhost:8082' : 'https://reconecta.cooptech.com.ar',
  'Mas Agua': local ? 'http://localhost:1420' : 'https://masagua.cooptech.com.ar',
  Centinela: local ? 'http://localhost:8082' : 'https://centinela.cooptech.com.ar',
  Cloud: local ? 'http://localhost:8082' : 'https://cloud.cooptech.com.ar',
  Provision: local ? 'http://localhost:8082' : 'https://cloud.cooptech.com.ar',
  Nucleo: local ? 'http://localhost:8082' : 'https://nucleo.cooptech.com.ar',
};

export const backend = {
  Cooptech: local ? 'http://localhost:8000/api' : 'https://cooptech.com.ar/api',
  'Oficina Virtual': local ? 'http://localhost:4000/api' : 'https://oficinainterna.cooptech.com.ar/api',
  Reconecta: local ? 'http://localhost:4000/api' : 'https://reconecta.cooptech.com.ar/api',
  'Mas Agua': local ? 'http://localhost:4000/api' : 'https://masagua.cooptech.com.ar/api',
  Centinela: local ? 'http://localhost:4000/api' : 'https://centinela.cooptech.com.ar/api',
  Cloud: local ? 'http://localhost:4000/api' : 'https://cloud.cooptech.com.ar/api',
  Provision: local ? 'http://localhost:4000/api' : 'https://provision.cooptech.com.ar/api',
  Nucleo: local ? 'http://localhost:4000/api' : 'https://nucleo.cooptech.com.ar/api',
};

// Productos a los que se les puede dar de alta un usuario desde acá. El Tablero
// queda afuera a propósito: sus usuarios son los colaboradores y no tiene un
// /relationUserCooptech.
export const tieneBackend = (nombreProducto) => !!backend[nombreProducto];
