import { App, Modal, Vault } from 'obsidian';
import ResyncDelFileModalContent from './resyncDelFileModal.svelte';
import { settingsStore } from '~/store';
import { get } from 'svelte/store';
import SyncHypothesis from '~/sync/syncHypothesis';
import FileManager from '~/fileManager';
import type { SyncedFile } from '~/models';

export default class ResyncDelFileModal extends Modal {
    private syncHypothesis!: SyncHypothesis;
    public waitForClose: Promise<void>;
    private resolvePromise: () => void;
    private modalContent: ResyncDelFileModalContent;
    vault: Vault;

    constructor(app: App) {
        super(app);
        this.vault = app.vault;

        this.waitForClose = new Promise(
            (resolve) => (this.resolvePromise = resolve)
        );

        this.open();

    }

    async onOpen() {
        super.onOpen()
        const fileManager = new FileManager(this.vault, this.app.metadataCache);
		this.syncHypothesis = new SyncHypothesis(fileManager);
        const deletedFiles = await this.retrieveDeletedFiles(this.vault);

        this.titleEl.innerText = "Hypothes.is: Resync deleted file(s)";

        this.modalContent = new ResyncDelFileModalContent({
            target: this.contentEl,
            props: {
                deletedFiles: deletedFiles,
                onSubmit: async (value: { selected }) => {
                    if((!!value.selected) && value.selected.length > 0 ){
                        this.startResync(value.selected)
                    } else{
                        console.log('No files selected')
                    }
                    this.close();
                },
            },
        });

    }

    onClose() {
        super.onClose();
        this.modalContent.$destroy();
        this.resolvePromise();
    }

    async retrieveDeletedFiles(vault:Vault) {

        const folder = get(settingsStore).highlightsFolder;
        const syncedFiles = get(settingsStore).syncedFiles;

        const existingFiles = await vault.adapter.list(`/${folder}`);

        // eslint-disable-next-line
        const r = /[^\/]*$/;

        existingFiles.files.forEach(function(value, index) {
            this[index] = (value.match(r))[0]
        }, existingFiles.files);

        return syncedFiles.filter((file) =>  !existingFiles.files.includes(file.filename));
    }

    async startResync(selectedFiles: SyncedFile[]): Promise<void> {
        selectedFiles.forEach(async selected => {
		console.log(`Start resync deleted file - ${selected.filename}`)
		await this.syncHypothesis.startSync(selected.uri);
        })
	}
}

