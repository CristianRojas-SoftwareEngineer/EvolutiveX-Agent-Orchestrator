## 1. Script de enforcement del hook Stop

- [ ] 1.1 Crear `scripting/openspec/enforce-auto-pipeline.mts` con las interfaces exportadas: `AutoPipelineSentinel` (doble nivel: `phase`, `stage`, `lastProgressKey`), `StopHookPayload`, `DecisionInput`, `DecisionEffect`, `Decision`
- [ ] 1.2 Implementar la constante exportada `DEFAULT_LOOP_GUARD_THRESHOLD = 3`
- [ ] 1.3 Implementar la función pura exportada `decideAutoPipeline(input: DecisionInput): Decision` con las cinco ramas (a) sin sentinel, (b) halt presente, (c) change archivado, (d) loop-guard con clave compuesta `lastProgressKey === "phase#stage"`, (e) pipeline en vuelo
- [ ] 1.4 Implementar el envoltorio de efectos `applyEffect(root, decision)`: `deleteSentinel` (rama c), `writeHalt` con `{ reason: "loop-guard", releasedAt, phase, stage }` (rama d), `persistSentinel` atómico write-to-tmp+rename (rama e)
- [ ] 1.5 Implementar `main()` con lectura de stdin, parseo del payload `StopHookPayload`, construcción del `DecisionInput`, llamada a `decideAutoPipeline`, aplicación de efectos y emisión del `{ decision: "block", reason }` si corresponde; todo envuelto en try/catch externo que nunca bloquea
- [ ] 1.6 Añadir el guard de entrypoint que ejecuta `main()` solo cuando el script se invoca directamente (no al importar desde tests); resolución de `repoRoot` desde `import.meta.url`

## 2. Suite de tests vitest

- [ ] 2.1 Crear `tests/scripting/openspec/enforce-auto-pipeline.test.ts` con la estructura base de suite vitest
- [ ] 2.2 Añadir test: rama (a) — sin sentinel, retorna allow
- [ ] 2.3 Añadir test: rama (b) — halt presente, retorna allow
- [ ] 2.4 Añadir test: rama (c) — change bajo archive (sin prefijo de fecha), retorna allow + efecto deleteSentinel
- [ ] 2.5 Añadir test: rama (c) — change bajo archive con prefijo de fecha `YYYY-MM-DD--<change>`, retorna allow + efecto deleteSentinel
- [ ] 2.6 Añadir test: rama (d) — `stopHookActive && lastProgressKey === "phase#stage"`, incrementa stuckCount; bajo umbral retorna block
- [ ] 2.7 Añadir test: rama (d) — stuckCount supera umbral (3), retorna allow + efecto writeHalt con `reason: "loop-guard"` y campos `phase` y `stage`
- [ ] 2.8 Añadir test: progreso vía cambio de `phase` (`stage` constante) — `lastProgressKey` cambia, stuckCount se reinicia a 0
- [ ] 2.9 Añadir test: progreso vía cambio de `stage` (`phase` constante) — `lastProgressKey` cambia, stuckCount se reinicia a 0
- [ ] 2.10 Añadir test: congelamiento de phase Y stage simultáneo — `lastProgressKey` no cambia, stuckCount se incrementa
- [ ] 2.11 Añadir test: error interno del envoltorio — la función retorna allow sin lanzar (rama de catch)
- [ ] 2.12 Verificar que los tests pasan con `npm run test -- tests/scripting/openspec/enforce-auto-pipeline.test.ts`

## 3. Integración con el harness

- [ ] 3.1 Editar `configs/hooks.json`: añadir segunda entrada en el array `Stop` invocando `scripting/openspec/enforce-auto-pipeline.mts` con el mismo patrón `npx --prefix ROOT tsx RUTA` que las demás entradas; el array `SubagentStop` no se toca
- [ ] 3.2 Editar `.gitignore`: añadir la línea `openspec/.workbench/` para excluir el estado de sesión efímero del control de versiones

## 4. Documentación de los agentes

- [ ] 4.1 Editar `.claude/agents/orchestrate-specification-delta.md` sección `<sentinel_schema>`: añadir el campo `lastProgressKey` con su tipo, formato y ownership ("subagente activo, atómico con stage")
- [ ] 4.2 Editar `.claude/agents/orchestrate-specification-delta.md` sección `<backstop>`: cambiar "Implementation status" de "no implementado" a "implementado", añadiendo referencia al script `scripting/openspec/enforce-auto-pipeline.mts`
- [ ] 4.3 Editar `.claude/agents/planner-specification-delta.md` (y revisar explorer, implementer, closer) sección `<sentinel_writes>`: documentar que al escribir `stage` también se escribe `lastProgressKey="#"` atómicamente (write-to-tmp + rename)

## 5. Spec canónica

- [ ] 5.1 Ejecutar `npm run openspec:synchronize -- --change "c00081-auto-pipeline-backstop"` para promover el delta-spec a `openspec/specs/pipeline-auto-continuation/spec.md`
