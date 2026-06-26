## 1. Fix readSentinel — aceptar change null en fase explorer

- [ ] 1.1 Localizar en `scripting/openspec/enforce-auto-pipeline.mts` la función o bloque `readSentinel` que valida el campo `change` del sentinel
- [ ] 1.2 Modificar la validación para que `change: null` (o ausente) sea aceptado cuando `mode === 'auto'` y el sentinel contiene `phase` y `stage` válidos correspondientes a la fase explorer (stage 1)
- [ ] 1.3 Mantener la validación estricta de `change` como string no vacío para cualquier fase posterior (stage ≥ 2)

## 2. Fix applyEffect writeHalt — borrar sentinel tras escribir halt

- [ ] 2.1 Localizar en `scripting/openspec/enforce-auto-pipeline.mts` el case `writeHalt` dentro de la función `applyEffect` (o el envoltorio equivalente que ejecuta el efecto)
- [ ] 2.2 Añadir `fs.rmSync(sentinelPath, { force: true })` (o `unlinkSync` con manejo silencioso del error) inmediatamente después de escribir `auto-pipeline.halt.json`
- [ ] 2.3 Verificar que el borrado del sentinel es fire-and-forget: si el archivo ya no existe el error se ignora sin propagar

## 3. Tests

- [ ] 3.1 Localizar el archivo de tests `tests/scripting/openspec/enforce-auto-pipeline.test.ts` (o el equivalente en el proyecto)
- [ ] 3.2 Añadir caso de test (a): sentinel con `change: null` y `phase: 'explorer'` es aceptado por `readSentinel` y el backstop opera normalmente (no retorna null)
- [ ] 3.3 Añadir caso de test (b): tras ejecutar el efecto `writeHalt`, `auto-pipeline.json` no existe en disco y `auto-pipeline.halt.json` sí existe; la siguiente invocación del hook no genera halt permanente
- [ ] 3.4 Ejecutar la suite de tests existente y verificar que todos los casos previos siguen pasando
