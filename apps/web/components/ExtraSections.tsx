"use client";

import React, { useState } from "react";
import { Barcode, Eyebrow, Reveal } from "./Atoms";
import { trackSchedule } from "@/lib/meta-pixel";

const STEPS_AGENDA = [
  {
    num: "01",
    title: "Te escuchamos",
    body: "Tendremos una breve charla para entender tus objetivos, desafios y la vision de tu proyecto.",
  },
  {
    num: "02",
    title: "Propuesta a medida",
    body: "Con la informacion clave, disenamos un plan estrategico y una propuesta comercial clara para ti.",
  },
  {
    num: "03",
    title: "Manos a la obra",
    body: "Una vez aprobada la propuesta, activamos a nuestro equipo y damos inicio a la transformacion digital.",
  },
];

export function ScheduleMeeting() {
  const [calOpen, setCalOpen] = useState(false);

  return (
    <section className="agenda" id="agenda" data-screen-label="Agenda meeting">
      <div className="shell">
        <Eyebrow num="05">Agenda - Reunion inicial</Eyebrow>
        <div className="agenda-head">
          <Reveal>
            <h2 className="agenda-h">
              Agenda una<br />
              <span className="b">reunion<br />con nosotros<span style={{ color: "var(--upz-electric)" }}>.</span></span>
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <p className="agenda-sub">
              En breves minutos podremos conocernos y entender como potenciar
              tu marca con branding, web, contenido, ads o automatizacion.
            </p>
          </Reveal>
        </div>

        <div className="agenda-grid">
          <div className="agenda-steps">
            {STEPS_AGENDA.map((step, i) => (
              <Reveal key={step.num} delay={i * 80}>
                <div className="agenda-step">
                  <span className="agenda-step-num">{step.num}</span>
                  <div className="agenda-step-body">
                    <h3 className="agenda-step-title">{step.title}</h3>
                    <p>{step.body}</p>
                  </div>
                  <span className="agenda-step-rule"></span>
                </div>
              </Reveal>
            ))}

            <Reveal delay={300}>
              <div className="agenda-disclaimer">
                <Barcode />
                <span>Reunion via Google Meet - Duracion 30 min - Sin costo</span>
              </div>
            </Reveal>
          </div>

          <Reveal delay={140}>
            <aside className="agenda-cal" style={{ padding: 0, overflow: "hidden", background: "#fff", minHeight: 580 }}>
              {calOpen ? (
                <iframe
                  src="https://cal.com/jose-manuel-rodriguez-z9ee2y/60minembed=1"
                  title="Agenda con UPZITES"
                  loading="lazy"
                  style={{ width: "100%", height: "100%", minHeight: "580px", border: "none" }}
                />
              ) : (
                <button
                  type="button"
                  className="agenda-cal-facade"
                  onClick={() => {
                    trackSchedule({ location: "agenda_section" });
                    setCalOpen(true);
                  }}
                >
                  <span className="agenda-cal-facade-tag">Cal.com - Google Meet - 30 min</span>
                  <span className="agenda-cal-facade-title">Reserva tu reunion</span>
                  <span className="agenda-cal-facade-sub">Toca para ver la disponibilidad en vivo y elegir tu horario.</span>
                  <span className="btn btn-dark btn-lg agenda-cal-facade-btn">
                    Ver disponibilidad <span className="arr">↗</span>
                  </span>
                </button>
              )}
            </aside>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
