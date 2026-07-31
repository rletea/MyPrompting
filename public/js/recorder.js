/**
 * recorder.js — Voice recording module
 *
 * Uses the MediaRecorder API to capture microphone audio.
 * Produces a Blob URL for in-browser playback and a download link.
 * No audio is sent to the server.
 *
 * Security:
 *  - Requests microphone permission only when the user clicks "Record".
 *  - Revokes old blob URLs on new recordings to prevent memory leaks.
 *  - All errors surfaced to the user via a visible status message.
 */

'use strict';

(function initRecorder() {
  /* ------------------------------------------------------------------
     DOM references
     ------------------------------------------------------------------ */
  const btnRecStart   = document.getElementById('btn-rec-start');
  const btnRecStop    = document.getElementById('btn-rec-stop');
  const recStatus     = document.getElementById('rec-status');
  const recPlayback   = document.getElementById('rec-playback');
  const recDownload   = document.getElementById('rec-download');
  const recError      = document.getElementById('rec-error');

  /* ------------------------------------------------------------------
     State
     ------------------------------------------------------------------ */
  let mediaRecorder   = null;
  let audioChunks     = [];
  let recordingBlobUrl = null;

  /* ------------------------------------------------------------------
     Feature detection
     ------------------------------------------------------------------ */
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showRecError('Your browser does not support audio recording.');
    btnRecStart.disabled = true;
    return;
  }

  if (typeof MediaRecorder === 'undefined') {
    showRecError('MediaRecorder is not supported in this browser.');
    btnRecStart.disabled = true;
    return;
  }

  /* ------------------------------------------------------------------
     Determine best MIME type
     ------------------------------------------------------------------ */
  const PREFERRED_MIME_TYPES = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/mp4',
  ];

  function getSupportedMimeType() {
    for (const type of PREFERRED_MIME_TYPES) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return '';   // browser picks a default
  }

  /* ------------------------------------------------------------------
     Start recording
     ------------------------------------------------------------------ */
  btnRecStart.addEventListener('click', async () => {
    clearRecError();
    setRecStatus('Requesting microphone permission…');

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch (err) {
      const msg = buildPermissionErrorMessage(err);
      showRecError(msg);
      setRecStatus('');
      return;
    }

    // Revoke previous recording blob
    if (recordingBlobUrl) {
      URL.revokeObjectURL(recordingBlobUrl);
      recordingBlobUrl = null;
    }

    audioChunks = [];

    const mimeType = getSupportedMimeType();
    const options  = mimeType ? { mimeType } : {};

    try {
      mediaRecorder = new MediaRecorder(stream, options);
    } catch (err) {
      showRecError(`Could not start recorder: ${err.message}`);
      setRecStatus('');
      stopStreamTracks(stream);
      return;
    }

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        audioChunks.push(e.data);
      }
    };

    mediaRecorder.onstop = () => {
      // Stop all microphone tracks (releases the mic indicator in the browser)
      stopStreamTracks(stream);

      const finalMime = mediaRecorder.mimeType || mimeType || 'audio/webm';
      const blob = new Blob(audioChunks, { type: finalMime });
      recordingBlobUrl = URL.createObjectURL(blob);

      // Wire up playback
      recPlayback.src = recordingBlobUrl;
      recPlayback.classList.remove('hidden');

      // Wire up download — determine extension from MIME type
      const ext = mimeExtension(finalMime);
      recDownload.href = recordingBlobUrl;
      recDownload.download = `recording.${ext}`;
      recDownload.classList.remove('hidden');

      setRecStatus(`Recording saved (${formatBytes(blob.size)}). Ready to download.`);

      // Reset button states
      btnRecStart.disabled = false;
      btnRecStart.classList.remove('recording');
      btnRecStop.disabled  = true;
    };

    mediaRecorder.onerror = (e) => {
      showRecError(`Recorder error: ${e.error ? e.error.message : 'Unknown error'}`);
      setRecStatus('');
      btnRecStart.disabled = false;
      btnRecStart.classList.remove('recording');
      btnRecStop.disabled  = true;
    };

    mediaRecorder.start(250);   // collect data every 250ms

    btnRecStart.disabled = true;
    btnRecStart.classList.add('recording');
    btnRecStop.disabled  = false;

    recPlayback.classList.add('hidden');
    recDownload.classList.add('hidden');
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
  });

  /* ------------------------------------------------------------------
     Helpers
     ------------------------------------------------------------------ */

  function stopStreamTracks(stream) {
    if (stream && stream.getTracks) {
      stream.getTracks().forEach((t) => t.stop());
    }
  }

  function buildPermissionErrorMessage(err) {
    if (!err) return 'Could not access the microphone.';
    switch (err.name) {
      case 'NotAllowedError':
      case 'PermissionDeniedError':
        return 'Microphone access was denied. Please allow microphone permission in your browser settings and try again.';
      case 'NotFoundError':
      case 'DevicesNotFoundError':
        return 'No microphone found. Please connect a microphone and try again.';
      case 'NotReadableError':
      case 'TrackStartError':
        return 'Microphone is in use by another application. Please close other apps and try again.';
      case 'OverconstrainedError':
        return 'No microphone matched the requested constraints.';
      case 'AbortError':
        return 'Microphone access was aborted.';
      default:
        return `Microphone error: ${err.message || err.name}`;
    }
  }

  /**
   * Map a MIME type string to a sensible file extension.
   * @param {string} mime
   * @returns {string}
   */
  function mimeExtension(mime) {
    if (!mime) return 'webm';
    if (mime.startsWith('audio/ogg'))  return 'ogg';
    if (mime.startsWith('audio/mp4'))  return 'm4a';
    if (mime.startsWith('audio/mpeg')) return 'mp3';
    if (mime.startsWith('audio/wav'))  return 'wav';
    return 'webm';  // default / audio/webm
  }

  /**
   * Human-readable file size.
   * @param {number} bytes
   * @returns {string}
   */
  function formatBytes(bytes) {
    if (bytes < 1024)        return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  function setRecStatus(msg) {
    recStatus.textContent = msg;
  }

  function showRecError(msg) {
    recError.textContent = msg;
  }

  function clearRecError() {
    recError.textContent = '';
  }

  /* ------------------------------------------------------------------
     Export for unit testing
     ------------------------------------------------------------------ */
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { mimeExtension, formatBytes, buildPermissionErrorMessage };
  }

})();
