# Por qué los assets se instalaban en `%LOCALAPPDATA%\AIAssistant\` (nota histórica)

> **Estado (2026-06-05)**: Este mecanismo **fue eliminado** en el change
> `remove-notification-asset-cache`. Los experimentos empíricos documentados en
> `docs/issues/cross-platform-analisys.md` demostraron que las rutas del repo con espacios
> funcionan correctamente para `-p`, el registro de AUMID y el `.lnk`. Ver ese documento
> para los hallazgos completos.

## Arquitectura actual (post-change)

Todos los assets apuntan directamente al repo. No hay copia a `%LOCALAPPDATA%`.

```
npm run notifications:register -- --install
          │
          ▼
  writeRegistry(aumid, DISPLAY_NAME, getIconIcoPath(), getIconPngPath())
  installSnoreToastShortcut(...)  ← .lnk apunta al .ico del repo
```

El registro de Windows y el `.lnk` del Menú Inicio usan directamente:

```
<repo>/assets/notifications/ai-assistant.ico   ← registro + IconLocation del .lnk
<repo>/assets/notifications/ai-assistant.png   ← IconUri del toast
<repo>/assets/notifications/events/*.png       ← imágenes por evento (resolveEventImagePath)
```

## Por qué existió el mecanismo original (incorrecto)

El comentario original en código afirmaba que la ruta del repo contiene caracteres no-ASCII
("Proyectos" con tilde). Esto es incorrecto: "Proyectos" no lleva tilde. La ruta sí contiene
**espacios** (`Smart Code Proxy`), pero las APIs de Windows y SnoreToast manejan espacios
correctamente (confirmado empíricamente; ver `docs/issues/cross-platform-analisys.md`).

## Archivos eliminados / simplificados

| Acción       | Archivo                                               |
| ------------ | ----------------------------------------------------- |
| ELIMINADO    | `src/2-services/notifications/asset-paths.ts`         |
| SIMPLIFICADO | `src/2-services/notifications/event-image-paths.ts`   |
| SIMPLIFICADO | `src/2-services/notifications/cli.ts`                 |
| SIMPLIFICADO | `src/2-services/notifications/register.ts`            |
| SIMPLIFICADO | `src/2-services/notifications/snoretoast-shortcut.ts` |
