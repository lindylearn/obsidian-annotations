import type { Group } from '~/models';
import { writable } from 'svelte/store';
import type HypothesisPlugin from '~/main';

type SyncHistory = {
    totalArticles: number;
    totalHighlights: number;
};

type Settings = {
    token: string;
    user: string;
    highlightsFolder: string;
    lastSyncDate?: Date;
    isConnected: boolean;
    customMetadataTemplate: string;
    syncOnBoot: boolean;
    enableBidirectionalSync: boolean;
    history: SyncHistory;
    dateTimeFormat: string;
    autoSyncInterval: number;
    groups: Group[];
    useDomainFolders: boolean;
};

const DEFAULT_SETTINGS: Settings = {
    token: '',
    user: '',
    highlightsFolder: '/articles',
    isConnected: false,
    customMetadataTemplate: null,
    syncOnBoot: true,
    enableBidirectionalSync: true,
    autoSyncInterval: 5,
    dateTimeFormat: 'YYYY-MM-DD',
    history: {
        totalArticles: 0,
        totalHighlights: 0,
    },
    groups: [],
    useDomainFolders: true,
};

const createSettingsStore = () => {
    const store = writable(DEFAULT_SETTINGS as Settings);

    let _plugin!: HypothesisPlugin;

    // Load settings data from disk into store
    const initialise = async (plugin: HypothesisPlugin): Promise<void> => {
        const data = Object.assign(
            {},
            DEFAULT_SETTINGS,
            await plugin.loadData()
        );

        const settings: Settings = {
            ...data,
            lastSyncDate: data.lastSyncDate
                ? new Date(data.lastSyncDate)
                : undefined,
        };

        store.set(settings);

        _plugin = plugin;
    };

    // Listen to any change to store, and write to disk
    store.subscribe(async (settings) => {
        if (_plugin) {
            // Transform settings fields for serialization
            const data = {
                ...settings,
                lastSyncDate: settings.lastSyncDate
                    ? settings.lastSyncDate.toJSON()
                    : undefined,
            };

            await _plugin.saveData(data);
        }
    });

    const connect = (token: string, userid: string) => {
        store.update((state) => {
            state.isConnected = true;
            state.token = token;
            state.user = userid;
            return state;
        });
    };

    const disconnect = () => {
        store.update((state) => {
            state.isConnected = false;
            state.user = undefined;
            state.token = undefined;
            state.groups = [];
            return state;
        });
    };

    const resetSyncHistory = () => {
        store.update((state) => {
            state.history.totalArticles = 0;
            state.history.totalHighlights = 0;
            state.lastSyncDate = undefined;
            return state;
        });
    };

    const setSyncDateToNow = () => {
        store.update((state) => {
            state.lastSyncDate = new Date();
            return state;
        });
    };

    const incrementHistory = (delta: SyncHistory) => {
        store.update((state) => {
            state.history.totalArticles += delta.totalArticles;
            state.history.totalHighlights += delta.totalHighlights;
            return state;
        });
    };

    const update = (settingsOverride: Partial<Settings>) => {
        store.update((state) => ({ ...state, ...settingsOverride }));
    };

    return {
        subscribe: store.subscribe,
        initialise,
        update,
        actions: {
            resetSyncHistory,
            setSyncDateToNow,
            connect,
            disconnect,
            incrementHistory,
        },
    };
};

export const settingsStore = createSettingsStore();
