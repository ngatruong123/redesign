# Phân Tích Toàn Diện Codebase — Design Tool

**Ngày review**: 2026-03-04  
**Stack**: Next.js 16.1.6 + React 19.2 | Zustand 5 | Prisma 7 (libsql/SQLite) | Gemini AI | Sharp | Fabric.js 7  
**So sánh với**: CODE_REVIEW lần trước (2026-03-03)

---

## 📊 Tổng Quan Kiến Trúc

```
┌────────────────────────────────────────────────────────────┐
│  Frontend (Client)                                         │
│  React 19 + Next.js 16 → Zustand Stores x3                │
│  Components x14+ │ Hooks x3 │ Styles (CSS)                │
├────────────────────────────────────────────────────────────┤
│  Backend (API Routes x14)                                  │
│  Middleware (JWT Auth) → 14 Route Groups                   │
│  auth/ │ workspaces/ │ generate/ │ mockup/ │ upload/       │
│  files/ │ download/ │ remove-bg/ │ generate-seo/           │
│  generate-stream/ │ generate-video/ │ templates/ │ save/   │
│  cleanup/                                                  │
├────────────────────────────────────────────────────────────┤
│  Data Layer                                                │
│  Prisma 7 + libsql → SQLite (2 Models: User, Workspace)   │
│  Blob Storage → R2 / Local Filesystem                      │
├────────────────────────────────────────────────────────────┤
│  External Services                                         │
│  Gemini API (AI Generation) │ Cloudflare R2 (Storage)      │
└────────────────────────────────────────────────────────────┘
```

| Metric | Giá trị |
|--------|---------|
| Tổng files TS/TSX | ~45 |
| Components | 14 + 6 sub-components |
| API Routes | 14 route groups |
| Stores | 3 (workflow, workspace, toast) |
| Hooks | 3 (useMaskHistory, useQuadCanvas, useQuadInteraction) |
| Tests | 8 test files |
| Lib utilities | 11 modules |
| File lớn nhất | `MockupEditor.tsx` — **46KB / ~983 dòng** |
| DB Models | **2** (User, Workspace) |
| Storage backends | 2 (R2, Local filesystem) |

---

## ✅ Đã Khắc Phục (so với review lần trước)

| # | Vấn đề cũ | Trạng thái |
|----|-----------|------------|
| ~~1~~ | Auth cookie chỉ chứa `"authenticated"` | ✅ **Đã chuyển sang JWT** (jose `HS256`, exp 30 ngày) |
| ~~2~~ | Password mặc định `design2026` | ✅ **`AUTH_PASS` không còn fallback** — throw error nếu thiếu secret |
| ~~3~~ | API routes bypass middleware auth | ✅ **Tất cả 14 API routes đều dùng `requireAuth()`** |
| ~~4~~ | `@types/bcryptjs` trong dependencies | ✅ **Đã chuyển sang devDependencies** |
| ~~5~~ | VariationGrid tự implement toggle selection | ✅ **Dùng store actions** |
| ~~6~~ | `next-auth` chưa được xóa | ✅ **Đã xóa khỏi package.json** |

---

## 1. 🗄️ DATABASE — Phân Tích & Mở Rộng

### 1.1 Hiện trạng Schema

Schema hiện tại cực kỳ đơn giản với chỉ **2 models**:

```prisma
// prisma/schema.prisma — 31 lines total
model User {
  id        String   @id @default(cuid())
  username  String   @unique
  email     String?  @unique
  password  String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  workspaces Workspace[]
}

model Workspace {
  id        String   @id @default(cuid())
  name      String
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  data      String?  // ← JSON blob chứa ALL workflow data
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([userId])
}
```

### 1.2 Vấn đề Database

| # | Vấn đề | Mức độ | Giải thích |
|---|--------|--------|------------|
| D1 | Chỉ 2 models — không tracking assets | 🔴 | Không thể query mockups, variations, uploads riêng lẻ |
| D2 | Workflow data = JSON blob trong `Workspace.data` | 🔴 | Toàn bộ designs, variations, templates → 1 chuỗi JSON. Không có FK constraints, không query được, performance sụt khi data lớn |
| D3 | Không có audit/activity log | 🟠 | Không tracking ai làm gì, khi nào |
| D4 | SQLite — giới hạn concurrent writes | 🟡 | File: `src/lib/db.ts`. Single-writer lock, không phù hợp multi-user |
| D5 | Không có soft delete | 🟡 | Workspace DELETE là hard delete — mất dữ liệu vĩnh viễn |
| D6 | Password marker `'___env_auth___'` lưu plain text | 🟠 | File: `src/app/api/auth/login/route.ts` dòng 29. Marker này cho biết user được tạo từ env auth |

### 1.3 Đề xuất mở rộng Schema

```prisma
// === PROPOSED EXPANSION ===

model User {
  id        String   @id @default(cuid())
  username  String   @unique
  email     String?  @unique
  password  String
  role      Role     @default(USER)     // ← NEW: RBAC

  workspaces  Workspace[]
  assets      Asset[]                    // ← NEW
  auditLogs   AuditLog[]                 // ← NEW
  apiKeys     ApiKey[]                   // ← NEW: cho Chrome extension
}

enum Role { USER ADMIN }

model Workspace {
  id        String    @id @default(cuid())
  name      String
  userId    String
  user      User      @relation(fields: [userId], references: [id])

  assets    Asset[]                      // ← NEW: structured assets
  deletedAt DateTime?                    // ← NEW: soft delete

  @@index([userId])
}

// ← NEW: Track uploaded files, generated images, mockups
model Asset {
  id          String    @id @default(cuid())
  type        AssetType
  filename    String
  url         String
  size        Int
  mimeType    String
  metadata    Json?     // dimensions, AI style, SEO data, etc.

  userId      String
  user        User      @relation(fields: [userId], references: [id])
  workspaceId String
  workspace   Workspace @relation(fields: [workspaceId], references: [id])

  parentId    String?   // link variation → source design
  parent      Asset?    @relation("AssetTree", fields: [parentId], references: [id])
  children    Asset[]   @relation("AssetTree")

  createdAt   DateTime  @default(now())
  deletedAt   DateTime? // soft delete

  @@index([userId, workspaceId, type])
  @@index([parentId])
}

enum AssetType { UPLOAD VARIATION MOCKUP TEMPLATE VIDEO }

// ← NEW: Track user actions
model AuditLog {
  id        String   @id @default(cuid())
  action    String   // "login", "generate_variation", "delete_workspace"
  details   Json?
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  ip        String?
  createdAt DateTime @default(now())

  @@index([userId, createdAt])
}

// ← NEW: API keys for Chrome extension (thay thế ENV-based extension IDs)
model ApiKey {
  id        String    @id @default(cuid())
  key       String    @unique
  name      String
  userId    String
  user      User      @relation(fields: [userId], references: [id])
  expiresAt DateTime?
  lastUsed  DateTime?
  createdAt DateTime  @default(now())

  @@index([key])
}
```

### 1.4 Lộ trình Migration SQLite → PostgreSQL

| Phase | Hành động | Effort |
|-------|-----------|--------|
| 1 | Thêm models mới (Asset, AuditLog, ApiKey) vào SQLite | 1-2 ngày |
| 2 | Migrate `Workspace.data` JSON → Asset records | 1 ngày |
| 3 | Chuyển adapter từ `@prisma/adapter-libsql` → `pg` | 2-3 giờ |
| 4 | Setup PostgreSQL (Supabase/Neon/self-hosted) | 1 ngày |
| 5 | Data migration script SQLite → PostgreSQL | 1 ngày |

---

## 2. 🔒 SECURITY — Phân Tích & Mở Rộng

### 2.1 Điểm tốt (đã khắc phục)

- ✅ JWT auth (jose HS256, 30-day expiry)
- ✅ 100% API routes protected (requireAuth)
- ✅ Path traversal protection trong `src/lib/resolve-path.ts`
- ✅ Rate limiting on login (5 req/min)
- ✅ File type validation on upload (PNG, JPG, WebP, SVG)
- ✅ File size limit (5MB)
- ✅ bcrypt password hashing
- ✅ httpOnly + SameSite cookies

### 2.2 Vấn đề Security

#### S1. 🔴 IDOR Risk — Workspace POST upsert không filter userId

**File**: `src/app/api/workspaces/route.ts` (dòng 34-40)

```typescript
// Hiện tại — VULNERABLE
if (clientId && typeof clientId === 'string') {
    const workspace = await prisma.workspace.upsert({
        where: { id: clientId },
        create: { id: clientId, name, userId: user.id },
        update: {},
    });
}
```

Client có thể gửi `id` trùng với workspace của user khác. Mặc dù `update: {}` không thay đổi dữ liệu, response vẫn trả về workspace info của user khác (IDOR — Insecure Direct Object Reference).

**Fix:**

```typescript
// FIXED — Check ownership first
if (clientId && typeof clientId === 'string') {
    const existing = await prisma.workspace.findFirst({
        where: { id: clientId, userId: user.id },
    });
    if (existing) {
        return NextResponse.json(existing, { status: 200 });
    }
    const workspace = await prisma.workspace.create({
        data: { id: clientId, name, userId: user.id },
    });
    return NextResponse.json(workspace, { status: 201 });
}
```

---

#### S2. 🔴 AUTH_SECRET fallback → dùng password làm JWT secret

**Files**: `src/auth.ts` (dòng 11), `src/middleware.ts` (dòng 7)

```typescript
// Hiện tại — RISKY
const secret = process.env.AUTH_SECRET || process.env.AUTH_PASSWORD;
```

Dùng password plain-text làm JWT signing secret là rủi ro: nếu password bị lộ → kẻ tấn công tạo được JWT token hợp lệ.

**Fix:**

```typescript
// FIXED — Require separate AUTH_SECRET
const secret = process.env.AUTH_SECRET;
if (!secret) throw new Error('AUTH_SECRET must be set (independent from AUTH_PASSWORD)');
```

---

#### S3. 🔴 ENV password so sánh plain-text khi không hash

**File**: `src/auth.ts` (dòng 61)

```typescript
// Hiện tại — VULNERABLE khi AUTH_PASSWORD không phải bcrypt hash
return password === AUTH_PASS;
```

Nếu admin set `AUTH_PASSWORD` dạng plain-text (không phải bcrypt hash), comparison dùng `===` trực tiếp.

**Fix:** Buộc `AUTH_PASSWORD` phải là bcrypt hash, hoặc loại bỏ nhánh plain-text comparison.

---

#### S4. 🟠 Middleware excludes tất cả `/api/` từ route matching

**File**: `src/middleware.ts` (dòng 38)

```typescript
matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
```

Tất cả API routes bị exclude khỏi middleware — auth check phụ thuộc hoàn toàn vào `requireAuth()` trong mỗi route. Nếu dev quên thêm `requireAuth()` vào route mới → route đó không có auth.

**Khuyến nghị**: Xem xét thêm API route auth vào middleware, hoặc tạo wrapper function bắt buộc.

---

#### S5. 🟠 Workspace routes dùng `getAuthUsername()` thay vì `requireAuth()`

**Files**: `src/app/api/workspaces/route.ts`, `src/app/api/workspaces/[id]/route.ts`

Workspace routes tự gọi `getAuthUsername()` thay vì dùng `requireAuth()` helper chung. Tuy vẫn check auth, nhưng không nhất quán — nếu logic auth thay đổi, workspace routes có thể bị bỏ sót.

**Fix:** Thay `getAuthUsername()` bằng `requireAuth()` + `getAuthUsername()` sau đó.

---

#### S6. 🟠 Rate limiter in-memory — bypass khi multi-instance

**File**: `src/lib/rate-limiter.ts`

`store` là `Map` trong bộ nhớ. Nếu deploy nhiều instance (Vercel serverless, k8s), rate limit bị bypass vì mỗi instance có map riêng.

**Khuyến nghị**: OK cho single-instance. Nếu scale → chuyển sang Redis-based rate limiting.

---

#### S7. 🟠 Không rate limit trên AI generation routes

**Files**: `src/app/api/generate-stream/route.ts`, `src/app/api/generate/route.ts`, `src/app/api/generate-seo/route.ts`

AI routes gọi Gemini API (tốn tiền) mà không có rate limiting. User có thể spam requests.

**Fix:**

```typescript
import { checkRateLimit } from '@/lib/rate-limiter';

// Thêm vào đầu mỗi AI route handler
const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
const { allowed, retryAfterMs } = checkRateLimit(`ai:${ip}`, 10, 60_000);
if (!allowed) {
    return NextResponse.json(
        { error: `Rate limited. Retry after ${Math.ceil(retryAfterMs / 1000)}s` },
        { status: 429 }
    );
}
```

---

#### S8. 🟠 Chrome extension auth bypass logic

**File**: `src/app/api/upload/route.ts` (dòng 36-44)

Upload route bỏ qua auth check cho Chrome extension requests dựa trên `origin` header. Attacker có thể fake `origin` header nếu không phải browser request.

**Khuyến nghị**: Chuyển sang API key authentication cho extension (xem đề xuất ApiKey model).

---

#### S9. 🟡 `setInterval` global không cleanup trong serverless

**File**: `src/lib/rate-limiter.ts` (dòng 8-14)

```typescript
setInterval(() => { ... }, 60_000);
```

Module-level `setInterval` chạy mãi, không có `clearInterval`. Trong serverless, mỗi cold start tạo thêm interval.

**Fix:** Dùng lazy cleanup (check expired entries khi `checkRateLimit` được gọi) thay vì interval.

---

#### S10. 🟡 Silent catch blocks

Nhiều `catch` block im lặng:

| File | Dòng | Context |
|------|------|---------|
| `auth.ts` | 49 | DB not available — fall through |
| `storage.ts` | 33 | Individual file error — skip |
| `workspace-store.ts` | 66 | localStorage remove error |

**Khuyến nghị**: Thêm `console.warn()` cho I/O errors, giữ im lặng cho logic fallback.

---

#### S11. 🟡 Không có CSRF protection

Tất cả POST/PUT/DELETE routes chỉ dựa vào SameSite cookie. Chưa có double-submit CSRF token.

**Khuyến nghị**: Cho internal tool ít rủi ro, nhưng nên thêm nếu mở rộng cho nhiều user.

---

### 2.3 Đề xuất expansion hướng bảo mật

| Tính năng | Mô tả | Priority |
|-----------|--------|----------|
| **RBAC** | User/Admin roles, admin-only routes (cleanup, user mgmt) | 🔴 |
| **API Key auth** | Thay thế Chrome extension ID whitelist — model ApiKey | 🟠 |
| **Audit logging** | Track all mutations (login, generate, delete) — model AuditLog | 🟠 |
| **CSRF tokens** | SameSite cookie + double-submit token cho mutations | 🟡 |
| **Content Security Policy** | CSP headers trong middleware | 🟡 |
| **Request size limits** | Global body size limit (not just upload) | 🟡 |

---

## 3. ⚙️ BACKEND — Phân Tích & Mở Rộng

### 3.1 Điểm tốt

- ✅ Storage abstraction (R2/local) — `src/lib/blob-storage.ts` (150 dòng)
- ✅ SSE streaming cho AI generation — `src/app/api/generate-stream/route.ts` (132 dòng)
- ✅ Concurrency control — `src/lib/concurrency.ts` (`parallelLimit` = 3)
- ✅ Coons patch perspective warp — `src/lib/perspective.ts` (7.6KB)
- ✅ AI provider abstraction (interface pattern) — `src/lib/ai-provider.ts`
- ✅ Graceful JSON parsing fallback — `src/app/api/generate-seo/route.ts` (regex fallback)
- ✅ Auto-cleanup old files — `src/instrumentation.ts`
- ✅ Path traversal protection — `src/lib/resolve-path.ts`
- ✅ Chrome extension CORS support — `src/app/api/upload/route.ts`

### 3.2 Vấn đề Backend

#### B1. 🟠 Không có input validation library

**Files**: Tất cả API routes

Tất cả routes tự validate input bằng `if/else`:

```typescript
// Ví dụ: generate-stream/route.ts
if (sources.length > 10) {
    return NextResponse.json({ error: 'Too many source images (max 10)' }, { status: 400 });
}
```

Thiếu nhất quán, dễ bỏ sót validation. Không validate types sâu (VD: `mask.x` có phải number không?)

**Đề xuất**: Dùng Zod validation:

```typescript
// lib/validators.ts — NEW
import { z } from 'zod';

export const generateStreamSchema = z.object({
  sourceImageUrl: z.string().url().optional(),
  sourceImageUrls: z.array(z.object({
    id: z.string(),
    url: z.string(),
  })).max(10).optional(),
  styles: z.array(z.object({
    id: z.string(),
    name: z.string(),
    prompt: z.string(),
  })).max(20).optional(),
  additionalPrompt: z.string().max(2000).optional(),
  imageSize: z.enum(['512px', '1K', '2K', '4K']).optional(),
  aspectRatio: z.enum(['1:1', '1:4', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9']).optional(),
});

export const workspaceSchema = z.object({
  name: z.string().min(1).max(100),
  id: z.string().max(50).optional(),
});

export const loginSchema = z.object({
  username: z.string().min(1).max(50),
  password: z.string().min(6).max(128),
});

export const mockupSchema = z.object({
  mockupImagePath: z.string(),
  designImagePath: z.string(),
  mask: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number().positive(),
    height: z.number().positive(),
    rotation: z.number().optional(),
  }),
});

// Usage: const body = generateStreamSchema.parse(await request.json());
```

---

#### B2. 🟠 `remove-bg/route.ts` quá lớn — 304 dòng

**File**: `src/app/api/remove-bg/route.ts` (304 dòng)

Chứa cả:
- Color science (RGB → Lab, deltaE) — 50+ dòng
- Gradient generation — 30+ dòng
- 5 background modes (transparent, solid, blur, gradient, custom) — 200+ dòng

**Đề xuất tách:**

```
src/lib/
├── color-science.ts    ← rgbToLab, deltaE, hexToRgb
├── gradient.ts         ← createGradientBuffer, GRADIENT_MAP
└── background.ts       ← bgRemoval logic (gọi @imgly + composite)
```

---

#### B3. 🟠 Duplicate perspective logic giữa server/client

**Files**: `src/lib/perspective.ts` (7.6KB), `src/lib/perspective-client.ts` (4.9KB)

Hai file cùng implement Coons patch perspective warp. Logic gần như giống nhau, chỉ khác kiểu context (`SKRSContext2D` vs `CanvasRenderingContext2D`).

**Đề xuất**: Tạo shared generic module, parametrize kiểu context/image:

```typescript
// lib/perspective-core.ts
export function renderCoonsPatch<TCtx, TImg>(
  ctx: TCtx,
  img: TImg,
  corners: [Point, Point, Point, Point],
  drawImage: (ctx: TCtx, img: TImg, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number) => void,
  // ...
) { /* shared logic */ }
```

---

#### B4. 🟡 AI provider chỉ hỗ trợ Gemini — không fallback

**File**: `src/lib/ai-provider.ts` (220 dòng)

Chỉ có `GeminiProvider` và `MockProvider`. Nếu Gemini API down, toàn bộ AI features ngừng hoạt động.

**Đề xuất**: Multi-provider chain với fallback:

```typescript
class AIProviderChain implements AIProvider {
  constructor(private providers: AIProvider[]) {}

  async generateVariation(src: string, prompt: string, opts?: AIImageOptions) {
    for (const provider of this.providers) {
      try {
        return await provider.generateVariation(src, prompt, opts);
      } catch (err) {
        console.warn('Provider failed, trying next:', err);
      }
    }
    throw new Error('All AI providers failed');
  }
}

// Providers to add: OpenAI DALL-E 3, Stability AI, Replicate
```

---

#### B5. 🟡 Không có job queue cho heavy tasks

**Files**: `src/app/api/remove-bg/route.ts`, `src/app/api/generate-video/route.ts`

Background removal và video generation chạy inline trong request handler. Request timeout (thường 30s) có thể kill task giữa chừng.

**Đề xuất**: Job queue architecture:

| Backend | Pros | Cons | Phù hợp |
|---------|------|------|---------|
| **BullMQ + Redis** | Battle-tested, retries, priorities | Cần Redis | Nếu scale |
| **Inngest** | Serverless, no infra | Vendor lock-in | Nếu Vercel |
| **DB-based queue** | Zero deps, dùng Prisma | Manual polling | MVP |

---

#### B6. 🟡 Template storage = flat JSON files trên filesystem

**File**: `src/app/api/templates/route.ts` (dòng 7-14)

```typescript
const TEMPLATES_DIR = path.join(process.cwd(), '.design-tool-data', 'user-templates');

function userFilePath(username: string, workspaceId: string): string {
    const safe = username.replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeWs = workspaceId.replace(/[^a-zA-Z0-9_-]/g, '_') || 'default';
    return path.join(TEMPLATES_DIR, `${safe}_ws_${safeWs}.json`);
}
```

Templates lưu dạng file JSON trên filesystem. Không query được, không backup tự động.

**Đề xuất**: Migrate sang DB (Asset model type = TEMPLATE).

---

#### B7. 🟡 `generate/route.ts` là duplicate yếu hơn của `generate-stream/route.ts`

**Files**: `src/app/api/generate/route.ts` (96 dòng), `src/app/api/generate-stream/route.ts` (132 dòng)

Route `generate/` xử lý tuần tự và trả kết quả dưới dạng JSON. Route `generate-stream/` xử lý song song (SSE) và có nhiều tính năng hơn (multi-source, concurrency limit).

**Đề xuất**: Deprecated `generate/` route, chỉ giữ `generate-stream/`.

---

### 3.3 Đề xuất mở rộng Backend

| Tính năng | Mô tả | Priority |
|-----------|--------|----------|
| **Zod validation** | Type-safe input validation cho tất cả routes | 🟠 |
| **Job queue** | Async processing cho BG removal, video gen | 🟡 |
| **Multi-provider AI** | Gemini + OpenAI + Stability fallback | 🟡 |
| **Shared perspective module** | DRY server/client perspective code | 🟡 |
| **PostgreSQL** | Chuyển từ SQLite cho multi-user | 🟡 |
| **Redis rate limiting** | Distributed rate limiting | 🟡 |
| **Webhook/callback** | Notify client khi async jobs complete | 🟡 |

---

## 4. 🎨 FRONTEND — Phân Tích & Mở Rộng

### 4.1 Điểm tốt

- ✅ Zustand persist + workspace isolation
- ✅ SSE streaming UX (progressive load)
- ✅ Mask editing with undo/redo (`useMaskHistory` hook)
- ✅ Quad interaction hooks (`useQuadCanvas`, `useQuadInteraction`)
- ✅ Toast notification system
- ✅ Chrome extension integration
- ✅ Etsy SEO validation (140 char title, 13 tags × 20 char)
- ✅ Concurrency control UI (`parallelLimit` = 3)

### 4.2 Vấn đề Frontend

#### F1. 🔴 God Component — MockupEditor.tsx = 46KB / ~983 dòng

**File**: `src/components/MockupEditor.tsx`

Chứa:
- Canvas drawing logic (150+ dòng)
- Quad interaction state management
- AI generation logic
- Batch mockup generation
- Design overlay handling (drag, resize, crop)
- Blend mode controls

**Đề xuất phân rã:**

```
MockupEditor.tsx (983 LOC) →
├── MockupCanvas.tsx         ← canvas rendering + quad drawing
│   ├── useCanvasDrawing()   ← NEW hook
│   ├── useQuadCanvas()      ← exists ✅
│   └── useQuadInteraction() ← exists ✅
├── MockupToolbar.tsx        ← blend, fit, mask controls
│   ├── BlendControls
│   ├── FitModeSelector
│   └── MaskTypeToggle
├── MockupBatchPanel.tsx     ← batch generate UI + progress
│   ├── BatchGenerateButton
│   └── BatchProgress
└── MockupDesignOverlay.tsx  ← overlay drag/resize/crop
    ├── useDragResize()      ← NEW hook
    └── ImageCropper          ← exists ✅
```

---

#### F2. 🟠 Workflow store = 373 dòng monolith

**File**: `src/store/workflow-store.ts` (373 dòng)

Store chứa quá nhiều concerns: UI state + persistence + server sync + migration logic.

**Đề xuất**: Tách thành:
- `workflow-store.ts` — pure UI state + actions
- `workflow-sync.ts` — server sync logic (debounce, ensure workspace)
- `workflow-migration.ts` — one-time migration logic

---

#### F3. 🟠 Hydration risk — `localStorage` trong Zustand persist key

**Files**: `src/store/workspace-store.ts` (dòng 4-7), `src/store/workflow-store.ts` (dòng 5-8)

```typescript
function getActiveUser(): string {
    if (typeof window === 'undefined') return 'default';
    return localStorage.getItem('design-tool-user') || 'default';
}
```

`localStorage` chỉ có trên client. Persist key được tính lúc module load → server render có state khác client → hydration mismatch.

**Hiện trạng**: Đã workaround với `typeof window` check, nhưng vẫn có edge cases.

---

#### F4. 🟠 `window.location.reload()` khi switch workspace

**File**: `src/store/workspace-store.ts` (dòng 77)

```typescript
switchWorkspace: (id) => {
    if (id === get().activeId) return;
    set({ activeId: id });
    window.location.reload(); // ← Hard reload
},
```

Full page reload khi chuyển workspace → mất UX, flash of content.

**Đề xuất**: Invalidate Zustand stores + re-fetch data thay vì reload.

---

#### F5. 🟡 Inline styles rải rác trong nhiều components

Hàng chục inline styles:

```typescript
style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}
style={{ marginTop: 6, fontSize: '0.78rem' }}
```

**Đề xuất**: Chuyển sang CSS classes trong stylesheets đã có sẵn.

---

#### F6. 🟡 VariationGrid.tsx = 27KB — cũng khá lớn

**File**: `src/components/VariationGrid.tsx` (27KB)

Tương tự MockupEditor, component này cũng chứa nhiều logic nên tách.

---

#### F7. 🟡 Không có Error Boundary

Không có React Error Boundary nào trong app. Nếu component crash → white screen.

**Đề xuất**: Thêm Error Boundary wrapper cho các component chính.

---

#### F8. 🟡 Không có loading skeleton / Suspense pattern

Loading states dùng simple spinner/text. Không có skeleton UI cho better perceived performance.

---

### 4.3 Đề xuất mở rộng Page Architecture

Hiện tại app là **single-page** wizard (upload → variations → mockup → video). Để mở rộng:

```
src/app/
├── (auth)/
│   ├── login/page.tsx
│   └── register/page.tsx
├── (dashboard)/
│   ├── layout.tsx           ← sidebar + header
│   ├── page.tsx              ← dashboard overview
│   ├── assets/page.tsx       ← asset library/gallery
│   ├── templates/page.tsx    ← template management
│   └── settings/page.tsx     ← user settings, API keys
├── (editor)/
│   └── editor/
│       └── [workspaceId]/page.tsx  ← main editor (current wizard)
```

---

## 5. 🧪 TEST COVERAGE — Phân Tích

### 5.1 Hiện trạng (8 test files)

| Test File | Covers | Type |
|-----------|--------|------|
| `auth.test.ts` | `checkCredentials` — 6 cases | Unit |
| `ai-provider.test.ts` | MockProvider, GeminiProvider | Unit |
| `prompt-engine.test.ts` | `buildVariationPrompt`, `buildMockupPrompt` | Unit |
| `drag-drop.test.ts` | Drag & drop logic | Unit |
| `api/auth-login.test.ts` | Login API route | Integration |
| `api/auth-register.test.ts` | Register API route | Integration |
| `api/mockup-ai-generate.test.ts` | AI generate route | Integration |

### 5.2 Gaps cần bổ sung

| Area | Missing Tests | Priority |
|------|--------------|----------|
| **Workspace API** | CRUD operations, IDOR edge cases | 🔴 |
| **blob-storage** | R2 upload/download, fallback logic | 🟠 |
| **rate-limiter** | Sliding window correctness, cleanup | 🟠 |
| **resolve-path** | Path traversal attack vectors | 🟠 |
| **generate-stream** | SSE parsing, error recovery | 🟠 |
| **remove-bg** | Color key mode, composite modes | 🟡 |
| **E2E** | Full workflow: upload → generate → mockup → export | 🟡 |

---

## 6. 🗺️ ROADMAP MỞ RỘNG — 4 Phase

### Phase 1: Security Hardening (1-2 ngày)

- [ ] Fix S1 (IDOR): Thêm userId filter vào workspace POST upsert
- [ ] Fix S2 (AUTH_SECRET): Loại bỏ fallback sang AUTH_PASSWORD
- [ ] Fix S3 (Plain-text): Buộc AUTH_PASSWORD phải bcrypt hash
- [ ] Add S7: Rate limiting cho AI generation routes
- [ ] Fix S5: Thống nhất `requireAuth()` cho workspace routes
- [ ] Add audit logging (ít nhất login + delete events)

### Phase 2: Database Expansion (3-5 ngày)

- [ ] Thêm Asset model — track uploads, variations, mockups
- [ ] Thêm AuditLog model — track user actions
- [ ] Thêm ApiKey model — cho Chrome extension auth
- [ ] Migrate `Workspace.data` JSON → Asset records
- [ ] Thêm Zod validation cho tất cả API routes
- [ ] Chuyển template storage từ filesystem → DB

### Phase 3: Backend Architecture (1-2 tuần)

- [ ] Job queue cho heavy processing (BG removal, video gen)
- [ ] Multi-provider AI with fallback (Gemini + OpenAI + Stability)
- [ ] Shared perspective module (DRY server/client)
- [ ] PostgreSQL migration
- [ ] Redis-based rate limiting
- [ ] Deprecated `generate/` route, chỉ giữ `generate-stream/`

### Phase 4: Frontend Scale (1-2 tuần)

- [ ] Phân rã MockupEditor → 4+ components
- [ ] Phân rã VariationGrid → sub-components
- [ ] Tách workflow-store → store + sync + migration
- [ ] Dashboard layout + asset library page
- [ ] Error boundaries + Suspense patterns
- [ ] Workspace switching without full reload
- [ ] CSS modules thay thế inline styles
- [ ] E2E test coverage (Playwright)

---

## 📊 Tóm tắt Ưu Tiên

| # | Vấn đề | Mức độ | Domain | Hành động |
|---|--------|--------|--------|-----------|
| S1 | IDOR trong workspace POST | 🔴 | Security | Filter upsert theo userId |
| S2 | AUTH_SECRET fallback → password | 🔴 | Security | Yêu cầu AUTH_SECRET riêng |
| S3 | Plain-text password comparison | 🔴 | Security | Buộc bcrypt hash |
| D1 | Chỉ 2 DB models | 🔴 | Database | Thêm Asset, AuditLog, ApiKey |
| D2 | Workflow data = JSON blob | 🔴 | Database | Migrate sang Asset records |
| F1 | MockupEditor God Component | 🔴 | Frontend | Phân rã 4+ components |
| S7 | Không rate limit AI routes | 🟠 | Security | Thêm checkRateLimit |
| S5 | Workspace routes auth pattern | 🟠 | Security | Thống nhất requireAuth |
| B1 | Không có validation library | 🟠 | Backend | Thêm Zod |
| B2 | remove-bg route quá lớn | 🟠 | Backend | Tách lib modules |
| B3 | Duplicate perspective logic | 🟠 | Backend | Shared module |
| F2 | Workflow store monolith | 🟠 | Frontend | Tách concerns |
| F3 | Hydration risk | 🟠 | Frontend | Fix localStorage pattern |
| F4 | Hard reload on workspace switch | 🟠 | Frontend | State invalidation |
| D4-D6 | SQLite, soft delete, password marker | 🟡 | Database | Phase 2-3 |
| S6,S8-S11 | Rate limiter, CSRF, CSP | 🟡 | Security | Phase 2-3 |
| B4-B7 | AI fallback, job queue, templates | 🟡 | Backend | Phase 3 |
| F5-F8 | Inline styles, error boundary | 🟡 | Frontend | Phase 4 |

---

> **Đánh giá tổng thể**: Codebase có nền tảng tốt (JWT auth, storage abstraction, AI provider pattern, SSE streaming, Coons patch rendering). Điểm yếu chính là **database quá đơn giản** (2 models + JSON blob cho toàn bộ workflow data), **vài lỗ hổng security critical** cần fix ngay (IDOR, AUTH_SECRET, plain-text password), và **frontend God Component** (MockupEditor 46KB) cần phân rã. Với 4 phases trên, app có thể scale lên multi-user production level.
