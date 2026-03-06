import type { MockupTemplate } from '@/types';

export function getActiveUser(): string {
    if (typeof window === 'undefined') return 'default';
    return localStorage.getItem('design-tool-user') || 'default';
}

export function getActiveWorkspaceId(): string {
    if (typeof window === 'undefined') return 'default';
    try {
        const raw = localStorage.getItem('design-tool-workspace');
        if (raw) {
            const parsed = JSON.parse(raw);
            return parsed?.state?.activeId || 'default';
        }
    } catch { /* ignore */ }
    return 'default';
}

/** Sync current templates to server (scoped by workspace) */
export function syncTemplatesToServer(templates: MockupTemplate[]) {
    const wsId = getActiveWorkspaceId();
    fetch(`/api/templates?workspace=${encodeURIComponent(wsId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(templates),
    }).catch(() => {});
}

/** Debounced sync of workflow data to server via workspace `data` field */
let syncTimer: ReturnType<typeof setTimeout> | null = null;

// We accept a getter function to avoid circular imports
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function syncWorkflowToServer(getState: () => any) {
    if (typeof window === 'undefined') return;
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
        const wsId = getActiveWorkspaceId();
        if (!wsId) return;
        const state = getState();
        const data = {
            currentStep: state.currentStep,
            sourceDesigns: state.sourceDesigns.map(({ file: _file, ...rest }: { file?: unknown; [k: string]: unknown }) => rest),
            variations: state.variations,
            // Templates synced separately via /api/templates (not duplicated here)
        };
        ensureWorkspaceExists(wsId).then(() => {
            fetch(`/api/workspaces/${encodeURIComponent(wsId)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data }),
            }).catch(() => {});
        });
    }, 2000);
}

/** Ensure a workspace exists in DB (creates it if missing, e.g. "default") */
const ensuredWorkspaces = new Set<string>();
export async function ensureWorkspaceExists(wsId: string) {
    if (ensuredWorkspaces.has(wsId)) return;
    try {
        const res = await fetch(`/api/workspaces/${encodeURIComponent(wsId)}`);
        if (res.ok) {
            ensuredWorkspaces.add(wsId);
            return;
        }
        const createRes = await fetch('/api/workspaces', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: wsId, name: wsId === 'default' ? 'Default' : wsId }),
        });
        if (createRes.ok) ensuredWorkspaces.add(wsId);
    } catch { /* ignore */ }
}

/** Load workflow data from server when localStorage is empty */
export async function loadWorkflowFromServer(
    wsId: string,
    setState: (state: Record<string, unknown>) => void,
) {
    if (typeof window === 'undefined') return;
    if (!wsId) return;
    try {
        const res = await fetch(`/api/workspaces/${encodeURIComponent(wsId)}`);
        console.log('[loadWorkflow] fetch status:', res.status, 'wsId:', wsId);
        if (!res.ok) return;
        const workspace = await res.json();
        if (!workspace.data) { console.log('[loadWorkflow] no data field'); return; }
        const data = typeof workspace.data === 'string' ? JSON.parse(workspace.data) : workspace.data;
        console.log('[loadWorkflow] parsed data — designs:', data.sourceDesigns?.length, 'vars:', data.variations?.length, 'templates:', data.mockupTemplates?.length);
        if (data && (data.sourceDesigns?.length || data.variations?.length)) {
            setState({
                currentStep: data.currentStep || 'upload',
                sourceDesigns: data.sourceDesigns || [],
                variations: data.variations || [],
                // Templates loaded separately from /api/templates
            });
            console.log('[loadWorkflow] setState done');
        }
    } catch (err) { console.warn('[loadWorkflow] error:', err); }
}
