import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const DB_SCHEMAS_MOCK = {
  punto_venta_db: `
    Tabla: productos (sku INT PK, articulo VARCHAR, precio NUMERIC, stock INT)
  `,
  control_escolar_db: `
    Tabla: alumnos (id_alumno INT PK, nombre VARCHAR, materia VARCHAR, grupo CHAR)
  `,
  hospital_central_db: `
    Tabla: citas (id_cita INT PK, fecha DATE, hora TIME, especialidad VARCHAR)
  `
};

export const generateUniqueProblem = async (description, requiredFunctions, activeDb) => {
  try {
    const dbSchema = DB_SCHEMAS_MOCK[activeDb] || "Esquema genérico no definido";

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
5. Devuelve el texto en formato PLANO. Está ESTRICTAMENTE PROHIBIDO usar Markdown (sin asteriscos \`**\`, sin negritas, sin viñetas).
`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    return response.text;
  } catch (error) {
    console.error("Error al generar enunciado con Gemini:", error);
    // Fallback in case of AI error
    return `Problema técnico: No se pudo generar la historia personalizada. Por favor, resuelve el siguiente objetivo: ${description}`;
  }
};
