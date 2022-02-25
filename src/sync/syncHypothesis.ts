import { settingsStore, syncSessionStore, SyncResult } from '~/store';
import { get } from 'svelte/store';
import ApiManager from '~/api/api';
import parseSyncResponse from '~/parser/parseSyncResponse';
import SyncGroup from './syncGroup';
import type FileManager from '~/fileManager';
import { Article, RemoteState } from '~/models';
import { reconcileArticle } from '~/bidirectional-sync/reconcile';

export default class SyncHypothesis {
    private syncGroup: SyncGroup;
    private fileManager: FileManager;

    constructor(fileManager: FileManager) {
        this.fileManager = fileManager;
        this.syncGroup = new SyncGroup();
    }

    async startSync(uri?: string) {
        // const lastSyncDate = new Date('2022-02-24 00:00:00');
        const lastSyncDate = get(settingsStore).lastSyncDate;
        const token = get(settingsStore).token;
        const userid = get(settingsStore).user;
        const apiManager = new ApiManager(token, userid);

        const isFullReset = !uri && !lastSyncDate;
        syncSessionStore.actions.trackStartSync(isFullReset);
        try {
            if (!uri) {
                await this.syncGroup.sync();
            }
            const syncState = await this.syncArticles(
                apiManager,
                lastSyncDate,
                uri
            );

            syncSessionStore.actions.trackCompleteSync(syncState);
        } catch (err) {
            syncSessionStore.actions.trackErrorSync(err);
        }
    }

    private async syncArticles(
        apiManager: ApiManager,
        lastSyncDate: Date,
        uri?: string
    ): Promise<SyncResult> {
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

        const isFullReset = !uri && !lastSyncDate;
        let syncResult: SyncResult = {
            newArticlesCount: 0,
            newAnnotationsCount: 0,
            downloadedAnnotations: 0,
            uploadedAnnotations: 0,
        };

        // Reconcile and update annotation files
        if (articles.length > 0) {
            for (const article of articles) {
                try {
                    // Compare remote & local state, the save combined state
                    const reconciledArticle =
                        await this.syncArticleWithLocalState(
                            article,
                            apiManager
                        );
                    const created = await this.fileManager.saveArticle(
                        reconciledArticle
                    );
                    syncResult = this.updateSyncState(
                        created,
                        isFullReset,
                        syncResult,
                        reconciledArticle
                    );
                } catch (e) {
                    console.error(`Error syncing ${article.metadata.title}`, e);
                }
            }
        }

        return syncResult;
    }

    // Update the sync state after saving one article
    private updateSyncState(
        createdFile: boolean,
        isFullReset: boolean,
        syncResult: SyncResult,
        reconciledArticle: Article
    ) {
        if (createdFile || isFullReset) {
            syncResult.newArticlesCount += 1;
            syncResult.newAnnotationsCount +=
                reconciledArticle.highlights.length;
        } else {
            const newCount = reconciledArticle.highlights.filter(
                (a) => a.remote_state === RemoteState.REMOTE_ONLY
            ).length;
            syncResult.newAnnotationsCount += newCount;
        }

        const downloaded = reconciledArticle.highlights.filter((a) =>
            [RemoteState.REMOTE_ONLY, RemoteState.UPDATED_REMOTE].contains(
                a.remote_state
            )
        ).length;
        const uploaded = reconciledArticle.highlights.filter((a) =>
            [RemoteState.LOCAL_ONLY, RemoteState.UPDATED_LOCAL].contains(
                a.remote_state
            )
        ).length;
        syncResult.downloadedAnnotations += downloaded;
        syncResult.uploadedAnnotations += uploaded;

        return syncResult;
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
