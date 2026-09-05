# OpenSlot 理发店预约 MVP

这是一个可本地演示、也可连接 Supabase 外部数据库的理发店预约系统 MVP。没有配置 Supabase 时，应用自动使用浏览器 `localStorage`；配置后会把预约写入 Supabase，并用 PostgreSQL 排他约束阻止重复预约。

## 运行

```powershell
python -m http.server 5173
```

然后打开：

```text
http://127.0.0.1:5173/
```

页面入口：
- 顾客页：`http://127.0.0.1:5173/`
- 管理员页：`http://127.0.0.1:5173/admin.html`
- 连接诊断页：`http://127.0.0.1:5173/diagnostics.html`

架构说明和示意图见 [docs/architecture.md](docs/architecture.md)。

如果 Codex 会话里没有系统 Python，可以使用 bundled Python：

```powershell
C:\Users\iwasz\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m http.server 5173
```

## 连接 Supabase

1. 在 Supabase 新建项目。
2. 打开 Supabase SQL Editor，执行 [supabase/setup.sql](supabase/setup.sql)。
3. 复制 `config.example.js` 为 `config.js`。
4. 在 `config.js` 填入项目 URL 和 anon public key：

```js
window.OPENSLOT_SUPABASE = {
  url: "https://your-project.supabase.co",
  anonKey: "your-anon-public-key",
};
```

5. 打开 `http://127.0.0.1:5173/diagnostics.html`，确认配置、表读取和 RPC 检查通过。
6. 重新打开 `http://127.0.0.1:5173/`，右上角显示 `Supabase 外部连接` 即表示前端已切到外部数据库。

`config.js` 当前只是本地演示配置文件，不要把真实 key 提交到公开仓库。anon key 可以出现在前端，但必须配合 RLS policy 使用。

Supabase 模式下，顾客创建预约统一走 `create_public_booking(...)` RPC。前端不直接插入 `customers` 和 `appointments`。

## 店主登录

创建 Supabase Auth 用户后，后台区域可以用该 Auth 用户邮箱和密码登录。新环境只需要执行 [supabase/setup.sql](supabase/setup.sql)，不需要再单独执行旧的分步 SQL。

登录前：
- 顾客可以提交预约
- 页面只用 `appointments` 的时间信息计算占用 slot
- 后台不展示客户姓名、电话、邮箱，也不能取消预约

登录后：
- 后台展示客户信息
- 可以取消预约
- 可以看到已确认和已取消的预约记录

## RPC 预约与排班管理

执行 [supabase/setup.sql](supabase/setup.sql) 后会包含：
- `shop_day_settings`：按日期设置工作开始时间、结束时间、整天停业
- `blocked_slots`：按日期 block 某个时间段，当前店主 UI 暂时不开放这个功能
- `create_public_booking(...)`：公开预约 RPC，负责校验姓名、电话、邮箱、服务、工作时间、blocked day、blocked slot

店主登录后可以：
- 调整当天工作开始/结束时间
- 管理服务名称、时长、价格和启用状态
- 查看当天所有预约记录，包括已取消记录
- 取消未取消的预约

冲突规则：
- 如果已有预约落在新工作时间之外，不能保存新工作时间
- 如果顾客预约与 blocked slot、停业日或非工作时间冲突，RPC 会拒绝写入

## 服务与价格管理

执行 [supabase/setup.sql](supabase/setup.sql) 后，服务配置会从 Supabase `services` 表读取，店主登录后可以在后台修改：
- 服务名称
- 服务时长
- 价格
- 是否启用

停用服务后，顾客端不再显示该服务，RPC 也会拒绝继续预约该服务。已有预约仍保留原 `service_id`，不会被删除。

## 顾客取消预约

执行 [supabase/setup.sql](supabase/setup.sql) 后，每条预约都会生成 `cancellation_token`。顾客预约确认邮件里包含一键取消链接，点击后由 `cancel-booking` Edge Function 取消预约。

旧的顾客查询/取消页已移到 `archive/`，不再作为主流程入口。保留的 RPC：
- `get_public_booking(p_booking_id, p_email)`：旧查询页兼容
- `cancel_public_booking(p_booking_id, p_email)`：旧查询页兼容

顾客取消会把 `appointments.status` 改为 `cancelled`，并记录 `cancelled_by = 'customer'`、`cancelled_at = now()`。后台取消会记录 `cancelled_by = 'owner'`。

## 当前业务规则

- 营业时间：`10:00-19:00`
- 时间粒度：`30` 分钟
- 服务时长：剪发 `30` 分钟，染发 `90` 分钟，烫发 `120` 分钟
- 姓名格式：至少 `2` 个字符，不能只填数字
- 同一天内，任何预约时间区间重叠都会被前端拦截
- Supabase 模式下，数据库还会通过 `tstzrange(start_time, end_time, '[)')` 排他约束二次拦截并发重复预约
- 取消预约后，对应 slot 会恢复可选
- 刷新页面后，本地模式数据保存在当前浏览器；Supabase 模式数据保存在外部数据库

如果取消预约时报 RLS 错误，在 Supabase SQL Editor 执行 [supabase/rls-fix-cancel.sql](supabase/rls-fix-cancel.sql)。这个补丁允许匿名读取 `appointments` 表的预约状态，前端仍只显示未取消预约；客户姓名、电话、邮箱仍保存在 `customers` 表，不开放匿名读取。

## 连接诊断

打开 `http://127.0.0.1:5173/diagnostics.html` 可以检查：
- `config.js` 是否填好
- Supabase SDK 是否加载
- 当前 Auth 登录状态
- `services`、`appointments`、`shop_day_settings`、`blocked_slots` 是否可读取
- `create_public_booking(...)` 和 `get_public_booking(...)` RPC 是否可调用

诊断页不会创建真实预约。`create_public_booking(...)` 检查会使用不存在的服务 id，收到 `Unknown or inactive service` 即表示 RPC 存在且校验链路正常。

## 邮件通知

邮件通知使用 Supabase Edge Function + Resend。先在 Supabase Edge Functions Secrets 设置：

```text
RESEND_API_KEY=你的 Resend API key
MAIL_FROM=Berlin Barber <booking@mail.example.com>
PUBLIC_SITE_URL=http://127.0.0.1:5173
```

然后部署 Edge Function：

```powershell
npx supabase login
npx supabase functions deploy send-booking-email --project-ref YOUR_SUPABASE_PROJECT_REF
npx supabase functions deploy cancel-booking --project-ref YOUR_SUPABASE_PROJECT_REF
```

`cancel-booking` 是邮件里的公开 GET 取消链接，`supabase/config.toml` 已设置 `verify_jwt = false`。

部署后重新打开 `http://127.0.0.1:5173/diagnostics.html`，确认 `send-booking-email Edge Function` 通过。

邮件触发点：
- 顾客预约成功：发送德语确认邮件，包含服务、日期、时间、店铺地址、电话、营业时间和一键取消链接
- 顾客点击邮件取消链接：取消预约，并尝试发送取消确认邮件
- 店主取消预约：发送顾客取消通知邮件

邮件发送失败不会回滚预约或取消操作，失败记录会写入 `email_events` 表。

为防止邮件额度被刷，`create_public_booking(...)` 会限制同一邮箱或同一电话在 10 分钟内最多创建 3 条预约。邮件函数本身也会按 booking id + event type + recipient 去重，重复调用不会重复发同一封邮件。

安全和额度保护清单见 [docs/security-abuse-prevention.md](docs/security-abuse-prevention.md)。

## 后续迁移方向

- 收紧 RLS：后台管理、取消预约、读取客户联系方式应改为店主登录后才能操作
- 增加服务端校验：营业时间、服务时长和允许日期不应只由前端控制
- 增加邮件确认和 Uni-app/微信小程序适配
