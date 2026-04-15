# 🚀 Fastify + TypeScript SOLID API

Un robusto esqueleto de servidor Backend moderno para Node.js. Utiliza **Fastify** (extremadamente veloz) y **TypeScript**, ensamblado desde cero bajo requerimientos estrictos enfocados en arquitecturas profesionales limpias y paralelizables.

---

## 🏛 Arquitectura SOLID

El proyecto destierra prácticas de acoplamiento rígido, optando por una división clara de responsabilidades. La carpeta `src` está estructurada para mantener flujos unidireccionales de datos:

- **`index.ts`** — *El Gatillo*: Punto de entrada puro responsable de encender el servidor.
- **`app.ts`** — *El Chasis*: Configuración inicial, middleware y cargador maestro de rutas (Agrupa plugins globales).
- **`routes/`** — *La Antena*: Define netamente QUÉ url direcciona a QUÉ controlador. Nada más.
- **`controllers/`** — *El Recepcionista*: Traduce el objeto Request de Fastify, invoca lógicas abstractas, y responde códigos HTTP. (Jamás toca directamente el negocio).
- **`services/`** — *El Corazón*: Solo lógica de negocio pura. Los verdaderos responsables de qué sucede con los datos o cómo muta la base de datos subyacente.
- **`interfaces/`** — *Los Contratos*: Archivos `.ts` que declaran modelos permitiendo Inversión de Dependencias entre quienes proveen información y quienes la reclaman.

---

## ⚙️ Workflows & Scripts

Este proyecto integra un motor de _Pipelines_ en tiempo de desarrollo. Todos están basados en el archivo `package.json` y se dividen según tu ciclo de trabajo diario:

### 🛠 Entorno de Desarrollo (Local Workflow)
Comandos pensados para programar día a día en modo local.

| Script | Descripción Integral |
|--------|----------------|
| `npm run help` | **(START HERE)** Un poderoso comando interactivo a nivel local que lista y explica de forma coloreada absolutamente todos los posibles *npm scripts* y las rutinas a ejecutar en terminal al programador ingresante en el pipeline actual. |
| `npm run dev` | Inicia tu entorno de desarrollo local vivo. Usa `ts-node` bajo el capó para interpretar TypeScript nativamente y ahorrar tiempo al no crear pesados achivos físicos JS. Responde por defecto en `http://localhost:3000`. |
| `npm run lint` | Eje vertebral de calidad. Usa ESLint (parser TS) para escanear y quejar en frío la lógica de todo tu código (`src/**/*.ts`). Avisa tipos prohibidos (ej. `any`) o variables no usadas. |
| `npm run lint:fix` | ¡Reparación mágica! Realiza el mismo scan de ESLint, pero intenta aplicar automáticamente las reparaciones estructurales y de indentación en todo el proyecto. |
| `npm run format` | Dispara el formateador espartano oficial (Prettier). Lee todo tu repositorio y reasigna los espacios, llaves, líneas max. y tabulaciones para una consistencia universal entre programadores del equipo. |

---

### 📦 Entorno de Producción (CI/CD Workflow)
Comandos agresivos que se asumen listos para ser despachados a Producción real.

| Script | Descripción Integral |
|--------|----------------|
| `npm run build` | Toma el servidor y lo compila óptimamente. Internamente primero ejecuta `clean:dist` (para purgar la memoria anterior evitando condiciones de carrera o Race Conditions), y luego coordina con `concurrently` dos hilos en paralelo: <br> • **[1] `build:js`**: Utiliza `tsup` (esbuild) generando Javascript crudo extra-veloz a CJS dentro de `dist/`. <br> • **[2] `build:types`**: Utiliza `tsc` emitiendo las validaciones rígidas del contrato general de TypeScript sin chocar con herramientas transitorias. |
| `npm start` | Corre directo en los clústers o contenedores. Apunta a la carpeta fría de salida en lugar de TypeScript. (`node dist/index.js`). |

---

### 🧹 Limpieza y Mantenimiento Avanzado (Troubleshooting Flow)
Cuando el gestor NPM pierde la cabeza con un módulo, la memoria de variables colisiona y VS Code marca falsos positivos, utiliza estos comandos de recuperación en tu terminal en este preciso orden:

| Script | Explicación |
|--------|-------------|
| `npm run clean:dist` | Elimina quirúrgicamente y rápido toda la carpeta autogenerada `/dist` usando capacidades nativas de NodeJS. |
| `npm run clean:modules` | Aniquila el enorme cache descargado dentro de `/node_modules`. |
| `npm run clean` | **Botón de Pánico.** Paraleliza el uso de `dist` y `modules` al unísono destruyéndolos de un sablazo. Luego de correr este script, tu proyecto es casi una carpeta vacía que solo requiere de nuevo el uso clásico de `npm install`. |

---

## 📡 Endpoints (API REST Básica)

La API levanta bajo el puerto estandarizado `3000`. Como regla arquitectónica el versionado principal usa de prefijo: `/api/v1/items`.

| Categoría | Método | Base | ID/Params | Descripción Funcional | Payload/Body Típico |
|:---:|:---:|---|---|---|---|
| Lectura | **GET** | `/` | *-* | Devuelve un listado genérico de de objetos `Item` activos en tabla. | `(Vacío)` |
| Lectura Única | **GET** | `/:id` | `:id` alfanumérico | Rastrea en cache local el ítem que coincida con ese ID exacto. Devuelve 404 si falla. | `(Vacío)` |
| Creación | **POST** | `/` | *-* | Ingresa e hidrata un nuevo elemento a memoria, devolviendo un ID autogenerado. | `{"name":"Laptop", "price": 1500}` |
| Modificación | **PUT** | `/:id` | `:id` alfanumérico | Reemplaza destructivamente (overwrite total) los datos de la entidad referenciada por su ID. | `{"name":"MacBook", "price": 1500}` |
| Borrado | **DELETE** | `/:id` | `:id` alfanumérico | Retira irrevocablemente de sistema al ítem seleccionado. Devuelve estatus `204`. | `(Vacío)` |

---
*Desarrollo propulsado por Modelos Estrictos (Antigravity).*
