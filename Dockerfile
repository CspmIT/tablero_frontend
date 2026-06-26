# ---- Build Stage ----
# Vite 8 requiere Node 20.19+ / 22+; usamos 22-alpine.
FROM node:22-alpine AS build
WORKDIR /app

# Build-args: Vite "inyecta" estas variables en el bundle (import.meta.env.VITE_*).
# Deben pasarse en build-time (no sirve setearlas en runtime con nginx).
ARG VITE_API_URL
ARG VITE_ENTORNO
ARG VITE_MINIO_URL
ARG VITE_MINIO_BUCKET
ARG VITE_MINIO_ACCESS
ARG VITE_MINIO_SECRET

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_ENTORNO=$VITE_ENTORNO
ENV VITE_MINIO_URL=$VITE_MINIO_URL
ENV VITE_MINIO_BUCKET=$VITE_MINIO_BUCKET
ENV VITE_MINIO_ACCESS=$VITE_MINIO_ACCESS
ENV VITE_MINIO_SECRET=$VITE_MINIO_SECRET

COPY package*.json ./
# --legacy-peer-deps: @vitejs/plugin-react@4 declara peer vite<=7, pero el
# proyecto usa vite@8 (funciona en runtime; sólo el resolver estricto lo rechaza).
RUN npm ci --legacy-peer-deps

COPY . .
RUN npm run build

# ---- Runtime Stage ----
FROM nginx:alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
# Config de Nginx para servir la SPA (fallback a index.html).
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
