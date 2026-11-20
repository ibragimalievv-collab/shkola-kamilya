// Одна активная запись для уроков и родительской студии.
let current;

export async function toggleRecording(button, duration, onAudio, onUnavailable) {
  if (current) {
    const same = current.button === button;
    current.stop(same);
    if (same) return;
  }
  if (document.hidden || !button.isConnected) return;

  let stream, recorder, timer, keep = false, closed = false;
  const chunks = [];
  const session = { button, stop };
  const observer = new MutationObserver(() => { if (!button.isConnected) stop(false); });
  const hidden = () => { if (document.hidden) stop(false); };
  const interrupt = () => stop(false);
  const stopTracks = () => stream?.getTracks().forEach(track => track.stop());
  function release() {
    clearTimeout(timer);
    observer.disconnect();
    document.removeEventListener('visibilitychange', hidden);
    window.removeEventListener('pagehide', interrupt);
    stream?.getTracks().forEach(track => track.removeEventListener('ended', interrupt));
    stopTracks();
    if (current === session) current = null;
    button.classList.remove('recording');
    button.setAttribute('aria-pressed', 'false');
  }
  function stop(save) {
    keep = save;
    if (closed) return;
    closed = true;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    release();
  }

  current = session;
  observer.observe(document.body, { childList: true, subtree: true });
  document.addEventListener('visibilitychange', hidden);
  window.addEventListener('pagehide', interrupt);
  try {
    if (!window.MediaRecorder) throw new Error('MediaRecorder');
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (closed || document.hidden || !button.isConnected) { stopTracks(); stop(false); return; }
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    recorder.onerror = () => { stop(false); if (button.isConnected && !document.hidden) onUnavailable(); };
    recorder.onstop = () => {
      if (!closed) stop(false);
      if (keep && chunks.length && button.isConnected && !document.hidden)
        onAudio(new Blob(chunks, { type: recorder.mimeType || chunks[0].type }));
    };
    stream.getTracks().forEach(track => track.addEventListener('ended', interrupt));
    recorder.start();
    button.classList.add('recording');
    button.setAttribute('aria-pressed', 'true');
    timer = setTimeout(() => stop(true), duration);
  } catch {
    const notify = !closed && button.isConnected && !document.hidden;
    stop(false);
    if (notify) onUnavailable();
  }
}
