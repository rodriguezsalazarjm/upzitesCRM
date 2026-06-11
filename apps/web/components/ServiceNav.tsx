import type { CSSProperties } from "react";
import Link from "next/link";
import { SERVICES } from "@/lib/services";

export function ServiceNav({ current }: { current: string }) {
  return (
    <nav className="service-nav" aria-label="Otros servicios">
      <div className="shell service-nav-inner">
        <span className="service-nav-label">Servicios</span>
        <div className="service-nav-pills">
          {SERVICES.map((s) => {
            const active = s.slug === current;
            return (
              <Link
                key={s.slug}
                href={`/servicios/${s.slug}`}
                className={`svcnav-pill${active ? " is-active" : ""}`}
                aria-current={active ? "page" : undefined}
                style={{ "--svc-accent": s.accent } as CSSProperties}
              >
                {s.title}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
