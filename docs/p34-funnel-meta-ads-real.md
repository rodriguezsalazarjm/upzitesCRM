# P34 — Primer funnel real Meta Ads → venta

Ensayado de punta a punta en crm_pruebas con `apps/crm/scripts/visual/p34-ads-funnel-hito.ts`, que corre después del P33. El referral del anuncio y el pago van simulados.

Para cumplir el hito se necesita una campaña real que deje al menos un lead trazable en producción.

## Requisitos previos (todos externos)

- Producción con la cadena P8–P34 desplegada y sus migraciones aplicadas (P35).
- Número de WhatsApp conectado por Embedded Signup y app de Meta en modo Live: Tech Provider, webhook público y suscripción `messages`.
- Mercado Pago real conectado al negocio (P27 validado antes con TEST).
- Email de entrega: Resend con el dominio verificado (P25). Sin él, la entrega igual sale por WhatsApp.
- Negocio 5MCD configurado como en el P33, con el contenido definitivo:
  - producto con su PDF;
  - bump con los audios;
  - cerebro de ventas;
  - agente publicado.

## Pasos

1. **Ads Manager:** crear una campaña con objetivo de mensajes y destino WhatsApp (Click-to-WhatsApp) hacia el número del negocio. Copiar el **ID del anuncio**, que es solo números.
2. **Flow → Canales → WhatsApp → Reglas de campaña → Nueva regla:**
   - nivel Anuncio y el ID copiado;
   - producto "30 experiencias guiadas";
   - agente comercial;
   - activa.
3. **Flow → Automatizaciones → Plantillas → Postventa**, canal WhatsApp, con tu número. Crear y publicar.
4. Opcional: **Recuperación** de checkout abandonado publicada (P33).
5. Activar la campaña con un presupuesto mínimo.

## Verificación del hito

Cuando entre el primer lead que pague, correr desde apps/crm, con `DATABASE_URL` de producción. El script es de solo lectura:

```
node node_modules/tsx/dist/cli.mjs scripts/p34-funnel-verify.ts --anuncio <ID del anuncio>
```

El script revisa estas etapas:
- el lead llegó con el referral del anuncio;
- la conversación quedó en la regla de campaña;
- el first touch es el anuncio;
- la IA respondió;
- hay un pedido pagado;
- el pago es real, no simulado;
- el pedido está atribuido al anuncio;
- la entrega se envió;
- arrancó el follow-up.

Imprime "P34 CUMPLIDO" o las etapas que faltan, y sale con 1 si falta alguna.

En la UI se ve en:
- **/analitica**: embudo "Desde anuncio", la venta en "Por campaña" y "Por agente de IA", y el recorrido de la venta;
- **Reglas de campaña**: conversaciones, ventas y monto;
- **/pedidos/[id]**: el pedido.

## Límites conocidos

- Meta solo manda el ID del anuncio. Las reglas por conjunto o por campaña aplican solo si llega ese dato (Marketing API, no integrada).
- No hay ROAS: la inversión publicitaria no se importa.
- "Por agente de IA" cuenta desde P34. Las conversaciones anteriores no tienen agente registrado.
