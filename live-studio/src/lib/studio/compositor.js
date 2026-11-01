// Draws the program feed onto a canvas: background, people/screens in the
// chosen layout (with animated transitions), name tags, active-speaker ring,
// lower-third banner, scrolling ticker, logo, overlay, scenes and video clips.
import { computeLayout, splitHandle } from "./layouts";
import { canvasSize, isScreenItem } from "./state";
import { createTicker, hashColor, initials } from "./utils";

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawMedia(ctx, el, sw, sh, x, y, w, h, fit) {
  if (!sw || !sh) return;
  const sA = sw / sh;
  const dA = w / h;
  if (fit === "contain") {
    let dw = w;
    let dh = h;
    if (sA > dA) dh = w / sA;
    else dw = h * sA;
    ctx.drawImage(el, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    return;
  }
  let cw = sw;
  let ch = sh;
  if (sA > dA) cw = sh * dA;
  else ch = sw / dA;
  ctx.drawImage(el, (sw - cw) / 2, (sh - ch) / 2, cw, ch, x, y, w, h);
}

function fitText(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(text.slice(0, mid) + "…").width <= maxW) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + "…";
}

function withAlpha(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return `rgba(229,32,46,${a})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export class Compositor {
  /** @param {{getSource:(id:string)=>any}} opts */
  constructor({ getSource }) {
    this.getSource = getSource;
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d", { alpha: false });
    this.state = null;
    this.quality = "1080p";
    this.rects = new Map();
    this.images = new Map();
    this.lastT = performance.now();
    this.banner = { id: null, at: 0, prev: null, prevAt: 0 };
    this.tickerStart = performance.now();
    this.clipVideo = null;
    this.clipUrl = "";
    this.onClipEnded = null;
    this.setSize(1920, 1080);
  }

  setSize(w, h) {
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.rects.clear();
    }
  }

  setQuality(q) {
    this.quality = q;
    if (this.state) this.applySize();
  }

  applySize() {
    const { width, height } = canvasSize(this.state.aspect, this.quality);
    this.setSize(width, height);
  }

  setState(state) {
    const prev = this.state;
    this.state = state;
    this.applySize();
    const b = state.brand ?? {};
    [b.logoUrl, b.bgUrl, b.overlayUrl].forEach((u) => u && this.image(u));
    if (prev?.activeBanner !== state.activeBanner) {
      this.banner = { prev: this.banner.id, prevAt: performance.now(), id: state.activeBanner, at: performance.now() };
    }
    if (prev?.activeTicker !== state.activeTicker) this.tickerStart = performance.now();
    this.syncClip(state.clip);
  }

  syncClip(clip) {
    if (!clip?.url) {
      if (this.clipVideo) {
        this.clipVideo.pause();
        this.clipVideo.removeAttribute("src");
        this.clipVideo.load();
      }
      this.clipUrl = "";
      return;
    }
    if (!this.clipVideo) {
      const v = document.createElement("video");
      v.crossOrigin = "anonymous";
      v.playsInline = true;
      v.preload = "auto";
      v.muted = true;
      v.addEventListener("ended", () => this.onClipEnded?.());
      this.clipVideo = v;
    }
    const v = this.clipVideo;
    if (this.clipUrl !== clip.url) {
      this.clipUrl = clip.url;
      v.src = clip.url;
    }
    if (clip.playing) {
      const target = Math.max(0, (Date.now() - (clip.startedAt || Date.now())) / 1000);
      if (Math.abs(v.currentTime - target) > 1.5 && v.readyState >= 1) v.currentTime = target;
      if (v.paused) v.play().catch(() => {});
    } else if (!v.paused) {
      v.pause();
      v.currentTime = 0;
    }
  }

  image(url) {
    let rec = this.images.get(url);
    if (!rec) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      rec = { img, ok: false };
      img.onload = () => (rec.ok = true);
      img.src = url;
      this.images.set(url, rec);
    }
    return rec.ok ? rec.img : null;
  }

  start(fps = 30) {
    this.stop();
    this.ticker = createTicker(fps, () => this.draw());
  }

  stop() {
    this.ticker?.stop();
    this.ticker = null;
  }

  captureStream(fps = 30) {
    return this.canvas.captureStream(fps);
  }

  stageItems() {
    const s = this.state;
    if (!s) return [];
    return (s.stage ?? [])
      .map((id) => ({ id, kind: isScreenItem(id) ? "screen" : "cam", src: this.getSource(id) }))
      .filter((it) => it.src);
  }

  draw() {
    const s = this.state;
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const now = performance.now();
    const dt = Math.min(100, now - this.lastT);
    this.lastT = now;
    if (!s) {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      return;
    }
    const brand = s.brand ?? {};
    const unit = Math.min(W, H);
    const font = brand.font || "Inter";

    this.drawBackground(ctx, W, H, brand);

    const banner = (s.banners ?? []).find((b) => b.id === s.activeBanner && !b.ticker);
    const ticker = (s.banners ?? []).find((b) => b.id === s.activeTicker && b.ticker);
    const tickerH = ticker ? Math.round(unit * 0.065) : 0;
    const bannerSpace = (banner ? Math.round(unit * 0.15) : 0) + tickerH;

    const clipPlaying = s.clip?.url && s.clip.playing && this.clipVideo && this.clipVideo.readyState >= 2;
    if (clipPlaying) {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      drawMedia(ctx, this.clipVideo, this.clipVideo.videoWidth, this.clipVideo.videoHeight, 0, 0, W, H, "contain");
    } else if (s.scene && s.scene !== "stage") {
      this.drawScene(ctx, W, H, s, brand, font, unit);
    } else {
      this.drawStage(ctx, W, H, s, brand, font, unit, bannerSpace, dt);
    }

    if (!clipPlaying) {
      this.drawLogo(ctx, W, H, brand, unit);
      this.drawBanner(ctx, W, H, s, brand, font, unit, tickerH, now);
      if (ticker) this.drawTicker(ctx, W, H, ticker, brand, font, unit, tickerH, now);
      if (brand.overlayUrl) {
        const ov = this.image(brand.overlayUrl);
        if (ov) ctx.drawImage(ov, 0, 0, W, H);
      }
    }
  }

  drawBackground(ctx, W, H, brand) {
    const bg = brand.bgUrl ? this.image(brand.bgUrl) : null;
    if (bg) {
      drawMedia(ctx, bg, bg.naturalWidth, bg.naturalHeight, 0, 0, W, H, "cover");
      return;
    }
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, brand.bgColor || "#0d0b14");
    g.addColorStop(1, withAlpha(brand.color, 0.35));
    ctx.fillStyle = brand.bgColor || "#0d0b14";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  /** Divider the host can drag for the current layout (canvas px), or null. */
  splitHandle() {
    const s = this.state;
    if (!s || (s.scene && s.scene !== "stage")) return null;
    const items = this.stageItems();
    const h = splitHandle(s.layout, items, this.canvas.width, this.canvas.height, { bannerSpace: this.bannerSpace ?? 0, splits: s.splits });
    return h ? { ...h, W: this.canvas.width, H: this.canvas.height } : null;
  }

  drawStage(ctx, W, H, s, brand, font, unit, bannerSpace, dt) {
    const items = this.stageItems();
    this.bannerSpace = bannerSpace;
    const targets = computeLayout(s.layout, items, W, H, { bannerSpace, splits: s.splits });
    const k = 1 - Math.exp(-dt / 90);
    const seen = new Set();
    for (const t of targets) {
      seen.add(t.id);
      const cur = this.rects.get(t.id);
      if (!cur) this.rects.set(t.id, { ...t });
      else {
        for (const key of ["x", "y", "w", "h", "r"]) cur[key] += (t[key] - cur[key]) * k;
        cur.fit = t.fit;
        cur.z = t.z;
      }
    }
    for (const id of [...this.rects.keys()]) if (!seen.has(id)) this.rects.delete(id);

    const ordered = targets.map((t) => this.rects.get(t.id)).sort((a, b) => a.z - b.z);
    for (const r of ordered) {
      const it = items.find((i) => i.id === r.id);
      if (it) this.drawTile(ctx, r, it, s, brand, font, unit);
    }

    if (!items.length) {
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.font = `600 ${Math.round(unit * 0.03)}px ${font}, Inter, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Add people or a screen to the stage", W / 2, H / 2);
      ctx.textAlign = "left";
    }
  }

  drawTile(ctx, r, it, s, brand, font, unit) {
    const src = it.src;
    const { x, y, w, h } = r;
    ctx.save();
    roundRectPath(ctx, x, y, w, h, r.r);
    ctx.clip();
    ctx.fillStyle = it.kind === "screen" ? "#000" : "#15131d";
    ctx.fillRect(x, y, w, h);
    const v = src.video;
    const hasFrame = src.hasVideo && v && v.readyState >= 2 && v.videoWidth > 0;
    if (hasFrame) {
      if (src.mirror && it.kind === "cam") {
        ctx.translate(2 * x + w, 0);
        ctx.scale(-1, 1);
      }
      drawMedia(ctx, v, v.videoWidth, v.videoHeight, x, y, w, h, r.fit);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    } else {
      const d = Math.min(w, h) * 0.38;
      ctx.fillStyle = hashColor(src.name);
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h / 2, d / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = `700 ${Math.round(d * 0.4)}px ${font}, Inter, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(initials(src.name), x + w / 2, y + h / 2 + d * 0.02);
      ctx.textAlign = "left";
    }
    ctx.restore();

    if (it.kind === "cam" && s.speakerHighlight && src.level > 0.04 && src.micOn) {
      ctx.save();
      ctx.strokeStyle = brand.color || "#e5202e";
      ctx.lineWidth = Math.max(3, unit * 0.005);
      roundRectPath(ctx, x + ctx.lineWidth / 2, y + ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth, r.r);
      ctx.stroke();
      ctx.restore();
    }

    if (it.kind === "cam" && s.showNames && w > unit * 0.12) {
      const scale = Math.max(0.55, Math.min(1, w / (unit * 0.9)));
      const pad = Math.round(unit * 0.014 * scale + 4);
      this.drawLabel(ctx, {
        x: x + pad,
        bottom: y + h - pad,
        maxW: w - pad * 2,
        title: src.name,
        sub: src.headline,
        brand,
        font,
        size: unit * 0.03 * scale,
      });
    }
  }

  /** Lower-third style label anchored bottom-left. */
  drawLabel(ctx, { x, bottom, maxW, title, sub, brand, font, size, alpha = 1 }) {
    if (!title) return 0;
    const theme = brand.theme || "bubble";
    const color = brand.color || "#e5202e";
    const textColor = brand.textColor || "#ffffff";
    const tSize = Math.round(size);
    const sSize = Math.round(size * 0.68);
    const padX = Math.round(size * 0.6);
    const padY = Math.round(size * 0.32);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textBaseline = "alphabetic";
    ctx.font = `700 ${tSize}px "${font}", Inter, system-ui, sans-serif`;
    const tText = fitText(ctx, title, maxW - padX * 2);
    const tW = ctx.measureText(tText).width;
    let sText = "";
    let sW = 0;
    if (sub) {
      ctx.font = `500 ${sSize}px "${font}", Inter, system-ui, sans-serif`;
      sText = fitText(ctx, sub, maxW - padX * 2);
      sW = ctx.measureText(sText).width;
    }
    const lineGap = Math.round(size * 0.18);
    const contentH = tSize + (sText ? sSize + lineGap : 0);
    const boxW = Math.min(maxW, Math.max(tW, sW) + padX * 2);
    const boxH = contentH + padY * 2;
    const top = bottom - boxH;

    if (theme === "block" && sText) {
      const tH = tSize + padY * 2;
      ctx.fillStyle = "#ffffff";
      roundRectPath(ctx, x, top, Math.min(maxW, tW + padX * 2), tH, 4);
      ctx.fill();
      ctx.fillStyle = color;
      roundRectPath(ctx, x, top + tH, Math.min(maxW, sW + padX * 2), sSize + padY * 2, 4);
      ctx.fill();
      ctx.fillStyle = "#111";
      ctx.font = `700 ${tSize}px "${font}", Inter, system-ui, sans-serif`;
      ctx.fillText(tText, x + padX, top + padY + tSize * 0.85);
      ctx.fillStyle = textColor;
      ctx.font = `500 ${sSize}px "${font}", Inter, system-ui, sans-serif`;
      ctx.fillText(sText, x + padX, top + tH + padY + sSize * 0.85);
      ctx.restore();
      return tH + sSize + padY * 2;
    }

    let fg = textColor;
    if (theme === "bubble") {
      ctx.fillStyle = color;
      roundRectPath(ctx, x, top, boxW, boxH, sText ? boxH * 0.35 : boxH / 2);
      ctx.fill();
    } else if (theme === "classic") {
      ctx.fillStyle = color;
      roundRectPath(ctx, x, top, boxW, boxH, 3);
      ctx.fill();
    } else if (theme === "minimal") {
      ctx.fillStyle = "rgba(10,10,14,0.66)";
      roundRectPath(ctx, x, top, boxW + 6, boxH, 6);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.fillRect(x, top, 6, boxH);
      fg = "#ffffff";
    } else {
      ctx.fillStyle = "#ffffff";
      roundRectPath(ctx, x, top, boxW, boxH, 4);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.fillRect(x, top, 6, boxH);
      fg = "#111111";
    }
    const tx = x + padX + (theme === "minimal" || theme === "block" ? 6 : 0);
    ctx.fillStyle = fg;
    ctx.font = `700 ${tSize}px "${font}", Inter, system-ui, sans-serif`;
    ctx.fillText(tText, tx, top + padY + tSize * 0.85);
    if (sText) {
      ctx.globalAlpha = alpha * 0.85;
      ctx.font = `500 ${sSize}px "${font}", Inter, system-ui, sans-serif`;
      ctx.fillText(sText, tx, top + padY + tSize + lineGap + sSize * 0.85);
    }
    ctx.restore();
    return boxH;
  }

  drawBanner(ctx, W, H, s, brand, font, unit, tickerH, now) {
    const find = (id) => (s.banners ?? []).find((b) => b.id === id && !b.ticker);
    const m = Math.round(unit * 0.04);
    const maxW = H > W ? W - m * 2 : W * 0.72;
    const draw = (b, a, offset) =>
      this.drawLabel(ctx, {
        x: m,
        bottom: H - m - tickerH + offset,
        maxW,
        title: b.title,
        sub: b.subtitle,
        brand,
        font,
        size: unit * 0.048,
        alpha: a,
      });
    const cur = find(this.banner.id);
    if (cur) {
      const p = Math.min(1, (now - this.banner.at) / 280);
      const e = 1 - (1 - p) ** 3;
      draw(cur, e, (1 - e) * unit * 0.04);
    }
    const prev = find(this.banner.prev);
    if (prev && prev !== cur) {
      const p = Math.min(1, (now - this.banner.prevAt) / 220);
      if (p < 1) draw(prev, 1 - p, p * unit * 0.03);
    }
  }

  drawTicker(ctx, W, H, ticker, brand, font, unit, h, now) {
    const y = H - h;
    ctx.save();
    ctx.fillStyle = brand.color || "#e5202e";
    ctx.fillRect(0, y, W, h);
    ctx.beginPath();
    ctx.rect(0, y, W, h);
    ctx.clip();
    ctx.fillStyle = brand.textColor || "#fff";
    ctx.font = `600 ${Math.round(h * 0.48)}px "${font}", Inter, system-ui, sans-serif`;
    ctx.textBaseline = "middle";
    const text = `${ticker.title}${ticker.subtitle ? "  •  " + ticker.subtitle : ""}      •      `;
    const seg = Math.max(1, ctx.measureText(text).width);
    const travelled = ((now - this.tickerStart) / 1000) * unit * 0.12;
    let x = W - travelled;
    if (x < 0) x = -(-x % seg);
    for (; x < W; x += seg) ctx.fillText(text, x, y + h / 2);
    ctx.restore();
  }

  drawLogo(ctx, W, H, brand, unit) {
    if (!brand.logoUrl) return;
    const img = this.image(brand.logoUrl);
    if (!img) return;
    const m = Math.round(unit * 0.04);
    const maxW = unit * 0.22;
    const maxH = unit * 0.11;
    const sc = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight);
    const w = img.naturalWidth * sc;
    const h = img.naturalHeight * sc;
    const pos = brand.logoPos || "top-right";
    const x = pos.endsWith("left") ? m : W - m - w;
    const y = pos.startsWith("top") ? m : H - m - h;
    ctx.drawImage(img, x, y, w, h);
  }

  drawScene(ctx, W, H, s, brand, font, unit) {
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = brand.textColor || "#fff";
    ctx.font = `800 ${Math.round(unit * 0.085)}px "${font}", Inter, system-ui, sans-serif`;
    ctx.fillText(fitText(ctx, s.sceneTitle || "", W * 0.9), W / 2, H / 2 - unit * 0.04);
    if (s.sceneSubtitle) {
      ctx.globalAlpha = 0.8;
      ctx.font = `500 ${Math.round(unit * 0.036)}px "${font}", Inter, system-ui, sans-serif`;
      ctx.fillText(fitText(ctx, s.sceneSubtitle, W * 0.85), W / 2, H / 2 + unit * 0.05);
      ctx.globalAlpha = 1;
    }
    if (s.countdownTo) {
      const left = Math.max(0, Math.round((s.countdownTo - Date.now()) / 1000));
      const mm = String(Math.floor(left / 60)).padStart(2, "0");
      const ss = String(left % 60).padStart(2, "0");
      ctx.fillStyle = brand.color || "#e5202e";
      const bw = unit * 0.24;
      const bh = unit * 0.09;
      roundRectPath(ctx, W / 2 - bw / 2, H / 2 + unit * 0.11, bw, bh, bh / 2);
      ctx.fill();
      ctx.fillStyle = brand.textColor || "#fff";
      ctx.font = `700 ${Math.round(unit * 0.05)}px "${font}", Inter, system-ui, sans-serif`;
      ctx.fillText(`${mm}:${ss}`, W / 2, H / 2 + unit * 0.11 + bh / 2);
    }
    ctx.restore();
  }
}
