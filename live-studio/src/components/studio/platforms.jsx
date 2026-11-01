import { Facebook, Instagram, Linkedin, Radio, Twitch, Twitter, Youtube, Zap } from "lucide-react";

// mode: "account" = broadcast created through the connected account
//       "key"     = server URL + stream key saved once
//       "each"    = platform issues a new key per broadcast (paste at Go live)
export const PLATFORMS = {
  youtube: {
    label: "YouTube",
    color: "#FF0000",
    icon: Youtube,
    mode: "account",
    url: "rtmp://a.rtmp.youtube.com/live2",
    keyUrl: "https://studio.youtube.com/channel/UC/livestreaming",
    blurb: "A new broadcast is created on your channel every time you go live.",
  },
  facebook: {
    label: "Facebook",
    color: "#1877F2",
    icon: Facebook,
    mode: "key",
    url: "rtmps://live-api-s.facebook.com:443/rtmp/",
    keyUrl: "https://www.facebook.com/live/producer",
    blurb: "Streams to your profile or Page with a persistent stream key.",
    steps: [
      "Open Facebook Live Producer and choose where to post (profile or Page).",
      "Select “Streaming software” and switch on “Use a persistent stream key”.",
      "Copy the stream key and paste it below. You only do this once.",
    ],
  },
  instagram: {
    label: "Instagram",
    color: "#E1306C",
    icon: Instagram,
    mode: "each",
    keyUrl: "https://www.instagram.com/",
    blurb: "Instagram creates a new key for every live, so you paste it when you go live.",
    steps: [
      "On instagram.com (on a computer) click Create (+), then Live video.",
      "Name the live, then copy the Stream URL and Stream key it shows you.",
      "Paste both into the Go live window. Instagram gives a new key each time.",
    ],
  },
  linkedin: {
    label: "LinkedIn",
    color: "#0A66C2",
    icon: Linkedin,
    mode: "each",
    keyUrl: "https://www.linkedin.com/events/",
    blurb: "LinkedIn issues a stream key per live event, pasted when you go live.",
    steps: [
      "On LinkedIn create an event, choose LinkedIn Live, and pick “Other” as the streaming tool.",
      "Copy the Stream URL and Stream key from the event.",
      "Paste both into the Go live window when you start the show.",
    ],
  },
  twitch: {
    label: "Twitch",
    color: "#9146FF",
    icon: Twitch,
    mode: "key",
    url: "rtmp://live.twitch.tv/app",
    keyUrl: "https://dashboard.twitch.tv/settings/stream",
    steps: ["Open your Twitch stream settings.", "Copy your Primary Stream key and paste it below."],
  },
  kick: {
    label: "Kick",
    color: "#53FC18",
    icon: Zap,
    mode: "key",
    url: "",
    keyUrl: "https://kick.com/dashboard/settings/stream",
    steps: ["Open Kick stream settings.", "Copy the Stream URL and Stream key and paste them below."],
  },
  x: {
    label: "X",
    color: "#e7e9ea",
    icon: Twitter,
    mode: "key",
    url: "",
    keyUrl: "https://studio.x.com/producer",
    steps: ["Open X Media Studio → Producer → Sources and create an RTMP source.", "Copy the RTMP URL and stream key and paste them below."],
  },
  custom_rtmp: {
    label: "Custom RTMP",
    color: "#a1a1aa",
    icon: Radio,
    mode: "key",
    url: "",
    steps: ["Paste the RTMP or RTMPS server URL and the stream key from your platform."],
  },
  whip: {
    label: "WHIP",
    color: "#a1a1aa",
    icon: Radio,
    mode: "whip",
    steps: ["Paste a WebRTC WHIP ingest URL (and its token if it needs one)."],
  },
};

export const MAIN_PLATFORMS = ["youtube", "facebook", "instagram", "linkedin"];
export const MORE_PLATFORMS = ["twitch", "kick", "x", "custom_rtmp", "whip"];

export function PlatformIcon({ platform, size = "md", className = "" }) {
  const p = PLATFORMS[platform] ?? PLATFORMS.custom_rtmp;
  const Icon = p.icon;
  const box = size === "sm" ? "h-7 w-7 rounded-md" : size === "lg" ? "h-12 w-12 rounded-xl" : "h-10 w-10 rounded-lg";
  const ic = size === "sm" ? "h-3.5 w-3.5" : size === "lg" ? "h-6 w-6" : "h-5 w-5";
  return (
    <span className={`inline-flex shrink-0 items-center justify-center ${box} ${className}`} style={{ background: `${p.color}1f`, color: p.color }}>
      <Icon className={ic} />
    </span>
  );
}
