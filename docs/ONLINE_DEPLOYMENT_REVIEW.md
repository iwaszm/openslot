# OpenSlot 上线审查与部署注意事项

审查日期：2026-09-28
审查范围：当前工作区、`template/` 本地设置原型、Cloudflare Pages 构建、Supabase 迁移与 Edge Functions。

## 结论

当前版本适合继续做本地 UI 和业务流程验证，但**不应直接发布为新的线上设置系统**。

现有 `lisa/`、`demo/` 线上页面仍使用 Supabase；`template/` 明确是独立的本地沙盒，数据存放在浏览器 `localStorage`，而且构建脚本不会将 `template/` 复制进 `dist/`。要把新设置页用于生产，必须先补齐 Supabase 数据适配层、权限策略和迁移，再把页面纳入正式构建。

此外，当前已链接的远端 Supabase 数据库迁移明显落后于仓库，且数据库 lint 存在一个会在运行时失败的旧函数。数据库状态是当前最主要的上线阻断项。

## 审查发现

### P0：远端数据库未应用仓库中的大部分迁移

`npx supabase migration list --linked` 的结果显示，远端只登记了以下迁移：

- `20260913103414`
- `20260913143316`
- `20260913143501`
- `20260913170000`

从 `20260914090000` 到 `20260926140000` 的 15 个迁移在远端均为空，包括历史清理、翻译、员工权限、统一日程、公共假日、线上 lane 容量和 owner settings 基础结构。

影响：

- 当前前端查询的新表、列、RPC 或 RLS 策略可能在线上不存在。
- 员工权限和跨店隔离可能与当前代码假设不一致。
- 直接部署前端可能出现部分页面可读、部分写入失败的混合状态。
- README 中手工 SQL 安装顺序也只写到 `20260915090000`，已经落后于当前迁移目录。

处理要求：

1. 对远端数据库做 CLI 备份，并单独备份 Auth 用户及 Storage 元数据。
2. 在 staging 项目从空库完整执行所有迁移。
3. 用 staging 数据回归 booking、admin、邮件、取消和员工权限。
4. 确认迁移可重复执行且数据修复 SQL 符合预期后，再对生产执行 `supabase db push`。
5. 不要把旧的根目录 SQL 文件和 `supabase/migrations/` 混合手工执行；今后以迁移目录作为唯一发布历史。

### P0：远端数据库存在已失效函数

`npx supabase db lint --linked --level warning` 报告：

```text
public.create_admin_block: relation "blocked_slots" does not exist
```

该函数仍向已经不存在的 `blocked_slots` 表写入。调用时会直接失败，也说明远端数据库仍包含旧架构残留。

处理要求：

- 在 staging 验证后，通过迁移删除或替换 `create_admin_block`。
- 搜索前端和 RPC 是否还有调用该函数的路径。
- 迁移后再次运行 `supabase db lint --linked --level warning`，要求至少没有 `error`。

另有一个低风险 lint：`generate_berlin_public_holidays` 中 `holiday_year` 变量遮蔽且未使用。应清理，但不阻断上线。

### P1：客户取消链接使用 GET 直接修改数据

`supabase/functions/cancel-booking/index.ts:16` 只接受 GET，并在 `:45` 直接把预约改为取消。

邮件安全扫描器、链接预览和企业邮箱网关可能自动访问 GET 链接，导致客户尚未确认就被取消。

建议改为：

1. GET 只展示预约摘要和确认页面，不修改数据。
2. 用户点击确认后用 POST 提交取消 token。
3. POST 保持幂等，并在数据库事务内完成状态变更。
4. 设置 `Cache-Control: no-store` 和严格的 `Referrer-Policy`。

### P1：生产邮件函数的调用边界需要收紧

客户页面在 `customer.js:799` 直接调用 `send-booking-email`，管理页在 `admin.js:1769` 也直接调用同一函数。该 Edge Function 使用 service role 读取预约和客户资料，但目前只根据调用方提供的 `booking_id` 和 `event_type` 决定发送内容。

风险：

- 持有预约 UUID 的调用方可以请求与真实预约状态不一致的邮件事件，例如预约仍有效却请求 `cancelled` 邮件。
- 邮件发送与预约写入分成两个客户端步骤，网络中断时可能成功预约但没有邮件。

建议：

- 创建预约成功后，由 `create-booking` 在服务端触发创建邮件。
- 取消成功后，由取消函数在服务端触发取消邮件。
- `send-booking-email` 不对浏览器公开，或要求内部签名/service-role 调用。
- 发送前校验 `event_type` 与数据库中的预约状态一致。
- 保留现有 `email_events` 幂等记录，并为失败发送加入重试任务。

### P1：`template/settings` 仍是本地原型，不是生产设置页

依据：

- `template/local-config.js:4` 将数据源固定为 `local`。
- `template/local-config.js:5` 使用独立命名空间 `openslot.template.preview.v2`。
- `template/local-repository.js:52` 及后续写入全部使用 `localStorage`。
- `scripts/build.js:41` 只复制 `datenschutz`、`stornierung`、`lisa`、`demo`，没有复制 `template`。
- 构建中的 `validateTemplateIsolation()` 只验证模板没有引用 Supabase，并不将其发布。

因此目前设置页中的 Shop、Services、Öffnungszeiten、Mitarbeiter 修改：

- 只影响当前浏览器；
- 不会跨设备同步；
- 清理站点数据后会丢失；
- 不会影响线上 booking/admin；
- 不具备真正的 owner/staff 服务器端权限。

正确的生产化方式不是删除本地隔离，而是保留模板作为 UI 沙盒，并新增 Supabase repository，实现与本地 repository 相同的接口。

### P1：缺少自动化测试门禁

`package.json` 目前只有 `npm run build`。构建可以检查静态复制和模板隔离，但不能证明以下关键行为正确：

- covered time 与 occupied time 冲突规则；
- 多 lane 自动分配；
- owner/staff 权限边界；
- 节假日、全天 block、时间段 block；
- 服务与员工能力匹配；
- 预约和取消的并发安全；
- booking/admin 响应式布局。

上线前至少应增加：

- 数据层单元测试；
- Supabase RPC 集成测试；
- Playwright booking/admin/settings 主流程测试；
- 针对 RLS 的 owner、staff、anon 负向测试。

### P2：服务端错误信息直接返回给公共客户端

`supabase/functions/create-booking/index.ts:68` 和 `send-booking-email/index.ts:67` 会把捕获到的原始异常文本返回给客户端。

数据库错误可能暴露表名、约束名和内部实现。生产环境应：

- 服务端记录完整错误和 request ID；
- 客户端只返回稳定错误代码和德语用户提示；
- 对可预期冲突使用 409，对校验错误使用 400，未知错误使用通用 500。

### P2：CORS 和滥用控制仍需生产化

公开 Edge Functions 使用 `Access-Control-Allow-Origin: *`。公共预约本身允许匿名调用是合理的，但建议：

- 限制为正式域名和明确的预览域名；
- 验证 Turnstile 的 `hostname` 和预期 action；
- 在 Cloudflare 增加按 IP/路径的 rate limit；
- Supabase RPC 内继续保留事务锁和频率限制，不能只依赖前端或 Turnstile；
- 对取消 POST 增加节流和审计日志。

## 当前架构边界

### 正式页面

- Cloudflare Pages 发布静态文件。
- `scripts/build.js` 根据环境变量生成 `dist/config.js`。
- 浏览器使用 Supabase publishable/anon key；该 key 可以公开，安全性必须依赖 RLS 和 RPC。
- booking 写入经过 `create-booking` Edge Function、Turnstile 和数据库 RPC。
- admin 使用 Supabase Auth 和 `salon_members` 权限。

### Template 页面

- 仅用于本地 UI/交互试验。
- 使用 localStorage 和合成数据。
- 不加载生产 `config.js`、Supabase 或 Turnstile。
- 当前不会进入 Cloudflare 构建产物。

这一隔离设计是正确的，应继续保留。生产化时应迁移“界面和 repository 接口”，不要把 localStorage 数据直接当作线上数据库。

## 建议的生产化顺序

### 阶段 1：冻结数据库基线

1. 记录当前生产 project ref、迁移状态、函数版本和环境变量名称。
2. 使用 Supabase CLI 导出 schema、data 和 roles。
3. 建立独立 staging Supabase 项目。
4. 从空库按 `supabase/migrations/` 全量执行。
5. 修复 lint 中的 `create_admin_block` 和假日函数警告。
6. 更新 README，删除过时的手工 SQL 执行顺序。

### 阶段 2：为设置页建立生产 repository

保持 `OpenSlotLocalRepository` 供模板使用，新增例如 `OpenSlotSupabaseSettingsRepository`：

- Shop：`salons` 中的名称、地址、电话、邮箱、主题色和语言顺序。
- Kategorien：分类表及多语言名称、排序、active 状态。
- Services：服务、多语言、简称、时长、价格、`price_from`、occupied slots、排序和 active 状态。
- Mitarbeiter：`salon_staff`、lane 数量、线上接单状态。
- Service ↔ Mitarbeiter：`staff_services`。
- Öffnungszeiten：`salon_weekly_hours`。

所有写入必须：

- 通过 Auth 用户身份执行；
- 由 RLS 或安全 RPC 校验 salon membership；
- 使用稳定 ID，名称修改不能改变 ID；
- 在多表修改时使用事务 RPC；
- 返回更新后的服务器记录，避免 UI 假成功。

### 阶段 3：权限模型

- Owner：管理 Shop、Services、Kategorien、Öffnungszeiten、所有 Mitarbeiter 和所有 lanes。
- Staff：只能管理自己的 lanes 和允许的日程操作；默认只读其他员工区域。
- Anon：只能读取公开营业信息、公开服务和可预约时间，不能读取客户资料。
- Edge Function 的 service role 只存在于 Supabase Secrets，绝不进入前端或 Cloudflare Pages 环境变量。

为每个表和 RPC 编写 owner/staff/anon 的正向与负向测试。

### 阶段 4：邮件与取消流程

1. 将创建邮件合并到服务端预约流程。
2. 将取消改为 GET 确认页 + POST 状态修改。
3. 邮件事件校验数据库状态。
4. 配置 Resend 已验证发件域名、SPF、DKIM 和 DMARC。
5. 设置失败重试与监控，但避免重复发送。

### 阶段 5：前端发布

Cloudflare Pages 需要：

```text
Build command: npm run build
Build output directory: dist
Root directory: /
```

构建变量：

```text
OPENSLOT_SUPABASE_URL
OPENSLOT_SUPABASE_ANON_KEY
OPENSLOT_TURNSTILE_SITE_KEY
OPENSLOT_VAPID_PUBLIC_KEY        # 启用 push 时
```

Supabase Function secrets：

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
TURNSTILE_SECRET_KEY
RESEND_API_KEY
MAIL_FROM
PUBLIC_BASE_URL
VAPID_PUBLIC_KEY                # 启用 push 时
VAPID_PRIVATE_KEY               # 启用 push 时
```

检查 `PUBLIC_BASE_URL=https://openslotberlin.de`，并确保 Cloudflare Turnstile 的允许域名包含正式域名，不把 localhost 测试配置带到生产。

## 上线前验收清单

### 数据库

- [ ] 生产备份可恢复。
- [ ] staging 从空库执行所有迁移成功。
- [ ] `migration list --linked` 本地与远端完全一致。
- [ ] `db lint --linked` 没有 error。
- [ ] 所有 public 表启用 RLS。
- [ ] owner、staff、anon 权限测试通过。
- [ ] 两个并发请求不能预订同一受冲突约束的资源。

### Booking

- [ ] 只显示有效服务、有效员工和真正可预约时间。
- [ ] 服务时长、covered slots、occupied slots 与管理页一致。
- [ ] 过去日期、休息日、节假日和 block 时段无法预约。
- [ ] Turnstile 失败时不产生数据库记录。
- [ ] 成功预约只发送一次德语确认邮件。
- [ ] 三个输入框长度和服务端校验一致。

### Admin / Settings

- [ ] 未登录用户无法读取客户资料。
- [ ] staff 不能修改其他员工的 lane。
- [ ] owner 可以修改全部店铺设置。
- [ ] Shop 主题色同步影响 booking/admin/settings。
- [ ] Services、Kategorien、Mitarbeiter和Öffnungszeiten跨设备同步。
- [ ] 所有状态反馈使用 toast；需要用户决策的操作仍使用 dialog。
- [ ] 删除已被预约引用的 service/category 被数据库阻止。

### 邮件与取消

- [ ] 邮件链接打开不会自动取消。
- [ ] POST 确认取消幂等。
- [ ] 已取消预约不能再次产生状态变化。
- [ ] 邮件失败有日志、重试和可观察状态。
- [ ] 发件域名 SPF/DKIM/DMARC 正常。

### 发布与回滚

- [ ] `npm run build` 使用正式环境变量成功。
- [ ] 在本地静态服务器验证 `dist/`，而不是源文件目录。
- [ ] 检查 `/lisa/`、`/lisa/admin/`、`/demo/` 和取消页面路由。
- [ ] Cloudflare Preview 环境先完成 smoke test。
- [ ] 记录上一版 Pages deployment ID。
- [ ] 数据库迁移有前向修复方案；不要依赖破坏性 down migration。

## 建议的发布判定

满足以下条件后再发布新的生产设置页：

1. 远端迁移与仓库一致，数据库 lint 无 error。
2. 取消流程改为显式 POST 确认。
3. 设置页完成 Supabase repository、RLS 与权限测试。
4. 邮件发送从浏览器编排迁移到受控服务端流程。
5. booking/admin/settings 的核心 E2E 测试通过。

在此之前，可以继续发布不依赖新数据库结构的纯样式改动，但每次都应从 `dist/` 验证，并避免把 `template/` 误当成正式页面。
