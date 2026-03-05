# TODO — Design Tool Improvement Plan

**Tạo từ**: CODE_REVIEW.md (2026-03-04)
**Cập nhật lần cuối**: 2026-03-04

---

## Phase 1: Security Hardening

### S1. 🔴 Fix IDOR — Workspace POST upsert không filter userId
- **File**: `src/app/api/workspaces/route.ts` (dòng 34-40)
- **Vấn đề**: Client gửi `id` trùng workspace user khác → response trả workspace info người khác
- [ ] Thêm `findFirst({ where: { id, userId } })` trước upsert
- [ ] Nếu không tìm thấy → tạo mới thay vì upsert

### S2. 🔴 AUTH_SECRET fallback → dùng password làm JWT secret
- **Files**: `src/auth.ts` (dòng 11), `src/middleware.ts` (dòng 7)
- **Vấn đề**: `AUTH_SECRET || AUTH_PASSWORD` — password bị lộ = JWT bị forge
- [ ] Yêu cầu `AUTH_SECRET` riêng biệt, throw error nếu thiếu
- [ ] Xóa fallback sang `AUTH_PASSWORD`

### S3. 🔴 Plain-text password comparison
- **File**: `src/auth.ts` (dòng 61)
- **Vấn đề**: `password === AUTH_PASS` khi AUTH_PASSWORD không phải bcrypt hash
- [ ] Buộc `AUTH_PASSWORD` phải là bcrypt hash
- [ ] Hoặc loại bỏ nhánh plain-text comparison

### S5. 🟠 Workspace routes dùng getAuthUsername() thay vì requireAuth()
- **Files**: `src/app/api/workspaces/route.ts`, `src/app/api/workspaces/[id]/route.ts`
- [ ] Thay `getAuthUsername()` bằng `requireAuth()` + `getAuthUsername()`

### S7. 🟠 Không rate limit trên AI generation routes
- **Files**: `src/app/api/generate-stream/route.ts`, `src/app/api/generate/route.ts`, `src/app/api/generate-seo/route.ts`
- [ ] Thêm `checkRateLimit()` vào đầu mỗi AI route handler
- [ ] Giới hạn: 10 requests/phút/IP

### S4. 🟠 Middleware excludes tất cả /api/ từ route matching
- **File**: `src/middleware.ts` (dòng 38)
- [ ] Xem xét thêm API route auth vào middleware
- [ ] Hoặc tạo wrapper function bắt buộc requireAuth

### S6. 🟠 Rate limiter in-memory — bypass khi multi-instance
- **File**: `src/lib/rate-limiter.ts`
- [ ] OK cho single-instance hiện tại
- [ ] Chuyển sang Redis-based nếu scale multi-instance

### S8. 🟠 Chrome extension auth bypass logic
- **File**: `src/app/api/upload/route.ts` (dòng 36-44)
- [ ] Chuyển sang API key authentication cho extension
- [ ] Không dựa vào `origin` header

### S9. 🟡 setInterval global không cleanup trong serverless
- **File**: `src/lib/rate-limiter.ts` (dòng 8-14)
- [ ] Chuyển sang lazy cleanup (check expired khi gọi `checkRateLimit`)
- [ ] Xóa `setInterval`

### S10. 🟡 Silent catch blocks
- **Files**: `src/auth.ts:49`, `src/lib/storage.ts:33`, `src/store/workspace-store.ts:66`
- [ ] Thêm `console.warn()` cho I/O errors
- [ ] Giữ im lặng cho logic fallback có chủ đích

### S11. 🟡 Không có CSRF protection
- [ ] Thêm double-submit CSRF token nếu mở rộng cho nhiều user
- [ ] Ưu tiên thấp cho internal tool

---

## Phase 2: Database Expansion

### D1. 🔴 Chỉ 2 DB models — không tracking assets
- [ ] Thêm model `Asset` (type: UPLOAD, VARIATION, MOCKUP, TEMPLATE, VIDEO)
- [ ] Thêm fields: filename, url, size, mimeType, metadata (JSON)
- [ ] Thêm parent-child relation (variation → source design)
- [ ] Index: `[userId, workspaceId, type]`

### D2. 🔴 Workflow data = JSON blob trong Workspace.data
- [ ] Migrate designs, variations, templates từ JSON blob → Asset records
- [ ] Giữ `Workspace.data` cho UI state only (step, selections)
- [ ] Script migration cho data cũ

### D3. 🟠 Không có audit/activity log
- [ ] Thêm model `AuditLog` (action, details, userId, ip, createdAt)
- [ ] Log: login, generate, delete, workspace changes
- [ ] Index: `[userId, createdAt]`

### D6. 🟠 Password marker '___env_auth___' lưu plain text
- **File**: `src/app/api/auth/login/route.ts` (dòng 29)
- [ ] Thay marker bằng cách khác (flag column hoặc null password)

### D4. 🟡 SQLite — giới hạn concurrent writes
- [ ] OK cho 1-2 user hiện tại
- [ ] Plan migration sang PostgreSQL khi cần multi-user
- [ ] Xem lộ trình migration trong CODE_REVIEW.md mục 1.4

### D5. 🟡 Không có soft delete
- [ ] Thêm `deletedAt DateTime?` cho Workspace
- [ ] Thêm `deletedAt DateTime?` cho Asset
- [ ] Filter query: `where: { deletedAt: null }`

### D-NEW. Thêm model ApiKey cho Chrome extension
- [ ] Model: id, key (unique), name, userId, expiresAt, lastUsed
- [ ] Thay thế Chrome extension ID whitelist
- [ ] UI quản lý API keys trong settings

---

## Phase 3: Backend Architecture

### B1. 🟠 Không có input validation library
- **Files**: Tất cả API routes
- [ ] Cài `zod`
- [ ] Tạo `src/lib/validators.ts` với schemas cho:
  - [ ] `generateStreamSchema`
  - [ ] `workspaceSchema`
  - [ ] `loginSchema`
  - [ ] `mockupSchema`
  - [ ] `uploadSchema`
- [ ] Apply validation vào tất cả API routes

### B2. 🟠 remove-bg/route.ts quá lớn — 304 dòng
- **File**: `src/app/api/remove-bg/route.ts`
- [ ] Tách `src/lib/color-science.ts` — rgbToLab, deltaE, hexToRgb
- [ ] Tách `src/lib/gradient.ts` — createGradientBuffer, GRADIENT_MAP
- [ ] Tách `src/lib/background.ts` — bg removal + composite logic
- [ ] Route chỉ giữ request handling + response

### B3. 🟠 Duplicate perspective logic giữa server/client
- **Files**: `src/lib/perspective.ts` (7.6KB), `src/lib/perspective-client.ts` (4.9KB)
- [ ] Tạo `src/lib/perspective-core.ts` — shared generic module
- [ ] Parametrize kiểu context/image
- [ ] Server + client import từ core

### B4. 🟡 AI provider chỉ hỗ trợ Gemini — không fallback
- **File**: `src/lib/ai-provider.ts`
- [ ] Tạo `AIProviderChain` class với fallback logic
- [ ] Thêm provider: OpenAI DALL-E 3
- [ ] Thêm provider: Stability AI
- [ ] Auto-retry với provider tiếp theo khi fail

### B5. 🟡 Không có job queue cho heavy tasks
- **Files**: `src/app/api/remove-bg/route.ts`, `src/app/api/generate-video/route.ts`
- [ ] Chọn solution: BullMQ + Redis / Inngest / DB-based queue
- [ ] Implement async processing cho:
  - [ ] Background removal
  - [ ] Video generation
  - [ ] Batch mockup generation (large batches)
- [ ] Client polling/SSE cho job status

### B6. 🟡 Template storage = flat JSON files
- **File**: `src/app/api/templates/route.ts`
- [ ] Migrate sang DB (Asset model type = TEMPLATE)
- [ ] API: list, create, update, delete templates
- [ ] Xóa filesystem-based storage

### B7. 🟡 generate/route.ts duplicate generate-stream/route.ts
- [ ] Deprecate `src/app/api/generate/route.ts`
- [ ] Migrate callers sang `generate-stream/`
- [ ] Xóa route cũ

---

## Phase 4: Frontend Structure

### F1. 🔴 God Component — MockupEditor.tsx ~1000 LOC
- **File**: `src/components/MockupEditor.tsx`
- [ ] Tách `MockupCanvas.tsx` — canvas rendering + quad drawing
  - [ ] Tạo `useCanvasDrawing()` hook
- [ ] Tách `MockupToolbar.tsx` — blend, fit, mask controls
- [ ] Tách `MockupBatchPanel.tsx` — batch generate UI + progress
- [ ] Tách `MockupAIPanel.tsx` — AI generate options
- [ ] MockupEditor chỉ giữ layout + orchestration

### F2. 🟠 Workflow store = 373 dòng monolith
- **File**: `src/store/workflow-store.ts`
- [ ] Tách `workflow-store.ts` — pure UI state + actions
- [ ] Tách `workflow-sync.ts` — server sync logic (debounce, ensure workspace)
- [ ] Tách `workflow-migration.ts` — one-time migration logic

### F3. 🟠 Hydration risk — localStorage trong Zustand persist key
- **Files**: `src/store/workspace-store.ts`, `src/store/workflow-store.ts`
- [ ] Chuyển sang `useEffect` để đọc localStorage sau hydration
- [ ] Hoặc dùng Zustand `onRehydrateStorage` callback

### F4. 🟠 window.location.reload() khi switch workspace
- **File**: `src/store/workspace-store.ts` (dòng 77)
- [ ] Invalidate Zustand stores thay vì reload
- [ ] Re-fetch workspace data
- [ ] Reset UI state (step, selections)

### F6. 🟡 VariationGrid.tsx = 27KB
- **File**: `src/components/VariationGrid.tsx`
- [ ] Tách sub-components:
  - [ ] `VariationCard` — single variation item
  - [ ] `StyleSelector` — style selection UI
  - [ ] `GenerateControls` — generate button + options

### F5. 🟡 Inline styles rải rác
- [ ] Audit tất cả inline styles trong components
- [ ] Chuyển sang CSS classes trong stylesheets hiện có
- [ ] Tạo thêm CSS utility classes nếu cần

### F7. 🟡 Không có Error Boundary
- [ ] Tạo `src/components/ErrorBoundary.tsx`
- [ ] Wrap MockupEditor, VariationGrid, UploadZone
- [ ] Hiện friendly error message + retry button

### F8. 🟡 Không có loading skeleton / Suspense
- [ ] Thêm skeleton UI cho:
  - [ ] Variation grid loading
  - [ ] Mockup generation progress
  - [ ] Template list loading
- [ ] Dùng React Suspense cho lazy-loaded components

---

## Phase 5: Testing

### T1. 🔴 Workspace API — thiếu tests
- [ ] CRUD operations
- [ ] IDOR edge cases (cross-user access)
- [ ] Invalid input handling

### T2. 🟠 blob-storage — thiếu tests
- [ ] R2 upload/download
- [ ] Local filesystem fallback
- [ ] Error handling

### T3. 🟠 rate-limiter — thiếu tests
- [ ] Sliding window correctness
- [ ] Cleanup logic
- [ ] Edge cases (boundary, overflow)

### T4. 🟠 resolve-path — thiếu tests
- [ ] Path traversal attack vectors (`../`, `..%2F`, etc.)
- [ ] Valid path cases

### T5. 🟠 generate-stream — thiếu tests
- [ ] SSE parsing
- [ ] Error recovery
- [ ] Concurrency limit

### T6. 🟡 E2E tests
- [ ] Setup Playwright
- [ ] Full workflow: upload → generate → mockup → export
- [ ] Auth flow: login → workspace → logout
- [ ] Edge cases: large files, network errors

---

## Phase 6: Page Architecture Expansion

### P1. Dashboard layout
- [ ] `src/app/(dashboard)/layout.tsx` — sidebar + header
- [ ] `src/app/(dashboard)/page.tsx` — overview

### P2. Asset library
- [ ] `src/app/(dashboard)/assets/page.tsx`
- [ ] Grid/list view tất cả uploads, variations, mockups
- [ ] Search, filter, sort

### P3. Template management
- [ ] `src/app/(dashboard)/templates/page.tsx`
- [ ] CRUD mockup templates
- [ ] Template categories/tags

### P4. User settings
- [ ] `src/app/(dashboard)/settings/page.tsx`
- [ ] API key management
- [ ] Theme/preferences
- [ ] Account settings

---

## Bugs từ session gần nhất (2026-03-04)

### BUG-1. 🟠 buildMaskFromOverlay ghi đè edgeCurves cũ
- **File**: `src/components/MockupEditor.tsx`
- **Vấn đề**: Kéo design vào template đã có mask cong → mask bị reset thành rect quad, mất curves
- [ ] Giữ `edgeCurves` từ mask cũ trong `buildMaskFromOverlay`

### BUG-2. 🟡 Mất type safety trong handleGenerateMockups
- **File**: `src/components/MockupEditor.tsx` (dòng 605)
- **Vấn đề**: `Array<Record<string, unknown>>` thay vì typed interface
- [ ] Tạo interface `BatchItem` và dùng thay `Record<string, unknown>`

### BUG-3. 🟡 Generate fail → mất ảnh mockup cũ
- **File**: `src/components/MockupEditor.tsx`
- **Vấn đề**: `setGeneratedMockups([])` trước fetch → fail = mất hết ảnh cũ
- [ ] Lưu ảnh cũ vào biến tạm, chỉ clear khi có kết quả mới
- [ ] Hoặc restore ảnh cũ trong catch block

---

## Tổng hợp theo mức độ ưu tiên

| Ưu tiên | Items | Effort |
|---------|-------|--------|
| 🔴 Critical | S1, S2, S3, D1, D2, F1, T1 | 3-5 ngày |
| 🟠 Important | S4, S5, S7, S8, D3, D6, B1, B2, B3, F2, F3, F4, T2-T5, BUG-1 | 1-2 tuần |
| 🟡 Nice-to-have | S6, S9-S11, D4, D5, B4-B7, F5-F8, T6, P1-P4, BUG-2, BUG-3 | 2-4 tuần |
