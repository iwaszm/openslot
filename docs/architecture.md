# OpenSlot Architecture / 架构示意图

这份文档描述当前已经跑通的 OpenSlot 理发店预约 MVP。术语以 English 为主，中文用于辅助理解。当前系统是一个 static web app + Supabase backend + Resend email 的轻量架构。

## 1. System Overview / 系统总览

```mermaid
flowchart LR
  subgraph Client["Client Apps / 浏览器端"]
    Customer["Customer Booking Page<br/>index.html + customer.js<br/>顾客预约页"]
    Admin["Owner Admin Page<br/>admin.html + admin.js<br/>店主管理页"]
    Diagnostics["Diagnostics Page<br/>diagnostics.html + diagnostics.js<br/>连接诊断页"]
    LocalStorage["localStorage Fallback<br/>无外部配置时的本地演示数据"]
  end

  subgraph Supabase["Supabase Project / 后端项目"]
    Auth["Supabase Auth<br/>Owner login / 店主登录"]
    PostgREST["PostgREST API<br/>table select/update/upsert"]
    RPC["PostgreSQL RPC<br/>create_public_booking<br/>get_public_booking<br/>cancel_public_booking"]
    Edge["Edge Functions<br/>Deno serverless runtime"]
    DB["PostgreSQL Database<br/>RLS + constraints"]
  end

  subgraph Database["Database Tables / 数据表"]
    Services["services<br/>service catalog / 服务与价格"]
    Customers["customers<br/>customer PII / 顾客联系方式"]
    Appointments["appointments<br/>booking records / 预约记录"]
    DaySettings["shop_day_settings<br/>working hours / 工作时间"]
    BlockedSlots["blocked_slots<br/>blocked intervals / 不开放时段"]
    EmailEvents["email_events<br/>email idempotency log / 邮件去重日志"]
  end

  subgraph External["External SaaS / 外部服务"]
    Resend["Resend Email API<br/>customer notification / 顾客邮件"]
  end

  Customer -->|"read services, appointments, day settings, blocked slots"| PostgREST
  Customer -->|"create booking"| RPC
  Customer -->|"invoke send-booking-email"| Edge
  Customer -.->|"when config.js missing"| LocalStorage

  Admin -->|"sign in/out"| Auth
  Admin -->|"owner CRUD: services, settings, cancellations"| PostgREST
  Admin -->|"invoke cancellation email"| Edge
  Admin -.->|"when config.js missing"| LocalStorage

  Diagnostics -->|"health checks"| PostgREST
  Diagnostics -->|"RPC/function smoke checks"| RPC
  Diagnostics -->|"email function check"| Edge

  PostgREST --> DB
  RPC --> DB
  Edge -->|"service role read/write"| DB
  Edge -->|"send email"| Resend

  DB --> Services
  DB --> Customers
  DB --> Appointments
  DB --> DaySettings
  DB --> BlockedSlots
  DB --> EmailEvents
```

### Key Idea / 核心思路

OpenSlot 的核心不是页面，而是 availability calculation（可用时间计算）和 double-booking prevention（防重复预约）。浏览器端负责交互和即时反馈，Supabase 端负责最终校验、并发冲突拦截、数据持久化和邮件触发。

## 2. Runtime Components / 运行组件

| Component | File / Service | Responsibility / 职责 |
| --- | --- | --- |
| Static Frontend | `index.html`, `customer.js`, `styles.css`, `i18n.js` | Customer booking UI, service/date/time selection, form validation, slot rendering |
| Owner Admin | `admin.html`, `admin.js` | Owner authentication, appointment list, cancelled bookings visibility, service/price/work-hour management |
| Diagnostics | `diagnostics.html`, `diagnostics.js` | Checks config, Supabase SDK, Auth, table access, RPC availability, Edge Function availability |
| Config Boundary | `config.js` from `config.example.js` | Holds public Supabase URL and anon key for browser runtime |
| PostgreSQL Schema | `supabase/setup.sql` | Tables, constraints, RLS policies, RPC functions |
| Booking RPC | `create_public_booking(...)` | Server-side booking validation and atomic insert |
| Email Function | `supabase/functions/send-booking-email/index.ts` | Reads booking with service role, sends customer emails through Resend, logs idempotency |
| Cancel Link Function | `supabase/functions/cancel-booking/index.ts` | Public GET endpoint for cancellation-token link in customer email |
| External Email | Resend | Real email delivery |

## 3. Booking Flow / 顾客预约流程

```mermaid
sequenceDiagram
  autonumber
  actor Customer as Customer / 顾客
  participant UI as Customer Page<br/>customer.js
  participant API as Supabase<br/>PostgREST + RPC
  participant DB as PostgreSQL<br/>RLS + constraints
  participant Edge as send-booking-email<br/>Edge Function
  participant Resend as Resend Email API

  Customer->>UI: Select gender, service, date<br/>选择性别、服务、日期
  UI->>API: SELECT services where is_active = true
  API->>DB: Read services
  DB-->>API: Service catalog
  API-->>UI: Active services

  UI->>API: SELECT appointments/day settings/blocked slots
  API->>DB: Read availability inputs
  DB-->>API: Existing confirmed bookings + rules
  API-->>UI: Availability data
  UI->>UI: buildSlots(date, service.duration)<br/>30-min grid + overlap check
  Customer->>UI: Pick available slot and submit form

  UI->>API: RPC create_public_booking(...)
  API->>DB: Validate name/phone/email/service/hours/blocked slot/rate limit
  DB->>DB: Exclusion constraint prevent_double_booking<br/>tstzrange(start_time,end_time,'[)') && overlap
  DB-->>API: booking_id
  API-->>UI: booking_id

  UI->>Edge: POST send-booking-email<br/>{ booking_id, event_type: "created" }
  Edge->>DB: Load booking + customer + service with service role
  Edge->>DB: Insert/read email_events idempotency row
  Edge->>Resend: Send customer confirmation email
  Resend-->>Edge: resend_email_id or error
  Edge->>DB: Update email_events status
  Edge-->>UI: Email result
  UI-->>Customer: Show booking success + email status
```

### Booking Validation Layers / 预约校验分层

| Layer | What It Checks | Why It Exists |
| --- | --- | --- |
| UI validation | Required fields, name length, selected slot, service/date selection | Fast feedback; avoids obvious bad input |
| Client availability check | Working hours, blocked day, blocked slot, existing non-cancelled appointments | Makes the slot grid responsive |
| RPC validation | Name/phone/email format, active service, 30-min increments, future date, working hours, blocked slots, simple rate limits | Browser data cannot be trusted |
| Database constraint | `prevent_double_booking` exclusion constraint on `tstzrange(start_time, end_time, '[)')` | Final concurrency guard; prevents race-condition double booking |

## 4. Slot Engine / Slot 计算

```mermaid
flowchart TD
  Start["Selected date + selected service<br/>已选日期 + 已选服务"]
  Inputs["Load inputs<br/>services.duration_minutes<br/>shop_day_settings<br/>blocked_slots<br/>appointments where status != cancelled"]
  BlockedDay{"is_blocked_day?"}
  Loop["Generate 30-minute start times<br/>from open_time to close_time - duration"]
  Candidate["Candidate interval<br/>[slot_start, slot_start + service_duration)"]
  Past{"Past slot?"}
  BookingOverlap{"Overlap existing appointment?"}
  BlockOverlap{"Overlap blocked slot?"}
  Available["Available slot<br/>可预约"]
  Hidden["Unavailable slot<br/>当前顾客页只展示可预约 slot"]

  Start --> Inputs --> BlockedDay
  BlockedDay -- yes --> Hidden
  BlockedDay -- no --> Loop --> Candidate
  Candidate --> Past
  Past -- yes --> Hidden
  Past -- no --> BookingOverlap
  BookingOverlap -- yes --> Hidden
  BookingOverlap -- no --> BlockOverlap
  BlockOverlap -- yes --> Hidden
  BlockOverlap -- no --> Available
```

Current business rules（当前规则）：

- Slot granularity: `30 minutes`
- Default working hours: `10:00-19:00`
- Service duration comes from `services.duration_minutes`
- A slot is bookable only when the full service interval fits inside working hours
- Interval model is half-open: `[start, end)`, meaning an appointment ending at `11:00` does not conflict with another starting at `11:00`
- Cancelled appointments are kept for admin history but ignored for availability

## 5. Cancellation Flow / 取消预约流程

```mermaid
sequenceDiagram
  autonumber
  actor Customer as Customer / 顾客
  actor Owner as Owner / 店主
  participant Mail as Email Client
  participant CancelEdge as cancel-booking<br/>Edge Function
  participant AdminUI as Admin Page<br/>admin.js
  participant DB as PostgreSQL
  participant MailEdge as send-booking-email<br/>Edge Function
  participant Resend as Resend

  Customer->>Mail: Click cancellation link<br/>点击确认邮件里的取消链接
  Mail->>CancelEdge: GET /functions/v1/cancel-booking?token=...
  CancelEdge->>DB: Find appointment by cancellation_token
  CancelEdge->>DB: UPDATE appointments SET status='cancelled', cancelled_by='customer'
  CancelEdge->>MailEdge: POST send-booking-email event_type='cancelled'
  MailEdge->>DB: Check email_events idempotency
  MailEdge->>Resend: Send cancellation confirmation to customer
  CancelEdge-->>Customer: Render HTML result page

  Owner->>AdminUI: Click cancel booking<br/>后台取消预约
  AdminUI->>DB: UPDATE appointments SET status='cancelled', cancelled_by='owner'
  AdminUI->>MailEdge: POST send-booking-email event_type='cancelled'
  MailEdge->>DB: Check email_events idempotency
  MailEdge->>Resend: Send cancellation notification to customer
```

Cancellation design（取消设计）：

- `appointments.cancellation_token` is a random token generated by PostgreSQL using `gen_random_bytes(24)`.
- Customer email contains a one-click cancel URL pointing to `cancel-booking`.
- `cancel-booking` uses service role credentials inside Supabase Edge Function, not in the browser.
- Admin cancellation uses authenticated browser session and RLS policy.
- Cancelled bookings remain visible in admin but no longer block customer slots.

## 6. Database Model / 数据模型

```mermaid
erDiagram
  CUSTOMERS ||--o{ APPOINTMENTS : "customer_id"
  SERVICES ||--o{ APPOINTMENTS : "service_id"
  APPOINTMENTS ||--o{ EMAIL_EVENTS : "booking_id"

  CUSTOMERS {
    uuid id PK
    text name
    text phone
    text email
    text gender
    timestamptz created_at
  }

  SERVICES {
    text id PK
    text name
    integer duration_minutes
    numeric price
    boolean is_active
  }

  APPOINTMENTS {
    uuid id PK
    uuid customer_id FK
    text service_id FK
    date appointment_date
    timestamptz start_time
    timestamptz end_time
    text status
    text cancellation_token UK
    timestamptz cancelled_at
    text cancelled_by
    timestamptz created_at
  }

  SHOP_DAY_SETTINGS {
    date setting_date PK
    time open_time
    time close_time
    boolean is_blocked_day
    timestamptz updated_at
  }

  BLOCKED_SLOTS {
    uuid id PK
    date block_date
    time start_time
    time end_time
    text reason
    timestamptz created_at
  }

  EMAIL_EVENTS {
    uuid id PK
    uuid booking_id FK
    text event_type
    text recipient
    text status
    text resend_email_id
    text error_message
    timestamptz created_at
    timestamptz sent_at
  }
```

### Important Constraints / 关键约束

| Constraint | Location | Purpose |
| --- | --- | --- |
| `prevent_double_booking` | `appointments` | Prevent overlapping non-cancelled appointment intervals |
| `appointments_cancellation_token_key` | `appointments.cancellation_token` | Ensure every public cancel link maps to one appointment |
| `unique (booking_id, event_type, recipient)` | `email_events` | Ensure one email event is sent only once per recipient |
| `duration_minutes % 30 = 0` policy check | `services` owner insert/update | Keep service durations aligned with slot grid |
| `close_time > open_time` | `shop_day_settings` | Prevent invalid working hours |
| `end_time > start_time` | `blocked_slots`, `appointments` | Prevent invalid time ranges |

## 7. Appointment State / 预约状态

```mermaid
stateDiagram-v2
  [*] --> confirmed: create_public_booking
  confirmed --> cancelled: owner cancels
  confirmed --> cancelled: customer cancellation link
  cancelled --> [*]

  note right of confirmed
    Blocks slots
    出现在顾客端占用计算中
  end note

  note right of cancelled
    Kept in admin history
    Does not block slots
  end note
```

The schema also allows `pending`, but the current MVP writes new bookings directly as `confirmed`. `pending` can be used later for online payment, manual approval, SMS verification, or deposit flows.

## 8. Security Boundary / 安全边界

```mermaid
flowchart TB
  Browser["Browser / Public Client<br/>has anon key only"]
  Anon["Anon Role<br/>public read + RPC execute"]
  AuthUser["Authenticated Owner<br/>Supabase Auth session"]
  ServiceRole["Service Role<br/>only inside Edge Functions"]
  PII["Customer PII<br/>customers table"]
  PublicData["Public Availability Data<br/>services, appointments time/status,<br/>day settings, blocked slots"]
  OwnerData["Owner Data<br/>customers + all appointments + service settings"]
  EmailSecrets["Secrets<br/>RESEND_API_KEY, MAIL_FROM,<br/>SUPABASE_SERVICE_ROLE_KEY"]

  Browser --> Anon
  Browser --> AuthUser
  Anon --> PublicData
  Anon -->|"create_public_booking RPC"| PublicData
  AuthUser --> OwnerData
  ServiceRole --> PII
  ServiceRole --> OwnerData
  ServiceRole --> EmailSecrets
```

Security rules currently implemented（当前已实现）：

- Browser only uses `SUPABASE_URL` and `anon public key`.
- Real customer insert happens through `create_public_booking(...)`, not direct table insert.
- `customers` table is not anonymously readable; owner login is required to view name/phone/email.
- `appointments` is publicly readable so the customer page can calculate occupied slots, but it does not expose customer details.
- Edge Functions use `SUPABASE_SERVICE_ROLE_KEY`, which must stay in Supabase secrets only.
- `send-booking-email` sends only customer emails and logs results into `email_events`.
- Basic abuse protection exists in `create_public_booking(...)`: max 3 bookings per same email or same phone within 10 minutes.

Security items still recommended for production（生产前建议补强）：

- Add CAPTCHA / Turnstile before public booking creation.
- Add stricter rate limiting by IP/device/session at an API gateway or Edge Function layer.
- Avoid exposing complete appointment timeline publicly if competitor abuse becomes serious; return only derived availability instead.
- Add owner role table instead of letting any authenticated Supabase user manage the shop.
- Add audit logs for admin changes and cancellations.
- Add backup/export strategy before real customer operation.

## 9. API Boundary / API 边界

```mermaid
flowchart LR
  CustomerUI["customer.js"] -->|"SELECT"| Services["services"]
  CustomerUI -->|"SELECT"| Availability["appointments + shop_day_settings + blocked_slots"]
  CustomerUI -->|"RPC"| CreateBooking["create_public_booking"]
  CustomerUI -->|"Function Invoke"| SendEmail["send-booking-email"]

  AdminUI["admin.js"] -->|"Supabase Auth"| Auth["auth.signInWithPassword"]
  AdminUI -->|"SELECT/UPSERT"| ManageServices["services"]
  AdminUI -->|"SELECT/UPSERT"| ManageHours["shop_day_settings"]
  AdminUI -->|"SELECT"| AdminBookings["appointments join customers"]
  AdminUI -->|"UPDATE"| CancelBooking["appointments.status = cancelled"]
  AdminUI -->|"Function Invoke"| SendCancelEmail["send-booking-email"]

  EmailLink["Email cancel URL"] -->|"GET token"| CancelEdge["cancel-booking"]
```

The current frontend has a repository pattern（仓储模式）:

- `createSupabaseRepository(client)` talks to Supabase.
- `createLocalRepository()` talks to browser `localStorage`.
- UI code calls the repository interface, so the same UI can run without a backend for local demos.

## 10. Why These Technologies / 核心技术解释

### Static Web App

The frontend is plain HTML/CSS/JavaScript. There is no React/Vite build dependency in the current MVP runtime. This keeps deployment and debugging simple: any static server can host it.

中文理解：现在重点是跑通业务闭环，不是前端工程化。静态页面足够承载预约、后台、诊断三个入口。

### Supabase

Supabase provides PostgreSQL, Auth, PostgREST, RPC, Edge Functions, and secrets management in one platform.

中文理解：它不是单纯数据库，而是把数据库、登录、API、Serverless Function 组合成一个轻量 backend。

### PostgreSQL RPC

`create_public_booking(...)` is a `security definer` PostgreSQL function. The browser can call it, but the function itself runs database-side validation.

中文理解：顾客端不直接写 `customers` 和 `appointments`，而是把预约请求交给数据库函数处理。这样业务规则不会只留在前端。

### RLS

Row Level Security controls who can read or mutate rows.

中文理解：anon 用户可以读服务和时间占用，不能读客户联系方式；店主登录后才可以看客户信息和管理预约。

### Exclusion Constraint

The database uses `tstzrange(start_time, end_time, '[)') with &&` to prevent interval overlap for non-cancelled appointments.

中文理解：即使两个顾客几乎同时点击同一个时间，数据库也会拦住第二个重叠预约。这是比前端判断更可靠的最终防线。

### Edge Functions

Supabase Edge Functions run server-side TypeScript on Deno. They can safely use secrets like `RESEND_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY`.

中文理解：发邮件和一键取消不能只靠浏览器做，因为浏览器不能保存私密 key。

### Resend

Resend is the external email provider. The app sends appointment confirmation and cancellation emails to customers only.

中文理解：店主已经有后台，所以当前逻辑不再给店主发邮件，减少噪音和免费额度消耗。

### Idempotency

`email_events` records `(booking_id, event_type, recipient)` and the delivery status.

中文理解：同一个预约、同一种邮件、同一个收件人只发一次，避免重复调用函数导致邮件重复发送。

## 11. Current Limitations / 当前限制

- Availability is still partly calculated in the browser; production can move this behind a dedicated availability API.
- Public appointment read exposes appointment dates and time ranges, although not customer PII.
- Abuse prevention is basic: email/phone rate limit exists, but no CAPTCHA, IP-based throttle, or deposit flow yet.
- Owner authorization is currently "any authenticated user"; production should restrict to explicit owner accounts.
- Email failure does not roll back booking or cancellation; it is logged in `email_events`.
- No online payment, SMS, WeChat mini-program, calendar sync, or multi-staff scheduling yet.

## 12. Suggested Next Architecture Step / 下一步架构建议

The next backend-oriented milestone should be an Availability API（可用时间 API）:

```mermaid
flowchart LR
  Customer["Customer Page"] -->|"date + service_id"| AvailabilityAPI["get_public_availability RPC or Edge Function"]
  AvailabilityAPI --> DB["PostgreSQL"]
  DB --> AvailabilityAPI
  AvailabilityAPI -->|"only available slots"| Customer
```

Why this matters（为什么重要）：

- The browser no longer needs to read all appointment time ranges.
- Competitors have less visibility into your actual booking density.
- Slot logic becomes centralized, testable, and easier to reuse in future mobile/WeChat clients.
- Later CAPTCHA, IP rate limit, and anti-abuse checks can be placed at the same boundary.
