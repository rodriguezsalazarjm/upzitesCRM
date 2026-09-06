"use client";

import { useRef } from "react";
import Image from "next/image";
import { Bebas_Neue } from "next/font/google";
import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import styles from "./OurWorkScene.module.css";

const bebasNeue = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

type BrandTile = {
  id: string;
  name: string;
  image: string;
  href: string;
  left: string;
  top: string;
  zIndex: number;
  driftX: number;
  driftY: number;
  exitX: number;
  exitY: number;
  exitRotate: number;
  hideOnMobile?: boolean;
};

const brands: BrandTile[] = [
  {
    id: "valle-smash",
    name: "Valle Smash",
    image: "/work-brands/valle-smash.png",
    href: "#",
    left: "8%",
    top: "13%",
    zIndex: 55,
    driftX: 8,
    driftY: -12,
    exitX: -170,
    exitY: -210,
    exitRotate: -14,
  },
  {
    id: "vr-automotriz",
    name: "V&R Automotriz",
    image: "/work-brands/vr-automotriz.png",
    href: "#",
    left: "67%",
    top: "13%",
    zIndex: 35,
    driftX: -6,
    driftY: 10,
    exitX: 185,
    exitY: -165,
    exitRotate: 12,
  },
  {
    id: "urban-wild",
    name: "Urban Wild",
    image: "/work-brands/urban-wild.png",
    href: "#",
    left: "21%",
    top: "62%",
    zIndex: 70,
    driftX: -10,
    driftY: 9,
    exitX: -190,
    exitY: 250,
    exitRotate: 16,
  },
  {
    id: "reyes-protec",
    name: "Reyes Protec",
    image: "/work-brands/reyes-protec.png",
    href: "#",
    left: "69%",
    top: "61%",
    zIndex: 62,
    driftX: 9,
    driftY: -6,
    exitX: 205,
    exitY: 220,
    exitRotate: -16,
  },
  {
    id: "dirty-pizza",
    name: "Dirty Pizza",
    image: "/work-brands/dirty-pizza.png",
    href: "#",
    left: "46%",
    top: "17%",
    zIndex: 75,
    driftX: 5,
    driftY: -8,
    exitX: 28,
    exitY: -240,
    exitRotate: 9,
    hideOnMobile: true,
  },
  {
    id: "gloobitos",
    name: "Gloobitos",
    image: "/work-brands/gloobitos.png",
    href: "#",
    left: "74%",
    top: "35%",
    zIndex: 48,
    driftX: -8,
    driftY: 8,
    exitX: 225,
    exitY: 80,
    exitRotate: 11,
    hideOnMobile: true,
  },
  {
    id: "iron-mallas",
    name: "Iron Mallas",
    image: "/work-brands/iron-mallas.png",
    href: "#",
    left: "47%",
    top: "70%",
    zIndex: 40,
    driftX: 6,
    driftY: -8,
    exitX: 30,
    exitY: 265,
    exitRotate: -10,
    hideOnMobile: true,
  },
  {
    id: "avacos",
    name: "Avacos",
    image: "/work-brands/avacos.png",
    href: "#",
    left: "46%",
    top: "42%",
    zIndex: 80,
    driftX: -5,
    driftY: 5,
    exitX: -18,
    exitY: 185,
    exitRotate: 8,
    hideOnMobile: true,
  },
];

type LetterSpec = {
  char: string;
  exitX: number;
  exitY: number;
  exitRotate: number;
  delay: number;
  isFirstWord?: boolean;
};

const letters: LetterSpec[] = [
  { char: "O", exitX: -22, exitY: 50, exitRotate: -5, delay: 0, isFirstWord: true },
  { char: "U", exitX: -9, exitY: 62, exitRotate: -3, delay: 0.01, isFirstWord: true },
  { char: "R", exitX: 14, exitY: 72, exitRotate: 4, delay: 0.02, isFirstWord: true },
  { char: "W", exitX: -60, exitY: 180, exitRotate: -11, delay: 0.00 },
  { char: "O", exitX: -5, exitY: 260, exitRotate: -8, delay: 0.04 },
  { char: "R", exitX: 60, exitY: 340, exitRotate: 8, delay: 0.08 },
  { char: "K", exitX: 125, exitY: 420, exitRotate: 14, delay: 0.12 },
];

function Brand({
  brand,
  progress,
}: {
  brand: BrandTile;
  progress: MotionValue<number>;
}) {
  const reduceMotion = useReducedMotion();

  // 0–32%: logos stay near their composition with a tiny parallax drift.
  // 32–62%: each logo leaves by its own direction, then returns on reverse scroll.
  const x = useTransform(
    progress,
    [0, 0.32, 0.62, 1],
    [0, brand.driftX, brand.exitX, brand.exitX]
  );

  const y = useTransform(
    progress,
    [0, 0.32, 0.62, 1],
    [0, brand.driftY, brand.exitY, brand.exitY]
  );

  const rotate = useTransform(progress, [0, 0.32, 0.62], [0, 1.5, brand.exitRotate]);

  const scale = useTransform(progress, [0, 0.32, 0.62], [1, 1.015, 0.84]);

  const opacity = useTransform(
    progress,
    [0, 0.31, 0.57, 0.64],
    [1, 1, 0.18, 0]
  );

  return (
    <motion.a
      href={brand.href}
      aria-label={`Ver proyecto ${brand.name}`}
      className={`${styles.brandWrap} ${
        brand.hideOnMobile ? styles.hideOnMobile : ""
      }`}
      style={
        reduceMotion
          ? {
              left: brand.left,
              top: brand.top,
              zIndex: brand.zIndex,
            }
          : {
              left: brand.left,
              top: brand.top,
              zIndex: brand.zIndex,
              x,
              y,
              rotate,
              scale,
              opacity,
            }
      }
    >
      <div className={styles.brandTile}>
        <Image
          src={brand.image}
          alt={brand.name}
          fill
          sizes="(max-width: 767px) 118px, 170px"
          className={styles.brandImage}
          priority={brand.id === "valle-smash"}
        />
      </div>
    </motion.a>
  );
}

function AnimatedLetter({
  item,
  index,
  progress,
}: {
  item: LetterSpec;
  index: number;
  progress: MotionValue<number>;
}) {
  const start = 0.34 + item.delay;
  const end = 0.62 + item.delay;

  const x = useTransform(progress, [0, start, end, 1], [0, 0, item.exitX, item.exitX]);
  const y = useTransform(progress, [0, start, end, 1], [0, 0, item.exitY, item.exitY]);
  const rotate = useTransform(
    progress,
    [0, start, end, 1],
    [0, 0, item.exitRotate, item.exitRotate]
  );
  const opacity = useTransform(progress, [0, 0.52 + item.delay, 0.69 + item.delay, 1], [1, 1, 0, 0]);

  return (
    <motion.span
      aria-hidden="true"
      className={`${styles.letter} ${item.isFirstWord ? styles.firstWord : ""}`}
      style={{ x, y, rotate, opacity }}
    >
      {item.char}
    </motion.span>
  );
}

export default function OurWorkScene() {
  const sectionRef = useRef<HTMLElement>(null);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

  const progress = useSpring(scrollYProgress, {
    stiffness: 92,
    damping: 25,
    mass: 0.28,
  });

  const labelOpacity = useTransform(progress, [0, 0.3, 0.48], [1, 1, 0]);
  const nextOpacity = useTransform(progress, [0.56, 0.72, 1], [0, 1, 1]);
  const nextY = useTransform(progress, [0.56, 0.72, 1], [48, 0, -10]);

  return (
    <section ref={sectionRef} className={styles.section}>
      <div className={styles.scene}>
        <div className={styles.grid} aria-hidden="true">
          {Array.from({ length: 6 }).map((_, index) => (
            <span key={index} />
          ))}
        </div>

        <motion.div className={styles.sceneMeta} style={{ opacity: labelOpacity }}>
          <p>03 — Selected work</p>
          <p>Marcas, sistemas visuales, web y producto digital.</p>
        </motion.div>

        <div className={styles.titleWrap} aria-label="Our Work">
          <h2 className={`${styles.title} ${bebasNeue.className}`}>
            {letters.map((item, index) => (
              <AnimatedLetter
                key={`${item.char}-${index}`}
                item={item}
                index={index}
                progress={progress}
              />
            ))}
          </h2>
        </div>

        <div className={styles.brandsLayer}>
          {brands.map((brand) => (
            <Brand key={brand.id} brand={brand} progress={progress} />
          ))}
        </div>

        <motion.div className={styles.handoff} style={{ opacity: nextOpacity, y: nextY }}>
          <span>SELECTED PROJECTS</span>
          <strong>Scroll into the work.</strong>
        </motion.div>

        <motion.div className={styles.scrollHint} style={{ opacity: labelOpacity }} aria-hidden="true">
          <i />
          <span>Scroll para explorar</span>
        </motion.div>
      </div>
    </section>
  );
}