"use client";

import { useRef } from "react";
import {
  motion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import styles from "./OurWorkScene.module.css";

type PillSpec = {
  id: string;
  name: string;
  href: string;
  bg: string;
  fg: string;
  left: string;
  top: string;
  rot: number;
  speed: number; // px que sube al hacer scroll (parallax)
  hideOnMobile?: boolean;
};

// Píldoras horizontales de marca, repartidas alrededor del título.
// `speed` distinto en cada una = sensación de profundidad (parallax).
const pills: PillSpec[] = [
  { id: "valle-smash", name: "Valle Smash", href: "/proyectos", bg: "#FFBA00", fg: "#111", left: "6%", top: "20%", rot: -6, speed: 560 },
  { id: "dirty-pizza", name: "Dirty Pizza", href: "/proyectos", bg: "#FF3B30", fg: "#fff", left: "57%", top: "14%", rot: 5, speed: 820 },
  { id: "gloobitos", name: "Gloobitos", href: "/proyectos", bg: "#A6FF00", fg: "#111", left: "71%", top: "33%", rot: -4, speed: 470 },
  { id: "urban-wild", name: "Urban Wild", href: "/proyectos", bg: "#0057FF", fg: "#fff", left: "14%", top: "58%", rot: 7, speed: 720 },
  { id: "reyes-protec", name: "Reyes Protec", href: "/proyectos", bg: "#111", fg: "#FAFBF5", left: "64%", top: "60%", rot: -5, speed: 640 },
  { id: "avacos", name: "Avacos", href: "/proyectos", bg: "#FF5CAB", fg: "#111", left: "40%", top: "73%", rot: 3, speed: 900, hideOnMobile: true },
  { id: "vr-automotriz", name: "V&R Automotriz", href: "/proyectos", bg: "#FFD100", fg: "#111", left: "28%", top: "11%", rot: 4, speed: 700, hideOnMobile: true },
  { id: "iron-mallas", name: "Iron Mallas", href: "/proyectos", bg: "#2B2B2B", fg: "#fff", left: "47%", top: "45%", rot: -3, speed: 980, hideOnMobile: true },
];

function Pill({ pill, progress }: { pill: PillSpec; progress: MotionValue<number> }) {
  // Scroll abajo => progress sube => la píldora SUBE (y negativo). Scroll arriba lo revierte.
  const y = useTransform(progress, [0, 1], [0, -pill.speed]);
  const opacity = useTransform(progress, [0, 0.62, 0.85], [1, 1, 0]);

  return (
    <motion.a
      href={pill.href}
      aria-label={`Ver proyecto ${pill.name}`}
      className={`${styles.pill} ${pill.hideOnMobile ? styles.hideOnMobile : ""}`}
      style={{
        left: pill.left,
        top: pill.top,
        rotate: pill.rot,
        background: pill.bg,
        color: pill.fg,
        y,
        opacity,
      }}
    >
      {pill.name}
    </motion.a>
  );
}

export function OurWorkScene() {
  const sectionRef = useRef<HTMLElement>(null);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

  const progress = useSpring(scrollYProgress, { stiffness: 90, damping: 26, mass: 0.3 });

  // Pista de scroll se desvanece apenas empiezas a bajar.
  const hintOpacity = useTransform(progress, [0, 0.18], [1, 0]);

  return (
    <section ref={sectionRef} className={styles.section} data-screen-label="04 Selected work">
      <div className={styles.scene}>
        <div className={styles.grid} aria-hidden="true">
          {Array.from({ length: 6 }).map((_, index) => (
            <span key={index} />
          ))}
        </div>

        {/* Píldoras detrás/alrededor del título, con parallax */}
        <div className={styles.pillsLayer}>
          {pills.map((pill) => (
            <Pill key={pill.id} pill={pill} progress={progress} />
          ))}
        </div>

        {/* OUR WORK: se forma al entrar y queda ESTÁTICO */}
        <div className={styles.titleWrap}>
          <h2 className={styles.title} aria-label="Our Work">
            <span className={styles.titleForm}>OUR WORK</span>
          </h2>
          <p className={styles.subtitle}>Marcas que ya no se ven como antes.</p>
        </div>

        <motion.div className={styles.scrollHint} style={{ opacity: hintOpacity }} aria-hidden="true">
          <i />
          <span>Scroll para explorar</span>
        </motion.div>
      </div>
    </section>
  );
}

export default OurWorkScene;
