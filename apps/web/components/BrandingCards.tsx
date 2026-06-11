"use client";

import React, { useState } from "react";
import { Reveal } from "./Atoms";

type Card = {
  num: string;
  title: string;
  visible: string;
  detail: string;
  micro: string;
};

const CARDS: Card[] = [
  {
    num: "01",
    title: "Dirección estratégica de marca",
    visible: "Definimos el norte de tu marca antes de diseñar.",
    detail: "Clarificamos propósito, posicionamiento, diferencial, audiencia, percepción deseada y dirección comercial. Esto evita que tu identidad visual nazca desde gustos sueltos y no desde una estrategia real.",
    micro: "Antes del diseño, dirección.",
  },
  {
    num: "02",
    title: "Logotipo y sistema de marca",
    visible: "Creamos una identidad reconocible, fuerte y funcional.",
    detail: "Diseñamos el logotipo principal, versiones secundarias, isotipo o sello, usos correctos, proporciones y aplicaciones clave para que tu marca funcione en digital, redes, piezas comerciales y web.",
    micro: "No es solo un logo. Es presencia.",
  },
  {
    num: "03",
    title: "Paleta de colores",
    visible: "Color con intención, no decoración.",
    detail: "Definimos una paleta cromática alineada con la personalidad, mercado y energía de la marca. Colores principales, secundarios, acentos y reglas de uso para mantener consistencia visual.",
    micro: "El color también posiciona.",
  },
  {
    num: "04",
    title: "Tipografía y jerarquía visual",
    visible: "Diseñamos cómo se siente tu marca cuando habla visualmente.",
    detail: "Seleccionamos tipografías para titulares, textos, piezas digitales y aplicaciones comerciales. Creamos jerarquías claras para que la marca se vea profesional, ordenada y con carácter.",
    micro: "La letra también vende.",
  },
  {
    num: "05",
    title: "Voz, tono y personalidad",
    visible: "Tu marca necesita sonar tan fuerte como se ve.",
    detail: "Definimos cómo habla tu marca: directa, elegante, cercana, audaz, técnica, cultural o comercial. Creamos lineamientos de voz, tono, frases clave y estilo verbal para web, redes y ventas.",
    micro: "Una marca sin voz se olvida.",
  },
  {
    num: "06",
    title: "Arquetipo de marca",
    visible: "Le damos carácter y comportamiento a tu identidad.",
    detail: "Identificamos el arquetipo principal y secundario para guiar la personalidad, narrativa, estilo visual y forma de conectar con la audiencia.",
    micro: "Personalidad con estrategia.",
  },
  {
    num: "07",
    title: "Universo visual",
    visible: "Creamos un lenguaje gráfico propio.",
    detail: "Definimos recursos visuales como patrones, stickers, íconos, sellos, texturas, layouts, estilo fotográfico, composición y dirección de arte para que tu marca tenga un sistema reconocible.",
    micro: "Menos genérico. Más marca.",
  },
  {
    num: "08",
    title: "Manual básico de identidad",
    visible: "Todo organizado para que tu marca pueda crecer.",
    detail: "Entregamos una guía clara con reglas de uso, colores, tipografías, logos, tono, aplicaciones y recomendaciones para mantener coherencia en cada pieza.",
    micro: "Sistema antes que improvisación.",
  },
];

export function BrandingCards() {
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
      {CARDS.map((c, i) => (
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
