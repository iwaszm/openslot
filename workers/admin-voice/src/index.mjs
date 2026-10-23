import {
  MAX_AUDIO_BYTES,
  VoiceContractError,
  finalizeVoiceAppointment,
  isSupportedAudioType,
  matchCatalogAliases,
  normalizeVoiceContext,
  resolveSpokenDate,
} from "./contract.mjs";

const jsonHeaders = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
const semanticModel = "@cf/meta/llama-3.1-8b-instruct-fast";

function allowedCorsOrigin(request) {
  const origin = request.headers.get("Origin") || "";
  if (origin === "https://openslotberlin.de" || /^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(origin)) return origin;
  return "";
}

function withCors(response, request) {
  const origin = allowedCorsOrigin(request);
  if (!origin) return response;
  const next = new Response(response.body, response);
  next.headers.set("Access-Control-Allow-Origin", origin);
  next.headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Supabase-Anon-Key");
  next.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  next.headers.set("Vary", "Origin");
  return next;
}

async function authorizeRequest(request, env) {
  const authorization = request.headers.get("Authorization") || "";
  if (env.VOICE_API_TOKEN && authorization === `Bearer ${env.VOICE_API_TOKEN}`) return "template";
  if (!authorization.startsWith("Bearer ") || !env.SUPABASE_URL) return "";
  const anonKey = request.headers.get("X-Supabase-Anon-Key") || "";
  if (!anonKey) return "";
  const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: anonKey },
  });
  return response.ok ? "supabase" : "";
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function errorResponse(code, message, status = 400) {
  return jsonResponse({ error: { code, message } }, status);
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function parseAiJson(result) {
  const value = result?.response ?? result;
  if (value && typeof value === "object") return value;
  if (typeof value !== "string") throw new VoiceContractError("INVALID_AI_RESPONSE", "语义模型返回了无效结果。", 502);
  try {
    return JSON.parse(value);
  } catch {
    throw new VoiceContractError("INVALID_AI_RESPONSE", "语义模型未返回有效 JSON。", 502);
  }
}

const responseSchema = {
  type: "object",
  properties: {
    date: { type: "string" },
    startTime: { type: "string" },
    serviceCode: { type: "string" },
    staffCode: { type: "string" },
    note: { type: "string" },
    staffMentioned: { type: "boolean" },
    serviceAmbiguous: { type: "boolean" },
    staffAmbiguous: { type: "boolean" },
  },
  required: ["date", "startTime", "serviceCode", "staffCode", "note", "staffMentioned", "serviceAmbiguous", "staffAmbiguous"],
};

function errorDetails(error) {
  return String(error?.message || error || "unknown error").replace(/\s+/g, " ").slice(0, 300);
}

async function handleRequest(request, env) {
  if (request.method !== "POST") return errorResponse("METHOD_NOT_ALLOWED", "只支持 POST 请求。", 405);
  const authMode = await authorizeRequest(request, env);
  if (!authMode) {
    return errorResponse("UNAUTHORIZED", "请求未授权。", 401);
  }
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    return errorResponse("INVALID_CONTENT_TYPE", "请求必须使用 multipart/form-data。", 415);
  }

  const form = await request.formData();
  const audio = form.get("audio");
  if (!(audio instanceof File) || audio.size === 0) return errorResponse("EMPTY_AUDIO", "没有收到录音。", 400);
  if (audio.size > MAX_AUDIO_BYTES) return errorResponse("AUDIO_TOO_LARGE", "录音超过 10 MB。", 413);
  const audioType = String(audio.type || "").toLowerCase();
  if (!isSupportedAudioType(audioType)) return errorResponse("UNSUPPORTED_AUDIO", `不支持这种录音格式：${audioType || "unknown"}`, 415);

  let context;
  try {
    const rawContext = JSON.parse(String(form.get("context") || "{}"));
    if (authMode === "supabase" && rawContext.salonSlug !== "demo") {
      return errorResponse("VOICE_NOT_ENABLED", "该店铺尚未启用语音预约。", 403);
    }
    context = normalizeVoiceContext(rawContext);
  } catch (error) {
    if (error instanceof VoiceContractError) return errorResponse(error.code, error.message, error.status);
    return errorResponse("INVALID_CONTEXT", "预约上下文不是有效 JSON。", 400);
  }

  const audioBuffer = await audio.arrayBuffer();
  let transcription;
  try {
    transcription = await env.AI.run("@cf/openai/whisper-large-v3-turbo", {
      audio: arrayBufferToBase64(audioBuffer),
      task: "transcribe",
      language: context.language,
    });
  } catch (error) {
    throw new VoiceContractError("STT_FAILED", `Whisper 识别失败：${errorDetails(error)}`, 502);
  }
  const transcript = String(transcription?.text || transcription?.transcription_info?.text || "").trim();
  if (!transcript) return errorResponse("EMPTY_TRANSCRIPT", "没有识别到有效语音。", 422);

  const serviceMatch = matchCatalogAliases(transcript, context.services);
  const staffMatch = matchCatalogAliases(transcript, context.staff);
  const spokenDate = resolveSpokenDate(transcript, context.currentDate);
  const serviceCodes = new Map(context.services.map((service, index) => [`S${index + 1}`, service.id]));
  const staffCodes = new Map(context.staff.map((employee, index) => [`E${index + 1}`, employee.key]));
  const serviceCodeById = new Map([...serviceCodes].map(([code, id]) => [id, code]));
  const staffCodeByKey = new Map([...staffCodes].map(([code, key]) => [key, code]));
  const catalogPrompt = JSON.stringify({
    services: context.services.map((service) => ({ code: serviceCodeById.get(service.id), aliases: service.aliases })),
    staff: context.staff.map((employee) => ({
      code: staffCodeByKey.get(employee.key),
      aliases: employee.aliases,
      serviceCodes: employee.serviceIds.map((id) => serviceCodeById.get(id)).filter(Boolean),
    })),
  });
  const deterministicPrompt = JSON.stringify({
    date: spokenDate.date,
    serviceCode: serviceMatch.matched ? serviceCodeById.get(serviceMatch.key) : "",
    serviceAmbiguous: serviceMatch.ambiguous,
    staffCode: staffMatch.matched ? staffCodeByKey.get(staffMatch.key) : "",
    staffAmbiguous: staffMatch.ambiguous,
  });

  let semantic;
  try {
    semantic = await env.AI.run(semanticModel, {
      messages: [
        {
          role: "system",
          content: [
            "你是预约字段解析器，只能输出符合 JSON schema 的数据。",
            `现实日期是 ${context.currentDate}，时区 ${context.timezone}，后台当前选择日期是 ${context.selectedDate}。`,
            "没说日期时 date 返回空字符串。代码预解析得到的非空 date 必须原样返回。",
            "开始时间和项目必填，但缺失时返回空字符串，不允许猜测。",
            "项目只能从目录 aliases 精确或明确匹配并返回 serviceCode；代码预匹配非空时必须原样返回；歧义时 serviceAmbiguous=true。",
            "员工未被提及时 staffMentioned=false 且 staffCode为空字符串；代码预匹配非空时必须原样返回；明确提到但无法唯一匹配时 staffMentioned=true 且 staffAmbiguous=true。",
            "note 只保留日期、时间、项目、员工之外的信息，简短中文，不超过 12 字。",
            `代码预解析：${deterministicPrompt}`,
            `目录：${catalogPrompt}`,
          ].join("\n"),
        },
        { role: "user", content: transcript },
      ],
      response_format: { type: "json_schema", json_schema: responseSchema },
      temperature: 0,
      max_tokens: 220,
    });
  } catch (error) {
    throw new VoiceContractError("SEMANTIC_FAILED", `已识别“${Array.from(transcript).slice(0, 40).join("")}”，但预约解析失败：${errorDetails(error)}`, 502);
  }
  const parsed = parseAiJson(semantic);
  const serviceCode = serviceMatch.matched ? serviceCodeById.get(serviceMatch.key) : String(parsed.serviceCode || "");
  const staffCode = staffMatch.matched ? staffCodeByKey.get(staffMatch.key) : String(parsed.staffCode || "");
  const appointment = finalizeVoiceAppointment({
    ...parsed,
    date: spokenDate.date || parsed.date,
    serviceId: serviceCodes.get(serviceCode) || "",
    staffKey: staffCodes.get(staffCode) || "",
    serviceAmbiguous: serviceMatch.ambiguous || parsed.serviceAmbiguous === true,
    staffAmbiguous: staffMatch.ambiguous || parsed.staffAmbiguous === true,
    staffMentioned: staffMatch.matched || parsed.staffMentioned === true,
  }, context);
  return jsonResponse({ transcript, appointment });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      const origin = allowedCorsOrigin(request);
      return withCors(new Response(null, { status: origin ? 204 : 403 }), request);
    }
    try {
      return withCors(await handleRequest(request, env), request);
    } catch (error) {
      if (error instanceof VoiceContractError) return withCors(errorResponse(error.code, error.message, error.status), request);
      const status = Number(error?.status || error?.cause?.status || 0);
      if (status === 429 || /quota|rate.?limit|neurons/i.test(String(error?.message || ""))) {
        return withCors(errorResponse("AI_QUOTA_EXCEEDED", "语音服务额度暂时不可用。", 429), request);
      }
      return withCors(errorResponse("AI_PROCESSING_FAILED", "语音识别或解析失败。", 502), request);
    }
  },
};

