// Ayuda · Asistente IA — REGLA DEL MÉTODO (28/09): toda ola que cambie este módulo
// actualiza esta página EN EL MISMO zip. El formato lo renderiza AyudaPanel.
export default {
  "id": "asistente",
  "titulo": "Asistente IA",
  "intro": "Preguntale al tablero en lenguaje natural: responde con datos reales y te dice qué consultó.",
  "secciones": [
    {
      "titulo": "El criterio",
      "parrafos": [
        "Los datos que ve el asistente se filtran según TU perfil: cada uno puede preguntar solo sobre lo que puede ver. La conversación no se guarda — se pierde al salir de la solapa."
      ]
    },
    {
      "titulo": "¿Cómo hago…?",
      "recetas": [
        {
          "q": "Preguntar",
          "pasos": [
            "Escribí y mandá con Enter (Shift+Enter hace salto de línea).",
            "Ejemplos: «¿Cuántas horas se destinaron a Reconecta este año?», «¿Cómo está el pipeline comercial?».",
            "Cada respuesta muestra al pie qué datos consultó."
          ]
        },
        {
          "q": "Configurar la clave de la API",
          "pasos": [
            "Engranaje ⚙ (solo manager): se valida con una llamada de prueba y se guarda cifrada.",
            "La clave se muestra siempre enmascarada; «Quitar clave» pide confirmación."
          ],
          "rol": "manager"
        }
      ]
    }
  ]
};
