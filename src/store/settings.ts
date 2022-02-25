import type { Group } from '~/models';
import { writable } from 'svelte/store';
import type HypothesisPlugin from '~/main';

type Settings = {
    // persisted sync state
    isConnected: boolean;
    lastSyncDate?: Date;
    globalSyncStats?: GlobalSyncStats;

    // user auth
    token: string;
    user: string;
    groups: Group[];

    // sync settings
    highlightsFolder: string;
    syncOnBoot: boolean;
    autoSyncInterval: number;
    enableBidirectionalSync: boolean;

    // formatting
    useDomainFolders: boolean;
    customMetadataTemplate: string;
    dateTimeFormat: string;
};

type GlobalSyncStats = {
    remoteArticlesCount: number;
    remoteAnnotationsCount: number;
};

export const DEFAULT_SETTINGS: Settings = {
    isConnected: false,
    lastSyncDate: null,
    globalSyncStats: null,

    token: '',
    user: '',
    groups: [],

    highlightsFolder: 'articles',
    syncOnBoot: true,
    autoSyncInterval: 15,
    enableBidirectionalSync: true,

    useDomainFolders: true,
    customMetadataTemplate: null,
    dateTimeFormat: 'YYYY-MM-DD',
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

    const updateFn = store.update;
    const update = (settingsOverride: Partial<Settings>) => {
        store.update((state) => ({ ...state, ...settingsOverride }));
    };

    return {
        subscribe: store.subscribe,
        initialise,
        updateFn,
        update,
        actions: {
            connect,
            disconnect,
        },
    };
};

export const settingsStore = createSettingsStore();
