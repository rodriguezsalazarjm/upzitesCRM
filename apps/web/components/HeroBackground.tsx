"use client";

import { useEffect, useRef } from "react";

// Brand palette for the particle field
const COLORS = ["#0057FF", "#FF3B30", "#FFD100", "#FF5CAB", "#A6FF00"];

type Particle = {
  x: number; y: number;
  tx: number; ty: number;
  vx: number; vy: number;
  c: string; s: number;
};

// Draws the UPZ up-right arrow glyph (↗) into an offscreen context.
function drawArrow(o: CanvasRenderingContext2D, w: number, h: number) {
  const S = Math.min(h * 0.82, w * 0.52);
  const cx = w * 0.64;
  const cy = h * 0.5;
  o.save();
  o.translate(cx, cy);
  o.fillStyle = "#000";
  o.strokeStyle = "#000";
  o.lineWidth = S * 0.17;
  o.lineCap = "round";
  o.lineJoin = "round";
  // diagonal shaft (bottom-left -> up-right)
  o.beginPath();
  o.moveTo(-S * 0.32, S * 0.32);
  o.lineTo(S * 0.18, -S * 0.18);
  o.stroke();
  // arrowhead
  o.beginPath();
  o.moveTo(S * 0.4, -S * 0.4);
  o.lineTo(S * 0.08, -S * 0.4);
  o.lineTo(S * 0.4, -S * 0.08);
  o.closePath();
  o.fill();
  o.restore();
}

export function HeroBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!canvas || !parent) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    let W = 0, H = 0;
    let particles: Particle[] = [];
    let raf = 0;
    const mouse = { x: -9999, y: -9999, active: false };

    function buildTargets() {
      const off = document.createElement("canvas");
      off.width = W; off.height = H;
      const o = off.getContext("2d");
      if (!o) return;
      drawArrow(o, W, H);
      const data = o.getImageData(0, 0, W, H).data;
      const isMobile = W / dpr < 700;
      const gap = Math.max(isMobile ? 9 : 6, Math.round(W / (isMobile ? 130 : 240)));
      const prev = particles;
      const next: Particle[] = [];
      let i = 0;
      for (let y = 0; y < H; y += gap) {
        for (let x = 0; x < W; x += gap) {
          if (data[(y * W + x) * 4 + 3] > 128) {
            const ex = prev[i];
            next.push({
              x: ex ? ex.x : Math.random() * W,
              y: ex ? ex.y : Math.random() * H,
              tx: x, ty: y,
              vx: 0, vy: 0,
              c: COLORS[i % COLORS.length],
              s: dpr * (Math.random() * 1.3 + 0.8),
            });
            i++;
          }
        }
      }
      particles = next;
    }

    function resize() {
      const rect = parent!.getBoundingClientRect();
      W = Math.max(1, Math.round(rect.width * dpr));
      H = Math.max(1, Math.round(rect.height * dpr));
      canvas!.width = W;
      canvas!.height = H;
      canvas!.style.width = rect.width + "px";
      canvas!.style.height = rect.height + "px";
      buildTargets();
      if (reduce) drawStatic();
    }

    function drawStatic() {
      ctx!.clearRect(0, 0, W, H);
      for (const p of particles) {
        ctx!.fillStyle = p.c;
        ctx!.globalAlpha = 0.85;
        ctx!.fillRect(p.tx, p.ty, p.s, p.s);
      }
      ctx!.globalAlpha = 1;
    }

    function frame() {
      ctx!.clearRect(0, 0, W, H);
      const px = mouse.active ? ((mouse.x - W / 2) / W) * 22 * dpr : 0;
      const py = mouse.active ? ((mouse.y - H / 2) / H) * 22 * dpr : 0;
      const R = 130 * dpr;
      for (const p of particles) {
        p.vx += (p.tx - p.x) * 0.013;
        p.vy += (p.ty - p.y) * 0.013;
        if (mouse.active) {
          const dx = p.x - mouse.x;
          const dy = p.y - mouse.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < R * R) {
            const d = Math.sqrt(d2) || 1;
            const f = ((R - d) / R) * 6;
            p.vx += (dx / d) * f;
            p.vy += (dy / d) * f;
          }
        }
        p.vx += (Math.random() - 0.5) * 0.14;
        p.vy += (Math.random() - 0.5) * 0.14;
        p.vx *= 0.86;
        p.vy *= 0.86;
        p.x += p.vx;
        p.y += p.vy;
        ctx!.fillStyle = p.c;
        ctx!.globalAlpha = 0.82;
        ctx!.fillRect(p.x + px, p.y + py, p.s, p.s);
      }
      ctx!.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    }

    function onMove(e: MouseEvent) {
      const rect = canvas!.getBoundingClientRect();
      mouse.x = (e.clientX - rect.left) * dpr;
      mouse.y = (e.clientY - rect.top) * dpr;
      mouse.active = true;
    }
    function onLeave() {
      mouse.active = false;
      mouse.x = -9999;
      mouse.y = -9999;
    }

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(parent);

    if (!reduce) {
      parent.addEventListener("mousemove", onMove);
      parent.addEventListener("mouseleave", onLeave);
      raf = requestAnimationFrame(frame);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      parent.removeEventListener("mousemove", onMove);
      parent.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  return <canvas ref={canvasRef} className="hero-canvas" aria-hidden="true" />;
}
