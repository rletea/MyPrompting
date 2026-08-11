/**
 * recorder.js — Video recording module
 *
 * Uses MediaRecorder + getUserMedia (video + audio) to record from the
 * device camera. Supports:
 *  - Camera selector (lists all available video input devices)
 *  - Front / rear camera toggle (facingMode constraint)
 *  - Live preview while recording
 *  - In-browser playback and download of the recorded video
 *  - No data sent to the server — client-side only
 *
 * Security:
 *  - Camera/mic permission requested only on Record click
 *  - Blob URLs revoked on new recording to prevent memory leaks
 *  - All errors surfaced via visible status/error elements
 */

'use strict';

(function initRecorder() {
  /* ------------------------------------------------------------------
     DOM references
     ------------------------------------------------------------------ */
  const btnRecStart     = document.getElementById('btn-rec-start');
  const btnRecStop      = document.getElementById('btn-rec-stop');
  const btnRecClear     = document.getElementById('btn-rec-clear');
  const recStatus       = document.getElementById('rec-status');
  const recPreview      = document.getElementById('rec-preview');       // PiP in prompter
  const recPlayback     = document.getElementById('rec-playback');
  const recDownload     = document.getElementById('rec-download');
  const recError        = document.getElementById('rec-error');
  const cameraSelect    = document.getElementById('camera-select');
  const facingToggle    = document.getElementById('camera-facing-toggle');
  const prompterContainer = document.getElementById('prompter-container');

  /* ------------------------------------------------------------------
     State
     ------------------------------------------------------------------ */
  let mediaRecorder    = null;
  let videoChunks      = [];
  let recordingBlobUrl = null;
  let activeStream     = null;   // current live stream (released on stop)

  /* ------------------------------------------------------------------
     Feature detection
     ------------------------------------------------------------------ */
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showRecError('Camera recording is not supported in this browser.');
    btnRecStart.disabled = true;
    return;
  }
  if (typeof MediaRecorder === 'undefined') {
    showRecError('MediaRecorder is not supported in this browser.');
    btnRecStart.disabled = true;
    return;
  }

  /* ------------------------------------------------------------------
     Enumerate cameras and populate the selector
     ------------------------------------------------------------------ */
  async function populateCameras() {
    try {
      // A brief permission probe so enumerateDevices returns labels
      const probe = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        .catch(() => null);
      if (probe) stopStreamTracks(probe);

      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter((d) => d.kind === 'videoinput');

      cameraSelect.innerHTML = '';
      if (cameras.length === 0) {
        cameraSelect.innerHTML = '<option value="">No cameras found</option>';
        btnRecStart.disabled = true;
        return;
      }

      cameras.forEach((cam, idx) => {
        const opt = document.createElement('option');
        opt.value       = cam.deviceId;
        opt.textContent = cam.label || `Camera ${idx + 1}`;
        cameraSelect.appendChild(opt);
      });
    } catch {
      // Permissions not yet granted — list will populate after first Record
    }
  }

  populateCameras();

  // Re-enumerate if a new device is plugged in
  navigator.mediaDevices.addEventListener('devicechange', populateCameras);

  /* ------------------------------------------------------------------
     Build getUserMedia constraints from current UI state
     ------------------------------------------------------------------ */
  function buildConstraints() {
    const deviceId  = cameraSelect.value;
    const useRear   = facingToggle.checked;

    const videoConstraint = deviceId
      ? { deviceId: { exact: deviceId } }
      : { facingMode: useRear ? 'environment' : 'user' };

    return { video: videoConstraint, audio: true };
  }

  /* ------------------------------------------------------------------
     Preferred video MIME types (in order of preference)
     ------------------------------------------------------------------ */
  const PREFERRED_MIME_TYPES = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=h264,opus',
    'video/webm',
    'video/mp4;codecs=h264,aac',
    'video/mp4',
  ];

  function getSupportedMimeType() {
    for (const type of PREFERRED_MIME_TYPES) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return '';
  }

  /* ------------------------------------------------------------------
     Start recording
     ------------------------------------------------------------------ */
  btnRecStart.addEventListener('click', async () => {
    clearRecError();
    setRecStatus('Requesting camera access…');

    // Release any previous live stream
    stopStreamTracks(activeStream);
    activeStream = null;

    const constraints = buildConstraints();
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      showRecError(buildPermissionErrorMessage(err));
      setRecStatus('');
      return;
    }

    // After permission granted, refresh camera list (labels now available)
    populateCameras();

    activeStream = stream;

    // Show PiP preview inside the prompter area
    recPreview.srcObject = stream;
    recPreview.classList.remove('hidden');
    recPreview.classList.add('recording');
    prompterContainer.classList.add('pip-active');
    recPlayback.classList.add('hidden');
    recDownload.classList.add('hidden');
    btnRecClear.classList.add('hidden');

    // Trigger teleprompter Play (countdown + scroll)
    if (typeof window._startScroll === 'function') window._startScroll();

    // Revoke previous recording blob
    if (recordingBlobUrl) {
      URL.revokeObjectURL(recordingBlobUrl);
      recordingBlobUrl = null;
    }

    videoChunks = [];

    const mimeType = getSupportedMimeType();
    const options  = mimeType ? { mimeType } : {};

    try {
      mediaRecorder = new MediaRecorder(stream, options);
    } catch (err) {
      showRecError(`Could not start recorder: ${err.message}`);
      setRecStatus('');
      stopStreamTracks(stream);
      recPreview.classList.add('hidden');
      recPreview.classList.remove('recording');
      return;
    }

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) videoChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      stopStreamTracks(stream);
      activeStream = null;

      // Hide PiP preview
      recPreview.srcObject = null;
      recPreview.classList.add('hidden');
      recPreview.classList.remove('recording');
      prompterContainer.classList.remove('pip-active');

      const finalMime      = mediaRecorder.mimeType || mimeType || 'video/webm';
      const blob           = new Blob(videoChunks, { type: finalMime });
      recordingBlobUrl     = URL.createObjectURL(blob);

      // Show playback
      recPlayback.src = recordingBlobUrl;
      recPlayback.classList.remove('hidden');

      // Download link + Clear button
      const ext            = mimeExtension(finalMime);
      recDownload.href     = recordingBlobUrl;
      recDownload.download = `recording.${ext}`;
      recDownload.classList.remove('hidden');
      btnRecClear.classList.remove('hidden');

      setRecStatus(`Recording saved (${formatBytes(blob.size)}). Ready to download.`);

      btnRecStart.disabled = false;
      btnRecStart.classList.remove('recording');
      btnRecStop.disabled  = true;
    };

    mediaRecorder.onerror = (e) => {
      showRecError(`Recorder error: ${e.error ? e.error.message : 'Unknown error'}`);
      setRecStatus('');
      stopStreamTracks(stream);
      recPreview.classList.add('hidden');
      recPreview.classList.remove('recording');
      btnRecStart.disabled = false;
      btnRecStart.classList.remove('recording');
      btnRecStop.disabled  = true;
    };

    mediaRecorder.start(250);

    btnRecStart.disabled = true;
    btnRecStart.classList.add('recording');
    btnRecStop.disabled  = false;
    setRecStatus('🔴 Recording…');
  });

  /* ------------------------------------------------------------------
     Stop recording
     ------------------------------------------------------------------ */
  btnRecStop.addEventListener('click', () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
      setRecStatus('Processing…');
    }
    // Also stop the teleprompter playback
    const btnStop = document.getElementById('btn-stop');
    if (btnStop) btnStop.click();
  });

  /* ------------------------------------------------------------------
     Auto-clear after download
     ------------------------------------------------------------------ */
  recDownload.addEventListener('click', () => {
    // Give the browser a tick to start the download, then clear
    setTimeout(clearRecording, 500);
  });

  /* ------------------------------------------------------------------
     Facing toggle — re-enumerate so deviceId list stays correct
     ------------------------------------------------------------------ */
  facingToggle.addEventListener('change', () => {
    // If currently recording, do nothing (can't switch mid-record)
    if (mediaRecorder && mediaRecorder.state === 'recording') return;
    // Clear deviceId selection so facingMode constraint is used instead
    cameraSelect.value = '';
  });

  /* ------------------------------------------------------------------
     Helpers
     ------------------------------------------------------------------ */
  function stopStreamTracks(stream) {
    if (stream && stream.getTracks) stream.getTracks().forEach((t) => t.stop());
  }

  function buildPermissionErrorMessage(err) {
    if (!err) return 'Could not access the camera.';
    switch (err.name) {
      case 'NotAllowedError':
      case 'PermissionDeniedError':
        return 'Camera access was denied. Please allow camera permission in your browser settings and try again.';
      case 'NotFoundError':
      case 'DevicesNotFoundError':
        return 'No camera found. Please connect a camera and try again.';
      case 'NotReadableError':
      case 'TrackStartError':
        return 'Camera is in use by another application. Please close other apps and try again.';
      case 'OverconstrainedError':
        return 'No camera matched the selected constraints. Try a different camera or toggle front/rear.';
      case 'AbortError':
        return 'Camera access was aborted.';
      default:
        return `Camera error: ${err.message || err.name}`;
    }
  }

  function mimeExtension(mime) {
    if (!mime) return 'webm';
    if (mime.startsWith('video/mp4'))  return 'mp4';
    if (mime.startsWith('video/ogg'))  return 'ogv';
    return 'webm';
  }

  function formatBytes(bytes) {
    if (bytes < 1024)        return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  function setRecStatus(msg)  { recStatus.textContent = msg; }
  function showRecError(msg)  { recError.textContent  = msg; }
  function clearRecError()    { recError.textContent  = '';  }

  /* ------------------------------------------------------------------
     clearRecording — resets all recording UI and releases blob memory.
     Called after download and from the Clear Script button in app.js.
     ------------------------------------------------------------------ */
  function clearRecording() {
    // Stop any active stream/recording first
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    stopStreamTracks(activeStream);
    activeStream = null;

    // Release blob URL
    if (recordingBlobUrl) {
      URL.revokeObjectURL(recordingBlobUrl);
      recordingBlobUrl = null;
    }

    videoChunks = [];

    // Reset PiP and UI
    recPreview.srcObject = null;
    recPreview.src       = '';
    recPreview.classList.add('hidden');
    recPreview.classList.remove('recording');
    prompterContainer.classList.remove('pip-active');
    recPlayback.src = '';
    recPlayback.classList.add('hidden');
    recDownload.href     = '';
    recDownload.classList.add('hidden');
    btnRecClear.classList.add('hidden');
    btnRecStart.disabled = false;
    btnRecStart.classList.remove('recording');
    btnRecStop.disabled  = true;
    setRecStatus('');
    clearRecError();
  }

  // Clear Recording button
  btnRecClear.addEventListener('click', clearRecording);

  // Expose so app.js Clear Script button can call it
  window._clearRecording = clearRecording;

  /* ------------------------------------------------------------------
     Export for unit testing
     ------------------------------------------------------------------ */
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { mimeExtension, formatBytes, buildPermissionErrorMessage };
  }

})();
