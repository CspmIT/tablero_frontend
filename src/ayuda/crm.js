// Ayuda · CRM — REGLA DEL MÉTODO (28/09): toda ola que cambie este módulo
// actualiza esta página EN EL MISMO zip. El formato lo renderiza AyudaPanel.
export default {
  "id": "crm",
  "titulo": "CRM",
  "intro": "El embudo comercial: leads de Contacto a Ganado, con presupuestadores por producto, métricas de conversión y la agenda de contactos.",
  "secciones": [
    {
      "titulo": "El criterio",
      "parrafos": [
        "Cada oportunidad es una tarjeta que se arrastra entre etapas (Contacto → Oportunidad → Visita Técnica → Propuesta → Negociación → Trial → Ganado). Perdidos y declinados quedan ocultos por defecto.",
        "Solapas: Embudo (el tablero), Cuentas (todas las oportunidades por organización), Novedades (lo de esta semana + tus notas) y Contactos (la agenda)."
      ]
    },
    {
      "titulo": "¿Cómo hago…?",
      "recetas": [
        {
          "q": "Cargar un lead",
          "pasos": [
            "«+ Lead». Obligatorios: organización, al menos un producto, fuente y responsable.",
            "La tarjeta arranca en la etapa que elijas; después se arrastra."
          ]
        },
        {
          "q": "Ganar un lead",
          "pasos": [
            "Arrastrá la tarjeta a «Ganado»: se abre «Ganar lead».",
            "Completá Razón Social y CUIT; podés elegir plantillas y cantidad de equipos.",
            "«Ganar y crear proyecto» genera las tarjetas en el backlog del Kanban.",
            "La fecha de ganado se completa sola (editable): define el mes del ingreso en la sección Ingresos.",
            "Si el lead incluye Reconecta o +Agua, queda además como «Pendiente de crear» en Operaciones → Gestión de Organizaciones y Usuarios (no se crea nada solo: el alta la hace una persona con el formulario precargado)."
          ]
        },
        {
          "q": "Presupuestar CON lead",
          "pasos": [
            "Abrí el lead: según producto y etapa aparecen los botones (Reconecta y Presupuesto +Agua desde Propuesta; Relevamiento +Agua desde Visita Técnica; CoopCloud siempre).",
            "El presupuestador guarda solo (autosave) EN el lead: cualquiera que abra ese lead ve lo mismo.",
            "Descargar el PDF actualiza el Valor (US$) del lead."
          ]
        },
        {
          "q": "Presupuestar SIN lead",
          "pasos": [
            "Usá los tres badges de producto bajo las solapas del Embudo.",
            "Reconecta y +Agua sin lead no quedan guardados en ningún lado (son de exploración).",
            "El badge CoopCloud abre el SIMULADOR GLOBAL de precios: una definición compartida en el servidor — lo que guarda la conducción lo ven todos igual."
          ]
        },
        {
          "q": "Publicar los precios de CoopCloud en la web",
          "pasos": [
            "Abrí el simulador global (badge CoopCloud sin lead).",
            "Revisá la solapa Monómicos.",
            "Tocá «Publicar precios en la web» y confirmá con el segundo click.",
            "La web pública muestra la última publicación — nunca el simulador en vivo."
          ],
          "rol": "gestor"
        },
        {
          "q": "Registrar actividad y tareas de seguimiento",
          "pasos": [
            "Dentro del lead: registrá visitas/videollamadas/eventos con «Registrar».",
            "Las tareas de seguimiento se completan con el círculo ✓ (con resultado opcional); una próxima acción vencida se ve en rojo con ⚠.",
            "«Agendar videollamada» crea el evento con Teams e impacta en la grilla de los involucrados."
          ]
        },
        {
          "q": "Corregir un contacto",
          "pasos": [
            "Solapa Contactos: el lápiz edita en línea.",
            "Los contactos con chip azul «CRM» viven en el lead: editarlos acá corrige el lead.",
            "Esta agenda alimenta el «+ Agregar desde Contactos» al invitar externos a reuniones."
          ]
        },
        {
          "q": "Atender una consulta que llegó desde la landing",
          "pasos": [
            "Botón «Consultas web» en la barra del CRM (el globito naranja marca cuántas hay nuevas). También llega un push («CRM: consulta web», se apaga en Configuración → Notificaciones).",
            "Cada consulta trae organización, contacto y el detalle técnico que cargó el visitante (la configuración del simulador CoopCloud, los reconectadores o las plantas de agua).",
            "«Convertir en lead» abre el formulario +Lead PRECARGADO (fuente Web, detalle en las notas): completás lo que falte y al guardar la consulta queda convertida y vinculada.",
            "«Descartar» (con confirmación) saca el spam sin ensuciar las métricas; se puede restaurar desde «Todas»."
          ]
        }
      ]
    },
    {
      "titulo": "Conviene saber",
      "items": [
        "Eliminar un lead y configurar Outlook/Teams es solo del manager.",
        "Las métricas (botón «Métricas») calculan conversión, monto ganado, ticket promedio y tiempo de aprobación sobre el período elegido.",
        "Importar de Kommo (.xlsx) está en el engranaje; lo que no tiene campo propio va a las notas del lead.",
        "Las credenciales de Outlook se guardan cifradas y no se vuelven a mostrar; un punto ámbar/rojo en el engranaje avisa que el secreto vence."
      ]
    }
  ]
};
