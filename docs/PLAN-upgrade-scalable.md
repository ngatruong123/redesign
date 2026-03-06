# PLAN: Nâng Cấp Design Tool — Dễ Quản Lý & Mở Rộng

**Ngày tạo**: 2026-03-05
**Cập nhật**: 2026-03-06
**Project Type**: WEB (Next.js 16 + React 19 + PostgreSQL)

---

## Tổng Quan Hiện Trạng

| Metric | Hiện tại | Đánh giá |
|--------|----------|----------|
| **DB Models** | 5 (User, Workspace, Asset, AuditLog, ApiKey) | ✅ Đã mở rộng |
| **DB Engine** | PostgreSQL (via `@prisma/adapter-pg`) | ✅ Đã migrate từ SQLite |
| **API Routes** | 17 route groups | ⚠️ Cần tổ chức, chưa dùng Zod hết |
| **MockupEditor** | 874 LOC, đã tách 7 sub-components + 4 hooks | ⚠️ Vẫn lớn, cần phân rã thêm |
| **VariationGrid** | 383 LOC | ⚠️ Cần phân rã |
| **Store** | 5 files (đã tách sync/migration) | ✅ |
| **Lib modules** | 19 modules | ✅ perspective-core đã shared |
| **Tests** | 8 unit + 4 API test files | ⚠️ Thiếu E2E |
| **Auth** | JWT (jose HS256) + bcrypt | ✅ IDOR đã fix |
| **Storage** | R2 / Local filesystem | ✅ Abstraction tốt |

### Đã hoàn thành
- ✅ IDOR fix — workspace route dùng `findFirst({ userId: user.id })`
- ✅ Rate limiter refactored — lazy cleanup, không còn setInterval leak
- ✅ Rate limit trên `generate-stream`, `generate`, `generate-seo`
- ✅ Perspective core shared — cả server/client dùng `perspective-core.ts`
- ✅ `color-science.ts` + `gradient.ts` đã tách từ remove-bg (229 LOC, giảm từ 304)
- ✅ `generate/route.ts` đã deprecated (có header `X-Deprecated`)
- ✅ MockupEditor đã tách: 7 components (`TemplatePanel`, `VariationsPanel`, `BlendControlsPanel`, `GeneratedMockupsGrid`, `BatchPreviewModal`, `DesignOverlay`, `MockupAIPanel`) + 4 hooks (`useCanvasDrawing`, `useQuadInteraction`, `useMaskHistory`, `useQuadCanvas`)
- ✅ `api-handler.ts` tồn tại với `withAuth` wrapper
- ✅ `validators.ts` tồn tại, dùng ở workspace + auth routes
- ✅ Deploy pipeline — `.github/workflows/deploy.yml`

---

## Mục Tiêu

1. **Dễ quản lý**: Tiếp tục phân rã components lớn, consistent API patterns
2. **Dễ mở rộng**: Dashboard multi-page, template DB storage
3. **An toàn hơn**: Rate limit generate-video, Zod validation toàn bộ routes
4. **Dễ test**: CI pipeline, E2E tests

---

## Task Breakdown — 4 Phases

---

### Phase 1: Security & API Cleanup (1-2 ngày) — P0

#### Task 1.1: ~~Fix IDOR trong Workspace POST~~ ✅ DONE

#### Task 1.2: Rate limit `generate-video` route
- **File**: `src/app/api/generate-video/route.ts`
- **Status**: ❌ Chưa có rate limit (các route khác đã có)
- **OUTPUT**: Thêm `checkRateLimit('ai:' + ip, 10, 60_000)`

#### Task 1.3: ~~Fix rate limiter setInterval leak~~ ✅ DONE

#### Task 1.4: Xoá `generate/route.ts` deprecated
- **File**: `src/app/api/generate/route.ts`
- **Status**: Đã deprecated nhưng vẫn tồn tại
- **OUTPUT**: Xoá file, verify frontend chỉ gọi `/api/generate-stream`

#### Task 1.5: Zod validation cho tất cả routes
- **Files**: `src/lib/validators.ts` + tất cả route groups
- **Status**: Chỉ workspace + auth routes dùng Zod
- **OUTPUT**: Tất cả routes import schema từ `validators.ts` và dùng `.parse()`

---

### Phase 2: Backend Restructuring (2-3 ngày) — P1

#### Task 2.1: Nâng cấp `createApiHandler` wrapper
- **File**: `src/lib/api-handler.ts`
- **Status**: Đã có `withAuth`, cần mở rộng thêm validation + rate limit
- **OUTPUT**: `createApiHandler({ schema, rateLimit, requireAuth })` wrapper

#### Task 2.2: Giảm `remove-bg/route.ts` xuống < 150 LOC
- **Status**: 229 LOC (đã giảm từ 304, nhưng còn nhiều)
- **OUTPUT**: Tách thêm logic xử lý ảnh ra lib modules

#### Task 2.3: Migrate template storage → Database
- **File**: `src/app/api/templates/route.ts`
- **OUTPUT**: Templates lưu trong Asset model (`type: TEMPLATE`)

---

### Phase 3: Frontend Restructuring (1-2 tuần) — P2

#### Task 3.1: Tiếp tục phân rã MockupEditor (874 LOC → < 400 LOC)

Đã tách được 7 components + 4 hooks. Cần tách thêm:

```
src/components/mockup/
├── MockupEditor.tsx        ← orchestrator (target: ~300 LOC)
├── MockupCanvas.tsx         ← NEW: canvas + wrapper + drag/drop handlers
├── TemplatePanel.tsx        ← exists ✅
├── VariationsPanel.tsx      ← exists ✅
├── BlendControlsPanel.tsx   ← exists ✅
├── GeneratedMockupsGrid.tsx ← exists ✅
├── BatchPreviewModal.tsx    ← exists ✅
├── DesignOverlay.tsx        ← exists ✅
├── MockupAIPanel.tsx        ← exists ✅
src/hooks/
├── useCanvasDrawing.ts      ← exists ✅
├── useQuadInteraction.ts    ← exists ✅
├── useMaskHistory.ts        ← exists ✅
├── useQuadCanvas.ts         ← exists ✅
```

- **Cần làm**: Tách phần canvas rendering, drag/drop, batch generate logic ra `MockupCanvas.tsx`

#### Task 3.2: Phân rã VariationGrid (383 LOC → sub-components)

```
src/components/variation/
├── VariationGrid.tsx           ← orchestrator (~150 LOC)
├── VariationCard.tsx            ← NEW: single card
├── VariationGenerateForm.tsx    ← NEW: prompt + style form
```

#### Task 3.3: Multi-page Dashboard Layout

```
src/app/
├── (auth)/
│   ├── login/page.tsx       ← exists ✅
│   └── register/page.tsx    ← exists ✅
├── (dashboard)/
│   ├── layout.tsx           ← NEW: sidebar + header
│   ├── page.tsx             ← NEW: dashboard overview
│   ├── assets/page.tsx      ← NEW: asset library
│   ├── templates/page.tsx   ← NEW: template management
│   └── settings/page.tsx    ← NEW: user settings, API keys
├── (editor)/
│   └── editor/[workspaceId]/page.tsx  ← MOVE current wizard
```

#### Task 3.4: Fix workspace switching
- **File**: `src/store/workspace-store.ts`
- **Status**: Vẫn dùng `window.location.reload()` (line 76, 93)
- **OUTPUT**: Invalidate Zustand stores + re-fetch thay vì reload

#### Task 3.5: CSS cleanup — Inline styles → Stylesheets
- Nhiều components dùng inline `style={{}}`
- **OUTPUT**: Chuyển sang CSS classes

---

### Phase 4: Testing & CI (3-5 ngày) — P3

#### Task 4.1: CI pipeline
- **File**: `.github/workflows/ci.yml` — ❌ chưa tồn tại
- **OUTPUT**: lint + typecheck + test + build on PR

#### Task 4.2: E2E test với Playwright
```
tests/e2e/
├── full-workflow.spec.ts    ← upload → generate → mockup → export
├── auth.spec.ts             ← login, register, logout
└── workspace.spec.ts        ← create, switch, delete
```

#### Task 4.3: Unit tests bổ sung
| Module | Test file | Status |
|--------|-----------|--------|
| rate-limiter | `rate-limiter.test.ts` | ✅ Exists |
| resolve-path | `resolve-path.test.ts` | ✅ Exists |
| Workspace API | `workspace-crud.test.ts` | ❌ Cần tạo |
| blob-storage | `blob-storage.test.ts` | ❌ Cần tạo |

---

### Phase 5: Advanced Features (Ongoing) — P4

#### Task 5.1: Multi-provider AI fallback
- Gemini → OpenAI DALL-E → Stability AI chain

#### Task 5.2: Job queue cho heavy processing
- BullMQ + Redis cho BG removal, video generation

#### Task 5.3: RBAC enforcement
- Admin-only routes, role field already in schema

#### Task 5.4: Dashboard analytics
- Asset usage stats, generation history, storage usage

---

## Effort Estimate

| Phase | Effort | Priority | Status |
|-------|--------|----------|--------|
| Phase 1: Security & Cleanup | 1-2 ngày | P0 | ~80% done |
| Phase 2: Backend | 2-3 ngày | P1 | ~30% done |
| Phase 3: Frontend | 5-10 ngày | P2 | ~40% done |
| Phase 4: Testing & CI | 3-5 ngày | P3 | 0% |
| Phase 5: Advanced | Ongoing | P4 | 0% |

---

## Final Verification Checklist

- [ ] `npm run lint` — no errors
- [ ] `npx tsc --noEmit` — no type errors
- [ ] `npm run test:run` — all pass
- [ ] `npm run build` — success
- [ ] No file > 500 LOC
- [ ] All routes use Zod validation
- [ ] Rate limit on ALL AI routes (including generate-video)
- [ ] `generate/route.ts` deleted
- [ ] Dashboard navigation works
- [ ] Workspace switch without reload
- [ ] CI pipeline green on PR
