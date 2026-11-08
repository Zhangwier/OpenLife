// Lightweight high-performance Canvas 2D Particle VFX Engine for Card World
// Zero external dependencies, pooled particles, smooth animation.

class Particle {
  constructor() {
    this.active = false;
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.life = 0;
    this.maxLife = 1;
    this.size = 2;
    this.color = "#fff";
    this.type = "spark";
    this.alpha = 1;
    this.decay = 0.02;
    this.gravity = 0;
    this.spin = 0;
    this.angle = 0;
  }

  init(type, x, y, opts = {}) {
    this.active = true;
    this.type = type;
    this.x = x;
    this.y = y;
    this.life = 1.0;
    this.maxLife = opts.maxLife ?? (type === "smoke" || type === "steam" ? 1.5 : 0.8);
    this.decay = 1.0 / (this.maxLife * 60);
    this.size = opts.size ?? (type === "smoke" ? 10 : type === "steam" ? 8 : type === "spark" ? 2.5 : 3);
    this.color = opts.color ?? (
      type === "spark" ? "#ffd27a" :
      type === "smoke" ? "rgba(160, 150, 140, 0.45)" :
      type === "steam" ? "rgba(230, 240, 250, 0.4)" :
      type === "qi" ? "#7fe0c8" :
      type === "magic" ? "#b890f0" : "#fff"
    );
    this.gravity = opts.gravity ?? (
      type === "spark" ? 0.08 :
      type === "smoke" || type === "steam" ? -0.04 : 0
    );
    const speed = opts.speed ?? (type === "spark" ? 2.5 : 0.8);
    const angle = opts.angle ?? (
      type === "smoke" || type === "steam" ? (-Math.PI / 2 + (Math.random() - 0.5) * 0.8) :
      Math.random() * Math.PI * 2
    );
    this.vx = Math.cos(angle) * speed + (opts.vx ?? 0);
    this.vy = Math.sin(angle) * speed + (opts.vy ?? 0);
    this.spin = (Math.random() - 0.5) * 0.05;
    this.angle = Math.random() * Math.PI * 2;
  }

  update() {
    if (!this.active) return;
    this.x += this.vx;
    this.y += this.vy;
    this.vy += this.gravity;
    this.angle += this.spin;
    this.life -= this.decay;
    if (this.type === "smoke" || this.type === "steam") {
      this.size += 0.15;
      this.vx *= 0.98;
    } else if (this.type === "spark") {
      this.vx *= 0.95;
      this.vy *= 0.95;
    } else if (this.type === "bee") {
      this.angle += 0.25;
      this.vx = Math.cos(this.angle * 1.7) * 0.5;
      this.vy = Math.sin(this.angle * 1.3) * 0.4 - 0.05;
    }
    if (this.life <= 0) this.active = false;
  }

  draw(ctx) {
    if (!this.active) return;
    const a = Math.max(0, Math.min(1, this.life));
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    if (this.type === "spark") {
      ctx.fillStyle = this.color;
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.arc(0, 0, this.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.type === "smoke" || this.type === "steam") {
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(0, 0, this.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.type === "bee") {
      ctx.fillStyle = this.color;
      ctx.beginPath(); ctx.ellipse(0, 0, this.size, this.size * 0.7, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.7)";
      ctx.beginPath(); ctx.ellipse(-this.size * 0.4, -this.size * 0.5, this.size * 0.7, this.size * 0.35, -0.5, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(this.size * 0.45, -this.size * 0.45, this.size * 0.65, this.size * 0.3, 0.5, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(50,35,20,.75)";
      ctx.fillRect(-this.size * 0.15, -this.size * 0.6, this.size * 0.3, this.size * 1.1);
    } else if (this.type === "qi" || this.type === "magic") {
      ctx.fillStyle = this.color;
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(0, 0, this.size, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = this.color;
      ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size);
    }
    ctx.restore();
  }
}

export class FXManager {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.pool = [];
    this.maxParticles = 250;
    this.lastSpawn = 0;
    this.enabled = true;
    for (let i = 0; i < this.maxParticles; i++) {
      this.pool.push(new Particle());
    }
  }

  init(canvas) {
    if (!canvas) return;
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
  }

  resize(w, h) {
    if (!this.canvas) return;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  getFree() {
    for (const p of this.pool) {
      if (!p.active) return p;
    }
    return null;
  }

  emit(type, x, y, count = 1, opts = {}) {
    if (!this.enabled) return;
    for (let i = 0; i < count; i++) {
      const p = this.getFree();
      if (!p) break;
      const ox = (Math.random() - 0.5) * (opts.spreadX ?? 6);
      const oy = (Math.random() - 0.5) * (opts.spreadY ?? 6);
      p.init(type, x + ox, y + oy, opts);
    }
  }

  // Auto-scan world card stacks to emit ambient and work particles
  scanWorld(stacks = [], now = performance.now()) {
    if (now - this.lastSpawn < 120) return;
    this.lastSpawn = now;

    for (const st of stacks) {
      if (!st.cards || !st.cards.length) continue;
      const top = st.cards[st.cards.length - 1];
      const cx = st.x + 56;
      const cy = st.y + 74;

      // Fire, stove, kiln ambient particles
      if (top.key === "fire") {
        this.emit("smoke", cx, cy - 10, 1, { size: 6, color: "rgba(180,160,140,0.35)", maxLife: 1.2 });
        if (Math.random() < 0.4) {
          this.emit("spark", cx, cy - 12, 1, { size: 2, color: "#f0a24a", speed: 1.5, gravity: -0.05 });
        }
      } else if (top.key === "stove") {
        this.emit("steam", cx, cy - 24, 1, { size: 7, color: "rgba(240,245,255,0.4)", maxLife: 1.4 });
      } else if (top.key === "kiln") {
        this.emit("smoke", cx, cy - 28, 1, { size: 8, color: "rgba(120,110,100,0.4)", maxLife: 1.5 });
      } else if (top.key === "hive" && (top.stock ?? 0) > 0) {
        this.emit("bee", cx + (Math.random() - 0.5) * 64, cy - 8 + (Math.random() - 0.5) * 48, 1, { size: 2.4, color: "#e8c34a", maxLife: 1.4, speed: 0.2, gravity: 0 });
      }

      // Work / Crafting progress sparkles
      if (st.bar && st.bar.offsetWidth > 0) {
        if (Math.random() < 0.6) {
          this.emit("spark", cx, cy, 2, {
            size: 2.2,
            color: "#f0d27a",
            speed: 2.0,
            gravity: 0.08
          });
        }
      }

      // Supernatural / Cultivation / Magic aura
      if (top.key === "flying_sword" || top.key === "cultivator" || top.key === "alchemy_furnace") {
        if (Math.random() < 0.5) {
          this.emit("qi", cx, cy - 15, 1, { size: 3, color: "#7fe0c8", maxLife: 0.9, speed: 0.8 });
        }
      } else if (top.key === "wizard_tower" || top.key === "archmage" || top.key === "spellbook") {
        if (Math.random() < 0.5) {
          this.emit("magic", cx, cy - 15, 1, { size: 3, color: "#c894ff", maxLife: 0.9, speed: 0.8 });
        }
      }
    }
  }

  clear() {
    for (const p of this.pool) p.active = false;
    if (this.ctx && this.canvas) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  updateAndDraw() {
    if (!this.ctx || !this.canvas) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    for (const p of this.pool) {
      if (p.active) {
        p.update();
        p.draw(this.ctx);
      }
    }
  }
}

export const fx = new FXManager();
