# Dockerización — Smart Code Proxy

Guía para construir y ejecutar la imagen de producción del proxy.

## Artefactos

| Archivo | Propósito |
| --- | --- |
| `containerization/Dockerfile` | Imagen multi-etapa: compila TypeScript y deja solo runtime en la imagen final. |
| `containerization/.dockerignore` | Excluye del contexto de build artefactos locales y secretos (`node_modules`, `dist`, `sessions`, `configs/.env`, etc.). Con [Docker BuildKit](https://docs.docker.com/build/buildkit/) (motor por defecto desde Docker 23.0+), este archivo se asocia al `Dockerfile` del mismo directorio aunque el contexto de build sea la raíz del repo. |

## Diseño de la imagen

- **Multi-etapa:** la etapa `builder` ejecuta `npm ci` y `npm run build`; la etapa final copia `dist/`, `package.json`, `package-lock.json` (si existe), instala dependencias de producción y copia `configs/` (sin `.env`, excluido por `.dockerignore`).
- **Base:** `node:24-alpine`.
- **Usuario:** el proceso corre como `node` (no root).
- **Auditoría:** `WORKDIR` `/app`; las sesiones se escriben en `/app/sessions` (volumen declarado para persistencia externa).
- **Puerto:** `EXPOSE 8787` (configurable con la variable `PORT`).
- **Salud:** `HEALTHCHECK` periódico contra `http://localhost:8787/health` (mismo puerto por defecto que `PORT`).

## Requisitos previos

1. Docker con el daemon en ejecución.
2. Archivo de entorno en el host (no va dentro de la imagen):

   ```bash
   cp configs/.env.example configs/.env
   ```

   En PowerShell:

   ```powershell
   Copy-Item configs/.env.example configs/.env
   ```

   Edita `configs/.env` (como mínimo `UPSTREAM_ORIGIN` y, si aplica, credenciales del upstream). El comando de arranque del contenedor es `node dist/index.js` — equivalente a `npm start`: **no carga** `configs/.env` desde disco dentro del contenedor; las variables deben inyectarse con `--env-file` o `-e` (véase [`configs/.env.example`](../configs/.env.example)).

3. No hace falta ejecutar `npm ci` ni `npm run build` en el host antes del build: la compilación ocurre dentro de la etapa `builder` del `Dockerfile`.

## Comandos

### Construir (desde la raíz del repositorio)

```bash
docker build -f containerization/Dockerfile -t smart-code-proxy:latest .
```

### Ejecutar

Mapea el puerto del host al del contenedor (8787 por defecto) y monta `sessions/` para no perder auditoría al recrear el contenedor.

**Bash / Git Bash:**

```bash
docker run -it --rm -p 8787:8787 \
  -v "$(pwd)/sessions:/app/sessions" \
  --env-file configs/.env \
  smart-code-proxy:latest
```

**PowerShell:**

```powershell
docker run -it --rm -p 8787:8787 `
  -v "${PWD}/sessions:/app/sessions" `
  --env-file configs/.env `
  smart-code-proxy:latest
```

Si en `configs/.env` defines otro `PORT`, ajusta el mapeo (ejemplo `PORT=9000` → `-p 9000:9000`).

Para ejecución en segundo plano, añade `-d` y omite `-it`.

### CI/CD

- Construye la imagen en el pipeline con el mismo `docker build` anterior.
- No incluyas `configs/.env` ni secretos en la imagen ni en el contexto de build; usa secret stores o variables del pipeline y pásalas al `docker run` / orquestador (`--env-file`, variables de entorno del manifiesto, etc.).

## Buenas prácticas

- Mantén `containerization/.dockerignore` alineado con lo que no debe entrar en el contexto (`sessions/`, `dist/`, `node_modules/`, `configs/.env`, documentación, etc.).
- No embebas secretos en el `Dockerfile`.
- `sessions/` puede contener datos sensibles; el volumen montado debe tener permisos acotados en el host.
- Para desarrollo con recarga en caliente, usa `npm run dev` en el host (véase [`docs/how-to-start.md`](../docs/how-to-start.md)); reconstruir la imagen en cada cambio de código no es práctico.

## Extensiones

Si necesitas plantillas de despliegue (Docker Compose, Kubernetes), colócalas bajo `containerization/` con la misma convención de rutas y documenta aquí los comandos equivalentes.
