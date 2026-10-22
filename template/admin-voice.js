import { createVoiceInputController } from "../src/admin/voice-input-controller.mjs";

function initialize(api) {
  if (!api || window.__openSlotTemplateVoiceController) return;
  const button = document.getElementById("voiceAppointmentButton");
  const status = document.getElementById("voiceAppointmentStatus");
  if (!button || !status) return;
  window.__openSlotTemplateVoiceController = createVoiceInputController({
    button,
    status,
    getContext: api.getContext,
    createAppointment: api.createAppointment,
    showToast: api.showToast,
  });
}

initialize(window.OpenSlotTemplateAdminVoice);
window.addEventListener("openslot:template-admin-voice-ready", () => initialize(window.OpenSlotTemplateAdminVoice), { once: true });

