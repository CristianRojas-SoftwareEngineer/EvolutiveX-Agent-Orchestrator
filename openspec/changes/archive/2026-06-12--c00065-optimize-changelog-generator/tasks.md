## 1. Reescritura del script generate-changelog

- [x] 1.1 Leer `scripting/generate-changelog` completo para tomar el estado actual como línea base
- [x] 1.2 Reescribir el script con una sola invocación de `git log --pretty=format:'%D|%s|%as'` (refs, subject y fecha en una pasada)
- [x] 1.3 Implementar la clasificación en memoria: acumular entradas por sección (Added/Changed/Fixed/Documentation) y por bloque de release (detectando límites de tag a partir de los refs de la pasada única)
- [x] 1.4 Eliminar los argumentos `--pending` y `--case`: si se pasan, terminar con exit code 1 y mensaje descriptivo
- [x] 1.5 Eliminar el uso de `%(trailers:key=Case,valueonly)` y la lógica de emisión de `(Case: X)`
- [x] 1.6 Añadir comentario en el script documentando explícitamente que `chore`, `test`, `build`, `ci`, `style` se descartan por diseño (Keep a Changelog)
- [x] 1.7 Verificar manualmente que el script genera output correcto ejecutándolo y revisando `CHANGELOG.md`

## 2. Script de instalación del hook post-commit

- [x] 2.1 Crear `scripting/install-changelog-hook` (script bash ejecutable) que escriba `.git/hooks/post-commit` con el contenido del hook y lo marque como ejecutable (`chmod +x`)
- [x] 2.2 El contenido del hook debe: invocar `scripting/generate-changelog`, hacer `git add CHANGELOG.md`, y ejecutar `git commit --amend --no-edit --no-verify`
- [x] 2.3 Hacer idempotente la instalación: si `.git/hooks/post-commit` ya existe, reemplazarlo sin error
- [x] 2.4 Ejecutar `scripting/install-changelog-hook` para instalar el hook localmente y verificar que `.git/hooks/post-commit` existe con permisos correctos

## 3. Regeneración y sincronización del CHANGELOG

- [x] 3.1 Ejecutar `scripting/generate-changelog` para regenerar `CHANGELOG.md` al estado actual del historial git
- [x] 3.2 Revisar el `CHANGELOG.md` generado: verificar que las secciones son correctas, que no aparecen entradas `(Case: X)`, y que el formato es válido Keep a Changelog

## 4. Documentación

- [x] 4.1 Actualizar `README.md` con una nota sobre el hook `post-commit`: que no se versiona en git y debe reinstalarse con `scripting/install-changelog-hook` tras cada clone

## 5. Commit y cierre

- [x] 5.1 Commitear `scripting/generate-changelog` (reescritura), `scripting/install-changelog-hook` (nuevo), y `CHANGELOG.md` (regenerado) en un único commit con mensaje descriptivo
