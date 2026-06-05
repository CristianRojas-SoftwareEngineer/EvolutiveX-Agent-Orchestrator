# Análisis cross-platform: mecanismo de copia a `%LOCALAPPDATA%`

## Pregunta de investigación

¿Es necesario copiar los assets de notificación a `%LOCALAPPDATA%\AIAssistant\` para que funcionen
en Windows, o pueden cargarse directamente desde el directorio `assets/notifications/` del repo?

La motivación para eliminar el mecanismo de copia es simplificar la implementación y evitar la
dependencia en un directorio del sistema operativo (cuya ruta puede cambiar si el usuario renombra
su carpeta de usuario o mueve el perfil).

---

## Hipótesis original del código

El comentario en `src/2-services/notifications/asset-paths.ts` dice:

```
// la ó de Proyectos hace que las Windows Shell APIs fallen al resolver el icono
```

Esto es **factualmente incorrecto**: "Proyectos" no lleva tilde. La hipótesis real no estaba
documentada; la preocupación legítima sería los **espacios** en `Smart Code Proxy`.

---

## Ruta bajo análisis

```
C:\Users\Cristian\Desktop\Proyectos\Smart Code Proxy\assets\notifications\
```

Características de esta ruta:
- Contiene espacios (`Smart Code Proxy`)
- Todos los caracteres son ASCII estándar (no hay acentos ni caracteres no-ASCII)

---

## Experimentos empíricos

Fecha: 2026-06-05. Sistema: Windows 11 Home, Node.js v24.13.1.

Los tres experimentos se ejecutaron en secuencia con el usuario presente para observar cada
notificación visual.

### EXP 1 — Flag `-p` (body image) desde repo path

**Mecanismo probado**: SnoreToast `-p <ruta>` → imagen del cuerpo del toast.

**Comando ejecutado**:
```
snoretoast-x64.exe
  -t "EXP 1A — repo path"
  -m "Body image desde repo (con espacios en la ruta)"
  -p "C:\Users\Cristian\Desktop\Proyectos\Smart Code Proxy\assets\notifications\events\task-created.png"
  -appID AIAssistant.Proxy
```

**Resultado**: ✅ La imagen apareció correctamente en el cuerpo del toast.

**Conclusión**: SnoreToast invoca `CreateProcess` directamente (vía `cp.execFile`, no shell), por lo
que los espacios en la ruta son manejados correctamente por el sistema operativo sin necesidad de
rutas estables.

---

### EXP 2 — Registro de Windows (`Icon` / `IconUri`) desde repo path

**Mecanismo probado**: Valores `Icon` e `IconUri` en
`HKCU\Software\Classes\AppUserModelId\AIAssistant.Proxy` apuntando al repo.

**Configuración temporal**:
```
Icon    = C:\Users\Cristian\Desktop\Proyectos\Smart Code Proxy\assets\notifications\ai-assistant.ico
IconUri = C:\Users\Cristian\Desktop\Proyectos\Smart Code Proxy\assets\notifications\ai-assistant.png
```

**Resultado**: ✅ El ícono de AI Assistant apareció correctamente en el encabezado del toast.

**Conclusión**: Las Windows Shell APIs que leen el registro para resolver el ícono del AUMID
manejan correctamente rutas con espacios.

---

### EXP 3 — Escenario completo sin LOCALAPPDATA

**Mecanismo probado**: Registro + `.lnk` `IconLocation` + `-p`, todo apuntando al repo simultáneamente.

**Configuración temporal**:
```
Registro Icon    = C:\Users\...\Smart Code Proxy\assets\notifications\ai-assistant.ico
Registro IconUri = C:\Users\...\Smart Code Proxy\assets\notifications\ai-assistant.png
.lnk IconLocation = C:\Users\...\Smart Code Proxy\assets\notifications\ai-assistant.ico,1
SnoreToast -p    = C:\Users\...\Smart Code Proxy\assets\notifications\events\task-created.png
```

**Resultado**: ✅ El ícono del encabezado y la imagen del cuerpo aparecieron correctamente.

**Conclusión**: El escenario completo sin ninguna copia a LOCALAPPDATA funciona en Windows 11
cuando la ruta sólo contiene espacios (ASCII).

---

## Hallazgos consolidados

| Mecanismo | LOCALAPPDATA necesario | Con repo path |
|---|---|---|
| Body image (`-p` flag) | No | ✅ Funciona |
| Header icon (registro `Icon`/`IconUri`) | No | ✅ Funciona |
| Header icon (`.lnk` `IconLocation`) | No | ✅ Funciona |
| Escenario completo (los tres simultáneos) | No | ✅ Funciona |

**El mecanismo de copia a `%LOCALAPPDATA%` no es necesario cuando la ruta del repo sólo contiene
espacios y caracteres ASCII.**

---

## Caveats y límites del experimento

1. **Sólo se probó en Windows 11**. Windows 10 y versiones anteriores podrían tener diferencias en
   cómo las Windows Shell APIs resuelven el ícono del AUMID.

2. **La ruta del repo no contiene caracteres no-ASCII**. Si el usuario instalara el repo en una
   ruta con caracteres fuera del rango ASCII (ej. `C:\Développement\`, `C:\用户\`), el
   comportamiento podría ser diferente. Los experimentos no cubren ese caso.

3. **La ruta del repo no se mueve**. El mecanismo LOCALAPPDATA ofrece un path estable aunque el
   repo se mueva o renombre. Con repo path directo, mover el repo invalida el registro y el `.lnk`.
   Esto requiere `--install` de nuevo tras cualquier cambio de ubicación del repo.

4. **El `%LOCALAPPDATA%` tampoco es garantía de estabilidad absoluta**: puede cambiar si el usuario
   renombra su carpeta de usuario o si cambia el perfil de Windows. El argumento de "path estable"
   aplica igualmente a LOCALAPPDATA como al repo path.

---

## Arquitectura simplificada propuesta

Si se elimina el mecanismo de copia, la implementación resultante sería:

```
assets/notifications/
├── ai-assistant.ico       ← fuente de verdad para registro + .lnk
├── ai-assistant.png       ← fuente de verdad para registro (IconUri)
└── events/
    ├── task-created.png   ← resuelto directamente por resolveEventImagePath()
    ├── task-completed.png
    └── ...

--install
  ├── writeRegistry(aumid, displayName, repoIcoPath, repoPngPath)
  └── installSnoreToastShortcut(lnkFileName, targetExe, aumid, repoIcoPath)

runtime (resolveEventImagePath)
  └── return join(REPO_EVENTS_DIR, filename)  ← sin sync, sin copia
```

Archivos eliminables si se adopta esta simplificación:
- `src/2-services/notifications/asset-paths.ts` (constantes STABLE_*)
- Lógica de copia en `register.ts` (`ensureStableAssets`, `ensureStableEventAssets`, `copyFileIfChanged`)
- `src/2-services/notifications/event-image-paths.ts` (`syncEventImageFromRepoIfStale`)
- Directorio `%LOCALAPPDATA%\AIAssistant\` dejaría de crearse

---

## Recomendación

Eliminar el mecanismo de copia a LOCALAPPDATA para los assets de eventos (`events/*.png`), cuyo
único uso es `-p <ruta>`. Los experimentos confirman que espacios en la ruta no impiden el
funcionamiento.

Para los assets de branding (`.ico` / `.png` usados en registro y `.lnk`), también es seguro usar
la ruta del repo directamente bajo el supuesto de que la ruta sólo contiene ASCII (que aplica en
este proyecto: `Smart Code Proxy` sólo tiene espacios).

**Precaución a documentar en el Change**: si en el futuro el repo se instala en una ruta con
caracteres no-ASCII, habría que volver a validar o aplicar una estrategia de escape/encode diferente.
