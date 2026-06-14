# Q-LIT Backend API

Este es el microservicio backend para Q-LIT, construido en Node.js y Express (ES Modules), aplicando una **Arquitectura de 4 Capas** y siguiendo las mejores prácticas de desarrollo de APIs RESTful.

## Arquitectura

El proyecto está dividido estrictamente en capas para separar responsabilidades:

1. **Routes (`/src/routes`)**: Define el contrato público de la API (Métodos HTTP y URLs). Solo se encargan de enrutar la petición.
2. **Controllers (`/src/controllers`)**: Actúan como traductores. Reciben la petición HTTP (`req`), extraen los parámetros, invocan al Servicio, y retornan la respuesta con los *Status Codes* correspondientes (200, 201, 400).
3. **Services (`/src/services`)**: Contienen las reglas y validaciones de negocio. Son código puro de JavaScript, agnóstico de HTTP.
4. **Repositories (`/src/repositories`)**: Encargados exclusivos del acceso a datos (ej. Base de Datos).

## Configuración y Ejecución

1. Clona el repositorio y navega a esta carpeta.
2. Instala las dependencias:
   ```bash
   npm install
   ```
3. Ejecuta el servidor en modo desarrollo:
   ```bash
   npm run dev
   ```

El servidor correrá por defecto en `http://localhost:4000`.

## Pruebas (Health Check)

Puedes probar que el servidor y la arquitectura funcionan haciendo una petición GET a la ruta de prueba:

**Endpoint:** `GET /api/health`

**Respuesta Exitosa (200 OK):**
```json
{
  "status": "OK",
  "message": "Servicio de Q-LIT funcionando correctamente",
  "timestamp": "2026-06-13T20:39:41.000Z"
}
```
