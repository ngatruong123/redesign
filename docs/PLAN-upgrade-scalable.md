# PLAN: Nâng Cấp Design Tool — Dễ Quản Lý & Mở Rộng

**Ngày tạo**: 2026-03-05  
**Project Type**: WEB (Next.js 16 + React 19 + PostgreSQL)  
**Agent**: `project-planner` → `backend-specialist` + `frontend-specialist` + `security-auditor`

---

## 📊 Tổng Quan Hiện Trạng

| Metric | Hiện tại | Đánh giá |
|--------|----------|----------|
| **DB Models** | 5 (User, Workspace, Asset, AuditLog, ApiKey) | 🟢 Đã mở rộng từ 2 → 5 |
| **DB Engine** | PostgreSQL (via `@prisma/adapter-pg`) | 🟢 Đã migrate từ SQLite |
| **API Routes** | 17 route groups | 🟡 Nhiều, chưa tổ chức |
| **Components** | 15+ (God Component 32KB) | 🔴 Cần phân rã |
| **Store** | 5 files (đã tách sync/migration) | 🟢 Cải thiện tốt |
| **Lib modules** | 19 modules | 🟡 Có duplicate logic |
| **Tests** | 8 unit + 4 API test files | 🟡 Thiếu E2E & coverage |
| **Auth** | JWT (jose HS256) + bcrypt | 🟢 Nhưng có IDOR bug |
| **Storage** | R2 / Local filesystem | 🟢 Abstraction tốt |

### Những gì đã làm tốt
- ✅ JWT auth với `jose` (HS256, 30-day expiry)
- ✅ Storage abstraction (R2/local) — `blob-storage.ts`
- ✅ AI provider interface pattern — `ai-provider.ts`
- ✅ SSE streaming cho AI generation
- ✅ Coons patch perspective warp — `perspective-core.ts`
- ✅ Store đã tách: `workflow-store.ts` + `workflow-sync.ts` + `workflow-migration.ts`
- ✅ Zod validators — `validators.ts` (đã tạo)
- ✅ Error Boundary — `ErrorBoundary.tsx` (đã tạo)
- ✅ Schema mở rộng 5 models (User, Workspace, Asset, AuditLog, ApiKey)

---

## 🎯 Mục Tiêu Nâng Cấp

1. **Dễ quản lý**: Code modular, clear separation of concerns, consistent patterns
2. **Dễ mở rộng**: Plugin-ready architecture, proper API layer, scalable DB
3. **An toàn hơn**: Fix IDOR, rate limit AI, RBAC enforcement
4. **Dễ test**: Tăng coverage, thêm E2E, CI-ready

---

## Success Criteria

| # | Tiêu chí | Cách đo |
|---|----------|---------|
| 1 | Không có file > 500 LOC | `wc -l` check |
| 2 | 100% API routes dùng Zod validation | Grep `z.object` trong mỗi route |
| 3 | IDOR fix verified | Unit test confirm ownership check |
| 4 | Rate limit trên AI routes | Test 429 response |
| 5 | MockupEditor < 300 LOC | Component phân rã thành 4+ sub-components |
| 6 | E2E test chạy được | Playwright basic flow |
| 7 | `npm run build` pass | Zero errors |
| 8 | Dashboard layout mới | Multi-page routing hoạt động |

---

## 📋 Task Breakdown — 5 Phases

---

### Phase 1: 🔒 Security Hardening (1-2 ngày)

> Agent: `security-auditor`  
> Priority: P0 — Fix trước khi làm gì khác

#### Task 1.1: Fix IDOR trong Workspace POST
- **File**: `src/app/api/workspaces/route.ts`
- **INPUT**: POST request với `id` trùng workspace user khác
- **OUTPUT**: Response trả 403 thay vì thông tin workspace user khác
- **VERIFY**: Unit test xác nhận chỉ owner mới access được

```diff
- const workspace = await prisma.workspace.upsert({
-     where: { id: clientId },
+ const existing = await prisma.workspace.findFirst({
+     where: { id: clientId, userId: user.id },
+ });
+ if (existing) return NextResponse.json(existing);
+ const workspace = await prisma.workspace.create({
+     data: { id: clientId, name, userId: user.id },
+ });
```

#### Task 1.2: Rate limit AI generation routes
- **Files**: `src/app/api/generate-stream/route.ts`, `src/app/api/generate/route.ts`, `src/app/api/generate-seo/route.ts`, `src/app/api/generate-video/route.ts`
- **INPUT**: Import `checkRateLimit` từ `@/lib/rate-limiter`
- **OUTPUT**: 429 response khi vượt 10 req/min/user
- **VERIFY**: Gửi 11 requests liên tiếp → request thứ 11 trả 429

#### Task 1.3: Thống nhất auth pattern cho workspace routes
- **Files**: `src/app/api/workspaces/route.ts`, `src/app/api/workspaces/[id]/route.ts`
- **INPUT**: Sử dụng `getAuthUsername()` riêng lẻ
- **OUTPUT**: Dùng shared `requireAuth()` helper nhất quán
- **VERIFY**: Grep confirm tất cả routes gọi `requireAuth()`

#### Task 1.4: Fix rate limiter setInterval leak
- **File**: `src/lib/rate-limiter.ts`
- **INPUT**: Module-level `setInterval` chạy mãi
- **OUTPUT**: Lazy cleanup (check expired khi `checkRateLimit` gọi)
- **VERIFY**: Unit test confirm entries bị clear sau TTL

---

### Phase 2: 🏗️ Backend Restructuring (3-5 ngày)

> Agent: `backend-specialist`  
> Priority: P1 — Foundation cho mở rộng

#### Task 2.1: API Route Middleware Pattern
- **Mục tiêu**: Tạo wrapper function bắt buộc auth + validation cho mọi route
- **Files**: `src/lib/api-handler.ts` (MODIFY)
- **INPUT**: Mỗi route tự handle auth + validate + error
- **OUTPUT**: Shared `createApiHandler(schema, handler)` wrapper

```typescript
// Proposed pattern
export function createApiHandler<T>(options: {
  schema?: ZodSchema<T>;
  rateLimit?: { max: number; windowMs: number };
  requireAuth?: boolean;
}) {
  return (handler: (req: Request, ctx: { user: User; body: T }) => Promise<Response>) => {
    return async (req: Request) => {
      // 1. Auth check
      // 2. Rate limit check
      // 3. Body validation
      // 4. Call handler
      // 5. Error handling
    };
  };
}
```

- **VERIFY**: Refactor 2-3 routes dùng pattern mới, build pass

#### Task 2.2: Tách `remove-bg/route.ts` (304 LOC → 3 modules)
- **Files**:
  - `src/lib/color-science.ts` ← đã tạo ✅
  - `src/lib/gradient.ts` ← đã tạo ✅
  - `src/app/api/remove-bg/route.ts` (MODIFY — import từ lib, giảm xuống ~100 LOC)
- **INPUT**: Route 304 dòng chứa cả color science + gradient code
- **OUTPUT**: Route chỉ chứa handler logic, gọi lib modules
- **VERIFY**: BG removal vẫn hoạt động đúng, `wc -l` < 150

#### Task 2.3: Xoá duplicate `generate/route.ts`
- **Files**: `src/app/api/generate/route.ts` (DELETE hoặc redirect)
- **INPUT**: Route duplicate yếu hơn của `generate-stream/`
- **OUTPUT**: Clients redirect sang `generate-stream/`, route cũ deprecated
- **VERIFY**: Frontend không gọi `/api/generate` nữa

#### Task 2.4: Shared perspective module (DRY)
- **Files**: `src/lib/perspective-core.ts` (đã tạo ✅)
- **Kiểm tra**: `perspective.ts` và `perspective-client.ts` đã dùng `perspective-core.ts` chưa?
- **INPUT**: Check import, nếu chưa thì refactor
- **OUTPUT**: Server/client cùng dùng shared core
- **VERIFY**: Mockup generation + client-side preview vẫn render đúng

#### Task 2.5: Activate Zod validation cho TẤT CẢ routes
- **Files**: `src/lib/validators.ts` (đã tạo ✅) + tất cả 17 route groups
- **INPUT**: Routes tự validate bằng if/else
- **OUTPUT**: Mỗi route import schema từ `validators.ts` và dùng `.parse()`
- **VERIFY**: Gửi invalid payload → nhận Zod error message chuẩn (400)

#### Task 2.6: Migrate template storage → Database
- **Files**: `src/app/api/templates/route.ts` (MODIFY)
- **INPUT**: Templates lưu dạng flat JSON files trên filesystem
- **OUTPUT**: Templates lưu trong Asset model (`type: TEMPLATE`)
- **VERIFY**: Template CRUD hoạt động, old data đọc được

---

### Phase 3: 🎨 Frontend Restructuring (1-2 tuần)

> Agent: `frontend-specialist`  
> Priority: P2 — UX & maintainability

#### Task 3.1: Phân rã MockupEditor (32KB → 4+ components)

**Proposed structure:**

```
src/components/mockup/
├── MockupEditor.tsx        ← orchestrator (~200 LOC)
├── MockupCanvas.tsx         ← canvas rendering + quad
├── MockupToolbar.tsx        ← blend, fit, mask controls
├── MockupBatchPanel.tsx     ← batch generate + progress
├── MockupDesignOverlay.tsx  ← overlay drag/resize/crop
├── MockupSEOPanel.tsx       ← SEO generation (đã tách ✅ → SEOPanel.tsx)
└── hooks/
    ├── useCanvasDrawing.ts  ← NEW
    └── useDragResize.ts     ← NEW
```

- **INPUT**: `MockupEditor.tsx` — 32KB monolith
- **OUTPUT**: 4+ components, mỗi cái < 300 LOC
- **VERIFY**: Mockup workflow hoạt động đúng, `wc -l` check

#### Task 3.2: Phân rã VariationGrid (17KB → sub-components)

```
src/components/variation/  (đã có thư mục ✅)
├── VariationGrid.tsx       ← orchestrator
├── VariationCard.tsx        ← NEW: single variation card
├── VariationActions.tsx     ← NEW: select/download/remove toolbar
└── VariationGenerateForm.tsx ← NEW: prompt + style form
```

- **INPUT**: `VariationGrid.tsx` — 17KB
- **OUTPUT**: 3-4 sub-components
- **VERIFY**: Variation workflow hoạt động

#### Task 3.3: Multi-page Dashboard Layout

```
src/app/
├── (auth)/
│   ├── login/page.tsx       ← exists ✅
│   └── register/page.tsx    ← exists ✅
├── (dashboard)/
│   ├── layout.tsx           ← NEW: sidebar + header
│   ├── page.tsx             ← NEW: dashboard overview
│   ├── assets/page.tsx      ← NEW: asset library (Gallery view)
│   ├── templates/page.tsx   ← NEW: template management
│   └── settings/page.tsx    ← NEW: user settings, API keys
├── (editor)/
│   └── editor/
│       └── [workspaceId]/
│           └── page.tsx     ← MOVE: current wizard (page.tsx)
```

- **INPUT**: Single-page wizard app
- **OUTPUT**: Multi-page app với dashboard + editor + settings
- **VERIFY**: Navigation giữa pages hoạt động, editor vẫn đúng

#### Task 3.4: Fix workspace switching (hard reload → state invalidation)
- **File**: `src/store/workspace-store.ts`
- **INPUT**: `window.location.reload()` khi switch workspace
- **OUTPUT**: Invalidate Zustand stores + re-fetch thay vì reload
- **VERIFY**: Switch workspace không flash trắng

#### Task 3.5: CSS cleanup — Inline styles → Stylesheets
- **Files**: Tất cả components có inline `style={{ }}`
- **INPUT**: Inline styles rải rác
- **OUTPUT**: CSS classes trong existing stylesheets
- **VERIFY**: Visual regression check (so sánh trước/sau)

---

### Phase 4: 🧪 Testing & Quality (1 tuần)

> Agent: `backend-specialist` + `frontend-specialist`  
> Priority: P3

#### Task 4.1: Unit tests cho critical modules

| Module | Test file | Cases |
|--------|-----------|-------|
| Workspace API | `api/workspace-crud.test.ts` | CRUD + IDOR edge cases |
| blob-storage | `blob-storage.test.ts` | R2 upload, local fallback |
| rate-limiter | `rate-limiter.test.ts` ← exists ✅ | Thêm cleanup, sliding window |
| resolve-path | `resolve-path.test.ts` ← exists ✅ | Thêm attack vectors |

- **VERIFY**: `npm run test:run` — all green

#### Task 4.2: E2E test với Playwright

```
tests/e2e/
├── full-workflow.spec.ts    ← upload → generate → mockup → export
├── auth.spec.ts             ← login, register, logout
└── workspace.spec.ts        ← create, switch, delete
```

- **VERIFY**: `npx playwright test` — all pass

#### Task 4.3: CI pipeline (GitHub Actions)

```yaml
# .github/workflows/ci.yml
- npm run lint
- npx tsc --noEmit
- npm run test:run
- npm run build
```

- **VERIFY**: Push → CI green

---

### Phase 5: 🚀 Advanced Features (Ongoing)

> These are optional enhancements after the core restructuring

#### Task 5.1: Multi-provider AI fallback
- Gemini → OpenAI DALL-E → Stability AI chain
- Only triggers when primary provider fails

#### Task 5.2: Job queue cho heavy processing
- BullMQ + Redis cho BG removal, video generation
- SSE status updates cho job progress

#### Task 5.3: RBAC enforcement
- Admin-only routes: cleanup, user management
- Role field already in schema ✅

#### Task 5.4: Dashboard analytics
- Asset usage stats
- Generation history
- Storage usage per workspace

---

## 🔍 Verification Plan

### Automated Tests (cho mỗi Phase)

```bash
# Phase 1-2: Unit + API tests
npm run test:run

# Phase 3: Build verification
npm run build

# Phase 4: Full suite
npm run lint && npx tsc --noEmit && npm run test:run && npm run build
```

### Manual Verification

| Step | Action | Expected |
|------|--------|----------|
| 1 | Login → Upload design | Upload thành công, hiển thị preview |
| 2 | Generate variations | SSE stream hiển thị progress, ảnh xuất hiện |
| 3 | Open MockupEditor | Canvas render đúng, quad interaction hoạt động |
| 4 | Generate mockup | Perspective warp đúng, download được |
| 5 | Switch workspace | Không flash trắng, data khác nhau |
| 6 | Navigate Dashboard | Các pages load chính xác |

### Security Checks

```bash
# Script kiểm tra bảo mật tự động
python .agent/skills/vulnerability-scanner/scripts/security_scan.py .
```

---

## 📊 Effort Estimate

| Phase | Effort | Priority |
|-------|--------|----------|
| Phase 1: Security | 1-2 ngày | 🔴 P0 |
| Phase 2: Backend | 3-5 ngày | 🟠 P1 |
| Phase 3: Frontend | 5-10 ngày | 🟡 P2 |
| Phase 4: Testing | 3-5 ngày | 🟡 P3 |
| Phase 5: Advanced | Ongoing | 🟢 P4 |
| **Tổng** | **~3-4 tuần** | — |

---

## 📁 File Impact Summary

### MODIFY (Existing files)
- `src/app/api/workspaces/route.ts` — Fix IDOR
- `src/app/api/workspaces/[id]/route.ts` — requireAuth pattern
- `src/app/api/generate-stream/route.ts` — Rate limit
- `src/app/api/generate-seo/route.ts` — Rate limit
- `src/app/api/generate-video/route.ts` — Rate limit
- `src/app/api/remove-bg/route.ts` — Tách lib imports
- `src/app/api/templates/route.ts` — DB migration
- `src/lib/api-handler.ts` — Wrapper function
- `src/lib/rate-limiter.ts` — Fix setInterval
- `src/store/workspace-store.ts` — Fix reload
- `src/components/MockupEditor.tsx` — Phân rã
- `src/components/VariationGrid.tsx` — Phân rã

### NEW (Files sẽ tạo mới)
- `src/components/mockup/MockupCanvas.tsx`
- `src/components/mockup/MockupToolbar.tsx`
- `src/components/mockup/MockupBatchPanel.tsx`
- `src/components/mockup/MockupDesignOverlay.tsx`
- `src/components/mockup/hooks/useCanvasDrawing.ts`
- `src/components/mockup/hooks/useDragResize.ts`
- `src/components/variation/VariationCard.tsx`
- `src/components/variation/VariationActions.tsx`
- `src/components/variation/VariationGenerateForm.tsx`
- `src/app/(dashboard)/layout.tsx`
- `src/app/(dashboard)/page.tsx`
- `src/app/(dashboard)/assets/page.tsx`
- `src/app/(dashboard)/templates/page.tsx`
- `src/app/(dashboard)/settings/page.tsx`
- `src/app/(editor)/editor/[workspaceId]/page.tsx`
- `tests/e2e/full-workflow.spec.ts`
- `tests/e2e/auth.spec.ts`
- `.github/workflows/ci.yml`

### DELETE (Files sẽ xoá)
- `src/app/api/generate/route.ts` (deprecated → redirect)

---

## Phase X: Final Verification Checklist

- [ ] `npm run lint` — no errors
- [ ] `npx tsc --noEmit` — no type errors
- [ ] `npm run test:run` — all pass
- [ ] `npm run build` — success
- [ ] Security scan — no critical
- [ ] No file > 500 LOC
- [ ] All routes use Zod validation
- [ ] IDOR fix confirmed by test
- [ ] Rate limit on AI routes confirmed
- [ ] Dashboard navigation works
- [ ] Workspace switch without reload
