## MODIFIED Requirements

### Requirement: Configuration MUST be sourced from environment variables

The system MUST read the logging flags from the environment configuration module (`env.config.ts`). The env vars and their defaults MUST be:
- `LOG_HTTP_BODIES` — default `false`
- `LOG_HTTP_HEADERS` — default `true`

#### Scenario: Defaults are applied when env vars are absent
- **WHEN** neither of the two env vars is set
- **THEN** the plugin MUST behave as if `LOG_HTTP_BODIES=false` and `LOG_HTTP_HEADERS=true`

#### Scenario: Valid string values are accepted
- **WHEN** `LOG_HTTP_BODIES=true` is set
- **THEN** body logging MUST be enabled for the lifetime of the process
- **AND** when `LOG_HTTP_HEADERS=false` is set, header logging MUST be disabled

## ADDED Requirements

### Requirement: HTTP access log entries MUST always emit at info level

The system MUST emit all HTTP access log entries (`→ incoming request`, `→ incoming request body`, `← response sent`) via `request.log.info(...)`. The system MUST NOT provide a per-subsystem Pino level override for HTTP logging.

#### Scenario: All hooks emit at info level regardless of global log level configuration
- **WHEN** the HTTP logger hooks process a request
- **THEN** each emitted log entry MUST use Pino's `info` level (level 30)
- **AND** the system MUST NOT read or honor any `LOG_HTTP_LEVEL` environment variable

## REMOVED Requirements

### Requirement: Configuration MUST be sourced from environment variables (LOG_HTTP_LEVEL clause)

**Reason**: `LOG_HTTP_LEVEL` couples Pino's global level filter with per-subsystem verbosity, causing HTTP logs to be silently discarded when `LOG_HTTP_LEVEL=debug` and `LOG_LEVEL=info`. Visibility is already controlled by `LOG_LEVEL`; content is controlled by `LOG_HTTP_BODIES` and `LOG_HTTP_HEADERS`.

**Migration**: Remove `LOG_HTTP_LEVEL` from environment configuration, `HttpLoggerConfig.level`, and documentation. HTTP events are operational and always emit at `info`. To reduce HTTP log volume, use `LOG_LEVEL` or disable body/header logging via the existing boolean flags.
