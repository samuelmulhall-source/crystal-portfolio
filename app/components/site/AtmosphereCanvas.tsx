"use client";

import { useEffect, useRef } from "react";
import { useDisplayMode } from "./DisplayModeProvider";

type Star = {
  x: number;
  y: number;
  size: number;
  twinkle: number;
  drift: number;
  depth: number;
  hue: number;
};

type Meteor = {
  active: boolean;
  delay: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  duration: number;
};

function createStars(count: number): Star[] {
  return Array.from({ length: count }, (_, index) => ({
    x: ((index * 17.23) % 1000) / 1000,
    y: ((index * 29.71) % 1000) / 1000,
    size: 0.45 + (((index * 13) % 100) / 100) * 2.2,
    twinkle: ((index * 31) % 628) / 100,
    drift: 0.015 + (((index * 11) % 100) / 100) * 0.045,
    depth: 0.35 + (((index * 7) % 100) / 100) * 0.75,
    hue: index % 9 === 0 ? 194 : index % 13 === 0 ? 206 : 210,
  }));
}

function resetMeteor(meteor: Meteor, index: number, immediate = false) {
  meteor.active = false;
  meteor.delay = (immediate ? 1.2 : 5.5) + index * 2.4;
  meteor.x = 0;
  meteor.y = 0;
  meteor.vx = 0;
  meteor.vy = 0;
  meteor.life = 0;
  meteor.duration = 0;
}

export function AtmosphereCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { effectiveMode } = useDisplayMode();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const pointer = {
      x: 0,
      y: 0,
      tx: 0,
      ty: 0,
      active: false,
    };

    const stars = createStars(effectiveMode === "enhanced" ? 220 : 110);
    const meteors = Array.from({ length: effectiveMode === "enhanced" ? 3 : 1 }, (): Meteor => ({
      active: false,
      delay: 0,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      duration: 0,
    }));

    meteors.forEach((meteor, index) => resetMeteor(meteor, index, true));

    let width = 0;
    let height = 0;
    let dpr = 1;
    let raf = 0;
    const start = performance.now();

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      pointer.x = width * 0.5;
      pointer.y = height * 0.3;
      pointer.tx = pointer.x;
      pointer.ty = pointer.y;
    };

    const onMove = (event: MouseEvent) => {
      pointer.tx = event.clientX;
      pointer.ty = event.clientY;
      pointer.active = true;
    };

    const onLeave = () => {
      pointer.active = false;
      pointer.tx = width * 0.5;
      pointer.ty = height * 0.34;
    };

    const draw = (now: number) => {
      raf = window.requestAnimationFrame(draw);
      const elapsed = (now - start) * 0.001;
      const dt = 1 / 60;

      pointer.x += (pointer.tx - pointer.x) * 0.09;
      pointer.y += (pointer.ty - pointer.y) * 0.09;

      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";

      const hovered: Array<{ x: number; y: number; dist: number }> = [];

      for (const star of stars) {
        const px = pointer.active ? ((pointer.x / width) - 0.5) * (1 - star.depth) * 46 : 0;
        const py = pointer.active ? ((pointer.y / height) - 0.45) * (1 - star.depth) * 28 : 0;
        const x = (((star.x + elapsed * star.drift) % 1) * width) + px;
        const y = (star.y * height) + Math.sin(elapsed * (0.7 + star.depth * 0.8) + star.twinkle) * (8 + (1 - star.depth) * 10) + py;

        const dx = x - pointer.x;
        const dy = y - pointer.y;
        const dist = Math.hypot(dx, dy);
        const hoverThreshold = effectiveMode === "enhanced" ? 120 : 72;
        const hover = pointer.active ? Math.max(0, 1 - dist / hoverThreshold) : 0;
        const twinkle = 0.4 + (Math.sin(elapsed * (2 + star.depth * 2) + star.twinkle) + 1) * 0.3;
        const radius = star.size * (0.7 + star.depth * 0.65 + hover * 1.4);
        const alpha = 0.14 + twinkle * 0.35 + hover * 0.22;

        ctx.fillStyle = `hsla(${star.hue}, 90%, ${hover > 0 ? 84 : 76}%, ${alpha})`;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();

        if (hover > 0.08) {
          hovered.push({ x, y, dist });
          ctx.fillStyle = `rgba(206, 240, 255, ${0.08 + hover * 0.18})`;
          ctx.beginPath();
          ctx.arc(x, y, radius * (5.5 + hover * 3), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      hovered.sort((left, right) => left.dist - right.dist);
      const activeLinks = hovered.slice(0, effectiveMode === "enhanced" ? 5 : 3);

      if (pointer.active && activeLinks.length > 0) {
        ctx.strokeStyle = "rgba(170, 224, 255, 0.18)";
        ctx.lineWidth = 1;
        ctx.setLineDash([7, 12]);
        for (const star of activeLinks) {
          ctx.beginPath();
          ctx.moveTo(pointer.x, pointer.y);
          ctx.lineTo(star.x, star.y);
          ctx.stroke();
        }

        ctx.setLineDash([]);
        for (let index = 0; index < activeLinks.length - 1; index += 1) {
          const current = activeLinks[index];
          const next = activeLinks[index + 1];
          ctx.beginPath();
          ctx.moveTo(current.x, current.y);
          ctx.lineTo(next.x, next.y);
          ctx.stroke();
        }

        const cursorGlow = ctx.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, 90);
        cursorGlow.addColorStop(0, "rgba(220, 245, 255, 0.12)");
        cursorGlow.addColorStop(0.3, "rgba(118, 201, 255, 0.08)");
        cursorGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = cursorGlow;
        ctx.beginPath();
        ctx.arc(pointer.x, pointer.y, 90, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();

      for (let index = 0; index < meteors.length; index += 1) {
        const meteor = meteors[index];
        if (!meteor.active) {
          meteor.delay -= dt;
          if (meteor.delay <= 0) {
            meteor.active = true;
            meteor.life = 0;
            meteor.duration = 0.8 + index * 0.18;
            meteor.x = width * (0.08 + ((index * 23) % 100) / 100 * 0.64);
            meteor.y = height * (0.1 + ((index * 17) % 100) / 100 * 0.16);
            meteor.vx = 340 + index * 85;
            meteor.vy = 180 + index * 45;
          }
          continue;
        }

        meteor.life += dt;
        meteor.x += meteor.vx * dt;
        meteor.y += meteor.vy * dt;

        const lifeAlpha = Math.max(0, 1 - meteor.life / meteor.duration);
        const tailX = meteor.x - meteor.vx * 0.14;
        const tailY = meteor.y - meteor.vy * 0.14;

        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const gradient = ctx.createLinearGradient(tailX, tailY, meteor.x, meteor.y);
        gradient.addColorStop(0, "rgba(255,255,255,0)");
        gradient.addColorStop(0.55, `rgba(164, 220, 255, ${lifeAlpha * 0.2})`);
        gradient.addColorStop(1, `rgba(240, 249, 255, ${lifeAlpha * 0.9})`);
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(meteor.x, meteor.y);
        ctx.stroke();
        ctx.restore();

        if (meteor.life >= meteor.duration || meteor.x > width + 120 || meteor.y > height + 60) {
          resetMeteor(meteor, index);
        }
      }
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mouseleave", onLeave);
    raf = window.requestAnimationFrame(draw);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseleave", onLeave);
    };
  }, [effectiveMode]);

  return <canvas ref={canvasRef} className="site-atmosphere-canvas" aria-hidden="true" />;
}
