// Stage layouts. Each returns target rectangles for the items on stage;
// the compositor animates tiles between rectangles when the layout changes.

export const LAYOUTS = [
  { id: "solo", label: "Solo", hint: "One person full screen" },
  { id: "grid", label: "Grid", hint: "Everyone in equal tiles" },
  { id: "cropped", label: "Side by side", hint: "Tall cropped tiles, edge to edge" },
  { id: "leader", label: "Spotlight", hint: "First person large, others small" },
  { id: "pip", label: "Picture in picture", hint: "First person full, others in the corner" },
  { id: "screen", label: "Screen + people", hint: "Shared screen with a column of people" },
  { id: "screen-pip", label: "Screen + corner", hint: "Shared screen full, people in the corner" },
];

function gridRects(items, area, aspect, gap) {
  const n = items.length;
  if (!n) return [];
  let best = null;
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const cw = (area.w - gap * (cols - 1)) / cols;
    const ch = (area.h - gap * (rows - 1)) / rows;
    const tw = Math.min(cw, ch * aspect);
    const th = tw / aspect;
    if (!best || tw * th > best.tw * best.th) best = { cols, rows, tw, th };
  }
  const { cols, rows, tw, th } = best;
  const totalH = rows * th + (rows - 1) * gap;
  const y0 = area.y + (area.h - totalH) / 2;
  const out = [];
  for (let r = 0; r < rows; r++) {
    const rowItems = items.slice(r * cols, r * cols + cols);
    const rowW = rowItems.length * tw + (rowItems.length - 1) * gap;
    const x0 = area.x + (area.w - rowW) / 2;
    rowItems.forEach((it, i) => out.push({ id: it.id, x: x0 + i * (tw + gap), y: y0 + r * (th + gap), w: tw, h: th }));
  }
  return out;
}

function stripRects(items, area, aspect, gap, vertical) {
  const n = items.length;
  if (!n) return [];
  let tw;
  let th;
  if (vertical) {
    tw = area.w;
    th = tw / aspect;
    const need = n * th + (n - 1) * gap;
    if (need > area.h) {
      th = (area.h - (n - 1) * gap) / n;
      tw = th * aspect;
    }
    const total = n * th + (n - 1) * gap;
    const y0 = area.y + (area.h - total) / 2;
    const x0 = area.x + (area.w - tw) / 2;
    return items.map((it, i) => ({ id: it.id, x: x0, y: y0 + i * (th + gap), w: tw, h: th }));
  }
  th = area.h;
  tw = th * aspect;
  const need = n * tw + (n - 1) * gap;
  if (need > area.w) {
    tw = (area.w - (n - 1) * gap) / n;
    th = tw / aspect;
  }
  const total = n * tw + (n - 1) * gap;
  const x0 = area.x + (area.w - total) / 2;
  const y0 = area.y + (area.h - th) / 2;
  return items.map((it, i) => ({ id: it.id, x: x0 + i * (tw + gap), y: y0, w: tw, h: th }));
}

/**
 * @param {string} layout
 * @param {{id:string, kind:'cam'|'screen'}[]} items  stage items in order
 * @param {number} W canvas width
 * @param {number} H canvas height
 * @param {{bannerSpace?:number}} opts
 */
export function computeLayout(layout, items, W, H, opts = {}) {
  if (!items.length) return [];
  const portrait = H > W;
  const unit = Math.min(W, H);
  const m = Math.round(unit * 0.04);
  const gap = Math.round(unit * 0.02);
  const radius = Math.round(unit * 0.018);
  const bannerSpace = opts.bannerSpace ?? 0;
  const area = { x: m, y: m, w: W - 2 * m, h: H - 2 * m - bannerSpace };
  const camAspect = portrait ? 1 : 16 / 9;
  const fitOf = (it) => (it.kind === "screen" ? "contain" : "cover");
  const finish = (rects, extra = {}) =>
    rects.map((r, i) => {
      const it = items.find((x) => x.id === r.id);
      return { r: radius, fit: fitOf(it), z: i, ...extra, ...r };
    });

  const screens = items.filter((i) => i.kind === "screen");
  const cams = items.filter((i) => i.kind !== "screen");

  switch (layout) {
    case "solo": {
      const it = items[0];
      return [{ id: it.id, x: 0, y: 0, w: W, h: H, r: 0, fit: fitOf(it), z: 0 }];
    }
    case "cropped": {
      const n = items.length;
      if (n === 1) return finish([{ id: items[0].id, ...area }]);
      const rows = portrait ? n : n > 4 ? 2 : 1;
      const cols = portrait ? 1 : Math.ceil(n / rows);
      const cw = (area.w - gap * (cols - 1)) / cols;
      const ch = (area.h - gap * (rows - 1)) / rows;
      return finish(
        items.map((it, i) => ({
          id: it.id,
          x: area.x + (i % cols) * (cw + gap),
          y: area.y + Math.floor(i / cols) * (ch + gap),
          w: cw,
          h: ch,
        }))
      );
    }
    case "leader": {
      const [main, ...rest] = items;
      if (!rest.length) return finish([{ id: main.id, ...area }]);
      if (portrait) {
        const mh = area.h * 0.66;
        const mainR = { id: main.id, x: area.x, y: area.y, w: area.w, h: mh };
        const strip = stripRects(rest, { x: area.x, y: area.y + mh + gap, w: area.w, h: area.h - mh - gap }, 1, gap, false);
        return finish([mainR, ...strip]);
      }
      const colW = Math.max(area.w * 0.22, 160);
      const mainW = area.w - colW - gap;
      const mainR = { id: main.id, x: area.x, y: area.y, w: mainW, h: area.h };
      const strip = stripRects(rest, { x: area.x + mainW + gap, y: area.y, w: colW, h: area.h }, 16 / 9, gap, true);
      return finish([mainR, ...strip]);
    }
    case "pip": {
      const [main, ...rest] = items;
      const mainR = { id: main.id, x: 0, y: 0, w: W, h: H, r: 0, fit: fitOf(main), z: 0 };
      const pw = portrait ? W * 0.34 : W * 0.2;
      const ph = portrait ? pw * 1.25 : (pw * 9) / 16;
      const smalls = rest.map((it, i) => ({
        id: it.id,
        x: W - m - pw - i * (pw + gap),
        y: H - m - bannerSpace - ph,
        w: pw,
        h: ph,
        r: radius,
        fit: fitOf(it),
        z: 10 + i,
      }));
      return [mainR, ...smalls];
    }
    case "screen": {
      if (!screens.length) return finish(gridRects(items, area, camAspect, gap));
      const [screen, ...otherScreens] = screens;
      const people = [...otherScreens, ...cams];
      if (!people.length) return finish([{ id: screen.id, ...area }]);
      if (portrait) {
        const sh = area.h * 0.55;
        const sR = { id: screen.id, x: area.x, y: area.y, w: area.w, h: sh };
        const g = gridRects(people, { x: area.x, y: area.y + sh + gap, w: area.w, h: area.h - sh - gap }, 1, gap);
        return finish([sR, ...g]);
      }
      const colW = Math.max(area.w * 0.2, 160);
      const sw = area.w - colW - gap;
      const sR = { id: screen.id, x: area.x, y: area.y, w: sw, h: area.h };
      const strip = stripRects(people, { x: area.x + sw + gap, y: area.y, w: colW, h: area.h }, 16 / 9, gap, true);
      return finish([sR, ...strip]);
    }
    case "screen-pip": {
      if (!screens.length) return computeLayout("pip", items, W, H, opts);
      const [screen, ...others] = screens;
      return computeLayout("pip", [screen, ...others, ...cams], W, H, opts);
    }
    case "grid":
    default:
      return finish(gridRects(items, area, camAspect, gap));
  }
}
