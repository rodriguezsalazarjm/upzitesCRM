"use client";

import { useState } from "react";
import { Reveal } from "./Atoms";

export type FeatureCard = {
  num: string;
  title: string;
  visible: string;
  detail: string;
  micro: string;
};

export function FeatureCards({ cards }: { cards: FeatureCard[] }) {
  const [open, setOpen] = useState<Set<number>>(new Set());

  function toggle(i: number) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  return (
    <div className="bcards">
      {cards.map((c, i) => (
        <Reveal key={c.num} delay={i * 50}>
          <button
            type="button"
            className={`bcard${open.has(i) ? " is-open" : ""}`}
            aria-expanded={open.has(i)}
            onClick={() => toggle(i)}
          >
            <div className="bcard-top">
              <span className="bcard-num">{c.num}</span>
              <span className="bcard-toggle" aria-hidden="true">+</span>
            </div>
            <h3 className="bcard-title">{c.title}</h3>
            <p className="bcard-visible">{c.visible}</p>
            <div className="bcard-detail">
              <p>{c.detail}</p>
              <span className="bcard-micro">{c.micro}</span>
            </div>
          </button>
        </Reveal>
      ))}
    </div>
  );
}
