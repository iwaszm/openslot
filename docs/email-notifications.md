# 真实邮件通知方案

## 推荐方案

使用 Supabase Edge Function + Resend。

原因：
- 邮件 API key 必须放在服务端，不能放进浏览器前端。
- 当前预约创建已经走 `create_public_booking(...)` RPC，适合在预约成功后由服务端触发邮件。
- Resend 适合事务邮件：预约确认、取消确认。

## 发送场景

第一阶段只做三类邮件：
- 顾客预约成功：发送德语确认邮件，包含 booking code、服务、日期、时间、店铺地址、电话、营业时间和一键取消链接。
- 顾客点击邮件取消链接后：取消预约，并尝试发送取消确认。
- 店主取消成功：发送取消通知。

暂不做：
- 营销邮件
- 批量群发
- 自动提醒
- 邮件模板后台编辑

## 技术路径

1. 在 Resend 添加并验证发信域名。
2. 创建 Resend API key。
3. 在 Supabase Edge Function Secrets 里保存：
   - `RESEND_API_KEY`
   - `MAIL_FROM`
   - `PUBLIC_SITE_URL`
4. 新建 Edge Function：`send-booking-email`。
5. 新建公开 Edge Function：`cancel-booking`。
6. 修改预约链路：
   - 保留 `create_public_booking(...)` 负责数据库事务和防重。
   - 预约成功后，由前端调用 Edge Function 发送邮件。
   - Edge Function 使用 booking id 查询预约详情，再发邮件。
   - 邮件里的 `Termin stornieren` 链接指向 `cancel-booking`，用随机 `cancellation_token` 取消预约。

## 当前实现

已实现：
- `supabase/functions/send-booking-email/index.ts`
- `supabase/functions/cancel-booking/index.ts`
- `supabase/config.toml` 中 `cancel-booking` 设置 `verify_jwt = false`
- `email_events` 表，定义在 `supabase/setup.sql`
- `appointments.cancellation_token`，用于邮件一键取消
- 顾客预约成功后调用 `send-booking-email`
- 顾客点击邮件取消链接后由 `cancel-booking` 取消预约
- 店主取消预约后调用 `send-booking-email`
- 只发送顾客邮件；店主不收邮件，直接看管理后台

部署命令：

```powershell
npx supabase login
npx supabase functions deploy send-booking-email --project-ref YOUR_SUPABASE_PROJECT_REF
npx supabase functions deploy cancel-booking --project-ref YOUR_SUPABASE_PROJECT_REF
```

部署后打开 `http://127.0.0.1:5173/diagnostics.html` 检查 `send-booking-email Edge Function`。

## 后续更稳的路径

当系统上线后，改成数据库事件触发：
- `appointments insert` 触发顾客预约确认邮件。
- `appointments update status = cancelled` 触发取消邮件。

这样即使未来有多个客户端，例如 Web、微信小程序、后台手动创建预约，邮件逻辑也只维护一套。

## 关键约束

- Resend API key 只放 Supabase Secrets，不写入 `config.js`。
- 发信域名需要配置 SPF、DKIM，建议用子域名，例如 `mail.example.com`。
- 邮件发送要幂等，使用 booking id + event type + recipient 作为去重 key。
- 一键取消链接只使用随机 `cancellation_token`，不在 URL 里暴露顾客邮箱。
- 邮件失败不能回滚预约成功，应该记录失败状态或在 Edge Function 日志里排查。
- MVP 已限制同一邮箱或同一电话 10 分钟内最多创建 3 条预约，避免刷预约造成邮件额度快速消耗。
