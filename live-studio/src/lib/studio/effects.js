// Camera effects: touch-up, clarity, low-light, colour, background blur and
// virtual backgrounds. Runs entirely on this device (WebGL2 + MediaPipe
// selfie segmentation), so nothing is uploaded and guests get it too.
//
// Pipeline per frame
//   camera frame -> texture
//   (background on) person mask from the segmenter, smoothed over time
//   (blur)          mask-weighted blur of the background at quarter res
//   final pass      low-light lift -> skin smoothing (bilateral, skin-only)
//                   -> clarity -> colour -> mask refined against the
//                   full-res image (joint bilateral) -> light-wrap composite
import { createTicker } from "./utils";
import { resolveBackground } from "./bgstore";

export const DEFAULT_FX = {
  smoothing: 0,
  clarity: 0,
  lowLight: 0,
  brightness: 0,
  contrast: 0,
  saturation: 0,
  warmth: 0,
  background: "none", // none | blur | image
  blur: 0.6,
  bgImage: null, // "preset:<id>", "account:<id>" / "stored:<id>" (saved uploads) or an image URL
  autoFrame: false, // keep the subject centred (digital pan/zoom)
  mirror: true,
  quality: "1080p", // "720p" = lighter processing for slower computers
};

export function fxSize(quality) {
  return quality === "720p" ? { maxWidth: 1280, maxHeight: 720 } : { maxWidth: 1920, maxHeight: 1080 };
}

export const FX_PRESETS = [
  { id: "natural", label: "Natural", fx: { smoothing: 0.35, clarity: 0.25, lowLight: 0, brightness: 0.02, contrast: 0.05, saturation: 0.05, warmth: 0.05 } },
  { id: "glow", label: "Studio glow", fx: { smoothing: 0.6, clarity: 0.2, lowLight: 0.15, brightness: 0.05, contrast: 0.08, saturation: 0.1, warmth: 0.15 } },
  { id: "crisp", label: "Crisp", fx: { smoothing: 0.15, clarity: 0.6, lowLight: 0, brightness: 0, contrast: 0.15, saturation: 0.1, warmth: 0 } },
  { id: "lowlight", label: "Low light", fx: { smoothing: 0.4, clarity: 0.3, lowLight: 0.7, brightness: 0.05, contrast: 0.05, saturation: 0.1, warmth: 0.05 } },
];

export const BG_PRESETS = [
  { id: "studio", label: "Studio" },
  { id: "bokeh", label: "Bokeh" },
  { id: "loft", label: "Loft" },
  { id: "clean", label: "Clean" },
  { id: "brand", label: "Brand" },
];

export function fxActive(fx) {
  if (!fx) return false;
  return (
    fx.background !== "none" ||
    !!fx.autoFrame ||
    ["smoothing", "clarity", "lowLight", "brightness", "contrast", "saturation", "warmth"].some((k) => Math.abs(fx[k] || 0) > 0.001)
  );
}

// ---------- procedural background presets ----------

const presetCache = new Map();

export function presetBackground(id, brandColor = "#e5202e") {
  const key = `${id}|${brandColor}`;
  if (presetCache.has(key)) return presetCache.get(key);
  const W = 1920;
  const H = 1080;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  const rand = mulberry(id.length * 9973);
  if (id === "studio") {
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#15121a");
    bg.addColorStop(1, "#060508");
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    const glow = g.createRadialGradient(W * 0.72, H * 0.35, 0, W * 0.72, H * 0.35, W * 0.55);
    glow.addColorStop(0, hexA(brandColor, 0.55));
    glow.addColorStop(1, hexA(brandColor, 0));
    g.fillStyle = glow;
    g.fillRect(0, 0, W, H);
    g.fillStyle = "rgba(255,255,255,0.04)";
    for (let i = 0; i < 9; i++) g.fillRect(W * 0.08 + i * W * 0.1, H * 0.62, W * 0.06, H * 0.38);
  } else if (id === "bokeh") {
    g.fillStyle = "#1b1410";
    g.fillRect(0, 0, W, H);
    g.filter = "blur(18px)";
    for (let i = 0; i < 70; i++) {
      const r = 20 + rand() * 90;
      const hue = 25 + rand() * 30;
      g.fillStyle = `hsla(${hue}, 90%, ${55 + rand() * 25}%, ${0.15 + rand() * 0.35})`;
      g.beginPath();
      g.arc(rand() * W, rand() * H, r, 0, Math.PI * 2);
      g.fill();
    }
    g.filter = "none";
  } else if (id === "loft") {
    const bg = g.createLinearGradient(0, 0, W, 0);
    bg.addColorStop(0, "#3a2f28");
    bg.addColorStop(1, "#211a16");
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    g.filter = "blur(6px)";
    for (let y = 0; y < H; y += 54) {
      for (let x = (y / 54) % 2 ? -60 : 0; x < W; x += 120) {
        const v = 60 + rand() * 30;
        g.fillStyle = `rgb(${v + 50}, ${v + 10}, ${v - 10})`;
        g.fillRect(x + 3, y + 3, 114, 48);
      }
    }
    g.filter = "blur(30px)";
    g.fillStyle = "rgba(255, 210, 150, 0.35)";
    g.fillRect(W * 0.62, H * 0.1, W * 0.3, H * 0.55);
    g.filter = "none";
    const v = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.75);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.55)");
    g.fillStyle = v;
    g.fillRect(0, 0, W, H);
  } else if (id === "clean") {
    const bg = g.createRadialGradient(W / 2, H * 0.4, 0, W / 2, H * 0.4, W * 0.8);
    bg.addColorStop(0, "#f4f4f5");
    bg.addColorStop(1, "#c9c9cf");
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
  } else {
    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, brandColor);
    bg.addColorStop(1, "#0b0b0f");
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
  }
  presetCache.set(key, c);
  return c;
}

function mulberry(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexA(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  const n = m ? parseInt(m[1], 16) : 0xe5202e;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// ---------- shaders ----------

const VERT = `#version 300 es
in vec2 p;
out vec2 uv;
void main() { uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

// Blur in texel space (no flips). Optionally down-weights person pixels so the
// subject's colours don't bleed into the blurred background (no halo).
const BLUR = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform sampler2D uMask;
uniform vec2 uSize;
uniform vec2 uDir;
out vec4 o;
void main() {
  vec2 t = gl_FragCoord.xy / uSize;
  vec3 sum = vec3(0.0);
  float ws = 0.0;
  for (int i = -7; i <= 7; i++) {
    vec2 tt = t + uDir * float(i);
    float w = exp(-float(i * i) / 24.0);
    float m = texture(uMask, tt).r;
    w *= (1.0 - smoothstep(0.25, 0.7, m)) + 0.015;
    sum += texture(uSrc, tt).rgb * w;
    ws += w;
  }
  o = vec4(sum / ws, 1.0);
}`;

const FINAL = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 o;
uniform sampler2D uCam;
uniform sampler2D uMask;
uniform sampler2D uBlur;
uniform sampler2D uBg;
uniform vec2 uTexel;
uniform vec2 uMaskTexel;
uniform int uBgMode;
uniform vec2 uBgScale;
uniform vec2 uBgOffset;
uniform float uSmooth;
uniform float uClarity;
uniform float uLow;
uniform float uBright;
uniform float uContrast;
uniform float uSat;
uniform float uWarm;
uniform float uRadius;
uniform vec2 uCropOff;
uniform vec2 uCropScale;

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

float skin(vec3 c) {
  float y = luma(c);
  float cb = 0.5 - 0.168736 * c.r - 0.331264 * c.g + 0.5 * c.b;
  float cr = 0.5 + 0.5 * c.r - 0.418688 * c.g - 0.081312 * c.b;
  float a = smoothstep(0.26, 0.32, cb) * (1.0 - smoothstep(0.50, 0.56, cb));
  float b = smoothstep(0.50, 0.545, cr) * (1.0 - smoothstep(0.68, 0.74, cr));
  return a * b * smoothstep(0.06, 0.2, y);
}

vec3 lift(vec3 c) {
  if (uLow <= 0.0) return c;
  c = pow(max(c, 0.0), vec3(1.0 / (1.0 + uLow * 0.55)));
  return mix(c, c + (1.0 - c) * c * 0.6, uLow);
}

vec3 cam(vec2 t) { return lift(texture(uCam, t).rgb); }

// Joint bilateral upsampling: the low-res person mask is resampled using the
// full-res image as a guide, so the edge snaps to hair and shoulders.
float refinedMask(vec2 t, vec3 c0) {
  vec2 base = t / uMaskTexel - 0.5;
  vec2 i0 = floor(base);
  float sum = 0.0;
  float ws = 0.0;
  for (int y = -1; y <= 2; y++) {
    for (int x = -1; x <= 2; x++) {
      vec2 cell = i0 + vec2(float(x), float(y));
      vec2 mt = (cell + 0.5) * uMaskTexel;
      float m = texture(uMask, mt).r;
      vec3 cc = texture(uCam, mt).rgb;
      vec2 d = cell - base;
      vec3 dc = cc - c0;
      float w = exp(-dot(d, d) / 1.6) * exp(-dot(dc, dc) / 0.03);
      sum += m * w;
      ws += w;
    }
  }
  float bil = sum / max(ws, 1e-5);
  float lin = texture(uMask, t).r;
  return mix(lin, bil, 0.75);
}

void main() {
  vec2 tOut = vec2(uv.x, 1.0 - uv.y);
  vec2 t = uCropOff + tOut * uCropScale;
  vec3 raw = texture(uCam, t).rgb;
  vec3 c = lift(raw);
  float sk = skin(c);

  if (uSmooth > 0.0) {
    vec3 sum = c;
    float ws = 1.0;
    for (int i = 0; i < 12; i++) {
      float a = float(i) * 0.5235988;
      vec2 dir = vec2(cos(a), sin(a)) * uTexel * uRadius;
      for (int k = 1; k <= 2; k++) {
        vec3 s = cam(t + dir * float(k));
        float dl = luma(s) - luma(c);
        float w = exp(-dl * dl / 0.0025) * (k == 1 ? 1.0 : 0.7);
        sum += s * w;
        ws += w;
      }
    }
    vec3 smoothC = sum / ws;
    c = mix(c, smoothC, clamp(uSmooth * sk * 1.15, 0.0, 0.92));
  }

  if (uClarity > 0.0) {
    vec2 d = uTexel * 2.0;
    vec3 b = (cam(t + vec2(d.x, 0.0)) + cam(t - vec2(d.x, 0.0)) + cam(t + vec2(0.0, d.y)) + cam(t - vec2(0.0, d.y))) * 0.25;
    c += (c - b) * uClarity * 1.8 * (1.0 - 0.75 * sk);
  }

  c += uBright * 0.25;
  c = (c - 0.5) * (1.0 + uContrast * 0.6) + 0.5;
  float l = luma(c);
  c = mix(vec3(l), c, 1.0 + uSat * 0.8);
  c += vec3(0.06, 0.012, -0.06) * uWarm;
  c = clamp(c, 0.0, 1.0);

  if (uBgMode > 0) {
    float m = refinedMask(t, raw);
    m = smoothstep(0.38, 0.75, m);
    vec3 bg = uBgMode == 1 ? texture(uBlur, t).rgb : texture(uBg, tOut * uBgScale + uBgOffset).rgb;
    float edge = m * (1.0 - m) * 4.0;
    vec3 fg = mix(c, bg, edge * 0.2);
    c = mix(bg, fg, m);
  }
  o = vec4(c, 1.0);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`Shader error: ${gl.getShaderInfoLog(s)}`);
  return s;
}

function program(gl, frag) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, frag));
  gl.bindAttribLocation(p, 0, "p");
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`Link error: ${gl.getProgramInfoLog(p)}`);
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    u[info.name] = gl.getUniformLocation(p, info.name);
  }
  return { p, u };
}

function texture(gl, filter = gl.LINEAR) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

function target(gl, w, h) {
  const tex = texture(gl);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { tex, fb, w, h };
}

// ---------- processor ----------

export class CameraFX {
  /**
   * @param {{wasmBase?:string, modelUrl?:string, maxWidth?:number, maxHeight?:number, fps?:number}} opts
   */
  constructor(opts = {}) {
    this.wasmBase = opts.wasmBase ?? "/mediapipe/wasm";
    this.modelUrl = opts.modelUrl ?? "/models/selfie_segmenter.tflite";
    this.maxW = opts.maxWidth ?? 1280;
    this.maxH = opts.maxHeight ?? 720;
    this.fps = opts.fps ?? 30;
    this.fx = { ...DEFAULT_FX };
    this.brandColor = "#e5202e";
    this.canvas = document.createElement("canvas");
    this.canvas.width = 1280;
    this.canvas.height = 720;
    const gl = this.canvas.getContext("webgl2", { premultipliedAlpha: false, preserveDrawingBuffer: false, antialias: false });
    if (!gl) throw new Error("WebGL2 is not available in this browser, so camera effects are off.");
    this.gl = gl;
    this.video = document.createElement("video");
    this.video.muted = true;
    this.video.playsInline = true;
    this.mask = null; // Float32Array (temporally smoothed)
    this.maskW = 0;
    this.maskH = 0;
    this.segmenter = null;
    this.segmenterLoading = null;
    this.segError = null;
    this.frameMs = 0;
    this.segMs = 0;
    this.lastSeg = 0;
    this.crop = { x: 0, y: 0, s: 1 };
    this.cropTarget = { x: 0, y: 0, s: 1 };
    this.segCanvas = document.createElement("canvas");
    this.segCtx = this.segCanvas.getContext("2d", { willReadFrequently: false });
    this.initGL();
  }

  initGL() {
    const gl = this.gl;
    this.final = program(gl, FINAL);
    this.blurP = program(gl, BLUR);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.camTex = texture(gl);
    this.maskTex = texture(gl);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array([255]));
    this.bgTex = texture(gl);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([20, 20, 24, 255]));
    this.bgAspect = 16 / 9;
    this.blurA = null;
    this.blurB = null;
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  }

  /** Feed a raw camera track; returns the processed output track. */
  async start(rawTrack) {
    this.setSource(rawTrack);
    if (!this.output) {
      this.output = this.canvas.captureStream(this.fps).getVideoTracks()[0];
      if (this.output && "contentHint" in this.output) this.output.contentHint = "motion";
    }
    if (!this.ticker) this.ticker = createTicker(this.fps, () => this.frame());
    return this.output;
  }

  get track() {
    return this.output;
  }

  setSource(rawTrack) {
    this.raw = rawTrack;
    this.video.srcObject = rawTrack ? new MediaStream([rawTrack]) : null;
    this.video.play().catch(() => {});
  }

  /** Change processing resolution on the fly (the output track stays the same). */
  setMaxSize(maxWidth, maxHeight) {
    this.maxW = maxWidth;
    this.maxH = maxHeight;
  }

  setBrandColor(color) {
    if (color && color !== this.brandColor) {
      this.brandColor = color;
      if (this.fx.bgImage === "preset:brand") this.loadBackground(this.fx.bgImage);
    }
  }

  setSettings(fx) {
    const prevBg = this.fx.bgImage;
    this.fx = { ...DEFAULT_FX, ...fx };
    if (this.fx.background !== "none" || this.fx.autoFrame) this.ensureSegmenter();
    if (!this.fx.autoFrame) this.cropTarget = { x: 0, y: 0, s: 1 };
    if (this.fx.background === "image" && this.fx.bgImage && this.fx.bgImage !== prevBg) this.loadBackground(this.fx.bgImage);
    if (this.fx.background === "image" && this.fx.bgImage && !this.bgLoaded) this.loadBackground(this.fx.bgImage);
  }

  async ensureSegmenter() {
    if (this.segmenter || this.segmenterLoading) return this.segmenterLoading;
    this.segmenterLoading = (async () => {
      try {
        const { FilesetResolver, ImageSegmenter } = await import("@mediapipe/tasks-vision");
        // Self-hosted first; public CDN as a fallback.
        const sources = [
          [this.wasmBase, this.modelUrl],
          [
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm",
            "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite",
          ],
        ];
        let lastErr;
        for (const [wasm, model] of sources) {
          try {
            const fileset = await FilesetResolver.forVisionTasks(wasm);
            this.segmenter = await ImageSegmenter.createFromOptions(fileset, {
              baseOptions: { modelAssetPath: model, delegate: "CPU" },
              runningMode: "VIDEO",
              outputCategoryMask: false,
              outputConfidenceMasks: true,
            });
            break;
          } catch (e) {
            lastErr = e;
          }
        }
        if (!this.segmenter) throw lastErr;
      } catch (e) {
        this.segError = e;
        console.error("[fx] segmentation unavailable", e);
      }
    })();
    return this.segmenterLoading;
  }

  async loadBackground(src) {
    this.bgLoaded = false;
    const token = (this.bgToken = (this.bgToken ?? 0) + 1);
    let img;
    if (typeof src === "string" && src.startsWith("preset:")) {
      img = presetBackground(src.slice(7), this.brandColor);
    } else {
      const url = typeof src === "string" && /^(stored|account):/.test(src) ? await resolveBackground(src) : src;
      if (!url) return;
      img = await new Promise((resolve, reject) => {
        const i = new Image();
        if (!url.startsWith("blob:")) i.crossOrigin = "anonymous";
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = url;
      }).catch(() => null);
    }
    // A newer choice arrived while this one was loading.
    if (!img || token !== this.bgToken) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.bgTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
    this.bgAspect = (img.naturalWidth || img.width) / (img.naturalHeight || img.height);
    this.bgLoaded = true;
  }

  runSegmentation(now) {
    const seg = this.segmenter;
    if (!seg) return;
    const t0 = performance.now();
    // The model works at 256px; feeding a small frame keeps the mask small
    // (cheap to copy) and lets the shader do the edge refinement at full res.
    const v = this.video;
    const sw = 256;
    const sh = Math.max(64, Math.round((sw * v.videoHeight) / v.videoWidth));
    if (this.segCanvas.width !== sw || this.segCanvas.height !== sh) {
      this.segCanvas.width = sw;
      this.segCanvas.height = sh;
    }
    this.segCtx.drawImage(v, 0, 0, sw, sh);
    try {
      seg.segmentForVideo(this.segCanvas, Math.max(now, this.lastSeg + 1), (result) => {
        const m = result.confidenceMasks?.[0];
        if (!m) return;
        const data = m.getAsFloat32Array();
        const w = m.width;
        const h = m.height;
        if (!this.mask || this.maskW !== w || this.maskH !== h) {
          this.mask = new Float32Array(data);
          this.maskW = w;
          this.maskH = h;
          this.mask8 = new Uint8Array(w * h);
        } else {
          // Temporal smoothing: steadier edges, less flicker.
          const a = 0.55;
          for (let i = 0; i < data.length; i++) this.mask[i] = this.mask[i] * (1 - a) + data[i] * a;
        }
      });
      this.lastSeg = Math.max(now, this.lastSeg + 1);
    } catch (e) {
      this.segError = e;
    }
    this.segMs = this.segMs * 0.9 + (performance.now() - t0) * 0.1;
    if (!this.mask) return;
    for (let i = 0; i < this.mask.length; i++) this.mask8[i] = Math.max(0, Math.min(255, Math.round(this.mask[i] * 255)));
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, this.maskW, this.maskH, 0, gl.RED, gl.UNSIGNED_BYTE, this.mask8);
    if (this.fx.autoFrame) this.updateFraming();
  }

  /** Head-and-shoulders framing target from the person mask (normalised coords). */
  updateFraming() {
    const W = this.maskW;
    const H = this.maskH;
    let x0 = W;
    let x1 = -1;
    let y0 = H;
    let y1 = -1;
    let n = 0;
    for (let y = 0; y < H; y += 2) {
      const row = y * W;
      for (let x = 0; x < W; x += 2) {
        if (this.mask[row + x] > 0.5) {
          n++;
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (n < 20) {
      this.cropTarget = { x: 0, y: 0, s: 1 };
      return;
    }
    // Frame on the head: its centre sets the pan (so a raised arm doesn't pull
    // the shot sideways) and its width sets the zoom, like webcam auto-framing.
    const headH = Math.max(4, Math.min((y1 - y0) * 0.18, H * 0.3));
    let sx = 0;
    let cnt = 0;
    let hx0 = W;
    let hx1 = -1;
    for (let y = y0; y <= y0 + headH; y += 2) {
      const row = y * W;
      for (let x = x0; x <= x1; x += 2) {
        if (this.mask[row + x] > 0.5) {
          sx += x;
          cnt++;
          if (x < hx0) hx0 = x;
          if (x > hx1) hx1 = x;
        }
      }
    }
    const cx = (cnt ? sx / cnt : (x0 + x1) / 2) / W;
    const headW = Math.max(0.02, (hx1 - hx0 + 2) / W);
    const top = y0 / H;
    // Head about a third of the frame width, never zooming past 1.7x.
    const s = Math.min(1, Math.max(0.6, headW / 0.28));
    const x = Math.min(1 - s, Math.max(0, cx - s / 2));
    const y = Math.min(1 - s, Math.max(0, top - s * 0.1));
    this.cropTarget = { x, y, s };
  }

  frame() {
    const v = this.video;
    if (!this.raw || v.readyState < 2 || !v.videoWidth) return;
    if (this.raw.enabled === false) return;
    const t0 = performance.now();
    const gl = this.gl;
    let w = v.videoWidth;
    let h = v.videoHeight;
    const sc = Math.min(1, this.maxW / w, this.maxH / h);
    w = Math.round(w * sc);
    h = Math.round(h * sc);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.blurA = this.blurB = null;
    }
    gl.bindTexture(gl.TEXTURE_2D, this.camTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, v);

    const fx = this.fx;
    let bgMode = fx.background === "blur" ? 1 : fx.background === "image" && this.bgLoaded ? 2 : 0;
    const wantMask = bgMode || fx.autoFrame;
    // Framing alone doesn't need every frame segmented.
    this.frameNo = (this.frameNo ?? 0) + 1;
    if (wantMask && this.segmenter && (bgMode || this.frameNo % 3 === 0)) this.runSegmentation(t0);
    if (!this.mask) bgMode = 0;
    gl.bindVertexArray(this.vao);

    if (bgMode === 1) {
      const bw = Math.max(16, Math.round(w / 4));
      const bh = Math.max(16, Math.round(h / 4));
      if (!this.blurA || this.blurA.w !== bw) {
        this.blurA = target(gl, bw, bh);
        this.blurB = target(gl, bw, bh);
      }
      const step = 0.6 + fx.blur * 2.6;
      const passes = [
        [this.camTex, this.blurA, [step / bw, 0]],
        [this.blurA.tex, this.blurB, [0, step / bh]],
        [this.blurB.tex, this.blurA, [step / bw, 0]],
        [this.blurA.tex, this.blurB, [0, step / bh]],
      ];
      gl.useProgram(this.blurP.p);
      for (const [src, dst, dir] of passes) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
        gl.viewport(0, 0, dst.w, dst.h);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, src);
        gl.uniform1i(this.blurP.u.uSrc, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
        gl.uniform1i(this.blurP.u.uMask, 1);
        gl.uniform2f(this.blurP.u.uSize, dst.w, dst.h);
        gl.uniform2f(this.blurP.u.uDir, dir[0], dir[1]);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
    }

    // Ease towards the framing target; ignore tiny moves so the shot stays calm.
    const ct = this.fx.autoFrame ? this.cropTarget : { x: 0, y: 0, s: 1 };
    const c = this.crop;
    const far = Math.abs(ct.x - c.x) + Math.abs(ct.y - c.y) + Math.abs(ct.s - c.s) > 0.02;
    if (far || this.cropMoving) {
      this.cropMoving = Math.abs(ct.x - c.x) + Math.abs(ct.y - c.y) + Math.abs(ct.s - c.s) > 0.002;
      const k = 0.06;
      c.x += (ct.x - c.x) * k;
      c.y += (ct.y - c.y) * k;
      c.s += (ct.s - c.s) * k;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    const P = this.final;
    gl.useProgram(P.p);
    const bind = (unit, tex, name) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(P.u[name], unit);
    };
    bind(0, this.camTex, "uCam");
    bind(1, this.maskTex, "uMask");
    bind(2, this.blurB ? this.blurB.tex : this.camTex, "uBlur");
    bind(3, this.bgTex, "uBg");
    gl.uniform2f(P.u.uTexel, this.crop.s / w, this.crop.s / h);
    gl.uniform2f(P.u.uMaskTexel, 1 / Math.max(1, this.maskW), 1 / Math.max(1, this.maskH));
    gl.uniform1i(P.u.uBgMode, bgMode);
    const fa = w / h;
    const ia = this.bgAspect;
    let sx = 1;
    let sy = 1;
    if (ia > fa) sx = fa / ia;
    else sy = ia / fa;
    gl.uniform2f(P.u.uBgScale, sx, sy);
    gl.uniform2f(P.u.uBgOffset, (1 - sx) / 2, (1 - sy) / 2);
    gl.uniform1f(P.u.uSmooth, fx.smoothing || 0);
    gl.uniform1f(P.u.uClarity, fx.clarity || 0);
    gl.uniform1f(P.u.uLow, fx.lowLight || 0);
    gl.uniform1f(P.u.uBright, fx.brightness || 0);
    gl.uniform1f(P.u.uContrast, fx.contrast || 0);
    gl.uniform1f(P.u.uSat, fx.saturation || 0);
    gl.uniform1f(P.u.uWarm, fx.warmth || 0);
    gl.uniform1f(P.u.uRadius, Math.max(1.5, h / 180));
    gl.uniform2f(P.u.uCropOff, this.crop.x, this.crop.y);
    gl.uniform2f(P.u.uCropScale, this.crop.s, this.crop.s);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.frameMs = this.frameMs * 0.9 + (performance.now() - t0) * 0.1;
  }

  stop() {
    this.ticker?.stop();
    this.ticker = null;
    this.output?.stop();
    this.output = null;
    this.video.srcObject = null;
    try {
      this.segmenter?.close();
    } catch {
      /* ignore */
    }
    this.segmenter = null;
  }
}
