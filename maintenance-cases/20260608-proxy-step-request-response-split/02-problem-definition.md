---
case_id: 20260608-proxy-step-request-response-split
profile: corrective
phase: 02-problem-definition
chain: cause
version: v1.0
timestamp: 2026-06-08T12:10:00Z
status: done
inputs: [01-observation.md]
produces: 02-problem-definition.md
links: { previous: 01-observation.md, next: 03-research.md }
---

# Problem Definition — 20260608-proxy-step-request-response-split

## Applied policy

- **acceptance:** enunciado falsable y medible

## Problem statement

El proxy registra **dos entidades `IStep` y dos carpetas `steps/MM/`** por cada hop HTTP de inferencia (request en ingress, response en egress), cuando el diseño canónico exige **una carpeta `steps/MM/` con `request/` y `response/`** por hop. Esto rompe la navegabilidad causal documentada y produce `stepCount` ≠ número de directorios bajo `steps/`.

## Success criterion (no-regresión)

Tras el fix, para un workflow wire con N hops HTTP cerrados:

1. Existen N carpetas `steps/00..N-1/`, cada una con `request/body.json` y `response/body.json` (cuando el hop tiene respuesta).
2. `workflow.steps.length === N` (no `2N`).
3. `result.json` `stepCount === N`.
4. `npm run test:unit` verde.

## Falsifiability

Si tras unificar ingress/egress en un solo `IStep` siguen apareciendo carpetas request-only y response-only alternadas, la hipótesis de causa está refutada.

## Acceptance check

Enunciado medible con criterio de éxito cuantificable.
