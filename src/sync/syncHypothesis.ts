import { settingsStore, syncSessionStore } from '~/store';
import type { SyncState } from './syncState';
import { get } from 'svelte/store';
import ApiManager from '~/api/api';
import parseSyncResponse from '~/parser/parseSyncResponse';
import SyncGroup from './syncGroup';
import type FileManager from '~/fileManager';
import { Article, Highlights, LocalHighlight, RemoteState } from '~/models';
import { reconcileArticle } from '~/bidirectional-sync/reconcile'


export default class SyncHypothesis {

    private syncState: SyncState = { newArticlesSynced: 0, newHighlightsSynced: 0 };
    private syncGroup: SyncGroup;
    private fileManager: FileManager;

    constructor(fileManager: FileManager) {
        this.fileManager = fileManager;
        this.syncGroup = new SyncGroup;
    }

    async startSync(uri?: string) {
        this.syncState = { newArticlesSynced: 0, newHighlightsSynced: 0 };

        const token = await get(settingsStore).token;
        const userid = await get(settingsStore).user;

        const apiManager = new ApiManager(token, userid);

        syncSessionStore.actions.startSync();

        //fetch groups
        await this.syncGroup.startSync();

        //fetch highlights
        // get(settingsStore).lastSyncDate
        const responseBody: [] = (!uri) ? await apiManager.getHighlights() : await apiManager.getHighlightWithUri(uri);
        const articles = await parseSyncResponse(responseBody);

        syncSessionStore.actions.setJobs(articles);

        if (articles.length > 0) {
            await this.syncArticles(articles, apiManager);
        }

        syncSessionStore.actions.completeSync({
            newArticlesCount: this.syncState.newArticlesSynced,
            newHighlightsCount: this.syncState.newHighlightsSynced,
            updatedArticlesCount: 0,
            updatedHighlightsCount: 0,
        });
    }

    private async syncArticles(articles: Article[], apiManager: ApiManager): Promise<void> {
        for (const article of articles) {
            // if (article.metadata.url != "http://kernelmag.io/pieces/a-founders-guide") {
            //     continue
            // }
            try {
                syncSessionStore.actions.startJob(article);

                await this.syncArticle(article, apiManager);

                syncSessionStore.actions.completeJob(article);

            } catch (e) {
                console.error(`Error syncing ${article.metadata.title}`, e);
                syncSessionStore.actions.errorJob(article);
            }
        }
    }

    private async syncArticle(article: Article, apiManager: ApiManager): Promise<void> {
        const reconciledArticle = await this.syncArticleWithLocalState(article, apiManager);

        const createdNewArticle = await this.fileManager.createOrUpdate(reconciledArticle);

        if (createdNewArticle) {
            this.syncState.newArticlesSynced += 1;
        }
        this.syncState.newHighlightsSynced += reconciledArticle.highlights.length;
    }

    private async syncArticleWithLocalState(remoteArticle: Article, apiManager: ApiManager): Promise<Article> {
        // Parse local file
        const localArticle = await this.fileManager.parseLocalArticle(remoteArticle);
        // console.log(remoteArticle, localArticle)

        // Compare local & remote state
        const reconciledArticle = reconcileArticle(remoteArticle, localArticle);
        // reconciledAnnotations.sort((a, b) => a.created > b.created ? -1 : 1 ) // TODO keep existing structure, only append?
  
        // Print debug info
        const annotations = reconciledArticle.highlights
            .concat(reconciledArticle.page_note ? [reconciledArticle.page_note] : [])
        const annotationStateCount = annotations
            .reduce((obj, annotation) => ({
                ...obj,
                [RemoteState[annotation.remote_state]]: (obj[RemoteState[annotation.remote_state]] || 0) + 1
            }), {})
        const nonStandardStateCount = annotationStateCount[RemoteState[RemoteState.SYNCHRONIZED]]
        if (nonStandardStateCount !== annotations.length) {
          console.info(`${remoteArticle.metadata.url} annotation state:`, annotationStateCount)
        }
  
        // Upload annotation changes
        const annotationsToUpload = annotations
          .filter(h => h.remote_state === RemoteState.UPDATED_LOCAL)
        if (annotationsToUpload.length > 0) {
          console.info(`${remoteArticle.metadata.url}: Updating ${annotationsToUpload.length} annotations on Hypothesis:`, annotationsToUpload)
          await Promise.all(annotationsToUpload.map(({id, annotation, tags}) => apiManager.updateAnnotation(id, annotation, tags)))
        }

        // Create new page notes, 
        const annotationsToCreate = annotations
            .filter(h => h.remote_state === RemoteState.LOCAL_ONLY)
        if (annotationsToCreate.length > 0) {
            console.info(`${remoteArticle.metadata.url}: Creating ${annotationsToCreate.length} annotations on Hypothesis:`, annotationsToCreate)
            await Promise.all(annotationsToCreate.map(({annotation, tags}) => apiManager.createPageNote(remoteArticle.metadata.url, annotation, tags)))
        }

        // TODO convert LocalHighlight to Highlight for updated / created annotations
        return {
            ...remoteArticle,
            ...reconciledArticle,
        } as unknown as Article
    }
}