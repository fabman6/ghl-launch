export const RESOLUTIONS = {
  "720p": { width: 1280, height: 720 },
  "1080p": { width: 1920, height: 1080 },
  "4k": { width: 3840, height: 2160 },
};

export async function listDevices() {
  const all = await navigator.mediaDevices.enumerateDevices();
  return {
    cameras: all.filter((d) => d.kind === "videoinput"),
    mics: all.filter((d) => d.kind === "audioinput"),
    speakers: all.filter((d) => d.kind === "audiooutput"),
  };
}

export async function getCamera({ deviceId, resolution = "1080p", fps = 30 } = {}) {
  const r = RESOLUTIONS[resolution] ?? RESOLUTIONS["1080p"];
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      width: { ideal: r.width },
      height: { ideal: r.height },
      frameRate: { ideal: fps },
    },
  });
  return stream.getVideoTracks()[0];
}

export async function getMicrophone({ deviceId, echoCancellation = true, noiseSuppression = true, autoGainControl = true } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      echoCancellation,
      noiseSuppression,
      autoGainControl,
      sampleRate: { ideal: 48000 },
      channelCount: { ideal: 1 },
    },
  });
  return stream.getAudioTracks()[0];
}

export async function getScreen() {
  return navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: { ideal: 30, max: 60 }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    selfBrowserSurface: "exclude",
    systemAudio: "include",
  });
}

export function mediaErrorMessage(err) {
  const name = err?.name ?? "";
  if (name === "NotAllowedError") return "Permission denied. Allow camera and microphone access in your browser's address bar, then try again.";
  if (name === "NotFoundError") return "No camera or microphone was found.";
  if (name === "NotReadableError") return "Your camera or microphone is in use by another app.";
  if (name === "OverconstrainedError") return "That device can't do the selected resolution. Try a lower one.";
  return err?.message || "Could not access your devices.";
}
