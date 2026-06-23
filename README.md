# Frontend — Tablero de Mando Cooptech

Interfaz del Tablero Cooptech. Hecha con Vite + React + Tailwind.
Se conecta al backend (la API) que levantaste por separado.

## Qué necesitás

- **Node.js 20 o superior** (el mismo que usaste para el backend).
- El **backend corriendo** (en `http://localhost:4000` o en tu túnel).

## Cómo levantarlo

```bash
# 1. Copiá la configuración de ejemplo
cp .env.example .env

# 2. (Opcional) Si tu backend NO está en localhost:4000, editá VITE_API_URL en el .env

# 3. Instalá dependencias
npm install

# 4. Arrancá
npm run dev
```

Abrí **http://localhost:5173**. Vas a ver el panel de verificación:
si dice "Conectado correctamente" y muestra tu usuario, el frontend ya habla con la API.

## Estado actual

Por ahora esto es solo la **base**: el proyecto, la conexión con la API y la verificación.
El tablero completo (grilla, Kanban, CRM, etc.) se trae en los próximos pasos, reemplazando
el guardado en el navegador por llamadas a esta API.

## Estructura

- `src/api/` — la comunicación con el backend:
  - `client.js` — el envío de pedidos (maneja la dirección, el token y los errores).
  - `index.js` — los métodos por recurso (leads, proyectos, etc.).
  - `auth.js` — el token de sesión.
- `src/App.jsx` — por ahora, el panel de verificación.
