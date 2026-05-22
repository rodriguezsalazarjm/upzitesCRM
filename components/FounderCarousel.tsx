"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const PHOTOS = [
  "/images/founder-1.webp",
  "/images/founder-2.webp",
  "/images/founder-3.webp",
  "/images/founder-4.webp",
];
const ALT = "José Manuel Rodríguez — Founder & CEO de UPZITES";

export function FounderCarousel() {
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => {
      setDir(1);
      setI((p) => (p + 1) % PHOTOS.length);
    }, 4800);
    return () => clearInterval(t);
  }, [mounted]);

  function go(n: number) {
    setDir(n > i ? 1 : -1);
    setI((n + PHOTOS.length) % PHOTOS.length);
  }
  function prev() {
    setDir(-1);
    setI((p) => (p - 1 + PHOTOS.length) % PHOTOS.length);
  }
  function next() {
    setDir(1);
    setI((p) => (p + 1) % PHOTOS.length);
  }

  if (!mounted) {
    return (
      <div className="founder-carousel">
        <div className="founder-frame">
          <img src={PHOTOS[0]} alt={ALT} />
        </div>
      </div>
    );
  }

  return (
    <div className="founder-carousel">
      <div className="founder-frame">
        <AnimatePresence initial={false} custom={dir}>
          <motion.img
            key={i}
            src={PHOTOS[i]}
            alt={ALT}
            className="founder-photo"
            initial={{ opacity: 0, x: dir >= 0 ? 50 : -50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir >= 0 ? -50 : 50 }}
            transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.18}
            onDragEnd={(_, info) => {
              if (info.offset.x < -60) next();
              else if (info.offset.x > 60) prev();
            }}
          />
        </AnimatePresence>
        <button type="button" className="founder-nav founder-prev" onClick={prev} aria-label="Foto anterior">↗</button>
        <button type="button" className="founder-nav founder-next" onClick={next} aria-label="Foto siguiente">↗</button>
      </div>
      <div className="founder-dots">
        {PHOTOS.map((_, n) => (
          <button
            key={n}
            type="button"
            className={`founder-dot${n === i ? " is-active" : ""}`}
            onClick={() => go(n)}
            aria-label={`Foto ${n + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
