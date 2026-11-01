// WebRTC-HTTP Ingestion Protocol (WHIP) publisher for going live.
function waitForIce(pc, timeout = 2500) {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const t = setTimeout(resolve, timeout);
    pc.addEventListener("icegatheringstatechange", () => {
      if (pc.iceGatheringState === "complete") {
        clearTimeout(t);
        resolve();
      }
    });
  });
}

export async function whipPublish({ url, token, stream, iceServers = [], videoBitrate = 4_500_000 }) {
  const pc = new RTCPeerConnection({ iceServers, bundlePolicy: "max-bundle" });
  for (const track of stream.getTracks()) {
    const tx = pc.addTransceiver(track, { direction: "sendonly", streams: [stream] });
    if (track.kind === "video" && RTCRtpSender.getCapabilities) {
      const codecs = RTCRtpSender.getCapabilities("video")?.codecs ?? [];
      const h264 = codecs.filter((c) => c.mimeType === "video/H264");
      const rest = codecs.filter((c) => c.mimeType !== "video/H264");
      if (h264.length && tx.setCodecPreferences) tx.setCodecPreferences([...h264, ...rest]);
    }
  }
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitForIce(pc);
  const headers = { "Content-Type": "application/sdp" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { method: "POST", headers, body: pc.localDescription.sdp });
  if (!res.ok) {
    pc.close();
    throw new Error(`WHIP endpoint answered ${res.status}`);
  }
  const location = res.headers.get("Location");
  await pc.setRemoteDescription({ type: "answer", sdp: await res.text() });
  for (const s of pc.getSenders()) {
    if (s.track?.kind !== "video") continue;
    try {
      const p = s.getParameters();
      if (!p.encodings?.length) p.encodings = [{}];
      p.encodings[0].maxBitrate = videoBitrate;
      p.encodings[0].maxFramerate = 30;
      await s.setParameters(p);
    } catch {
      /* ignore */
    }
  }
  return {
    pc,
    async stop() {
      pc.close();
      if (location) {
        try {
          await fetch(new URL(location, url).toString(), { method: "DELETE", headers: token ? { Authorization: `Bearer ${token}` } : {} });
        } catch {
          /* ignore */
        }
      }
    },
  };
}
