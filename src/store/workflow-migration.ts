import { getActiveUser, getActiveWorkspaceId } from './workflow-sync';

/** Migrate data from old persist key to new workspace-based key (one-time) */
export function migrateFromOldKey(): void {
    if (typeof window === 'undefined') return;
    const OLD_KEY = 'design-tool-workflow';
    const newKey = `design-tool-${getActiveUser()}-ws-${getActiveWorkspaceId()}`;
    try {
        const oldRaw = localStorage.getItem(OLD_KEY);
        if (!oldRaw) return;
        const newRaw = localStorage.getItem(newKey);
        // Only migrate if new key is empty or has no mockupTemplates
        if (!newRaw || !JSON.parse(newRaw)?.state?.mockupTemplates?.length) {
            const oldData = JSON.parse(oldRaw);
            if (oldData?.state?.mockupTemplates?.length) {
                // Merge old templates into new key
                const newData = newRaw ? JSON.parse(newRaw) : { state: {}, version: 0 };
                newData.state = { ...newData.state, mockupTemplates: oldData.state.mockupTemplates };
                localStorage.setItem(newKey, JSON.stringify(newData));
            }
        }
        // Remove old key after migration
        localStorage.removeItem(OLD_KEY);
    } catch { /* ignore */ }
}
