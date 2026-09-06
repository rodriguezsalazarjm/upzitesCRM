"use client";

import { useEffect, useRef } from "react";
import { trackContact, trackLead } from "@/lib/meta-pixel";

/**
 * Renderiza una landing convertida desde Claude Design (.dc.html) dentro de un
 * Shadow DOM, para aislar por completo su CSS del resto del sitio (el globals.css
 * de UPZITES no debe filtrarse). Reproduce la interactividad del runtime original:
 * - [data-reveal]   → aparición al hacer scroll
 * - [style-hover]   → estilos al pasar el mouse
 * - [data-dc-nav]   → fondo/sombra del nav al hacer scroll
 * - [data-dc-faq]   → acordeón de FAQ
 * - enlaces wa.me   → tracking de Meta Pixel (Contact + Lead)
 */
export function DcRuntime({ css, html, className }: { css: string; html: string; className: string }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${css}</style>${html}`;

    // --- background <video> autoplay (innerHTML-inserted videos don't always
    //     start on their own; force muted + play) ---
    root.querySelectorAll<HTMLVideoElement>("video").forEach((v) => {
      v.muted = true;
      v.play?.().catch(() => {});
    });

    // --- reveal ---
    // Las landings .dc estilo "reels" marcan animaciones con [data-rxanim] +
    // [data-rxdelay] (que el runtime original animaba). Las preparamos como
    // targets de reveal: parten ocultas y aparecen con fade-up al hacer scroll.
    root.querySelectorAll<HTMLElement>("[data-rxanim]").forEach((el) => {
      if (el.hasAttribute("data-reveal")) return;
      const delay = parseInt(el.getAttribute("data-rxdelay") || "0", 10) || 0;
      el.style.opacity = "0";
      el.style.transform = "translateY(22px)";
      el.style.transition = `opacity .6s ease ${delay}ms, transform .6s ease ${delay}ms`;
      el.setAttribute("data-reveal", "");
    });
    const reveals = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));
    const show = (el: HTMLElement) => {
      el.style.opacity = "1";
      el.style.transform = "none";
    };
    let io: IntersectionObserver | null = null;
    if ("IntersectionObserver" in window) {
      io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              show(e.target as HTMLElement);
              io?.unobserve(e.target);
            }
          });
        },
        { threshold: 0.08, rootMargin: "0px 0px -6% 0px" },
      );
      reveals.forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.top < (window.innerHeight || 800) * 0.96) show(el);
        else io!.observe(el);
      });
    } else {
      reveals.forEach(show);
    }
    const revealFallback = window.setTimeout(() => reveals.forEach(show), 1400);

    // --- hover (style-hover="prop:val;prop:val") ---
    const hoverCleanups: Array<() => void> = [];
    root.querySelectorAll<HTMLElement>("[style-hover]").forEach((el) => {
      const decls = (el.getAttribute("style-hover") || "")
        .split(";")
        .map((d) => d.trim())
        .filter(Boolean)
        .map((d) => {
          const i = d.indexOf(":");
          return [d.slice(0, i).trim(), d.slice(i + 1).trim()] as const;
        });
      const prev: Record<string, string> = {};
      const enter = () => decls.forEach(([p, v]) => {
        prev[p] = el.style.getPropertyValue(p);
        el.style.setProperty(p, v);
      });
      const leave = () => decls.forEach(([p]) => {
        if (prev[p]) el.style.setProperty(p, prev[p]);
        else el.style.removeProperty(p);
      });
      el.addEventListener("mouseenter", enter);
      el.addEventListener("mouseleave", leave);
      hoverCleanups.push(() => {
        el.removeEventListener("mouseenter", enter);
        el.removeEventListener("mouseleave", leave);
      });
    });

    // --- nav scroll ---
    const nav = root.querySelector<HTMLElement>("[data-dc-nav]");
    let onScroll: (() => void) | null = null;
    if (nav) {
      const bg = nav.getAttribute("data-dc-nav-bg") || "rgba(255,255,255,0.92)";
      const shadow = nav.getAttribute("data-dc-nav-shadow") || "0 1px 0 rgba(0,0,0,0.08)";
      onScroll = () => {
        const s = window.scrollY > 40;
        nav.style.background = s ? bg : "rgba(0,0,0,0)";
        nav.style.boxShadow = s ? shadow : "0 0 0 rgba(0,0,0,0)";
      };
      onScroll();
      window.addEventListener("scroll", onScroll, { passive: true });
    }

    // --- FAQ accordion ---
    const faqCleanups: Array<() => void> = [];
    root.querySelectorAll<HTMLElement>("[data-dc-faq]").forEach((btn) => {
      const n = btn.getAttribute("data-dc-faq");
      const panel = root.querySelector<HTMLElement>(`[style*="--dc-faq-${n}:1"]`);
      const icon = root.querySelector<HTMLElement>(`[data-dc-faqicon="${n}"]`);
      if (panel) panel.style.overflow = "hidden";
      const toggle = () => {
        if (!panel) return;
        const open = panel.style.maxHeight && panel.style.maxHeight !== "0px";
        panel.style.maxHeight = open ? "0px" : panel.scrollHeight + 48 + "px";
        if (icon) icon.textContent = open ? "+" : "–";
      };
      btn.style.cursor = "pointer";
      btn.addEventListener("click", toggle);
      faqCleanups.push(() => btn.removeEventListener("click", toggle));
    });

    // --- in-page anchors (#id): el scroll por fragmento no funciona desde el
    //     Shadow DOM, así que lo resolvemos buscando el target dentro del root ---
    const onClick = (e: Event) => {
      const path = e.composedPath?.() || [];
      const a = path.find((n) => (n as HTMLElement)?.tagName === "A") as HTMLAnchorElement | undefined;
      if (!a) return;

      const raw = a.getAttribute("href") || "";
      if (raw.startsWith("#")) {
        e.preventDefault();
        const id = raw.slice(1);
        const target = id ? root.getElementById?.(id) ?? root.querySelector<HTMLElement>(`[id="${id}"]`) : null;
        if (id && target) target.scrollIntoView({ behavior: "smooth", block: "start" });
        else window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      // --- WhatsApp tracking (Meta Pixel) ---
      if ((a.href || "").includes("wa.me")) {
        trackContact({ contact_method: "whatsapp", location: className });
        trackLead({ currency: "CLP" });
      }
    };
    root.addEventListener("click", onClick);

    // --- portfolio marquee ([data-dc-marquee]): auto-scroll izq., pausa al
    //     hover, flechas, y solo reproduce los videos visibles (perf) ---
    const marqueeCleanups: Array<() => void> = [];
    root.querySelectorAll<HTMLElement>("[data-dc-marquee]").forEach((m) => {
      const track = m.querySelector<HTMLElement>("[data-dc-marquee-track]");
      const viewport = m.querySelector<HTMLElement>("[data-dc-marquee-viewport]") || track?.parentElement || null;
      if (!track) return;
      let x = 0, paused = false, raf = 0;
      const speed = parseFloat(m.getAttribute("data-dc-marquee-speed") || "0.5") || 0.5;
      const half = () => track.scrollWidth / 2;
      const apply = () => { track.style.transform = `translateX(${x}px)`; };
      const step = () => {
        if (!paused) { const hw = half(); x -= speed; if (hw && x <= -hw) x += hw; apply(); }
        raf = requestAnimationFrame(step);
      };
      const onEnter = () => { paused = true; };
      const onLeave = () => { paused = false; };
      m.addEventListener("mouseenter", onEnter);
      m.addEventListener("mouseleave", onLeave);
      const nudge = (dir: number) => { const hw = half(); x += dir * 320; if (x > 0) x -= hw; if (hw && x <= -hw) x += hw; apply(); };
      const prev = m.querySelector<HTMLElement>("[data-dc-marquee-prev]");
      const next = m.querySelector<HTMLElement>("[data-dc-marquee-next]");
      const onPrev = () => nudge(1);
      const onNext = () => nudge(-1);
      prev?.addEventListener("click", onPrev);
      next?.addEventListener("click", onNext);
      let io2: IntersectionObserver | null = null;
      if ("IntersectionObserver" in window && viewport) {
        io2 = new IntersectionObserver((entries) => {
          entries.forEach((e) => {
            const v = e.target as HTMLVideoElement;
            if (e.isIntersecting) v.play?.().catch(() => {}); else v.pause?.();
          });
        }, { root: viewport, threshold: 0.04 });
        track.querySelectorAll<HTMLVideoElement>("video").forEach((v) => io2!.observe(v));
      }
      raf = requestAnimationFrame(step);
      marqueeCleanups.push(() => {
        cancelAnimationFrame(raf); io2?.disconnect();
        m.removeEventListener("mouseenter", onEnter); m.removeEventListener("mouseleave", onLeave);
        prev?.removeEventListener("click", onPrev); next?.removeEventListener("click", onNext);
      });
    });

    // --- video modal ([data-dc-video] abre un lightbox con el video + sonido) ---
    let vmodalCleanup: (() => void) | null = null;
    const videoTriggers = Array.from(root.querySelectorAll<HTMLElement>("[data-dc-video]"));
    if (videoTriggers.length) {
      const overlay = document.createElement("div");
      overlay.style.cssText = "position:fixed;inset:0;z-index:200;display:none;align-items:center;justify-content:center;padding:24px;background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)";
      overlay.innerHTML =
        '<div style="position:relative;width:min(420px,92vw);max-height:88vh;aspect-ratio:9/16;border-radius:20px;overflow:hidden;background:#000;box-shadow:0 30px 80px rgba(0,0,0,0.6)">' +
        '<video data-v controls playsinline style="width:100%;height:100%;object-fit:cover;background:#000"></video>' +
        '<div data-l style="position:absolute;left:0;right:0;bottom:0;padding:16px;font-family:\'Bebas Neue\',sans-serif;font-size:1.5rem;letter-spacing:0.02em;color:#fff;background:linear-gradient(180deg,transparent,rgba(0,0,0,0.75));pointer-events:none"></div>' +
        '</div>' +
        '<button data-x aria-label="Cerrar" style="position:absolute;top:20px;right:24px;width:46px;height:46px;border-radius:50%;border:1px solid rgba(255,255,255,0.3);background:rgba(0,0,0,0.55);color:#fff;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center">✕</button>';
      root.appendChild(overlay);
      const mv = overlay.querySelector<HTMLVideoElement>("[data-v]")!;
      const ml = overlay.querySelector<HTMLElement>("[data-l]")!;
      const open = (src: string, label: string) => { mv.src = src; ml.textContent = label || ""; overlay.style.display = "flex"; mv.currentTime = 0; mv.play?.().catch(() => {}); };
      const close = () => { overlay.style.display = "none"; mv.pause?.(); mv.removeAttribute("src"); mv.load?.(); };
      const handlers: Array<[HTMLElement, () => void]> = [];
      videoTriggers.forEach((el) => {
        const fn = () => open(el.getAttribute("data-dc-video") || "", el.getAttribute("data-dc-label") || "");
        el.addEventListener("click", fn);
        handlers.push([el, fn]);
      });
      const onOverlay = (e: Event) => { if (e.target === overlay) close(); };
      const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
      overlay.addEventListener("click", onOverlay);
      overlay.querySelector<HTMLElement>("[data-x]")!.addEventListener("click", close);
      document.addEventListener("keydown", onKey);
      vmodalCleanup = () => { handlers.forEach(([el, fn]) => el.removeEventListener("click", fn)); document.removeEventListener("keydown", onKey); overlay.remove(); };
    }

    return () => {
      io?.disconnect();
      window.clearTimeout(revealFallback);
      hoverCleanups.forEach((fn) => fn());
      faqCleanups.forEach((fn) => fn());
      marqueeCleanups.forEach((fn) => fn());
      vmodalCleanup?.();
      if (onScroll) window.removeEventListener("scroll", onScroll);
      root.removeEventListener("click", onClick);
    };
  }, [css, html, className]);

  return <div ref={hostRef} style={{ minHeight: "100vh" }} />;
}
