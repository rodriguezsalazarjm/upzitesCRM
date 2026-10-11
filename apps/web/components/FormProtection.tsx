"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref, type RefObject } from "react";
import { HONEYPOT_FIELD } from "@/lib/contact-options";

/**
 * Piezas antispam compartidas por los formularios que envían a /api/contact.
 * No cambian el diseño: el honeypot está fuera de pantalla y Turnstile corre
 * en modo "interaction-only" (solo se ve si Cloudflare necesita un desafío).
 */

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
export const TURNSTILE_ENABLED = Boolean(TURNSTILE_SITE_KEY);

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileApi = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile_missing")));
      script.onerror = () => {
        scriptPromise = null;
        reject(new Error("turnstile_load_failed"));
      };
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

export type TurnstileHandle = {
  /** Token vigente o "" si aún no hay (o venció). */
  getToken: () => string;
  /** Pide un token nuevo. Llamar después de cada envío: el token es de un uso. */
  reset: () => void;
};

export function TurnstileField({ ref }: { ref?: Ref<TurnstileHandle> }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const tokenRef = useRef("");
  const [interactive, setInteractive] = useState(false);

  useImperativeHandle(ref, () => ({
    getToken: () => tokenRef.current,
    reset: () => {
      tokenRef.current = "";
      if (widgetIdRef.current && window.turnstile) window.turnstile.reset(widgetIdRef.current);
    },
  }));

  useEffect(() => {
    if (!TURNSTILE_ENABLED) return;
    let cancelled = false;

    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !containerRef.current) return;
        widgetIdRef.current = turnstile.render(containerRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          action: "contact",
          appearance: "interaction-only",
          size: "flexible",
          language: "es",
          "refresh-expired": "auto",
          callback: (token: string) => {
            tokenRef.current = token;
          },
          "expired-callback": () => {
            tokenRef.current = "";
          },
          "error-callback": () => {
            tokenRef.current = "";
          },
          "before-interactive-callback": () => setInteractive(true),
          "after-interactive-callback": () => setInteractive(false),
        });
      })
      .catch((error) => console.error("turnstile_init_error", error));

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) window.turnstile.remove(widgetIdRef.current);
      widgetIdRef.current = null;
    };
  }, []);

  if (!TURNSTILE_ENABLED) return null;

  // Fuera del flujo mientras no haya desafío: no agrega huecos al layout.
  return (
    <div
      ref={containerRef}
      style={
        interactive
          ? { flexBasis: "100%", width: "100%" }
          : { position: "absolute", width: 0, height: 0, overflow: "hidden" }
      }
    />
  );
}

/**
 * Campo trampa. Fuera de pantalla (no `display:none`, que algunos bots
 * detectan), oculto para lectores de pantalla y sin foco con Tab.
 */
export function HoneypotField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div
      aria-hidden="true"
      style={{ position: "absolute", left: "-10000px", top: "auto", width: 1, height: 1, overflow: "hidden" }}
    >
      <label htmlFor={`hp-${HONEYPOT_FIELD}`}>No completar</label>
      <input
        id={`hp-${HONEYPOT_FIELD}`}
        name={HONEYPOT_FIELD}
        type="text"
        tabIndex={-1}
        autoComplete="off"
        // Que los gestores de contraseñas no lo rellenen (1Password, LastPass,
        // Bitwarden, Dashlane): sería el único falso positivo posible.
        data-1p-ignore=""
        data-lpignore="true"
        data-bwignore=""
        data-form-type="other"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

/**
 * Estado común de protección para un formulario: honeypot, tiempo desde que
 * se montó y Turnstile. `fields()` devuelve lo que hay que sumar al body.
 * El ref de Turnstile lo crea el formulario y lo pasa también a <TurnstileField>.
 */
export function useFormProtection(turnstileRef: RefObject<TurnstileHandle | null>) {
  const [honeypot, setHoneypot] = useState("");
  const mountedAtRef = useRef(0);

  useEffect(() => {
    mountedAtRef.current = Date.now();
  }, []);

  return {
    honeypot,
    setHoneypot,
    /**
     * true si el servidor va a descartar el envío en silencio (campo trampa):
     * su "éxito" es falso y no debe contarse como Lead.
     */
    isTrapped: () => honeypot.trim() !== "",
    /** Mensaje si falta el token de Turnstile, o null si se puede enviar. */
    missingTokenMessage: () =>
      TURNSTILE_ENABLED && !turnstileRef.current?.getToken()
        ? "Estamos verificando el envío. Espera unos segundos e inténtalo nuevamente."
        : null,
    fields: () => ({
      [HONEYPOT_FIELD]: honeypot,
      formElapsedMs: mountedAtRef.current ? Date.now() - mountedAtRef.current : undefined,
      turnstileToken: turnstileRef.current?.getToken() || undefined,
    }),
    /** Tras cada intento: el token ya se consumió en el servidor. */
    afterSubmit: () => turnstileRef.current?.reset(),
  };
}
