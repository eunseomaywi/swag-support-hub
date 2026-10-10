import { COLOURS, type PublicSignature } from "./model";
import { LOGO_REGIONS } from "./logo";
import { makeDecorativeSignature } from "./decorative";
import { assignSlots, type RenderSlot, type TargetSlot } from "./slots";
import { hash, seeded } from "./random";
import { makeTargets } from "./targets.client";

type Particle = {
  slot: RenderSlot;
  id: string;
  sprite: HTMLCanvasElement;
  x: number;
  y: number;
  tx: number;
  ty: number;
  sx: number;
  sy: number;
  ox: number;
  oy: number;
  vx: number;
  vy: number;
  rotation: number;
  size: number;
  alpha: number;
  start: number;
  duration: number;
  joining: boolean;
};
const clamp = (v: number) => Math.max(0, Math.min(1, v));
export class SignatureAnimation {
  private ctx: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private targets: TargetSlot[] = [];
  private records: PublicSignature[] = [];
  private width = 1;
  private height = 1;
  private logo = { x: 0, y: 0, size: 1 };
  private raf = 0;
  private last = 0;
  private destroyed = false;
  private initialized = false;
  private reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  private observer: ResizeObserver;
  private background = document.createElement("canvas");
  private ripples: { x: number; y: number; start: number; colour: string }[] = [];
  private resize = () => {
    const box = this.canvas.getBoundingClientRect();
    if (box.width < 1 || box.height < 1 || (box.width === this.width && box.height === this.height))
      return;
    this.width = box.width;
    this.height = box.height;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const compact = this.width < 860;
    const square = compact
      ? Math.min(this.width * 0.9, this.height * 0.5)
      : Math.min(this.height * 0.83, this.width * 0.5);
    const cx = this.width * (compact ? 0.5 : 0.735),
      cy = this.height * (compact ? 0.62 : 0.53);
    this.logo = { x: cx - square / 2, y: cy - square / 2, size: square };
    const count = this.width < 640 ? 500 : 980;
    if (this.targets.length !== count) this.targets = makeTargets(count);
    this.cacheBackground();
    this.reconcile(!this.initialized);
    this.initialized = true;
    this.wake();
  };
  private motionChanged = () => {
    if (this.reduced.matches) {
      for (const p of this.particles) {
        p.start = 0;
        p.ox = p.oy = p.vx = p.vy = 0;
      }
      this.ripples = [];
    }
    this.wake();
  };
  private pointer = (event: PointerEvent) => {
    if (this.reduced.matches) return;
    const rect = this.canvas.getBoundingClientRect();
    this.push(
      event.clientX - rect.left,
      event.clientY - rect.top,
      event.type === "pointerdown" ? 4 : 0.8,
    );
    this.wake();
  };
  private visibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    } else this.wake();
  };
  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(canvas);
    canvas.addEventListener("pointermove", this.pointer, { passive: true });
    canvas.addEventListener("pointerdown", this.pointer, { passive: true });
    this.reduced.addEventListener("change", this.motionChanged);
    document.addEventListener("visibilitychange", this.visibility);
    this.resize();
  }
  private cacheBackground() {
    this.background.width = this.canvas.width;
    this.background.height = this.canvas.height;
    const ctx = this.background.getContext("2d")!,
      dpr = Math.min(devicePixelRatio || 1, 2);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(this.logo.x, this.logo.y);
    ctx.scale(this.logo.size / 512, this.logo.size / 512);
    for (const region of LOGO_REGIONS) {
      ctx.fillStyle = COLOURS[region.id] + "0A";
      ctx.fill(new Path2D(region.path), "evenodd");
    }
  }
  private sprite(slot: RenderSlot): HTMLCanvasElement {
    const sprite = document.createElement("canvas");
    sprite.width = 168;
    sprite.height = 90;
    const ctx = sprite.getContext("2d")!;
    const rand = seeded(slot.signature?.id || slot.key),
      region = LOGO_REGIONS.find((r) => r.id === slot.region)!;
    ctx.strokeStyle = slot.signature
      ? COLOURS[slot.region]
      : region.inks[Math.floor(rand() * region.inks.length)]!;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.translate(84, 45);
    const path = new Path2D();
    let width: number;
    let strokes: { x: number; y: number; p: number }[][];
    if (slot.signature) {
      const points = slot.strokes.flat();
      const minX = Math.min(...points.map((p) => p[0])),
        maxX = Math.max(...points.map((p) => p[0]));
      const minY = Math.min(...points.map((p) => p[1])),
        maxY = Math.max(...points.map((p) => p[1]));
      const scale = Math.min(
        120 / Math.max(0.05, (maxX - minX) * 2.7),
        60 / Math.max(0.05, maxY - minY),
      );
      strokes = slot.strokes.map((s) =>
        s.map((p) => ({
          x: (p[0] - (minX + maxX) / 2) * 2.7 * scale,
          y: (p[1] - (minY + maxY) / 2) * scale,
          p: p[2] ?? 0.5,
        })),
      );
      width = 2.1;
    } else {
      const sig = makeDecorativeSignature(hash(slot.key));
      strokes = sig.strokes.map((s) =>
        s.map((p) => ({ x: p.x * 54 * sig.aspect, y: p.y * 54, p: p.p })),
      );
      width = sig.lineWidth * 54;
    }
    for (const stroke of strokes) {
      if (!stroke.length) continue;
      path.moveTo(stroke[0]!.x, stroke[0]!.y);
      for (let i = 1; i < stroke.length - 1; i++) {
        const p = stroke[i]!,
          next = stroke[i + 1]!;
        path.quadraticCurveTo(p.x, p.y, (p.x + next.x) / 2, (p.y + next.y) / 2);
      }
      const end = stroke.at(-1)!;
      path.lineTo(end.x, end.y);
    }
    ctx.globalAlpha = 0.14;
    ctx.lineWidth = width * 2.1;
    ctx.stroke(path);
    ctx.globalAlpha = 1;
    ctx.lineWidth = width;
    ctx.stroke(path);
    return sprite;
  }
  private reconcile(formation = false, joinId?: string) {
    const old = new Map(this.particles.map((p) => [p.slot.key, p]));
    const previous = new Map(
      this.particles.filter((p) => p.slot.signature).map((p) => [p.id, p.slot.key]),
    );
    const slots = assignSlots(this.targets, this.records, previous),
      now = performance.now();
    this.particles = slots.map((slot) => {
      const prior = old.get(slot.key),
        id = slot.signature?.id || slot.key,
        random = seeded(id);
      const tx = this.logo.x + (slot.x / 512) * this.logo.size,
        ty = this.logo.y + (slot.y / 512) * this.logo.size;
      if (prior?.id === id && !formation) {
        prior.slot = slot;
        prior.tx = tx;
        prior.ty = ty;
        return prior;
      }
      const joining = Boolean(slot.signature && !formation && (prior?.id !== id || id === joinId));
      const side = Math.floor(random() * 4),
        margin = 80;
      const sx = joining
        ? this.width * 0.5
        : side === 0
          ? -margin
          : side === 1
            ? this.width + margin
            : random() * this.width;
      const sy = joining
        ? this.height + 60
        : side === 2
          ? -margin
          : side === 3
            ? this.height + margin
            : random() * this.height;
      const start = this.reduced.matches ? 0 : now + (joining ? 0 : random() * 1200);
      return {
        slot,
        id,
        sprite: prior?.id === id ? prior.sprite : this.sprite(slot),
        x: tx,
        y: ty,
        tx,
        ty,
        sx,
        sy,
        ox: 0,
        oy: 0,
        vx: 0,
        vy: 0,
        rotation: (random() - 0.5) * 0.26,
        size: (this.width < 640 ? 11 : 18) + random() * (this.width < 640 ? 7 : 11),
        alpha: slot.signature ? 1 : 0.78 + random() * 0.2,
        start,
        duration: joining ? 1700 : 2800 + random() * 600,
        joining,
      };
    });
    // A user's receipt may already be in the approved sample; replay only that mark.
    if (joinId) {
      const p = this.particles.find((p) => p.id === joinId);
      if (p) {
        p.sx = this.width * 0.5;
        p.sy = this.height + 60;
        p.start = this.reduced.matches ? 0 : now;
        p.duration = 1700;
        p.joining = true;
      }
    }
  }
  setSignatures(records: PublicSignature[], joinId?: string) {
    if (
      !joinId &&
      records.length === this.records.length &&
      records.every((r, i) => r.id === this.records[i]?.id)
    )
      return;
    this.records = records;
    this.reconcile(false, joinId);
    this.wake();
  }
  replay() {
    this.reconcile(true);
    this.wake();
  }
  private push(x: number, y: number, strength: number) {
    const radius = this.width < 640 ? 80 : 115;
    for (const p of this.particles) {
      const dx = p.x - x,
        dy = p.y - y,
        d = Math.max(1, Math.hypot(dx, dy));
      if (d < radius) {
        p.vx += (dx / d) * (1 - d / radius) * strength;
        p.vy += (dy / d) * (1 - d / radius) * strength;
      }
    }
  }
  private wake() {
    if (this.raf || this.destroyed || document.hidden) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }
  private frame = (now: number) => {
    this.raf = 0;
    const dt = Math.min(2, (now - this.last) / 16.667);
    this.last = now;
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.ctx.drawImage(this.background, 0, 0, this.width, this.height);
    let moving = false,
      joining = false,
      forming = false;
    for (const p of this.particles) {
      const progress = p.start === 0 ? 1 : clamp((now - p.start) / p.duration),
        eased = 1 - (1 - progress) ** 3;
      if (progress < 1) {
        moving = true;
        if (p.joining) joining = true;
        else forming = true;
      } else if (p.joining) {
        p.joining = false;
        if (!this.reduced.matches) {
          this.ripples.push({ x: p.tx, y: p.ty, start: now, colour: COLOURS[p.slot.region] });
          this.push(p.tx, p.ty, 2);
        }
      }
      p.vx = (p.vx - p.ox * 0.032 * dt) * Math.pow(0.8, dt);
      p.vy = (p.vy - p.oy * 0.032 * dt) * Math.pow(0.8, dt);
      p.ox += p.vx * dt;
      p.oy += p.vy * dt;
      if (Math.abs(p.ox) + Math.abs(p.oy) + Math.abs(p.vx) + Math.abs(p.vy) > 0.025) moving = true;
      else p.ox = p.oy = p.vx = p.vy = 0;
      p.x = p.sx + (p.tx - p.sx) * eased + p.ox;
      p.y = p.sy + (p.ty - p.sy) * eased + p.oy;
      const size = p.size * (p.slot.signature ? 1.25 : 1.12) * (1 + (1 - eased) * 0.7),
        scale = size / 54;
      this.ctx.save();
      this.ctx.translate(p.x, p.y);
      this.ctx.rotate(p.rotation + (1 - eased) * (p.rotation * 6));
      this.ctx.globalAlpha = p.alpha;
      this.ctx.globalCompositeOperation = p.slot.signature ? "source-over" : "multiply";
      this.ctx.drawImage(
        p.sprite,
        (-p.sprite.width * scale) / 2,
        (-p.sprite.height * scale) / 2,
        p.sprite.width * scale,
        p.sprite.height * scale,
      );
      this.ctx.restore();
    }
    this.ripples = this.ripples.filter((r) => now - r.start < 1100);
    for (const r of this.ripples) {
      const t = (now - r.start) / 1100;
      this.ctx.globalAlpha = (1 - t) * 0.5;
      this.ctx.strokeStyle = r.colour;
      this.ctx.lineWidth = 1.2;
      this.ctx.beginPath();
      this.ctx.arc(r.x, r.y, 10 + t * 60, 0, Math.PI * 2);
      this.ctx.stroke();
    }
    this.ctx.globalAlpha = 1;
    this.canvas.dataset["animationState"] = joining
      ? "joining"
      : forming
        ? "assembling"
        : moving || this.ripples.length
          ? "responding"
          : "idle";
    if (moving || this.ripples.length) this.raf = requestAnimationFrame(this.frame);
  };
  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.canvas.removeEventListener("pointermove", this.pointer);
    this.canvas.removeEventListener("pointerdown", this.pointer);
    this.reduced.removeEventListener("change", this.motionChanged);
    document.removeEventListener("visibilitychange", this.visibility);
    this.particles = [];
  }
}
