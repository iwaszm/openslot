const els = {
  sourceLabel: document.querySelector("#sourceLabel"),
  projectUrlLabel: document.querySelector("#projectUrlLabel"),
  authUserLabel: document.querySelector("#authUserLabel"),
  diagnosticsTimestamp: document.querySelector("#diagnosticsTimestamp"),
  diagnosticsList: document.querySelector("#diagnosticsList"),
  runButton: document.querySelector("#runDiagnosticsButton"),
};

const CHECKS = [
  {
    id: "config",
    label: "config.js 配置",
    run: async (ctx) => {
      if (!ctx.config.url || !ctx.config.anonKey) throw new Error("缺少 Supabase URL 或 anon key");
      if (/YOUR_SUPABASE/i.test(ctx.config.url) || /YOUR_SUPABASE/i.test(ctx.config.anonKey)) throw new Error("仍在使用 config.example.js 占位值");
      return "配置存在";
    },
  },
  {
    id: "sdk",
    label: "Supabase SDK",
    run: async (ctx) => {
      if (!window.supabase) throw new Error("Supabase SDK 没有加载成功");
      if (!ctx.client) throw new Error("没有创建 Supabase client");
      return "SDK 已加载";
    },
  },
  {
    id: "auth",
    label: "Auth 状态",
    run: async (ctx) => {
      const { data, error } = await ctx.client.auth.getUser();
      if (error) return "未登录或 session 不可用";
      return data.user?.email ? `已登录：${data.user.email}` : "未登录";
    },
    optional: true,
  },
  {
    id: "services",
    label: "services 表读取",
    run: async (ctx) => {
      const { data, error } = await ctx.client.from("services").select("id, name, duration_minutes, price, is_active").limit(5);
      if (error) throw error;
      return `${data.length} 个服务可读取`;
    },
  },
  {
    id: "appointments",
    label: "appointments 表读取",
    run: async (ctx) => {
      const today = toDateInputValue(new Date());
      const { data, error } = await ctx.client.from("appointments").select("id, status, appointment_date, start_time, end_time").eq("appointment_date", today).limit(5);
      if (error) throw error;
      return `今日 ${data.length} 条预约记录可读取`;
    },
  },
  {
    id: "daySettings",
    label: "shop_day_settings 表读取",
    run: async (ctx) => {
      const today = toDateInputValue(new Date());
      const { error } = await ctx.client.from("shop_day_settings").select("setting_date, open_time, close_time, is_blocked_day").eq("setting_date", today).maybeSingle();
      if (error) throw error;
      return "排班设置可读取";
    },
  },
  {
    id: "blockedSlots",
    label: "blocked_slots 表读取",
    run: async (ctx) => {
      const today = toDateInputValue(new Date());
      const { data, error } = await ctx.client.from("blocked_slots").select("id, block_date, start_time, end_time").eq("block_date", today).limit(5);
      if (error) throw error;
      return `${data.length} 条暂停时间可读取`;
    },
    optional: true,
  },
  {
    id: "createRpc",
    label: "create_public_booking RPC",
    run: async (ctx) => {
      const { error } = await ctx.client.rpc("create_public_booking", {
        p_salon_slug: "lisa",
        p_service_id: "__diagnostic_missing_service__",
        p_appointment_date: toDateInputValue(new Date()),
        p_start_time: "10:00:00",
        p_gender: "male",
        p_name: "Diagnostic User",
        p_phone: "+490000000",
        p_email: "diagnostic@example.com",
      });
      if (!error) throw new Error("RPC 意外创建了预约，请检查测试服务 id");
      if (/Unknown or inactive service/i.test(error.message || "")) return "RPC 存在并正常校验服务";
      throw error;
    },
  },
  {
    id: "lookupRpc",
    label: "get_public_booking RPC",
    run: async (ctx) => {
      const { error } = await ctx.client.rpc("get_public_booking", {
        p_booking_id: "00000000-0000-0000-0000-000000000000",
        p_email: "diagnostic@example.com",
      });
      if (error) throw error;
      return "公开查询 RPC 可调用";
    },
  },
  {
    id: "emailFunction",
    label: "send-booking-email Edge Function",
    run: async (ctx) => {
      const { error } = await ctx.client.functions.invoke("send-booking-email", {
        body: { booking_id: "not-a-valid-booking-id", event_type: "created" },
      });
      if (!error) throw new Error("函数返回异常：无效 booking id 不应通过");
      if (/non-2xx|Invalid booking_id/i.test(error.message || "")) return "Edge Function 已部署并可调用";
      throw error;
    },
  },
];

init();

function init() {
  els.runButton.addEventListener("click", runDiagnostics);
  runDiagnostics();
}

async function runDiagnostics() {
  const config = window.OPENSLOT_SUPABASE || {};
  const hasConfig = Boolean(config.url && config.anonKey && !/YOUR_SUPABASE/i.test(config.url) && !/YOUR_SUPABASE/i.test(config.anonKey));
  const client = window.supabase && hasConfig ? window.supabase.createClient(config.url, config.anonKey) : null;
  const ctx = { config, client };

  els.sourceLabel.textContent = hasConfig ? "Supabase 外部连接" : "本地/未配置";
  els.projectUrlLabel.textContent = config.url || "-";
  els.authUserLabel.textContent = "检测中";
  els.diagnosticsTimestamp.textContent = "检测中...";
  els.diagnosticsList.innerHTML = "";
  els.runButton.disabled = true;

  const results = [];
  for (const check of CHECKS) {
    const result = await runCheck(check, ctx);
    results.push(result);
    renderResults(results);
  }

  const authResult = results.find((result) => result.id === "auth");
  els.authUserLabel.textContent = authResult?.status === "pass" ? authResult.detail.replace("已登录：", "") : "未登录";
  els.diagnosticsTimestamp.textContent = new Date().toLocaleString("zh-CN");
  els.runButton.disabled = false;
}

async function runCheck(check, ctx) {
  try {
    if (!ctx.client && !["config", "sdk"].includes(check.id)) throw new Error("Supabase client 未创建");
    const detail = await check.run(ctx);
    return { id: check.id, label: check.label, status: "pass", detail };
  } catch (error) {
    return {
      id: check.id,
      label: check.label,
      status: check.optional ? "warn" : "fail",
      detail: error.message || String(error),
    };
  }
}

function renderResults(results) {
  els.diagnosticsList.innerHTML = results.map((result) => `
    <article class="diagnostics-row ${result.status}">
      <span class="diagnostics-dot" aria-hidden="true"></span>
      <div>
        <strong>${escapeHtml(result.label)}</strong>
        <small>${escapeHtml(result.detail)}</small>
      </div>
    </article>
  `).join("");
}

function toDateInputValue(date) {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 10);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
