# Lumen Contracts

Estado: `partial`

## Propósito

Esta carpeta contiene contratos normativos compartidos entre frontend, Extension Host, Local Engine y cloud.

## Contratos existentes

- `activity.md`: manifest de autoría de actividades. Sus artefactos ejecutables (schema, taxonomía y ejemplos) viven en `contracts/` en la raíz del repo.

## Contratos previstos

- `route.md`
- `module.md`
- `exercise.md`
- `quiz.md`
- `project.md`
- `student-state.md`
- `recommendation.md`
- `notification.md`
- `profile.md`
- `duo-session.md`
- `race-session.md`

## Regla

Los contratos deben:

- estar versionados;
- distinguir campos authored, runtime y estado del usuario;
- declarar invariantes;
- declarar compatibilidad y migración;
- evitar campos ambiguos;
- incluir ejemplos válidos e inválidos;
- poder convertirse en JSON Schema o tipos ejecutables cuando corresponda.

Los documentos de producto pueden explicar una experiencia, pero no deben contradecir un contrato normativo.
