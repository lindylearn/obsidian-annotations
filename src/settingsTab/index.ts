import templateInstructions from './templateInstructions.html';
import datetimeInstructions from './datetimeInstructions.html';
import type HypothesisPlugin from '~/main';
import pickBy from 'lodash.pickby';
import { App, PluginSettingTab, Setting } from 'obsidian';
import { get } from 'svelte/store';
import { Renderer } from '~/renderer';
import { settingsStore } from '~/store';
import { TokenManager } from '~/store/tokenManager';
import ApiTokenModal from '~/modals/apiTokenModal';
import SyncGroup from '~/sync/syncGroup';
import ManageGroupsModal from '~/modals/manageGroupsModal';
import defaultMetadataTemplate from '~/assets/defaultMetadataTemplate.njk';
import defaultAnnotationsTemplate from '~/assets/defaultAnnotationsTemplate.njk';

const { moment } = window;

export class SettingsTab extends PluginSettingTab {
    public app: App;
    private plugin: HypothesisPlugin;
    private renderer: Renderer;
    private tokenManager: TokenManager;
    private syncGroup: SyncGroup;

    constructor(app: App, plugin: HypothesisPlugin) {
        super(app, plugin);
        this.app = app;
        this.plugin = plugin;
        this.renderer = new Renderer();
        this.tokenManager = new TokenManager();
        this.syncGroup = new SyncGroup();
    }

    public async display(): Promise<void> {
        const { containerEl } = this;
        containerEl.empty();

        this.insertGroupHeading('Synchronization');
        if (get(settingsStore).isConnected) {
            this.disconnect();
        } else {
            this.connect();
        }
        this.autoSyncInterval();
        this.syncOnBoot();
        this.bidirectionalSync();

        this.insertGroupHeading('Files');
        this.highlightsFolder();
        this.folderPath();

        this.insertGroupHeading('Formatting');
        this.dateFormat();
        this.metadataTemplate();
        this.annotationTemplate();

        this.insertGroupHeading('Other');
        this.manageGroups();
        this.resetSyncHistory();
        this.about();
    }

    private insertGroupHeading(name: string) {
        new Setting(this.containerEl).setName(name).setHeading();
    }

    private disconnect(): void {
        const syncMessage = get(settingsStore).lastSyncDate
            ? `Last sync ${moment(get(settingsStore).lastSyncDate).fromNow()}`
            : 'Sync has never run';

        const descFragment = document.createRange().createContextualFragment(`
      ${get(settingsStore).history.totalArticles} article(s) & ${
            get(settingsStore).history.totalHighlights
        } highlight(s) synced<br/>
      ${syncMessage}
    `);

        new Setting(this.containerEl)
            .setName(
                `Connected to Hypothes.is as ${
                    get(settingsStore).user.match(/([^:]+)@/)[1]
                }`
            )
            .setDesc(descFragment)
            .addButton((button) => {
                return button
                    .setButtonText('Disconnect')
                    .setCta()
                    .onClick(async () => {
                        button
                            .removeCta()
                            .setButtonText('Removing API token...')
                            .setDisabled(true);

                        settingsStore.actions.disconnect();

                        this.display(); // rerender
                    });
            });
    }

    private connect(): void {
        new Setting(this.containerEl)
            .setName('Connect to Hypothes.is')
            .addButton((button) => {
                return button
                    .setButtonText('Connect')
                    .setCta()
                    .onClick(async () => {
                        button
                            .removeCta()
                            .setButtonText('Removing API token...')
                            .setDisabled(true);

                        const tokenModal = new ApiTokenModal(
                            this.app,
                            this.tokenManager
                        );
                        await tokenModal.waitForClose;

                        this.display(); // rerender
                    });
            });
    }

    private autoSyncInterval(): void {
        new Setting(this.containerEl)
            .setName('Periodic sync interval')
            .setDesc(
                'Fetch new annotations every X minutes (recommended). Specify 0 to only fetch annotations manually when you click the sidebar icon.'
            )
            .addText((text) => {
                text.setPlaceholder(String(0))
                    .setValue(String(get(settingsStore).autoSyncInterval))
                    .onChange((value) => {
                        const minutes = Number(value);

                        settingsStore.update({ autoSyncInterval: minutes });

                        if (minutes > 0) {
                            this.plugin.clearAutoSync();
                            this.plugin.startAutoSync(minutes);
                        } else {
                            this.plugin.clearAutoSync();
                        }
                    });
            });
    }

    private highlightsFolder(): void {
        new Setting(this.containerEl)
            .setName('Annotations folder')
            .setDesc(
                document
                    .createRange()
                    .createContextualFragment(
                        'Vault folder to create the article files in. Files can be freely renamed and moved around afterwards if the <a href="https://help.obsidian.md/Advanced+topics/YAML+front+matter">frontmatter</a> remains intact.'
                    )
            )
            .addDropdown((dropdown) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const files = (this.app.vault.adapter as any).files;
                const folders = pickBy(files, (val) => {
                    return val.type === 'folder';
                });

                Object.keys(folders).forEach((val) => {
                    dropdown.addOption(val, val);
                });
                return dropdown
                    .setValue(get(settingsStore).highlightsFolder)
                    .onChange((highlightsFolder) =>
                        settingsStore.update({ highlightsFolder })
                    );
            });
    }

    private metadataTemplate(): void {
        const descFragment = document
            .createRange()
            .createContextualFragment(templateInstructions);

        new Setting(this.containerEl)
            .setName('Metadata template')
            .setDesc(descFragment)
            .addTextArea((text) => {
                text.inputEl.style.width = '500px';
                text.inputEl.style.maxWidth = '50vw';
                text.inputEl.style.height = '200px';
                text.inputEl.style.fontSize = '0.8em';
                text.inputEl.style.fontFamily = 'var(--font-monospace)';
                text.inputEl.placeholder = defaultMetadataTemplate;
                text.setValue(
                    get(settingsStore).customMetadataTemplate
                ).onChange(async (customMetadataTemplate) => {
                    const isValid = this.renderer.validate(
                        customMetadataTemplate
                    );
                    text.inputEl.style.border = isValid ? '' : '1px solid red';

                    if (isValid) {
                        settingsStore.update({ customMetadataTemplate });
                    }
                });
                return text;
            });
    }

    private annotationTemplate(): void {
        new Setting(this.containerEl)
            .setName('Annotation template')
            .setDesc(
                document
                    .createRange()
                    .createContextualFragment(
                        'In order to parse edits from your files, the annotation template is not currently customizable. <br />Please <a href="https://github.com/lindylearn/obsidian-annotations">raise an issue on GitHub</a> with the customization options you want!'
                    )
            );
    }

    private folderPath(): void {
        new Setting(this.containerEl)
            .setName('Use domain folders')
            .setDesc(
                document
                    .createRange()
                    .createContextualFragment(
                        'Group generated files into folders based on the domain of the annotated URL. Install the <a href="https://github.com/ozntel/file-explorer-note-count">File Explorer Count</a> plugin to get a better overview.'
                    )
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(get(settingsStore).useDomainFolders)
                    .onChange((useDomainFolders) =>
                        settingsStore.update({ useDomainFolders })
                    )
            );
    }

    private syncOnBoot(): void {
        new Setting(this.containerEl)
            .setName('Sync on startup')
            .setDesc(
                'Automatically sync new annotations when opening Obsidian (recommended).'
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(get(settingsStore).syncOnBoot)
                    .onChange((syncOnBoot) =>
                        settingsStore.update({ syncOnBoot })
                    )
            );
    }

    private bidirectionalSync(): void {
        new Setting(this.containerEl)
            .setName('Bi-directional sync')
            .setDesc(
                'Whether to update your Hypothes.is annotations when you modify your local annotation files. This allows you to revisit the webpage with all your notes in place.'
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(get(settingsStore).enableBidirectionalSync)
                    .onChange((enableBidirectionalSync) =>
                        settingsStore.update({ enableBidirectionalSync })
                    )
            );
    }

    private resetSyncHistory(): void {
        new Setting(this.containerEl)
            .setName('Reset sync')
            .setDesc(
                "Reset the synchronization state to regenerate files for all your annotations. Existing local files with matching frontmatter will be reused. Local annotation edits will be uploaded if you enabled the 'Bi-directional sync' above."
            )
            .addButton((button) => {
                return button
                    .setButtonText('Reset')
                    .setDisabled(!get(settingsStore).isConnected)
                    .setCta()
                    .onClick(() => {
                        settingsStore.actions.resetSyncHistory();
                        this.display(); // rerender
                    });
            });
    }

    private dateFormat(): void {
        const descFragment = document
            .createRange()
            .createContextualFragment(datetimeInstructions);

        new Setting(this.containerEl)
            .setName('Date format')
            .setDesc(descFragment)
            .addText((text) => {
                text.setPlaceholder('YYYY-MM-DD')
                    .setValue(get(settingsStore).dateTimeFormat)
                    .onChange((dateTimeFormat) =>
                        settingsStore.update({ dateTimeFormat })
                    );
            });
    }

    private async manageGroups(): Promise<void> {
        const descFragment = document
            .createRange()
            .createContextualFragment(
                `Select the Hypothes.is groups to sync annotations with.`
            );

        new Setting(this.containerEl)
            .setName('Groups')
            .setDesc(descFragment)
            .addExtraButton((button) => {
                return button
                    .setIcon('switch')
                    .setTooltip('Reset group selections')
                    .setDisabled(!get(settingsStore).isConnected)
                    .onClick(async () => {
                        settingsStore.update({ groups: [] });
                        await this.syncGroup.startSync();
                        this.display(); // rerender
                    });
            })
            .addButton((button) => {
                return button
                    .setButtonText('Manage')
                    .setCta()
                    .setDisabled(!get(settingsStore).isConnected)
                    .onClick(async () => {
                        const manageGroupsModal = new ManageGroupsModal(
                            this.app
                        );
                        await manageGroupsModal.waitForClose;
                        this.display(); // rerender
                    });
            });
    }

    private about(): void {
        new Setting(this.containerEl)
            .setName('About')
            .setDesc(
                "Star the project on GitHub if it's useful for you! Please also post bugs and improvement ideas."
            )
            .addButton((bt) => {
                bt.buttonEl.outerHTML = `<iframe src="https://ghbtns.com/github-btn.html?user=lindylearn&repo=obsidian-hypothesis-plugin&type=star&size=large" frameborder="0" scrolling="0" width="170" height="30" title="GitHub"></iframe>`;
            });
    }
}
