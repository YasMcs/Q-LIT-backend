import { GoogleGenAI } from '@google/genai';
import { getCatalogs } from './catalog.service.js';
import dotenv from 'dotenv';
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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
1. Genera un escenario narrativo muy breve y directo (MÁXIMO 3 oraciones).
2. Plantea el problema usando las tablas y columnas reales del esquema proporcionado.
3. NO incluyas la respuesta SQL ni ejemplos de código.
4. MUY IMPORTANTE: NO menciones, no enlistes y no hagas ninguna referencia a las palabras clave o funciones SQL requeridas. Simplemente plantea el problema de negocio.
5. DEBES generar también un código SQL válido (DML) de tipo INSERT que inserte los datos necesarios para que el estudiante pueda hacer la práctica.
6. Devuelve tu respuesta ÚNICAMENTE en un formato JSON válido con la siguiente estructura, sin comillas Markdown de bloque de código \`\`\`json:
{
  "historia": "El escenario narrativo aquí...",
  "setup_sql": "INSERT INTO tabla (col1, col2) VALUES ('val1', 'val2');"
}
`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    return response.text;
  } catch (error) {
    console.error("Error al generar enunciado con Gemini:", error);
    // Fallback in case of AI error
    return JSON.stringify({
      historia: `Problema técnico: No se pudo generar la historia personalizada. Por favor, resuelve el siguiente objetivo: ${description}`,
      setup_sql: ""
    });
  }
};
