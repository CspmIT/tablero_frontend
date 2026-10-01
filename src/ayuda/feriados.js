// Ayuda · Fechas especiales — REGLA DEL MÉTODO (28/09): toda ola que cambie este módulo
// actualiza esta página EN EL MISMO zip. El formato lo renderiza AyudaPanel.
export default {
  "id": "feriados",
  "titulo": "Fechas especiales",
  "intro": "Los feriados del área y los cumpleaños del equipo — la fuente de datos de media aplicación.",
  "secciones": [
    {
      "titulo": "¿Cómo hago…?",
      "recetas": [
        {
          "q": "Cargar los feriados del año",
          "pasos": [
            "«+ Agregar feriado»: fecha y nombre.",
            "Conviene cargar a principio de año todos los nacionales y los especiales del área."
          ],
          "rol": "manager"
        },
        {
          "q": "Cargar un cumpleaños",
          "pasos": [
            "En la lista de Cumpleaños: «Cargar» o «Editar» por persona.",
            "Genera el franco de cumpleaños en Francos."
          ],
          "rol": "manager"
        }
      ]
    },
    {
      "titulo": "Conviene saber",
      "items": [
        "Los feriados alimentan la grilla (pre-asigna el día), la capacidad y ociosidad de Costos, los francos de las guardias y la ociosidad anual de Reportes."
      ]
    }
  ]
};
