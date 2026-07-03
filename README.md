# Q-LIT: Plataforma de Laboratorio Interactivo de Bases de Datos

Bienvenido a **Q-LIT**, una plataforma educativa orientada a servicios (SOA) disenada para revolucionar la ensenanza de SQL. El sistema esta dividido en dos capas principales: un Frontend (Next.js) y un Backend (Express.js), garantizando alta cohesion y bajo acoplamiento.

## Documentacion del Proyecto

Para cumplir con los criterios de evaluacion, la documentacion tecnica detallada se ha dividido de forma modular:

1. **[Contrato de API (API Specification)](./api_spec_db.md):** Detalle exhaustivo de endpoints, payloads, codigos HTTP, manejo de errores y modelos de base de datos.
2. **[Arquitectura y Seguridad](./tech_stack_security.md):** Explicacion del Stack Tecnologico, justificacion de librerias, y la implementacion de controles de seguridad (Rate Limiting, CORS, JWT, BFF).
3. **[Requerimientos de Base de Datos](./PROYECTO_INTEGRADOR_BD.md):** Justificacion tecnica sobre el uso de JOINs, Vistas (Views) y modelado de datos exigidos por la rubrica.

---

## Guia de Instalacion y Ejecucion

El proyecto puede ser ejecutado localmente siguiendo estos pasos:

### 1. Prerrequisitos
- **Node.js** (v18 o superior)
- **NPM** o Yarn
- Instancia de PostgreSQL (Neon) y MySQL (Aiven) para los catalogos.

### 2. Configuracion del Backend (/backend-api)
1. Navega a la carpeta del backend: cd backend-api
2. Instala dependencias: 
pm install
3. Crea un archivo .env en la raiz de ackend-api basado en .env.example con las siguientes variables:
   `env
   PORT=4000
   DATABASE_URL="postgresql://usuario:password@host/neondb?sslmode=require"
   MYSQL_URL="mysql://usuario:password@host:port/defaultdb"
   GEMINI_API_KEY="tu_api_key_de_google_gemini"
   FRONTEND_URL="http://localhost:3000"
   `
4. Sincroniza la base de datos (Prisma): 
px prisma db push
5. Ejecuta el servidor: 
pm run dev

### 3. Configuracion del Frontend (/next-app-js)
1. Navega a la carpeta del frontend: cd next-app-js
2. Instala dependencias: 
pm install
3. Crea un archivo .env con las variables de autenticacion y proxy:
   `env
   NEXTAUTH_URL="http://localhost:3000"
   NEXTAUTH_SECRET="tu_secreto_super_seguro"
   GOOGLE_CLIENT_ID="tu_google_client_id"
   GOOGLE_CLIENT_SECRET="tu_google_client_secret"
   BACKEND_API_URL="http://localhost:4000"
   BACKEND_API_KEY="super-secret-api-key-123"
   `
4. Ejecuta el entorno de desarrollo: 
pm run dev

---

## Declaracion de Uso de IA y Recursos Externos

En cumplimiento estricto con las politicas de evaluacion de este proyecto integrador, el equipo declara de manera transparente lo siguiente:

1. **Uso de Asistencia por IA en el Desarrollo:** Se utilizo inteligencia artificial (Gemini/Antigravity) como herramienta de *Pair Programming* para acelerar la maquetacion de componentes React, optimizar las consultas complejas de Prisma ORM, refinar la estructura de seguridad (helmet, express-rate-limit) y estructurar los archivos Markdown de documentacion. Todo el codigo generado por IA fue adaptado, revisado y estructurado segun la arquitectura SOA y logica de negocio definida exclusivamente por el equipo estudiantil.
2. **Motor de IA Integrado (Feature del Sistema):** La plataforma consume activamente la API oficial de **Google Gemini** para la evaluacion en tiempo real de sentencias SQL escritas por los estudiantes. Esto no es codigo autogenerado para construir el proyecto, sino una caracteristica funcional (feature) del sistema evaluador.
3. **Plantillas y Librerias Externas:** La interfaz fue construida con componentes estandar de HTML/CSS/Tailwind. No se utilizaron plantillas pre-fabricadas de terceros. Las unicas librerias de terceros empleadas son de infraestructura tecnologica (Next.js, Express, Prisma, NextAuth, Helmet, CORS), debidamente justificadas en la documentacion arquitectonica.

> Toda la autoria logica, el diseno de la base de datos, los casos de uso, la integracion de servicios y el esfuerzo colaborativo (evidenciado en el historial de Git) corresponden 100% al equipo desarrollador.
