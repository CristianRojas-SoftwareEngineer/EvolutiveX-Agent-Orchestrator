# proxy-concurrent-step-attribution

**component:** gateway/audit-egress  
**defect-class:** cross-wiring concurrent hops  
**profile:** corrective

## Lesson

`AuditWorkflowContext.assignedStepIndex` se fija en ingress por hop HTTP y es inmutable hasta cerrar la response de esa request. Los handlers egress (SSE y estándar) NO deben usar `resolveOpenWireStepIndex` ni «último step abierto» cuando hay varios steps sin `closedAt` en el mismo workflow: deben enriquecer y emitir `stream_chunk`/`step_response` con el índice asignado. Evidencia: sesión `52f8f157` post-`unify-turn-workflow`.
