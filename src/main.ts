import { moment } from 'obsidian';
import { Notice, Plugin, addIcon, TFile } from 'obsidian';
import { SettingsTab } from '~/settingsTab';
import { get, Unsubscriber } from 'svelte/store';
import { initialise, settingsStore, syncSessionStore } from '~/store';
import SyncHypothesis from '~/sync/syncHypothesis';
import annotationsIcon from '~/assets/icon.svg';
import FileManager from '~/fileManager';
import { frontMatterDocType } from '~/utils/frontmatter';

addIcon('annotationsIcon', annotationsIcon);

export default class HypothesisPlugin extends Plugin {
    private syncHypothesis!: SyncHypothesis;
    private timeoutIDAutoSync: number;

    async onload(): Promise<void> {
        await initialise(this);

        const fileManager = new FileManager(
            this.app.vault,
            this.app.metadataCache
        );
        this.syncHypothesis = new SyncHypothesis(fileManager);

        this.addRibbonIcon('annotationsIcon', 'Sync your web annotations', () =>
            this.startSync(true)
        );

        this.addCommand({
            id: 'hypothesis-sync',
            name: 'Sync highlights',
            callback: () => this.startSync(true),
        });

        this.addCommand({
            id: 'hypothesis-sync-active-file',
            name: 'Resync annotations in the active file.',
            callback: () => {
                const activeFile = this.app.workspace.getActiveFile();
                const frontmatter =
                    this.app.metadataCache.getFileCache(
                        activeFile
                    )?.frontmatter;
                if (frontmatter?.['doc_type'] !== frontMatterDocType) {
                    new Notice(
                        'Open a file generated by the Annotations extension first'
                    );
                    return;
                }

                this.startSync(true, frontmatter['url']);
            },
        });

        this.addSettingTab(
            new SettingsTab(this.app, this, this.syncHypothesis)
        );

        this.registerEvent(
            this.app.workspace.on('file-open', this.handleFileOpen.bind(this))
        );

        if (get(settingsStore).syncOnBoot) {
            await this.startSync(false);
        }
        if (get(settingsStore).autoSyncInterval) {
            this.startAutoSync();
        }
    }

    async onunload(): Promise<void> {
        this.clearAutoSync();
    }

    async startSync(manuallyTriggered = false, uri?: string): Promise<void> {
        if (!get(settingsStore).isConnected) {
            new Notice(
                'Please configure your Hypothesis API token in the plugin settings first.'
            );
            return;
        }

        await this.syncHypothesis.startSync(uri);

        const lastSyncStats = get(syncSessionStore).lastSyncStats;
        if (manuallyTriggered && lastSyncStats) {
            new Notice(
                `Downloaded ${lastSyncStats?.downloadedAnnotations} new annotations and uploaded ${lastSyncStats?.uploadedAnnotations} changes.`
            );
        }
    }

    async startAutoSync(minutes?: number): Promise<void> {
        const minutesToSync =
            minutes ?? Number(get(settingsStore).autoSyncInterval);
        if (minutesToSync > 0) {
            this.timeoutIDAutoSync = window.setTimeout(() => {
                this.startSync(false);
                this.startAutoSync();
            }, minutesToSync * 60000);
        }
    }

    async clearAutoSync(): Promise<void> {
        if (this.timeoutIDAutoSync) {
            window.clearTimeout(this.timeoutIDAutoSync);
            this.timeoutIDAutoSync = undefined;
        }
    }

    // Show sync state in the status bar, when opening annotation files
    private statusBarItem: HTMLElement = null;
    private statusBarUnsubscribeUpdates: Unsubscriber = null;
    private statusBarIntervalId = null;
    async handleFileOpen(file: TFile | null) {
        // Remove previous status bar state
        if (this.statusBarItem) {
            this.statusBarItem.detach();
        }
        if (this.statusBarUnsubscribeUpdates) {
            try {
                this.statusBarUnsubscribeUpdates();
            } catch {}
        }
        if (this.statusBarIntervalId) {
            window.clearInterval(this.statusBarIntervalId);
        }

        if (!file) {
            // closed a file
            return;
        }
        const frontmatter =
            this.app.metadataCache.getFileCache(file)?.frontmatter;
        if (frontmatter?.['doc_type'] !== frontMatterDocType) {
            return;
        }

        this.statusBarItem = this.addStatusBarItem();
        const updateStatusBar = () => {
            const state = get(syncSessionStore);
            let text = null;
            if (state.status === 'idle') {
                const lastSync = moment(state.syncEndDate).fromNow();
                text = `Last sync ${lastSync}`;
            } else if (state.status === 'sync') {
                text = `Synchronizing annotations...`;
            } else if (state.status === 'error') {
                text = `Error synchronizing annotations`;
            } else if (state.status === 'logged-out') {
                text = `Not logged in`;
            }

            this.statusBarItem.empty();
            this.statusBarItem.createEl('span', {
                text,
            });
        };

        // Update both when the state changes, and every minute (to update relative time)
        this.statusBarUnsubscribeUpdates =
            syncSessionStore.subscribe(updateStatusBar);
        this.statusBarIntervalId = window.setInterval(
            updateStatusBar,
            60 * 1000
        );
        this.registerInterval(this.statusBarIntervalId);
    }
}
