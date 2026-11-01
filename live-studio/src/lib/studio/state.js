// The shared, host-controlled description of what the audience sees.
export const THEMES = [
  { id: "bubble", label: "Bubble" },
  { id: "classic", label: "Classic" },
  { id: "minimal", label: "Minimal" },
  { id: "block", label: "Block" },
];

export const FONTS = ["Inter", "Montserrat", "Poppins", "Roboto Slab", "Bebas Neue", "Playfair Display"];

export const SCENES = [
  { id: "stage", label: "Live stage" },
  { id: "starting", label: "Starting soon", title: "Starting soon", subtitle: "Grab a coffee, we'll be right with you" },
  { id: "brb", label: "Be right back", title: "Be right back", subtitle: "Stick around" },
  { id: "ending", label: "Thanks for watching", title: "Thanks for watching", subtitle: "See you next time" },
];

export const DEFAULT_BRAND = {
  color: "#e5202e",
  textColor: "#ffffff",
  theme: "bubble",
  font: "Inter",
  logoUrl: "",
  logoPos: "top-right",
  bgUrl: "",
  bgColor: "#0d0b14",
  overlayUrl: "",
};

export function defaultStudioState(saved = {}) {
  return {
    layout: saved.layout ?? "grid",
    aspect: saved.aspect ?? "16:9",
    splits: saved.splits ?? {},
    stage: [],
    showNames: saved.showNames ?? true,
    speakerHighlight: saved.speakerHighlight ?? true,
    scene: "stage",
    sceneTitle: "",
    sceneSubtitle: "",
    countdownTo: null,
    banners: saved.banners ?? [
      { id: "b-welcome", title: "Welcome to the show!", subtitle: "Say hi in the chat", ticker: false },
      { id: "b-ticker", title: "Follow us for more episodes  •  New shows every week", subtitle: "", ticker: true },
    ],
    activeBanner: null,
    activeTicker: null,
    brand: { ...DEFAULT_BRAND, ...(saved.brand ?? {}) },
    clip: { url: "", name: "", playing: false, startedAt: 0 },
    clips: saved.clips ?? [],
    live: false,
    liveStartedAt: null,
    recording: false,
    recStartedAt: null,
    recSession: null,
  };
}

/** The subset of state worth saving on the Studio record between sessions. */
export function persistableState(s) {
  return {
    layout: s.layout,
    aspect: s.aspect,
    splits: s.splits,
    showNames: s.showNames,
    speakerHighlight: s.speakerHighlight,
    banners: s.banners,
    brand: s.brand,
    clips: s.clips,
  };
}

export function canvasSize(aspect, quality = "1080p") {
  const long = quality === "720p" ? 1280 : 1920;
  const short = quality === "720p" ? 720 : 1080;
  return aspect === "9:16" ? { width: short, height: long } : { width: long, height: short };
}

export function isScreenItem(id) {
  return typeof id === "string" && id.startsWith("screen:");
}
