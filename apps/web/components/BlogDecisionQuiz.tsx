"use client";

import { useState } from "react";

const QUESTIONS = [
  "Tus ventas dependen de responder mensajes manualmente.",
  "Pierdes consultas o se te enfrían leads por no contestar a tiempo.",
  "Envías precios, catálogos o cotizaciones uno por uno.",
  "Tu marca no se ve más profesional que la de tu competencia.",
  "No tienes un lugar propio (fuera de redes) donde te encuentren en Google.",
  "Quieres cobrar online y no solo coordinar pagos por transferencia.",
  "Tienes clientes que vuelven o procesos que repites cada semana.",
  "Te gustaría automatizar el seguimiento de ventas por WhatsApp.",
];

export function BlogDecisionQuiz() {
  const [checked, setChecked] = useState<boolean[]>(() => QUESTIONS.map(() => false));
  const [show, setShow] = useState(false);
  const score = checked.filter(Boolean).length;

  function toggle(i: number) {
    setChecked((prev) => prev.map((v, j) => (j === i ? !v : v)));
  }

  const result =
    score >= 6
      ? { tag: "Necesitas una base digital + sistema", body: "Estás perdiendo ventas por falta de orden. Te conviene una web comercial o tienda online y, muy probablemente, un CRM con automatización de WhatsApp." }
      : score >= 4
      ? { tag: "Una landing o web comercial te dará más retorno", body: "Seguir invirtiendo solo en redes ya no es lo más rentable. Una landing o web comercial con WhatsApp y formularios ordenará tus ventas." }
      : score >= 1
      ? { tag: "Empieza por branding + landing", body: "Estás validando. Prioriza verte profesional y captar bien: Branding Express + una landing con WhatsApp es el primer paso correcto." }
      : { tag: "Marca las casillas que apliquen", body: "Responde el checklist para ver qué solución te conviene priorizar." };

  return (
    <div className="blog-quiz">
      <p className="blog-quiz-lead">Marca todo lo que aplique a tu negocio hoy:</p>
      <ul className="blog-quiz-list">
        {QUESTIONS.map((q, i) => (
          <li key={i}>
            <label className={`blog-quiz-item${checked[i] ? " is-on" : ""}`}>
              <input type="checkbox" checked={checked[i]} onChange={() => toggle(i)} />
              <span className="blog-quiz-box" aria-hidden="true">{checked[i] ? "✓" : ""}</span>
              <span>{q}</span>
            </label>
          </li>
        ))}
      </ul>

      <button type="button" className="blog-quiz-btn" onClick={() => setShow(true)}>
        Ver qué solución necesito <span className="arr">&#8599;</span>
      </button>

      {show && (
        <div className="blog-quiz-result" role="status">
          <span className="blog-quiz-score">{score}/8</span>
          <div>
            <strong>{result.tag}</strong>
            <p>{result.body}</p>
            <a className="blog-quiz-cta" href="/contacto?utm_source=blog&utm_medium=quiz">
              Quiero saber qué solución necesita mi negocio <span className="arr">&#8599;</span>
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
