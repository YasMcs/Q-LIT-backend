import { Type } from '@google/genai';
import { getCatalogs } from './catalog.service.js';
import { generateContentWithRetry } from './ai.service.js';

export const generateUniqueProblem = async (description, requiredFunctions, activeDb) => {
  try {
    const catalogs = await getCatalogs();
    const db = catalogs.find(c => c.name === activeDb);
    
    let dbSchema = "Esquema genérico no definido";
    if (db) {
      dbSchema = db.tables.map(table => {
        const columns = table.columns.map(col => `${col.field} ${col.type}${col.key === 'PRI' ? ' PK' : ''}`).join(', ');
        return `Tabla: ${table.name} (${columns})`;
      }).join('\n');
    }

    const prompt = `
Eres un profesor de SQL de universidad. Tienes que crear un enunciado para una práctica de base de datos.
El objetivo del profesor es el siguiente:
"${description}"

El alumno trabajará sobre la siguiente base de datos:
${dbSchema}

El alumno DEBE utilizar obligatoriamente estas palabras clave/funciones en su consulta SQL:
[${requiredFunctions.join(', ')}]

Instrucciones para ti:
1. Genera un escenario narrativo muy breve y directo (MÁXIMO 2 oraciones).
2. Plantea el problema dividiéndolo en un flujo de OBJETIVOS lógicos que el estudiante debe resolver en orden. Usando las tablas y columnas reales del esquema proporcionado.
3. MUY IMPORTANTE: Los objetivos deben ser EXTREMADAMENTE BREVES y CLAROS (MÁXIMO 1 a 2 oraciones cortas). Ve directo al grano sin textos de relleno.
4. NO incluyas la respuesta SQL ni ejemplos de código en las instrucciones.
5. NO menciones explícitamente palabras clave SQL en la historia general. En los objetivos, puedes sugerir qué hacer (ej. "selecciona", "elimina").
6. DEBES generar también un código SQL válido (DML) de tipo INSERT que inserte los datos necesarios para que el estudiante pueda hacer la práctica.
7. DATOS CONCRETOS Y VALORES REALES: Los objetivos deben contener valores concretos y específicos (nombres reales de autores/estudiantes, IDs específicos, títulos de libros, nuevos números de teléfono, etc.) que coincidan exactamente con los datos que estás insertando en tu "setup_sql". Evita enunciados abstractos como "el ID especificado" o "el nombre deseado". Especifica con precisión los nombres o IDs que el estudiante debe buscar, filtrar o actualizar en su consulta SQL para que sepa exactamente qué escribir.
8. REDACCIÓN NATURAL Y LÓGICA: Redacta los enunciados de manera natural y coherente para un estudiante. Evita textos de plantilla redundantes. Por ejemplo, en lugar de "Lista todos los datos del profesor cuyo nombre coincide exactamente con 'Ana García'", di "Consulta la información de la profesora 'Ana García'". En lugar de "Identifica todas las carreras que tienen como nombre exacto 'Ingeniería de Software'", di "Obtén la información de la carrera 'Ingeniería de Software'".
9. Devuelve tu respuesta ÚNICAMENTE en un formato JSON válido con la siguiente estructura, sin comillas Markdown de bloque de código \`\`\`json:
{
  "historia": "El escenario narrativo aquí...",
  "pasos": [
    {
      "step": 1,
      "instruction": "Instrucción corta y clara para el objetivo 1.",
      "expectedConcept": "SELECT" 
    }
  ],
  "setup_sql": "INSERT INTO tabla (col1, col2) VALUES ('val1', 'val2');"
}
`;

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        historia: {
          type: Type.STRING,
          description: "El escenario narrativo de la práctica."
        },
        pasos: {
          type: Type.ARRAY,
          description: "La lista de pasos/objetivos a resolver.",
          items: {
            type: Type.OBJECT,
            properties: {
              step: {
                type: Type.INTEGER,
                description: "El número secuencial del paso."
              },
              instruction: {
                type: Type.STRING,
                description: "La instrucción corta y clara para este objetivo."
              },
              expectedConcept: {
                type: Type.STRING,
                description: "El concepto SQL esperado, por ejemplo SELECT, WHERE, JOIN, etc."
              }
            },
            required: ["step", "instruction", "expectedConcept"]
          }
        },
        setup_sql: {
          type: Type.STRING,
          description: "Las sentencias SQL (DML) de tipo INSERT para preparar la base de datos."
        }
      },
      required: ["historia", "pasos", "setup_sql"]
    };

    const response = await generateContentWithRetry({
      model: 'gemini-3.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema
      }
    });

    return response.text;
  } catch (error) {
    console.error("Error al generar enunciado con Gemini:", error);
    // Lanzamos el error para que el controlador (submission) falle 
    // y no guarde un texto de error roto en la base de datos.
    // Así, el alumno puede refrescar la página y volver a intentar.
    throw new Error("Lumi (IA) no está disponible en este momento para crear tu enunciado. Por favor, espera unos segundos e intenta ingresar nuevamente.");
  }
};
