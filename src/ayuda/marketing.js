// Ayuda · Marketing — REGLA DEL MÉTODO (28/09): toda ola que cambie este módulo
// actualiza esta página EN EL MISMO zip. El formato lo renderiza AyudaPanel.
export default {
  "id": "marketing",
  "titulo": "Marketing",
  "intro": "El material y la planificación de marketing: calendario mensual con Booster, eventos, repositorio de marca y la administración de la landing pública.",
  "secciones": [
    {
      "titulo": "El criterio por solapa",
      "items": [
        "PLANIFICACIÓN: el mes visible con su calendario de piezas por canal (Feed, Historia, LinkedIn, Mailing). El flujo: Booster sube su documento del mes y carga ideas → conducción aprueba → se programan con fecha → pasan al calendario.",
        "EVENTOS: las piezas y archivos de los eventos del año.",
        "MARCA: el repositorio permanente (Manual, Logos, Videos, Imágenes) con subcarpetas. Todos suben; renombrar/borrar carpetas es curaduría de conducción.",
        "LANDING: la administración de la web pública de Cooptech (ver su sección abajo)."
      ]
    },
    {
      "titulo": "¿Cómo hago…?",
      "recetas": [
        {
          "q": "Subir el documento de planificación del mes (Booster)",
          "pasos": [
            "Planificación → elegí el mes → bloque «📝 Documento del mes».",
            "«＋ Subir Word/PDF» o arrastrá el archivo. Queda «Pendiente de revisión».",
            "Si conducción lo observa, el comentario aparece abajo del archivo: subí la versión corregida (queda arriba, con el historial completo)."
          ]
        },
        {
          "q": "Aprobar u observar el documento del mes",
          "pasos": [
            "En el bloque: «✓ Aprobar» (queda el chip verde con quién y cuándo) o «⚠ Observar» con el comentario de qué corregir.",
            "«↺ Quitar aprobación» lo devuelve a pendiente."
          ],
          "rol": "gestor"
        },
        {
          "q": "Cargar y programar ideas",
          "pasos": [
            "En «💡 Ideas»: «＋ idea» con canal, formato y título.",
            "El tilde ✓ la aprueba; «📅 Programar» le pone fecha y la pasa al calendario."
          ]
        },
        {
          "q": "Editar la landing pública",
          "pasos": [
            "Solapa Landing: se edita un BORRADOR (guarda solo) con Portada, Quiénes somos (KPIs), Productos, Clientes, Entrevistas, Reconocimientos (carrusel de ADN, ordenado por año), Sustentabilidad y Contacto y textos (link de «Agendá tu reunión», mail, redes, y los títulos/bajadas de cada sección — vacío usa el texto por defecto de la web).",
            "Los archivos se eligen de Marca con el selector (nunca copias); el ojo «Visible» oculta sin borrar; el orden es por flechas o arrastre.",
            "La web NO ve nada de esto hasta publicar."
          ]
        },
        {
          "q": "Publicar la landing",
          "pasos": [
            "Botón «Publicar en la web» (doble click de confirmación).",
            "Valida lo visible CON NOMBRE (si a una ficha le falta el logo, te dice cuál).",
            "«Versiones» lista el historial y permite republicar una versión anterior (rollback).",
            "«Ver cambios» compara el borrador contra lo publicado."
          ],
          "rol": "gestor"
        },
        {
          "q": "Descargar la planificación como Word",
          "pasos": [
            "Botón «⬇ Word» junto al selector de mes: exporta el mes con las ideas incluidas."
          ]
        }
      ]
    },
    {
      "titulo": "Conviene saber",
      "items": [
        "Formatos aceptados al subir: imágenes, video mp4, PDF, Word (doc/docx) y comprimidos. Más de 90 MB sube en partes (tope 500 MB).",
        "Los archivos de más de 90 MB y los videos conviene subirlos desde Marca; el selector de la Landing sube solo imágenes.",
        "La sección Clientes de la Landing puede sembrarse con «Traer los de la carpeta Logos Clientes».",
        "Publicada la primera versión de la landing, la web muestra SOLO la lista curada de clientes (ya no la carpeta entera)."
      ]
    }
  ]
};
