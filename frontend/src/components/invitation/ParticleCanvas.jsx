import React, { useEffect, useRef } from "react";

// GPU-friendly HTML5 Canvas particle engine. Video-free realistic ambience.
// type: rose_petals | leaves | gold_dust | sparkle | bokeh | confetti | hearts | snow | orient
// Pauses when the tab is hidden; resizes to its parent; DPR-aware.
const hexToRgb = (h) => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(h || "#ffffff");
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : { r: 255, g: 255, b: 255 };
};
const rnd = (a, b) => a + Math.random() * (b - a);

function makeParticle(type, w, h, color, burst) {
  const base = { x: rnd(0, w), y: rnd(0, h), rot: rnd(0, Math.PI * 2), vr: rnd(-0.02, 0.02), life: 1, phase: rnd(0, Math.PI * 2) };
  switch (type) {
    case "rose_petals":
      return { ...base, y: rnd(-h, 0), size: rnd(9, 20), vy: rnd(0.5, 1.4), sway: rnd(14, 34), swaySpeed: rnd(0.6, 1.4), vr: rnd(-0.03, 0.03), shape: "petal" };
    case "leaves":
      return { ...base, y: rnd(-h, 0), size: rnd(10, 22), vy: rnd(0.45, 1.1), sway: rnd(18, 40), swaySpeed: rnd(0.5, 1.1), vr: rnd(-0.035, 0.035), shape: "leaf" };
    case "gold_dust":
      return { ...base, size: rnd(1.2, 3.2), vy: rnd(-0.5, -0.15), vx: rnd(-0.2, 0.2), twinkle: rnd(1.2, 3), shape: "dust" };
    case "orient":
      return { ...base, size: rnd(1.4, 3.8), vy: rnd(-0.35, -0.1), vx: rnd(-0.25, 0.25), twinkle: rnd(1.4, 3.2), shape: "dust" };
    case "sparkle":
      return { ...base, size: rnd(3, 9), twinkle: rnd(1.4, 3.4), shape: "star", vy: rnd(-0.06, 0.06) };
    case "bokeh":
      return { ...base, size: rnd(16, 60), twinkle: rnd(3, 6), shape: "bokeh", vx: rnd(-0.08, 0.08), vy: rnd(-0.08, 0.08) };
    case "hearts":
      return { ...base, y: rnd(0, h), size: rnd(10, 22), vy: rnd(-0.7, -0.3), sway: rnd(12, 28), swaySpeed: rnd(0.6, 1.2), shape: "heart" };
    case "snow":
      return { ...base, y: rnd(-h, 0), size: rnd(2, 5), vy: rnd(0.4, 1), sway: rnd(10, 24), swaySpeed: rnd(0.5, 1), shape: "dot" };
    case "confetti":
      return burst
        ? { ...base, x: rnd(w * 0.3, w * 0.7), y: rnd(-20, h * 0.2), size: rnd(5, 11), vx: rnd(-2.4, 2.4), vy: rnd(1.2, 3.6), vr: rnd(-0.25, 0.25), shape: "rect", ci: Math.floor(rnd(0, 5)) }
        : { ...base, y: rnd(-h, 0), size: rnd(5, 11), vx: rnd(-1, 1), vy: rnd(1.2, 3), vr: rnd(-0.2, 0.2), shape: "rect", ci: Math.floor(rnd(0, 5)) };
    default:
      return { ...base, size: 3, vy: 1, shape: "dot" };
  }
}

const CONFETTI_COLORS = ["#ff5d8f", "#ffd166", "#4cc9f0", "#7bd389", "#c77dff"];

export default function ParticleCanvas({ type = "gold_dust", color = "#c8a24a", density = 1, className = "", style = {} }) {
  const ref = useRef(null);
  const raf = useRef(0);
  useEffect(() => {
    if (!type) return;
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const rgb = hexToRgb(color);
    let w = 0, h = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
    let parts = [];
    let running = true;
    let t0 = performance.now();

    const resize = () => {
      const p = canvas.parentElement;
      w = p ? p.clientWidth : window.innerWidth;
      h = p ? p.clientHeight : window.innerHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const area = w * h;
      let count = Math.round((area / 26000) * density);
      count = Math.max(10, Math.min(140, count));
      if (type === "bokeh") count = Math.min(count, 34);
      parts = Array.from({ length: count }, () => makeParticle(type, w, h, color, type === "confetti"));
    };
    resize();
    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    const drawPetal = (p) => {
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size * 0.55, p.size, 0, 0, Math.PI * 2);
      ctx.fill();
    };
    const drawLeaf = (p) => {
      ctx.beginPath();
      ctx.moveTo(0, -p.size);
      ctx.quadraticCurveTo(p.size * 0.7, 0, 0, p.size);
      ctx.quadraticCurveTo(-p.size * 0.7, 0, 0, -p.size);
      ctx.fill();
    };
    const drawStar = (p) => {
      const s = p.size;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s);
        ctx.lineTo(Math.cos(a + 0.28) * s * 0.32, Math.sin(a + 0.28) * s * 0.32);
      }
      ctx.fill();
    };
    const drawHeart = (p) => {
      const s = p.size * 0.5;
      ctx.beginPath();
      ctx.moveTo(0, s * 0.7);
      ctx.bezierCurveTo(s * 1.4, -s * 0.6, s * 0.5, -s * 1.5, 0, -s * 0.5);
      ctx.bezierCurveTo(-s * 0.5, -s * 1.5, -s * 1.4, -s * 0.6, 0, s * 0.7);
      ctx.fill();
    };

    const frame = (now) => {
      if (!running) return;
      const dt = Math.min(2.4, (now - t0) / 16.67);
      t0 = now;
      ctx.clearRect(0, 0, w, h);
      for (const p of parts) {
        p.phase += 0.02 * dt;
        if (p.shape === "petal" || p.shape === "leaf") {
          p.y += p.vy * dt;
          p.x += Math.sin(p.phase * p.swaySpeed) * p.sway * 0.02 * dt;
          p.rot += p.vr * dt;
          if (p.y > h + 30) { p.y = -20; p.x = rnd(0, w); }
        } else if (p.shape === "dust") {
          p.y += p.vy * dt; p.x += (p.vx + Math.sin(p.phase) * 0.15) * dt;
          if (p.y < -10) { p.y = h + 10; p.x = rnd(0, w); }
          if (p.x < -10) p.x = w + 10; else if (p.x > w + 10) p.x = -10;
        } else if (p.shape === "star" || p.shape === "bokeh") {
          p.x += (p.vx || 0) * dt; p.y += (p.vy || 0) * dt;
          if (p.x < -60) p.x = w + 60; else if (p.x > w + 60) p.x = -60;
          if (p.y < -60) p.y = h + 60; else if (p.y > h + 60) p.y = -60;
        } else if (p.shape === "heart") {
          p.y += p.vy * dt; p.x += Math.sin(p.phase * p.swaySpeed) * p.sway * 0.02 * dt;
          if (p.y < -30) { p.y = h + 20; p.x = rnd(0, w); }
        } else if (p.shape === "rect") {
          p.y += p.vy * dt; p.x += p.vx * dt; p.vy += 0.02 * dt; p.rot += p.vr * dt;
          if (p.y > h + 20) { p.y = -20; p.vy = rnd(1.2, 3); p.x = rnd(0, w); }
        } else if (p.shape === "dot") {
          p.y += p.vy * dt; p.x += Math.sin(p.phase * (p.swaySpeed || 1)) * (p.sway || 0) * 0.02 * dt;
          if (p.y > h + 10) { p.y = -10; p.x = rnd(0, w); }
        }

        let alpha = 0.85;
        if (p.twinkle) alpha = 0.35 + 0.6 * (0.5 + 0.5 * Math.sin(p.phase * p.twinkle));
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        if (p.shape === "rect") {
          const c = hexToRgb(CONFETTI_COLORS[p.ci % CONFETTI_COLORS.length]);
          ctx.fillStyle = `rgba(${c.r},${c.g},${c.b},0.9)`;
          ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
        } else if (p.shape === "bokeh") {
          const g = ctx.createRadialGradient(0, 0, 0, 0, 0, p.size);
          g.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha * 0.5})`);
          g.addColorStop(1, `rgba(${rgb.r},${rgb.g},${rgb.b},0)`);
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(0, 0, p.size, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
          if (p.shape === "star") ctx.shadowColor = `rgba(${rgb.r},${rgb.g},${rgb.b},0.9)`, ctx.shadowBlur = p.size;
          if (p.shape === "petal") drawPetal(p);
          else if (p.shape === "leaf") drawLeaf(p);
          else if (p.shape === "star") drawStar(p);
          else if (p.shape === "heart") drawHeart(p);
          else { ctx.beginPath(); ctx.arc(0, 0, p.size, 0, Math.PI * 2); ctx.fill(); }
        }
        ctx.restore();
      }
      raf.current = requestAnimationFrame(frame);
    };
    raf.current = requestAnimationFrame(frame);
    const onVis = () => { running = !document.hidden; if (running) { t0 = performance.now(); raf.current = requestAnimationFrame(frame); } };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      running = false;
      cancelAnimationFrame(raf.current);
      document.removeEventListener("visibilitychange", onVis);
      ro.disconnect();
    };
  }, [type, color, density]);

  if (!type) return null;
  return <canvas ref={ref} aria-hidden className={`pointer-events-none absolute inset-0 ${className}`} style={style} />;
}
