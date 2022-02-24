import { moment } from 'obsidian';
import { LocalArticle, RemoteState } from '~/models';
import type { Article, Highlights, LocalHighlight } from '~/models';
import { get } from 'svelte/store';
import { settingsStore } from '~/store';


export const reconcileArticle = (remoteArticle: Article, localArticle: LocalArticle): Article => {
    if (!localArticle) {
        return {
            ...remoteArticle,
            page_note: { ...remoteArticle.page_note, remote_state: RemoteState.REMOTE_ONLY },
            highlights: remoteArticle.highlights.map(h => ({ ...h, remote_state: RemoteState.REMOTE_ONLY }))
        }
    }

    const reconciledPageNote = reconcileAnnotation(remoteArticle.page_note, localArticle.page_note, localArticle.updated_millis);
    const reconciledAnnotations = reconcileAnnotations(remoteArticle.highlights, localArticle.highlights, localArticle.updated_millis);
    reconciledAnnotations.sort((a, b) => a.created > b.created ? -1 : 1 ) // TODO keep existing structure, only append?

    return {
        ...remoteArticle,
        page_note: reconciledPageNote,
        highlights: reconciledAnnotations,
    }
}

const reconcileAnnotations = (remoteAnnotations: Highlights[], localAnnotations: LocalHighlight[], lastLocalUpdateMillis: number): Highlights[] => {
    const localHighlightMap: {[id: string]: LocalHighlight} = localAnnotations.reduce((obj, highlight) => ({
        ...obj,
        [highlight.id]: highlight,
    }), {})

    const reconciledHighlights: Highlights[] = [];
    for (const remoteAnnotation of remoteAnnotations) {
        const localAnnotation = localHighlightMap[remoteAnnotation.id]

        const reconciledAnnotation = reconcileAnnotation(remoteAnnotation, localAnnotation, lastLocalUpdateMillis)
        reconciledHighlights.push(reconciledAnnotation)

        // Mark this highlight as processed
        delete localHighlightMap[remoteAnnotation.id];
    }

    if (Object.keys(localHighlightMap).length > 0) {
        console.log(`Found ${Object.keys(localHighlightMap).length} local-only annotations:`, Object.values(localHighlightMap))
    }

    return reconciledHighlights;
}

const reconcileAnnotation = (remoteAnnotation: Highlights, localAnnotation: LocalHighlight, lastLocalUpdateMillis: number): Highlights => {
    if (!localAnnotation && !remoteAnnotation) {
        return null;
    }
    if (!localAnnotation) {
        // Only present remotely
        return {
            ...remoteAnnotation, 
            remote_state: RemoteState.REMOTE_ONLY
        };
    }
    if (!remoteAnnotation) {
        // Not present locally
        return {
            ...remoteAnnotation, 
            remote_state: RemoteState.LOCAL_ONLY
        };
    }
    if (
        remoteAnnotation.annotation === localAnnotation.annotation && 
        remoteAnnotation.tags.map(t => t.replaceAll("-", " ")).toString() === localAnnotation.tags.map(t => t.replaceAll("-", " ")).toString()
    ) {
        // No change
        return {
            ...remoteAnnotation, 
            remote_state: RemoteState.SYNCHRONIZED
        };
    }
    
    // Remote and local annotation differ, check which happened more recently
    const momentFormat = get(settingsStore).dateTimeFormat;
    const remoteUpdateTimeMillis = moment(remoteAnnotation.updated, momentFormat).valueOf()

    // console.log(remoteAnnotation, localAnnotation)

    if (lastLocalUpdateMillis > remoteUpdateTimeMillis) {
        return {
            ...remoteAnnotation,
            remote_state: RemoteState.UPDATED_LOCAL,
            annotation: localAnnotation.annotation,
            tags: localAnnotation.tags,
        };
    }

    return {
        ...remoteAnnotation,
        remote_state: RemoteState.UPDATED_REMOTE,
    };
}
