// Ayuda · Francos — REGLA DEL MÉTODO (28/09): toda ola que cambie este módulo
// actualiza esta página EN EL MISMO zip. El formato lo renderiza AyudaPanel.
export default {
  "id": "francos",
  "titulo": "Francos",
  "intro": "El saldo de francos del año de cada integrante: carry + guardias + especiales + cumpleaños − tomados.",
  "secciones": [
    {
      "titulo": "¿Cómo hago…?",
      "recetas": [
        {
          "q": "Cargar un franco especial",
          "pasos": [
            "En «Francos especiales»: colaborador, fecha y motivo (p. ej. «viaje de instalación +24 hs») → «Agregar».",
            "Borrar pide confirmación."
          ]
        },
        {
          "q": "Ajustar el arrastre del año anterior",
          "pasos": [
            "Editá el «Carry» directamente en la tarjeta (acepta medios días); guarda al salir del campo."
          ]
        }
      ]
    },
    {
      "titulo": "Conviene saber",
      "items": [
        "Una guardia suma francos recién cuando TERMINÓ su semana; la guardia en curso todavía no cuenta.",
        "El franco de cumpleaños se habilita cuando ya pasó la fecha (se carga en Fechas especiales).",
        "Los «tomados» salen de los días marcados Franco o Franco cumpleaños en la grilla.",
        "Un total negativo se ve en rojo."
      ]
    }
  ]
};
