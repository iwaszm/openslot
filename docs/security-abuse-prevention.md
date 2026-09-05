# 安全与邮件额度防滥用

## 当前已做

- 邮件只发送给顾客，不再发送店主通知。
- `send-booking-email` 只根据已有 booking id 查询真实预约，不接受任意收件人。
- `email_events` 使用 booking id + event type + recipient 去重，重复调用同一事件不会重复发邮件。
- `create_public_booking(...)` 限制同一邮箱或同一电话 10 分钟内最多创建 3 条预约。
- Resend API key 只保存在 Supabase Secrets，不进入前端 `config.js`。

## 当前仍有风险

- 前端 anon key 是公开的，任何人都能调用公开 RPC。
- 攻击者可以使用不同邮箱和电话批量创建预约，从而消耗 Resend 免费额度。
- CORS 只能减少浏览器跨站调用，不能阻止脚本直接调用 API。
- 目前没有人机验证，无法有效区分真实顾客和自动化脚本。

## 上线前必须补

1. 加 Cloudflare Turnstile 或 hCaptcha。
   - 顾客提交预约前获取 captcha token。
   - 预约创建必须改走 Edge Function。
   - Edge Function 先校验 captcha，再调用数据库 RPC。

2. 把公开预约入口从前端直连 RPC 改成 Edge Function。
   - 前端不再直接调用 `create_public_booking(...)`。
   - Edge Function 统一做 captcha、频率限制、字段校验、RPC 调用、邮件发送。

3. 做更强的服务端频率限制。
   - 按邮箱、电话、IP、日期限制。
   - 推荐 Upstash Redis 或 Supabase 表记录窗口计数。

4. 限制预约日期范围。
   - 例如只能预约未来 30 天。
   - 防止攻击者向很远日期灌入大量预约。

5. 设置监控。
   - 每天检查 Resend usage。
   - 监控 `email_events.status = 'failed'`。
   - 监控异常高频的 `customers.email`、`customers.phone`、`appointments.created_at`。

## 推荐下一步

先做 Cloudflare Turnstile + 预约 Edge Function。这是最有效的额度保护，因为只有通过人机验证的请求才能创建预约并触发邮件。
