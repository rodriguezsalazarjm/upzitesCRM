# Upzites Flow — Continuar Plan Maestro congelado (instrucción del 2026-11-02)

Instrucción del propietario para continuar el Plan Maestro de Producto del 29-09-2026
(`docs/UPZITES_FLOW_PLAN_MAESTRO_V2.txt`), respetando su orden de implementación y sus
criterios de finalización.

Repositorio: `C:\dev\upzites-preview`

## Paso 1 — Cierre del Punto 5

El Punto 5, Base de conocimiento del negocio, está implementado en `feat/workspace-knowledge-base`.
Revisar `docs/p5-workspace-knowledge.md` y el estado actual del repositorio.
Confirmar qué queda pendiente para el cierre definitivo, especialmente:

- Bucket privado `knowledge` de Supabase.
- Variable `KNOWLEDGE_STORAGE_BUCKET`.
- Validación real de subida y búsqueda de documentos.
- Pruebas finales.
- Commit de los cambios.

Realizar lo que pueda completarse localmente y dejar identificadas las configuraciones externas pendientes.
No modificar producción.

## Paso 2 — Comenzar Punto 6: ofertas, order bump y upsells

Implementar el Punto 6 según las especificaciones originales del Plan Maestro.
Primero inspeccionar los componentes existentes de Product Sales Studio, checkout, order bumps, pagos y fulfillment.
No reconstruir funcionalidades ya implementadas.

Completar:

1. Interfaz visual para configurar order bumps desde el producto.
2. Copy, imagen, precio, prioridad y activación.
3. Vista previa y edición desde la interfaz.
4. Integración funcional del bump con el checkout existente.
5. Upsell postcompra configurable.
6. Pantalla para aceptar o rechazar upsell.
7. Checkout adicional seguro para el upsell aceptado, respetando las capacidades reales del proveedor.
8. Registro correcto de órdenes, pagos y fulfillment.
9. Analytics de bumps y upsells.
10. Pruebas de aislamiento multi-workspace, roles, idempotencia y consistencia de pagos.

Reutilizar la arquitectura, modelos, componentes y patrones existentes.
Evitar dependencias nuevas que no sean necesarias.

## Paso 3 — Validación

Ejecutar las pruebas unitarias, integración, smoke, lint, typecheck y build correspondientes.
Validar el funcionamiento en escritorio y móvil con las herramientas disponibles.
No declarar una integración de pago real como validada cuando solo se haya probado con mocks.

## Paso 4 — Cierre

Documentar la implementación y realizar commits limpios de cambios verificados.
Entregar un resumen con:

- Funcionalidades completadas.
- Funcionalidades pendientes.
- Resultados de pruebas.
- Migraciones generadas y estado de aplicación.
- Commits.
- Bloqueos externos.
- Cumplimiento del hito original.

No desplegar a producción sin autorización.

## Regla principal

Cada punto del Plan Maestro debe cerrarse antes de ampliar el alcance.
No agregar funcionalidades que no estén contempladas en el bloque actual.
Al terminar el Punto 6, detenerse y entregar el informe de cierre.
El siguiente bloque será el Punto 7: Seguimiento comercial configurable.
