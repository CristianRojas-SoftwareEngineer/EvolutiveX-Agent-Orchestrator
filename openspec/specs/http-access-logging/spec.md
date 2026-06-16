# HTTP Access Logging

## Purpose

Plugin de logging HTTP estructurado que emite logs en los hooks `onRequest`, `preValidation` y `onResponse` de Fastify para todas las rutas del proxy. Cada request genera dos o tres entradas de log — `→ incoming request` (headers), `→ incoming request body` (opcional, solo con `LOG_HTTP_BODIES=true`), y `← response sent` — con `reqId` para correlación en `logs.jsonl`.

## Requirements

### Requirement: HTTP access logging plugin MUST be registered for all endpoints

The system MUST register HTTP logger hooks (`onRequest`, `preValidation`, `onResponse`) via `app.addHook` in the root context so they apply to all endpoints (`/health`, `/hooks`, `/proxy/*`, and any other route). The hooks emit structured log entries for every incoming request and every outgoing response. The `httpLoggerPlugin` export serves as a documented grouping interface for future use with `fastify-plugin`.

#### Scenario: Plugin is registered in the app bootstrap
- **WHEN** `buildApp()` is invoked
- **THEN** the resulting Fastify instance MUST have the HTTP logger hooks registered before any route is added
- **AND** every request handled by that instance MUST trigger an `onRequest` log, a `preValidation` log (when `logBodies=true`), and an `onResponse` log

#### Scenario: Request log includes core fields
- **WHEN** a request is received on any endpoint
- **THEN** the system MUST emit a log entry with `reqId`, `method`, and `url` populated
- **AND** the log message MUST be the stable string `→ incoming request`
- **AND** the `body` field MUST NOT appear in this entry (body is logged separately in `preValidation`)

#### Scenario: Response log includes core fields
- **WHEN** a response is sent on any endpoint
- **THEN** the system MUST emit a log entry with `reqId`, `method`, `url`, `statusCode`, and `responseTime` populated
- **AND** the log message MUST be the stable string `← response sent`

### Requirement: Header logging MUST be controllable by configuration

The system MUST allow enabling or disabling request and response header logging via configuration. The configuration MUST default to **enabled** for headers.

#### Scenario: Headers are logged when enabled
- **WHEN** `LOG_HTTP_HEADERS=true` (or the default) is in effect
- **THEN** the `onRequest` log entry MUST include the request `headers` object
- **AND** the `onResponse` log entry MUST include the response `headers` object

#### Scenario: Headers are omitted when disabled
- **WHEN** `LOG_HTTP_HEADERS=false` is in effect
- **THEN** neither the `onRequest` nor the `onResponse` log entry MUST include a `headers` field

### Requirement: Body logging MUST be controllable by configuration

The system MUST allow enabling or disabling request body logging via configuration. The configuration MUST default to **disabled** for bodies to keep normal operation quiet.

#### Scenario: Body is logged when enabled
- **WHEN** `LOG_HTTP_BODIES=true` is in effect
- **AND** a request arrives with a serializable body (JSON or text content type)
- **THEN** the system MUST emit a `preValidation` log entry with message `→ incoming request body`
- **AND** that entry MUST include a `body` field containing the body as a UTF-8 string

#### Scenario: Body is omitted when disabled
- **WHEN** `LOG_HTTP_BODIES=false` (or the default) is in effect
- **THEN** the system MUST NOT emit a `→ incoming request body` entry

#### Scenario: Binary bodies MUST degrade gracefully
- **WHEN** `LOG_HTTP_BODIES=true` is in effect
- **AND** a request arrives with a binary content type (not `application/json`, `text/*`, or `application/x-www-form-urlencoded`)
- **THEN** the `→ incoming request body` entry MUST include a `bodyLength` field with the byte count
- **AND** it MUST include a `bodyPreview` field containing the first 256 bytes of the body as a UTF-8 string
- **AND** it MUST NOT include a `body` field (to avoid mojibake noise)

### Requirement: Configuration MUST be sourced from environment variables

The system MUST read the two logging flags from the environment configuration module (`env.config.ts`). The env vars and their defaults MUST be:
- `LOG_HTTP_BODIES` — default `false`
- `LOG_HTTP_HEADERS` — default `true`

#### Scenario: Defaults are applied when env vars are absent
- **WHEN** neither of the two env vars is set
- **THEN** the plugin MUST behave as if `LOG_HTTP_BODIES=false` and `LOG_HTTP_HEADERS=true`

#### Scenario: Valid string values are accepted
- **WHEN** `LOG_HTTP_BODIES=true` is set
- **THEN** body logging MUST be enabled for the lifetime of the process
- **AND** when `LOG_HTTP_HEADERS=false` is set, header logging MUST be disabled

### Requirement: HTTP access log entries MUST always emit at info level

The system MUST emit all HTTP access log entries (`→ incoming request`, `→ incoming request body`, `← response sent`) via `request.log.info(...)`. The system MUST NOT provide a per-subsystem Pino level override for HTTP logging.

#### Scenario: All hooks emit at info level regardless of global log level configuration
- **WHEN** the HTTP logger hooks process a request
- **THEN** each emitted log entry MUST use Pino's `info` level (level 30)
- **AND** the system MUST NOT read or honor any `LOG_HTTP_LEVEL` environment variable

### Requirement: Plugin hooks MUST be testable in isolation

The plugin MUST export factory functions (`createHttpOnRequestHook`, `createHttpPreValidationHook`, `createHttpOnResponseHook`) so they can be registered directly with `app.addHook` in unit tests without spinning up the full `buildApp`. In Fastify 5, registering the plugin via `app.register()` does not expose hooks to routes in the root context due to encapsulation; the factory-function pattern allows tests to register hooks directly.

#### Scenario: Unit test registers the hooks on a minimal app
- **WHEN** a test creates a Fastify instance, registers the factory hooks via `app.addHook` with a known config, configures a buffer content-type parser, and fires a request via `app.inject()`
- **THEN** the test MUST be able to capture the emitted log entries and assert on their fields

### Requirement: Documentation MUST describe usage and limitations

The system MUST ship a document at `docs/observability.md` that describes:
- How to enable body logging temporarily for debugging (`LOG_HTTP_BODIES=true`).
- The shape of the log entries (example JSON snippets for both modes).
- A `⚠️` warning that this logging MUST NOT be enabled in production with real users until sensitive-field redaction is implemented.
- A "Limitaciones conocidas" section that lists response body logging as a known gap.

#### Scenario: Developer can enable debug logging from the docs
- **WHEN** a developer reads `docs/observability.md`
- **THEN** they MUST find concrete examples of the env vars to set and the log output to expect
- **AND** they MUST find the explicit warning about production use

### Requirement: Existing endpoint behavior MUST remain unchanged

The plugin MUST be a pure observability addition. It MUST NOT alter request routing, request body parsing, response status codes, response payloads, error handling, or any handler logic of the existing endpoints.

#### Scenario: A request to /health still returns 200 with { status: 'OK' }
- **WHEN** the plugin is registered and `GET /health` is called
- **THEN** the response body and status code MUST be identical to the pre-change behavior

#### Scenario: A request to /hooks still returns 202 before processing
- **WHEN** the plugin is registered and `POST /hooks` is called with a valid payload
- **THEN** the hook handler MUST still call `reply.code(202).send()` before processing the event
- **AND** the audit log produced for that event MUST be unchanged