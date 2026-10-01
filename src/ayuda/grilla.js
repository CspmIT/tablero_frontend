// Ayuda · Grilla y jornadas — REGLA DEL MÉTODO (28/09): toda ola que cambie este módulo
// actualiza esta página EN EL MISMO zip. El formato lo renderiza AyudaPanel.
export default {
  "id": "grilla",
  "titulo": "Grilla y jornadas",
  "intro": "El corazón del tablero: la jornada de cada colaborador (estado, horario de ingreso, qué hizo, foco semanal), en cinco vistas que comparten el mismo editor del día.",
  "secciones": [
    {
      "titulo": "El criterio",
      "parrafos": [
        "Lo que no está cargado en la grilla NO existe para el resto del tablero: horas por proyecto, costos, métricas y reportes salen de acá. El día se reparte en 8 horas: los ítems con horas cargadas las usan y el resto se divide entre los demás.",
        "Las cinco vistas: Grilla (el equipo completo, semana por semana), Guardias (rotación anual — solo con permiso), Mi semana (tu carga rápida), Mi día (tus reuniones hora a hora) y Mi mes (tu calendario mensual, fin de semana incluido)."
      ]
    },
    {
      "titulo": "¿Cómo hago…?",
      "recetas": [
        {
          "q": "Cargar mi día",
          "pasos": [
            "Tocá la celda del día (o la tarjeta en Mi semana).",
            "Elegí el estado (Presente, Home Office, Vacaciones, Franco…). Con Presente elegí el horario de ingreso (06/07/08/09).",
            "En «Lo que hice hoy», agregá ítems con texto, horas (vacío = comparte el resto del día) y etiquetas («+ tag», con autocompletado).",
            "Guardá. Un «!» ámbar en la celda avisa ítems sin etiqueta: esas horas no suman a horas por proyecto."
          ]
        },
        {
          "q": "Definir el foco de la semana (WIP)",
          "pasos": [
            "En la Grilla, tocá la columna «WIP de la semana» del colaborador.",
            "Cargá el foco planificado y, si querés, el resumen para administración (es el que se ve en Costos).",
            "Guardá. El colaborador lo ve como banner en Mi semana."
          ],
          "rol": "gestor"
        },
        {
          "q": "Crear una reunión",
          "pasos": [
            "Desde el editor del día: «🗓 + Reunión» (o «+ Reunión» en Mi mes).",
            "Elegí participantes (internos y externos — los externos salen de Contactos del CRM).",
            "Se crea en Outlook con link de Teams, se invita a todos y aparece en la grilla de cada participante."
          ]
        },
        {
          "q": "Traer mis reuniones de Outlook",
          "pasos": [
            "En la Grilla, tocá «⇅ Outlook».",
            "Se traen las reuniones de TU Outlook de la semana visible. Apretar el botón es el consentimiento.",
            "Las creadas desde el tablero no se duplican."
          ]
        },
        {
          "q": "Reprogramar o cancelar una reunión",
          "pasos": [
            "En Mi día: arrastrá el bloque (cambia horario) o estirá el borde (duración); al soltar pide confirmación y actualiza Outlook.",
            "En Mi mes: botones «Reprogramar» y «Cancelar» en la lista de próximas reuniones. Cancelar avisa a todos por Outlook.",
            "Solo el organizador o un manager pueden hacerlo; el resto ve 🔒."
          ]
        },
        {
          "q": "Cargar horas extra (incluye sábados/domingos)",
          "pasos": [
            "Abrí el día — en Mi mes podés tocar también un fin de semana.",
            "Marcá «Cargar horas extra» y poné ingreso y salida: el total se calcula solo.",
            "Salen en el reporte «Horas extra» de Reportes."
          ]
        },
        {
          "q": "Planificar las guardias del año",
          "pasos": [
            "En la pestaña Guardias, hacé clic en una celda: rota entre sin guardia → de guardia → vacaciones. Se guarda al instante.",
            "El número de la celda son los francos que suma esa guardia (base 1 + feriados + puentes).",
            "Para que alguien aparezca, activá «Participa de la rotación de guardias» en su ficha de Equipo."
          ]
        }
      ]
    },
    {
      "titulo": "Conviene saber",
      "items": [
        "Los ítems con tag «Oficina Virtual» piden Tipo y Causa en el mismo editor; sin clasificar van a la bandeja de Métricas OV.",
        "El horario «típico» que se ve en gris es solo visual (viene de Grilla Típica en Configuración): no se guarda nada hasta que guardás el día.",
        "Quien está de guardia esa semana aparece con un escudo naranja.",
        "Los usuarios externos (p. ej. RRHH) ven la Grilla en solo lectura.",
        "Mi semana sugiere actividades tuyas del Kanban (movidas a Doing/Done) y del CRM para sumarlas al día con un toque; no duplica lo ya cargado."
      ]
    }
  ]
};
