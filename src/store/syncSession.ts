import { writable } from 'svelte/store';
import { settingsStore } from '~/store';

// temporary sync session
// persistent stats are stored in the settings store
export type SyncSession = {
    status: 'logged-out' | 'idle' | 'sync' | 'error';
    errorMessage?: string;
    lastSyncStats?: SyncResult;
};

export type SyncResult = {
    newArticlesCount: number;
    newAnnotationsCount: number;
    downloadedAnnotations: number;
    uploadedAnnotations: number;
};

const createSyncSessionStore = () => {
    const initialState: SyncSession = {
        status: null,
        errorMessage: null,
        lastSyncStats: null,
    };
    const store = writable(initialState);

    const trackStartSync = (isFullReset: boolean) => {
        console.info(`Annotations sync start.`);
        store.update((state) => {
            state.status = 'sync';
            state.errorMessage = undefined;
            return state;
        });

        if (isFullReset) {
            settingsStore.update({ globalSyncStats: null });
        }
    };

    const trackErrorSync = (errorMessage: string) => {
        console.error(`Annotations sync error: ${errorMessage}`);
        store.update((state) => {
            settingsStore.update({ lastSyncDate: new Date() });

            state.status = 'error';
            state.errorMessage = errorMessage;
            state.lastSyncStats = null;
            return state;
        });
    };

    const trackCompleteSync = (result: SyncResult) => {
        console.info(`Annotations sync complete:`, result);
        store.update((state) => {
            settingsStore.updateFn((state) => {
                state.globalSyncStats = {
                    remoteArticlesCount:
                        (state.globalSyncStats?.remoteArticlesCount || 0) +
                        result.newArticlesCount,
                    remoteAnnotationsCount:
                        (state.globalSyncStats?.remoteAnnotationsCount || 0) +
                        result.newAnnotationsCount,
                };

                return state;
            });
            settingsStore.update({ lastSyncDate: new Date() });

            state.status = 'idle';
            state.errorMessage = null;
            state.lastSyncStats = result;
            return state;
        });
    };

    const reset = () => {
        store.update((state) => {
            state.status = 'idle';
            state.errorMessage = null;
            state.lastSyncStats = null;
            return state;
        });

        settingsStore.update({ globalSyncStats: null });
        settingsStore.update({ lastSyncDate: null });
    };

    return {
        subscribe: store.subscribe,
        actions: {
            trackStartSync,
            trackErrorSync,
            trackCompleteSync,
            reset,
        },
    };
};

export const syncSessionStore = createSyncSessionStore();
