const MIN_RECORDING_MS = 700;
const MAX_RECORDING_MS = 60_000;
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const VOICE_REQUEST_TIMEOUT_MS = 45_000;
const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];

const errorMessages = {
  ABORTED: "录音已取消。",
  AI_PROCESSING_FAILED: "语音识别或解析失败，请重试。",
  AI_QUOTA_EXCEEDED: "今天的语音服务额度已用完。",
  AMBIGUOUS_SERVICE: "无法确定预约项目，请说得更明确。",
  AMBIGUOUS_STAFF: "无法确定预约员工，请说得更明确。",
  AUDIO_TOO_LARGE: "录音文件过大，请缩短录音。",
  EMPTY_AUDIO: "没有收到有效录音。",
  EMPTY_TRANSCRIPT: "没有识别到有效语音。",
  INVALID_CONTEXT: "当前日程数据不能用于语音预约。",
  INVALID_DATE: "没有识别到有效日期。",
  INVALID_TIME: "预约时间必须落在 30 分钟刻度上。",
  MISSING_SERVICE: "请说出预约项目。",
  MISSING_TIME: "请说出预约开始时间。",
  NETWORK_ERROR: "网络连接失败，请稍后重试。",
  PERMISSION_DENIED: "无法使用麦克风，请在系统设置中允许访问。",
  VOICE_PROXY_NOT_CONFIGURED: "本地语音代理未启动或尚未配置。",
  RECORDER_UNSUPPORTED: "当前浏览器不支持语音录入。",
  STAFF_SERVICE_MISMATCH: "该员工不提供这个项目。",
  UNAUTHORIZED: "语音服务认证失败。",
  UNKNOWN_SERVICE: "未识别到有效的预约项目。",
  UNKNOWN_STAFF: "未识别到有权限操作的员工。",
  UNSUPPORTED_AUDIO: "当前录音格式不受支持。",
  VOICE_NOT_ENABLED: "该店铺尚未启用语音预约。",
};

export function chooseRecordingMimeType(MediaRecorderClass = globalThis.MediaRecorder) {
  if (!MediaRecorderClass) return "";
  return MIME_CANDIDATES.find((type) => MediaRecorderClass.isTypeSupported?.(type)) || "";
}

export function voiceErrorMessage(code, fallback = "语音预约失败，请重试。") {
  return errorMessages[code] || fallback;
}

export function createVoiceInputController(options) {
  const {
    button,
    status,
    endpoint = "/api/admin-voice",
    getRequestHeaders = async () => ({}),
    getContext,
    createAppointment,
    showToast,
    onShortPress = null,
  } = options;
  let state = "idle";
  let pointerId = null;
  let recorder = null;
  let stream = null;
  let chunks = [];
  let recordingStartedAt = 0;
  let maximumTimer = null;
  let discardRecording = false;

  const setState = (next, message = "") => {
    state = next;
    button.dataset.state = next;
    button.setAttribute("aria-pressed", String(next === "recording"));
    button.disabled = next === "requesting" || next === "processing";
    status.textContent = message || (next === "recording" ? "正在录音，松开提交" : next === "processing" ? "正在识别和解析" : "");
    status.hidden = next === "idle";
  };

  const disableStream = () => {
    stream?.getAudioTracks().forEach((track) => { track.enabled = false; });
  };

  const releaseStream = () => {
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
  };

  const hasLiveStream = () => stream?.getAudioTracks().some((track) => track.readyState === "live");

  const releasePointer = () => {
    if (pointerId !== null && button.hasPointerCapture?.(pointerId)) {
      try { button.releasePointerCapture(pointerId); } catch (_error) { /* Capture may already be gone. */ }
    }
    pointerId = null;
  };

  const reset = () => {
    clearTimeout(maximumTimer);
    maximumTimer = null;
    releasePointer();
    recorder = null;
    chunks = [];
    recordingStartedAt = 0;
    discardRecording = false;
    disableStream();
    setState("idle");
  };

  const submitAudio = async (blob) => {
    if (!blob.size) throw Object.assign(new Error("Empty audio"), { code: "EMPTY_AUDIO" });
    if (blob.size > MAX_AUDIO_BYTES) throw Object.assign(new Error("Audio too large"), { code: "AUDIO_TOO_LARGE" });
    setState("processing");
    const form = new FormData();
    const extension = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
    form.append("audio", blob, `appointment.${extension}`);
    form.append("context", JSON.stringify(getContext()));
    let response;
    const requestController = new AbortController();
    const requestTimeout = setTimeout(() => requestController.abort(), VOICE_REQUEST_TIMEOUT_MS);
    try {
      response = await fetch(endpoint, {
        method: "POST",
        body: form,
        headers: await getRequestHeaders(),
        credentials: "same-origin",
        signal: requestController.signal,
      });
    } catch (error) {
      if (error?.code) throw error;
      const timedOut = error?.name === "AbortError";
      throw Object.assign(new Error(timedOut ? "Voice request timed out" : "Network error"), { code: "NETWORK_ERROR" });
    } finally {
      clearTimeout(requestTimeout);
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const proxyUnavailable = response.status === 404 || response.status === 503;
      throw Object.assign(new Error(payload?.error?.message || "Voice request failed"), {
        code: payload?.error?.code || (proxyUnavailable ? "VOICE_PROXY_NOT_CONFIGURED" : "AI_PROCESSING_FAILED"),
      });
    }
    if (!payload?.appointment) throw Object.assign(new Error("Invalid voice response"), { code: "AI_PROCESSING_FAILED" });
    await createAppointment(payload.appointment, payload.transcript || "");
  };

  const finishRecorder = ({ discard = false } = {}) => {
    if (!recorder || recorder.state === "inactive") {
      if (discard) reset();
      return;
    }
    discardRecording = discard;
    recorder.stop();
  };

  const onPointerDown = async (event) => {
    if (state !== "idle" || event.button > 0) return;
    event.preventDefault();
    pointerId = event.pointerId;
    button.setPointerCapture?.(event.pointerId);
    if (!navigator.mediaDevices?.getUserMedia || !globalThis.MediaRecorder) {
      showToast(voiceErrorMessage("RECORDER_UNSUPPORTED"), "error");
      return;
    }
    setState("requesting", "正在申请麦克风权限");
    try {
      if (!hasLiveStream()) {
        releaseStream();
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      }
      stream.getAudioTracks().forEach((track) => { track.enabled = true; });
      if (pointerId !== event.pointerId) {
        disableStream();
        setState("idle");
        showToast("麦克风已就绪，请再次长按录音。", "error");
        return;
      }
      const mimeType = chooseRecordingMimeType();
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunks = [];
      recorder.addEventListener("dataavailable", (item) => { if (item.data?.size) chunks.push(item.data); });
      recorder.addEventListener("stop", async () => {
        const type = recorder?.mimeType || chunks[0]?.type || mimeType || "audio/webm";
        const blob = new Blob(chunks, { type });
        const shouldDiscard = discardRecording;
        disableStream();
        if (shouldDiscard) { reset(); return; }
        try {
          await submitAudio(blob);
        } catch (error) {
          showToast(voiceErrorMessage(error?.code, error?.message), "error");
        } finally {
          reset();
        }
      }, { once: true });
      recorder.start(250);
      recordingStartedAt = performance.now();
      setState("recording");
      maximumTimer = setTimeout(() => finishRecorder(), MAX_RECORDING_MS);
    } catch (error) {
      reset();
      const denied = error?.name === "NotAllowedError" || error?.name === "SecurityError";
      showToast(voiceErrorMessage(denied ? "PERMISSION_DENIED" : "RECORDER_UNSUPPORTED"), "error");
    }
  };

  const onPointerUp = (event) => {
    if (event.pointerId !== pointerId) return;
    event.preventDefault();
    releasePointer();
    if (state === "requesting") return;
    if (state !== "recording") return;
    const duration = performance.now() - recordingStartedAt;
    if (duration < MIN_RECORDING_MS) {
      finishRecorder({ discard: true });
      if (typeof onShortPress === "function") {
        onShortPress();
        return;
      }
      showToast("按住时间太短，未提交录音。", "error");
      return;
    }
    finishRecorder();
  };

  const onPointerCancel = (event) => {
    if (event.pointerId !== pointerId) return;
    releasePointer();
    finishRecorder({ discard: true });
  };

  button.addEventListener("pointerdown", onPointerDown);
  button.addEventListener("pointerup", onPointerUp);
  button.addEventListener("pointercancel", onPointerCancel);
  button.addEventListener("lostpointercapture", (event) => {
    if (event.pointerId === pointerId && state === "recording") onPointerCancel(event);
  });
  button.addEventListener("contextmenu", (event) => event.preventDefault());
  const releaseWhenHidden = () => {
    if (document.visibilityState === "hidden") {
      finishRecorder({ discard: true });
      releaseStream();
    }
  };
  document.addEventListener("visibilitychange", releaseWhenHidden);
  setState("idle");

  return {
    cancel: () => finishRecorder({ discard: true }),
    destroy() {
      finishRecorder({ discard: true });
      button.removeEventListener("pointerdown", onPointerDown);
      button.removeEventListener("pointerup", onPointerUp);
      button.removeEventListener("pointercancel", onPointerCancel);
      document.removeEventListener("visibilitychange", releaseWhenHidden);
      releaseStream();
    },
  };
}

