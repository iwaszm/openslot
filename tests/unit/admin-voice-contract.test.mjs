import test from "node:test";
import assert from "node:assert/strict";

import { VoiceContractError, finalizeVoiceAppointment, isSupportedAudioType, normalizeVoiceContext } from "../../workers/admin-voice/src/contract.mjs";
import { chooseRecordingMimeType, voiceErrorMessage } from "../../src/admin/voice-input-controller.mjs";
import voiceWorker from "../../workers/admin-voice/src/index.mjs";

const context = {
  currentDate: "2026-10-22",
  selectedDate: "2026-10-24",
  timezone: "Europe/Berlin",
  language: "zh",
  defaultStaffKey: "linda",
  services: [
    { id: "herren_haarschnitt", aliases: ["男士剪发", "Herren Haarschnitt", "SchnittH"] },
    { id: "damen_haarschnitt", aliases: ["女士剪发", "Damen Haarschnitt", "SchnittD"] },
  ],
  staff: [
    { key: "linda", aliases: ["Linda"], serviceIds: ["herren_haarschnitt", "damen_haarschnitt"] },
    { key: "tony", aliases: ["Tony"], serviceIds: ["herren_haarschnitt"] },
  ],
};

test("normalizes voice context and removes unknown staff services", () => {
  const value = normalizeVoiceContext({ ...context, staff: [{ ...context.staff[0], serviceIds: ["herren_haarschnitt", "missing"] }] });
  assert.deepEqual(value.staff[0].serviceIds, ["herren_haarschnitt"]);
  assert.equal(value.language, "zh");
});

test("normalizes the back-office language for Whisper", () => {
  assert.equal(normalizeVoiceContext({ ...context, language: "de" }).language, "de");
  assert.equal(normalizeVoiceContext({ ...context, language: "en" }).language, "en");
  assert.equal(normalizeVoiceContext({ ...context, language: "fr" }).language, "de");
});

test("uses selected date and default staff when they were not spoken", () => {
  const appointment = finalizeVoiceAppointment({
    date: null,
    startTime: "15:00",
    serviceId: "herren_haarschnitt",
    staffKey: null,
    note: "小王第一次来需要咨询",
    staffMentioned: false,
    serviceAmbiguous: false,
    staffAmbiguous: false,
  }, context);
  assert.deepEqual(appointment, {
    date: "2026-10-24",
    startTime: "15:00",
    serviceId: "herren_haarschnitt",
    staffKey: "linda",
    note: "小王第一次来需要咨询",
  });
});

test("keeps an explicit permitted staff member and truncates note by Unicode characters", () => {
  const appointment = finalizeVoiceAppointment({
    date: "2026-10-23",
    startTime: "10:30",
    serviceId: "herren_haarschnitt",
    staffKey: "tony",
    note: "这是超过十二个字符的预约备注内容",
    staffMentioned: true,
    serviceAmbiguous: false,
    staffAmbiguous: false,
  }, context);
  assert.equal(appointment.staffKey, "tony");
  assert.equal(Array.from(appointment.note).length, 12);
});

for (const [name, output, code] of [
  ["missing time", { serviceId: "herren_haarschnitt", staffMentioned: false }, "MISSING_TIME"],
  ["missing service", { startTime: "15:00", staffMentioned: false }, "MISSING_SERVICE"],
  ["unknown staff", { startTime: "15:00", serviceId: "herren_haarschnitt", staffKey: "nobody", staffMentioned: true }, "UNKNOWN_STAFF"],
  ["staff service mismatch", { startTime: "15:00", serviceId: "damen_haarschnitt", staffKey: "tony", staffMentioned: true }, "STAFF_SERVICE_MISMATCH"],
  ["invalid slot", { startTime: "15:10", serviceId: "herren_haarschnitt", staffMentioned: false }, "INVALID_TIME"],
]) {
  test(`rejects ${name}`, () => {
    assert.throws(() => finalizeVoiceAppointment({ date: null, note: "", serviceAmbiguous: false, staffAmbiguous: false, ...output }, context), (error) => error instanceof VoiceContractError && error.code === code);
  });
}

test("selects the first supported recorder format and exposes stable errors", () => {
  const Recorder = { isTypeSupported: (type) => type === "audio/webm;codecs=opus" || type === "audio/mp4" };
  assert.equal(chooseRecordingMimeType(Recorder), "audio/webm;codecs=opus");
  assert.match(voiceErrorMessage("MISSING_SERVICE"), /预约项目/);
});

test("accepts browser MIME variants while rejecting unrelated audio codecs", () => {
  assert.equal(isSupportedAudioType("audio/mp4;codecs=opus"), true);
  assert.equal(isSupportedAudioType("audio/webm; codecs=opus"), true);
  assert.equal(isSupportedAudioType("audio/ogg;codecs=opus"), true);
  assert.equal(isSupportedAudioType("audio/wav"), false);
  assert.equal(isSupportedAudioType("audio/webm;codecs=opus;rate=48000"), true);
  assert.equal(isSupportedAudioType("audio/wav"), false);
});

test("voice worker rejects requests without the shared bearer token", async () => {
  const response = await voiceWorker.fetch(new Request("https://voice.test", { method: "POST" }), { VOICE_API_TOKEN: "secret" });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, "UNAUTHORIZED");
});

test("voice worker rejects unsupported audio before invoking AI", async () => {
  const form = new FormData();
  form.append("audio", new Blob(["audio"], { type: "audio/wav" }), "sample.wav");
  form.append("context", JSON.stringify(context));
  const response = await voiceWorker.fetch(new Request("https://voice.test", {
    method: "POST",
    headers: { Authorization: "Bearer secret" },
    body: form,
  }), { VOICE_API_TOKEN: "secret", AI: { run: () => { throw new Error("must not run"); } } });
  assert.equal(response.status, 415);
  assert.equal((await response.json()).error.code, "UNSUPPORTED_AUDIO");
});

test("voice worker passes the configured back-office language to Whisper", async () => {
  const calls = [];
  const form = new FormData();
  form.append("audio", new Blob(["audio"], { type: "audio/webm" }), "sample.webm");
  form.append("context", JSON.stringify({ ...context, language: "de" }));
  const response = await voiceWorker.fetch(new Request("https://voice.test", {
    method: "POST",
    headers: { Authorization: "Bearer secret" },
    body: form,
  }), {
    VOICE_API_TOKEN: "secret",
    AI: {
      async run(model, input) {
        calls.push({ model, input });
        if (model.includes("whisper")) return { text: "um drei Uhr Herren Haarschnitt" };
        return { response: JSON.stringify({
          date: "", startTime: "15:00", serviceId: "herren_haarschnitt", staffKey: "",
          note: "", staffMentioned: false, serviceAmbiguous: false, staffAmbiguous: false,
        }) };
      },
    },
  });
  assert.equal(response.status, 200);
  assert.equal(calls[0].input.language, "de");
});

test("Supabase-authenticated voice requests are limited to the demo salon", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ id: "demo-user" });
  try {
    const form = new FormData();
    form.append("audio", new Blob(["audio"], { type: "audio/webm" }), "sample.webm");
    form.append("context", JSON.stringify({ ...context, salonSlug: "lisa" }));
    const response = await voiceWorker.fetch(new Request("https://voice.test", {
      method: "POST",
      headers: {
        Authorization: "Bearer session-token",
        Origin: "https://openslotberlin.de",
        "X-Supabase-Anon-Key": "public-key",
      },
      body: form,
    }), {
      SUPABASE_URL: "https://project.supabase.co",
      AI: { run: () => { throw new Error("must not run"); } },
    });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://openslotberlin.de");
    assert.equal((await response.json()).error.code, "VOICE_NOT_ENABLED");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
