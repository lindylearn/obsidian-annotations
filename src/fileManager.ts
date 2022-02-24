import type { Vault, MetadataCache, TFile } from 'obsidian';
import { get } from 'svelte/store';
import { Renderer } from '~/renderer';
import { settingsStore } from '~/store';
import { sanitizeTitle } from '~/utils/sanitizeTitle';
import type { Article, LocalArticle } from '~/models';
import { parseFilePageNote ,parseFileAnnotations } from '~/bidirectional-sync/parseNote';
import { frontMatterDocType, addFrontMatter } from "~/utils/frontmatter"

type AnnotationFile = {
  articleUrl?: string;
  file: TFile;
};

export default class FileManager {
  private vault: Vault;
  private metadataCache: MetadataCache;
  private renderer: Renderer;

  constructor(vault: Vault, metadataCache: MetadataCache) {
    this.vault = vault;
    this.metadataCache = metadataCache;
    this.renderer = new Renderer();
  }

  // Save an article as markdown file, replacing its existing file if present
  public async saveArticle(article: Article): Promise<boolean> {
    const existingFile = await this.getArticleFile(article);

    const markdownContent = this.renderer.render(article);
    const fileContent = addFrontMatter(markdownContent, article)

    if (existingFile) {
      console.debug(`Updating ${existingFile.path}`);

      await this.vault.modify(existingFile, fileContent);
      return false;
    } else {
      const newFilePath = await this.getNewArticleFilePath(article);
      console.debug(`Creating ${newFilePath}`);

      await this.vault.create(newFilePath, fileContent);
      return true;
    }
  }

  // Read a local article state from its markdown file
  public async readArticle(article: Article): Promise<LocalArticle | null> {
    const file = await this.getArticleFile(article);
    if (!file) {
      return null
    }

    const content = await this.vault.cachedRead(file);
    
    const pageNote = parseFilePageNote(content);
    const annotations = parseFileAnnotations(content);

    return {
      id: article.id,
      page_note: pageNote,
      highlights: annotations,
      updated: new Date(file.stat.mtime),
    }
  }

  private async getArticleFile(article: Article): Promise<TFile | null> {
    const files = await this.getAnnotationFiles()
    return files.find((file) => file.articleUrl === article.metadata.url)?.file || null;
  }

  // TODO cache this method for performance?
  private async getAnnotationFiles(): Promise<AnnotationFile[]> {
    const files = this.vault.getMarkdownFiles();

    return files
      .map((file) => {
        const cache = this.metadataCache.getFileCache(file);
        return { file, frontmatter: cache?.frontmatter };
      })
      .filter(({ frontmatter }) => frontmatter?.["doc_type"] === frontMatterDocType)
      .map(({ file, frontmatter }): AnnotationFile => ({file, articleUrl: frontmatter["url"]}))
  }

  private async getNewArticleFilePath(article: Article): Promise<string> {
    const settings = get(settingsStore);
    let folderPath = settings.highlightsFolder;
    if (settings.useDomainFolders) {
      // "metadata.author" is equal to the article domain at the moment
      folderPath += `/${article.metadata.author}`;
    }

    if (!(await this.vault.adapter.exists(folderPath))) {
      await this.vault.createFolder(folderPath);
    }

    const fileName = `${sanitizeTitle(article.metadata.title)}.md`;
    const filePath = `${folderPath}/${fileName}`  
    return filePath;
  }

}

