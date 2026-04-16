# Dockerización - Smart Code Proxy

Este documento describe el enfoque y los pasos recomendados para contenerizar `Smart Code Proxy`.

Ubicación de artefactos:

- `containerization/Dockerfile` — Imagen Docker multi-etapa optimizada para producción.
- `containerization/Dockerfile.dockerignore` — Evita incluir directorios/archivos no deseados en el contexto de build. Sigue la convención de [Docker BuildKit](https://docs.docker.com/build/buildkit/) donde `<nombre-del-Dockerfile>.dockerignore` se asocia automáticamente al Dockerfile del mismo directorio (BuildKit es el motor de build por defecto desde Docker 23.0+).

Diseño y decisiones principales

- Multi-etapa: se compila TypeScript en una etapa `builder` y la imagen final contiene solo los artefactos necesarios (`dist`, `package.json`) y dependencias de runtime.
- Base ligera: `node:24-alpine` para reducir tamaño de imagen.
- Volumen `sessions/`: el directorio de auditoría se monta como volumen para persistencia externa.

Comandos de uso

1. Construir la imagen (desde la raíz del repo):

```bash
docker build -f containerization/Dockerfile -t smart-code-proxy:latest .
```

2. Ejecutar el contenedor (ejemplo, mapeando puerto y persistencia de `sessions`):

```bash
docker run -it --rm -p 8787:8787 -v "$(pwd)/sessions:/app/sessions" --env-file configs/.env smart-code-proxy:latest
```

3. Uso en CI/CD

- Construye la imagen en el pipeline usando el `Dockerfile` centralizado. Mantén `configs/.env` y secretos fuera del repositorio; usa variables de CI o secret stores.

Pautas y buenas prácticas

- No incluir secretos en el `Dockerfile` ni en la imagen.
- Mantener `containerization/Dockerfile.dockerignore` actualizado para evitar subir archivos grandes o sensibles al contexto de build.
- Para desarrollo local, usar `npm run dev` y montar código fuente en un contenedor si se desea hot-reload.

Limpieza temporal

- Antes de construir en entornos limpios, ejecutar `npm ci` localmente en la etapa builder (el `Dockerfile` ya lo realiza).

Si necesitas plantillas adicionales para despliegue (Kubernetes, Docker Compose), añádelas bajo `containerization/` siguiendo la misma convención.
