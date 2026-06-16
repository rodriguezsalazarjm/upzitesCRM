"use client";

import type { CSSProperties } from "react";
import { useRef } from "react";
import Link from "next/link";
import { SERVICES } from "@/lib/services";

export function ServiceNav({ current }: { current: string }) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  function scrollBy(direction: "prev" | "next") {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    scroller.scrollBy({
      left: direction === "prev" ? -280 : 280,
      behavior: "smooth",
    });
  }

  return (
    <nav className="service-nav" aria-label="Otros servicios">
      <div className="shell service-nav-inner">
        <span className="service-nav-label">Servicios</span>
        <button
          type="button"
          className="service-nav-arrow"
          onClick={() => scrollBy("prev")}
          aria-label="Ver servicios anteriores"
        >
          ←
        </button>
        <div className="service-nav-pills" ref={scrollerRef}>
          {SERVICES.map((service) => {
            const active = service.slug === current;
            return (
              <Link
                key={service.slug}
                href={`/servicios/${service.slug}`}
                className={`svcnav-pill${active ? " is-active" : ""}`}
                aria-current={active ? "page" : undefined}
                style={{ "--svc-accent": service.accent } as CSSProperties}
              >
                {service.title}
              </Link>
            );
          })}
        </div>
        <button
          type="button"
          className="service-nav-arrow"
          onClick={() => scrollBy("next")}
          aria-label="Ver mas servicios"
        >
          →
        </button>
      </div>
      <div className="shell service-nav-brochure-wrap">
        <Link href="/api/brochure/downloadsource=service_nav_card" className="service-nav-brochure">
          <span>
            <strong>Brochure UPZITES</strong>
            <small>Marca, web, contenido, ads, apps, CRM y automatización en un solo PDF.</small>
          </span>
          <span className="service-nav-brochure-action">Descargar &#8599;</span>
        </Link>
      </div>
    </nav>
  );
}
