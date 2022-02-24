import { moment } from 'obsidian';
import { RemoteState } from '~/models';
import type { Article, Highlights, LocalHighlight } from '~/models';
import { get } from 'svelte/store';
import { settingsStore } from '~/store';


export const reconcileHighlights = (remoteArticle: Article, localHighlights: LocalHighlight[], localUpdateTimeMillis: number): Article => {
    const localHighlightMap: {[id: string]: LocalHighlight} = localHighlights.reduce((obj, highlight) => ({
        ...obj,
        [highlight.id]: highlight,
    }), {})

    const reconciledHighlights: Highlights[] = [];
    for (const remoteHighlight of remoteArticle.highlights) {
        const localHighlight = localHighlightMap[remoteHighlight.id]
        if (!localHighlight) {
            // Not present locally -> new
            reconciledHighlights.push({
                ...remoteHighlight, 
                remote_state: RemoteState.REMOTE_ONLY
            });
        } else if (
            remoteHighlight.annotation === localHighlight.annotation && 
            remoteHighlight.tags.map(t => t.replaceAll("-", " ")).toString() === localHighlight.tags.map(t => t.replaceAll("-", " ")).toString()
        ) {
            // No change
            reconciledHighlights.push({
                ...remoteHighlight, 
                remote_state: RemoteState.SYNCHRONIZED
            });
        } else {
            // Remote and local annotation differ, check which happened more recently
            console.log(remoteHighlight, localHighlight)

            const momentFormat = get(settingsStore).dateTimeFormat;
            const remoteUpdateTimeMillis = moment(remoteHighlight.updated, momentFormat).valueOf()

            if (localUpdateTimeMillis > remoteUpdateTimeMillis) {
                reconciledHighlights.push({
                    ...remoteHighlight,
                    remote_state: RemoteState.UPDATED_LOCAL,
                    annotation: localHighlight.annotation,
                    tags: localHighlight.tags,
                });
            } else {
                reconciledHighlights.push({
                    ...remoteHighlight,
                    remote_state: RemoteState.UPDATED_REMOTE,
                });
            }
        }

        // Mark this highlight as processed
        delete localHighlightMap[remoteHighlight.id];
    }

    if (Object.keys(localHighlightMap).length > 0) {
        console.log(`${Object.keys(localHighlightMap).length} local-only annotations for ${remoteArticle.metadata.url}:`, Object.values(localHighlightMap), remoteArticle.highlights)
    }

    return {
        ...remoteArticle,
        highlights: reconciledHighlights
    }
}
