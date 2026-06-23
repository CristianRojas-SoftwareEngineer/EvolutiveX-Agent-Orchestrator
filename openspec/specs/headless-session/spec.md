### Requirement: Sesión headless aislada por provider
El módulo `headless-session` SHALL proveer una función `runHeadlessSession(opts)` que lance
un proxy Smart Code Proxy en un puerto dedicado, ejecute `claude -p` apuntando a ese proxy,
y devuelva el resultado, garantizando que ninguna de las dos operaciones mute
`~/.claude/settings.json`, `configs/.env`, ni interfiera con el proxy principal.

#### Scenario: Sesión exitosa con provider explícito
- **WHEN** se invoca `runHeadlessSession({ provider: 'anthropic', prompt: '...', port: 8788 })`
- **THEN** el proxy arranca en el puerto 8788 con la configuración del provider inyectada por entorno
- **THEN** `claude -p` apunta a `http://127.0.0.1:8788` sin leer `~/.claude/settings.json`
- **THEN** la función devuelve `{ output, exitCode, isError, logPath, sessionDir, claudeStartedAt }`
- **THEN** el proxy queda detenido al finalizar, independientemente de si hubo error

#### Scenario: Guard de aislamiento de puerto
- **WHEN** el `port` especificado coincide con el puerto del proxy principal (`configs/.env`)
- **THEN** `runHeadlessSession` rechaza la llamada con un error antes de arrancar nada

#### Scenario: Timeout de sesión claude
- **WHEN** `claude -p` no termina dentro de `claudeTimeoutMs` (default 180 000 ms)
- **THEN** el proceso claude es terminado y la función devuelve `{ isError: true, exitCode: 1 }`
- **THEN** el proxy igualmente queda detenido

#### Scenario: Proxy no disponible tras health check
- **WHEN** el proxy no responde en `/health` dentro de `healthTimeoutMs` (default 30 000 ms)
- **THEN** la función devuelve `{ isError: true }` sin intentar lanzar `claude -p`

### Requirement: Inyección de entorno extra para escenarios de test
`runHeadlessSession` SHALL aceptar un campo `extraProxyEnv` que sobreescriba variables de
entorno del proceso proxy de test, permitiendo simular condiciones controladas sin alterar
la configuración global.

#### Scenario: Escenario de clave TTS ausente
- **WHEN** se pasa `extraProxyEnv: { OPENROUTER_SECRETS_PATH: '/nonexistent/path' }`
- **THEN** el proxy arranca con esa variable sobreescrita
- **THEN** el comportamiento del proxy bajo esa condición es observable en los logs del test

### Requirement: Logs y auditoría separados del proxy principal
Las sesiones headless SHALL escribir logs en un archivo separado del log principal
(`server/logs.jsonl`) y sesiones de auditoría en un directorio distinto de `sessions/`.

#### Scenario: Paths por defecto
- **WHEN** no se especifican `logFile` ni `auditDir`
- **THEN** los logs van a `server/logs-headless.jsonl`
- **THEN** la auditoría va a `sessions/headless/`

#### Scenario: Paths configurados
- **WHEN** se especifican `logFile` y `auditDir` en las opciones
- **THEN** el proxy usa exactamente esos paths sin fallback

### Requirement: Módulos genéricos accesibles por path directo
Los módulos `proxy-lifecycle`, `run-claude`, `provider-env` y `env-utils` SHALL residir en
`scripting/headless/session-lib/` y ser importables por path para consumidores que necesiten
control fino del ciclo de vida (como la suite TTS existente).

#### Scenario: Importación directa de primitivo
- **WHEN** un consumidor importa `from './headless-session/proxy-lifecycle.js'`
- **THEN** obtiene `startProxy`, `stopProxy`, `waitHealth`, `killProcessOnPort`, `sleep`, `getLogPath`
- **THEN** la compilación TypeScript resuelve los tipos correctamente
