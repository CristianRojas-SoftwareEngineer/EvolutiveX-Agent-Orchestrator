## ADDED Requirements

Ninguna. Este cambio corrige la implementación de los requisitos existentes en `specs/tts-hooks/spec.md` sin modificar el comportamiento observable definido.

## MODIFIED Requirements

Ninguna. La corrección del mecanismo de transporte (SDK de Anthropic → `fetch()` al proxy local) no cambia los requisitos de `tts-hooks`, solo la forma de cumplirlos.

## REMOVED Requirements

Ninguna.

---

**Referencia**: el spec `tts-hooks/spec.md` define los requisitos que esta corrección implementa correctamente con cualquier provider activo.