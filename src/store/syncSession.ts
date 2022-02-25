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
    newHighlightsCount: number;
    updatedArticlesCount: number;
    updatedHighlightsCount: number;
};

const createSyncSessionStore = () => {
    const initialState: SyncSession = {
        status: null,
        errorMessage: null,
        lastSyncStats: null,
    };
    const store = writable(initialState);

    const trackStartSync = () => {
        console.info(`Annotations sync start.`);
        store.update((state) => {
            state.status = 'sync';
            state.errorMessage = undefined;
            return state;
        });
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
                    remoteAnnotationsCount:
                        (state.globalSyncStats?.remoteAnnotationsCount || 0) +
                        1,
                    remoteArticlesCount:
                        (state.globalSyncStats?.remoteArticlesCount || 0) + 1,
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
