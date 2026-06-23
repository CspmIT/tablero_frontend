import { useState, useEffect } from 'react';
import { getImage } from '../api/minio.js';

// Resuelve el valor de `foto` a una URL usable en <img src>.
//  - data:/blob:/http(s):  → se usa tal cual (incluye fotos base64 "legacy").
//  - cualquier otra cosa    → se trata como un key del gateway y se descarga
//                             (con auth) para armar un objectURL local.
// Devuelve null mientras carga o si no hay foto.
export function useFotoSrc(foto) {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    if (!foto) { setSrc(null); return; }
    if (/^(data:|blob:|https?:)/.test(foto)) { setSrc(foto); return; }

    let cancelado = false;
    let creado;
    getImage(foto)
      .then((u) => {
        if (cancelado) { URL.revokeObjectURL(u); return; }
        creado = u;
        setSrc(u);
      })
      .catch(() => { if (!cancelado) setSrc(null); });

    return () => { cancelado = true; if (creado) URL.revokeObjectURL(creado); };
  }, [foto]);

  return src;
}

// Avatar/imagen que resuelve `foto` y, si no hay, muestra `fallback` (iniciales, etc.).
export default function FotoImg({ foto, alt = '', fallback = null, imgClassName = 'w-full h-full object-cover' }) {
  const src = useFotoSrc(foto);
  if (src) return <img src={src} alt={alt} className={imgClassName} />;
  return fallback;
}
