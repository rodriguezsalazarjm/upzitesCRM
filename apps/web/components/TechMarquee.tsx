import React from "react";
import { TECH_ICONS } from "@/lib/techLogos";

export function TechMarquee() {
  const loop = [...TECH_ICONS, ...TECH_ICONS];
  return (
    <section className="tech-marquee" data-screen-label="Tech Marquee" aria-label="Stack tecnológico">
      <div className="tech-marquee-track">
        {loop.map((item, i) => (
          <React.Fragment key={i}>
            <span className="tech-logo" title={item.name} role="img" aria-label={item.name}>
              <svg
                viewBox={item.vb}
                fill="currentColor"
                aria-hidden="true"
                dangerouslySetInnerHTML={{ __html: item.body }}
              />
            </span>
            <span className="tech-marquee-sep" aria-hidden="true">●</span>
          </React.Fragment>
        ))}
      </div>
    </section>
  );
}
