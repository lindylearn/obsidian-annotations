import type {  Vault } from 'obsidian';
import { get } from 'svelte/store';
import { Renderer } from '~/renderer';
import { settingsStore } from '~/store';
import { sanitizeTitle } from '~/utils/sanitizeTitle';
import type { Article, LocalArticle } from '~/models';
import { parseFilePageNote ,parseFileAnnotations } from '~/bidirectional-sync/parseNote';

const articleFolderPath = (article: Article): string => {
  const settings = get(settingsStore);
  if (settings.useDomainFolders) {
    // "metadata.author" is equal to the article domain at the moment
    return `${settings.highlightsFolder}/${article.metadata.author}`;
  }

  return settings.highlightsFolder;
};

export default class FileManager {
  private vault: Vault;
  private renderer: Renderer;

  constructor(vault: Vault) {
    this.vault = vault;
    this.renderer = new Renderer();
  }

  public async createFolder(folderPath: string): Promise<void> {
    await this.vault.createFolder(folderPath);
  }

  public async createFile(filePath: string, content: string): Promise<void> {
    await this.vault.create(filePath, content);
  }

  public async createOrUpdate(article: Article): Promise<boolean> {
    const folderPath = articleFolderPath(article);
    const fileName = `${sanitizeTitle(article.metadata.title)}.md`;
    const filePath = `${folderPath}/${fileName}`
    let createdNewArticle = false;

    if (!(await this.vault.adapter.exists(folderPath))) {
      console.debug(`Folder ${folderPath} not found. Will be created`);

      await this.createFolder(folderPath);
    }

    if (!(await this.vault.adapter.exists(filePath))) {
      console.debug(`Document ${filePath} not found. Will be created`);

      const content = this.renderer.render(article);
      await this.createFile(filePath, content);
      createdNewArticle = true;
      await settingsStore.actions.addSyncedFile({filename: fileName, uri: encodeURIComponent(article.metadata.url)});

    } else {
      console.debug(`Document ${article.metadata.title} found. Reconciling local & remote annotations`);

      const content = this.renderer.render(article, false);
      await this.vault.adapter.write(filePath, content);
    }

    return createdNewArticle;
  }

  public async parseLocalArticle(article: Article): Promise<LocalArticle> {
    const folderPath = articleFolderPath(article);
    const fileName = `${sanitizeTitle(article.metadata.title)}.md`;
    const filePath = `${folderPath}/${fileName}`

    if (!(await this.vault.adapter.exists(filePath))) {
      return null;
    }

    const localUpdateTimeMillis = (await this.vault.adapter.stat(filePath)).mtime;
    const existingContent = await this.vault.adapter.read(filePath);

    const existingPageNote = parseFilePageNote(existingContent);
    const existingAnnotations = parseFileAnnotations(existingContent);

    return {
      id: article.id,
      page_note: existingPageNote,
      highlights: existingAnnotations,
      updated_millis: localUpdateTimeMillis,
    }
  }

}

