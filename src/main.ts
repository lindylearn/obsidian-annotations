import { moment } from 'obsidian';
import { Notice, Plugin, addIcon, TFile } from 'obsidian';
import { SettingsTab } from '~/settingsTab';
import { initialise, settingsStore } from '~/store';
import { get } from 'svelte/store';
import SyncHypothesis from '~/sync/syncHypothesis';
import annotationsIcon from '~/assets/icon.svg';
import FileManager from '~/fileManager';
import { frontMatterDocType } from '~/utils/frontmatter';

addIcon('annotationsIcon', annotationsIcon);

export default class HypothesisPlugin extends Plugin {
    private syncHypothesis!: SyncHypothesis;
    private timeoutIDAutoSync: number;

    async onload(): Promise<void> {
        console.log('loading plugin', new Date().toLocaleString());

        await initialise(this);

        const fileManager = new FileManager(
            this.app.vault,
            this.app.metadataCache
        );

        this.syncHypothesis = new SyncHypothesis(fileManager);

        this.addRibbonIcon(
            'annotationsIcon',
            'Sync your web annotations',
            () => {
                if (!get(settingsStore).isConnected) {
                    new Notice(
                        'Please configure Hypothesis API token in the plugin setting'
                    );
                } else {
                    this.startSync();
                }
            }
        );

        // this.addStatusBarItem().setText('Status Bar Text');

        this.addCommand({
            id: 'hypothesis-sync',
            name: 'Sync highlights',
            callback: () => {
                if (!get(settingsStore).isConnected) {
                    new Notice(
                        'Please configure Hypothesis API token in the plugin setting'
                    );
                } else {
                    this.startSync();
                }
            },
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

                if (!get(settingsStore).isConnected) {
                    new Notice(
                        'Please configure Hypothesis API token in the plugin setting'
                    );
                    return;
                }

                this.startSync(frontmatter['url']);
            },
        });

        this.addSettingTab(new SettingsTab(this.app, this));

        if (get(settingsStore).syncOnBoot) {
            if (get(settingsStore).isConnected) {
                await this.startSync();
            } else {
                console.info('Sync disabled. API Token not configured');
            }
        }

        if (get(settingsStore).autoSyncInterval) {
            this.startAutoSync();
        }

        let statusBarItem = null;
        this.registerEvent(
            this.app.workspace.on('file-open', (file: TFile | null) => {
                if (statusBarItem) {
                    statusBarItem.detach();
                }

                if (file) {
                    const frontmatter =
                        this.app.metadataCache.getFileCache(file).frontmatter;
                    if (frontmatter?.['doc_type'] === frontMatterDocType) {
                        // TODO update after syncs
                        statusBarItem = this.addStatusBarItem();

                        const lastSync = moment(
                            get(settingsStore).lastSyncDate
                        ).fromNow();
                        statusBarItem.createEl('span', {
                            text: `Last sync ${lastSync}`,
                        });
                    }
                }
            })
        );
    }

    async onunload(): Promise<void> {
        console.log('unloading plugin', new Date().toLocaleString());
        this.clearAutoSync();
    }

    async startSync(uri?: string): Promise<void> {
        await this.syncHypothesis.startSync(uri);
    }

    async clearAutoSync(): Promise<void> {
        if (this.timeoutIDAutoSync) {
            window.clearTimeout(this.timeoutIDAutoSync);
            this.timeoutIDAutoSync = undefined;
        }
        console.log('Clearing auto sync...');
    }

    async startAutoSync(minutes?: number): Promise<void> {
        const minutesToSync =
            minutes ?? Number(get(settingsStore).autoSyncInterval);
        if (minutesToSync > 0) {
            this.timeoutIDAutoSync = window.setTimeout(() => {
                this.startSync();
                this.startAutoSync();
            }, minutesToSync * 60000);
        }
        console.log(
            `StartAutoSync: this.timeoutIDAutoSync ${this.timeoutIDAutoSync} with ${minutesToSync} minutes`
        );
    }
}
