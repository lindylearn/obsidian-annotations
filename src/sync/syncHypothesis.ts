import { settingsStore, syncSessionStore, SyncResult } from '~/store';
import { get } from 'svelte/store';
import ApiManager from '~/api/api';
import parseSyncResponse from '~/parser/parseSyncResponse';
import SyncGroup from './syncGroup';
import type FileManager from '~/fileManager';
import { Article, RemoteState } from '~/models';
import { reconcileArticle } from '~/bidirectional-sync/reconcile';

const initialSyncResult = {
    newArticlesCount: 0,
    newHighlightsCount: 0,
    updatedArticlesCount: 0,
    updatedHighlightsCount: 0,
};

export default class SyncHypothesis {
    private syncState: SyncResult = initialSyncResult;
    private syncGroup: SyncGroup;
    private fileManager: FileManager;

    constructor(fileManager: FileManager) {
        this.fileManager = fileManager;
        this.syncGroup = new SyncGroup();
    }

    async startSync(uri?: string) {
        const lastSyncDate = new Date('2022-02-24 00:00:00'); //get(settingsStore).lastSyncDate
        const token = get(settingsStore).token;
        const userid = get(settingsStore).user;
        const apiManager = new ApiManager(token, userid);

        syncSessionStore.actions.trackStartSync();
        this.syncState = initialSyncResult;
        try {
            await this.syncGroup.sync();
            await this.syncArticles(apiManager, lastSyncDate, uri);

            syncSessionStore.actions.trackCompleteSync(this.syncState);
        } catch (err) {
            syncSessionStore.actions.trackErrorSync(err);
        }
    }

    private async syncArticles(
        apiManager: ApiManager,
        lastSyncDate: Date,
        uri?: string
    ): Promise<void> {
        let articles = [];
        if (uri) {
            console.info(`Syncing annotations for URL ${uri}...`);
            const articleAnnotations = await apiManager.getHighlightWithUri(
                uri
            );
            articles = parseSyncResponse(articleAnnotations);
        } else if (!lastSyncDate) {
            console.info(`Syncing all user annotations...`);
            const allAnnotations = await apiManager.getHighlights();
            articles = parseSyncResponse(allAnnotations);
        } else {
            console.info(`Fetching new annotations since ${lastSyncDate}...`);
            const newAnnoations = await apiManager.getHighlights(lastSyncDate);
            const changedArticles = parseSyncResponse(newAnnoations);

            console.info(
                `Fetching all annotations for the ${changedArticles.length} changed articles...`
            );
            const allAnnotations = (
                await Promise.all(
                    changedArticles.map(async (article) =>
                        apiManager.getHighlightWithUri(article.metadata.url)
                    )
                )
            ).flat();
            articles = parseSyncResponse(allAnnotations);
        }

        // Update annotation files locally
        if (articles.length > 0) {
            for (const article of articles) {
                try {
                    await this.syncArticle(article, apiManager);
                } catch (e) {
                    console.error(`Error syncing ${article.metadata.title}`, e);
                }
            }
        }
    }

    private async syncArticle(
        article: Article,
        apiManager: ApiManager
    ): Promise<void> {
        const reconciledArticle = await this.syncArticleWithLocalState(
            article,
            apiManager
        );

        const createdNewArticle = await this.fileManager.saveArticle(
            reconciledArticle
        );

        if (createdNewArticle) {
            this.syncState.newArticlesCount += 1;
        }
        this.syncState.newHighlightsCount +=
            reconciledArticle.highlights.length;
    }

    private async syncArticleWithLocalState(
        remoteArticle: Article,
        apiManager: ApiManager
    ): Promise<Article> {
        // Parse local file
        const localArticle = await this.fileManager.readArticle(remoteArticle);

        // Compare local & remote state
        const reconciledArticle = reconcileArticle(remoteArticle, localArticle);
        // reconciledAnnotations.sort((a, b) => a.created > b.created ? -1 : 1 ) // TODO keep existing structure, only append?

        // Print debug info
        const annotations = reconciledArticle.highlights.concat(
            reconciledArticle.page_note ? [reconciledArticle.page_note] : []
        );
        const annotationStateCount = annotations.reduce(
            (obj, annotation) => ({
                ...obj,
                [RemoteState[annotation.remote_state]]:
                    (obj[RemoteState[annotation.remote_state]] || 0) + 1,
            }),
            {}
        );
        if (
            Object.keys(annotationStateCount).filter(
                (state) =>
                    ![
                        RemoteState[RemoteState.SYNCHRONIZED],
                        RemoteState[RemoteState.REMOTE_ONLY],
                    ].includes(state)
            ).length > 0
        ) {
            console.info(
                `${remoteArticle.metadata.url} annotation state:`,
                annotationStateCount
            );
        }

        // Upload annotation changes
        const annotationsToUpload = annotations.filter(
            (h) => h.remote_state === RemoteState.UPDATED_LOCAL
        );
        if (annotationsToUpload.length > 0) {
            console.info(
                `${remoteArticle.metadata.url}: Updating ${annotationsToUpload.length} annotations on Hypothesis:`,
                annotationsToUpload
            );
            await Promise.all(
                annotationsToUpload.map(({ id, annotation, tags }) =>
                    apiManager.updateAnnotation(id, annotation, tags)
                )
            );
        }

        // Create new page notes,
        const annotationsToCreate = annotations.filter(
            (h) => h.remote_state === RemoteState.LOCAL_ONLY
        );
        if (annotationsToCreate.length > 0) {
            console.info(
                `${remoteArticle.metadata.url}: Creating ${annotationsToCreate.length} annotations on Hypothesis:`,
                annotationsToCreate
            );
            await Promise.all(
                annotationsToCreate.map(({ annotation, tags }) =>
                    apiManager.createPageNote(
                        remoteArticle.metadata.url,
                        annotation,
                        tags
                    )
                )
            );
        }

        // TODO convert LocalHighlight to Highlight for updated / created annotations
        return {
            ...remoteArticle,
            ...reconciledArticle,
        } as unknown as Article;
    }
}
