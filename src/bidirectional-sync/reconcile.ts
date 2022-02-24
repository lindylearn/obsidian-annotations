import { LocalArticle, RemoteState } from '~/models';
import type { Article, Highlights, LocalHighlight } from '~/models';


export const reconcileArticle = (remoteArticle: Article, localArticle: LocalArticle): LocalArticle => {
    if (!localArticle) {
        return {
            ...localArticle,
            page_note: { ...remoteArticle.page_note, remote_state: RemoteState.REMOTE_ONLY },
            highlights: remoteArticle.highlights.map(h => ({ ...h, remote_state: RemoteState.REMOTE_ONLY }))
        }
    }

    const reconciledPageNote = reconcileAnnotation(remoteArticle.page_note, localArticle.page_note, localArticle.updated);
    const reconciledAnnotations = reconcileAnnotations(remoteArticle.highlights, localArticle.highlights, localArticle.updated);

    return {
        ...localArticle,
        page_note: reconciledPageNote,
        highlights: reconciledAnnotations,
    }
}

const reconcileAnnotations = (remoteAnnotations: Highlights[], localAnnotations: LocalHighlight[], localUpdated: Date): LocalHighlight[] => {
    const localHighlightMap: {[id: string]: LocalHighlight} = localAnnotations.reduce((obj, highlight) => ({
        ...obj,
        [highlight.id]: highlight,
    }), {})

    const reconciledHighlights: LocalHighlight[] = [];
    for (const remoteAnnotation of remoteAnnotations) {
        const localAnnotation = localHighlightMap[remoteAnnotation.id]

        const reconciledAnnotation = reconcileAnnotation(remoteAnnotation, localAnnotation, localUpdated)
        reconciledHighlights.push(reconciledAnnotation)

        // Mark this highlight as processed
        delete localHighlightMap[remoteAnnotation.id];
    }

    if (Object.keys(localHighlightMap).length > 0) {
        console.log(`Found ${Object.keys(localHighlightMap).length} local-only annotations:`, Object.values(localHighlightMap))
    }

    return reconciledHighlights;
}

const reconcileAnnotation = (remoteAnnotation: Highlights, localAnnotation: LocalHighlight, localUpdated: Date): LocalHighlight => {
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
            ...localAnnotation, 
            remote_state: RemoteState.LOCAL_ONLY
        };
    }
    if (
        remoteAnnotation.annotation.trim() === localAnnotation.annotation.trim() && 
        remoteAnnotation.tags.map(t => t.replaceAll("-", " ")).toString() === localAnnotation.tags.map(t => t.replaceAll("-", " ")).toString()
    ) {
        // No change
        return {
            ...remoteAnnotation, 
            remote_state: RemoteState.SYNCHRONIZED
        };
    }
    
    // Remote and local annotation differ, take latest change
    if (localUpdated > remoteAnnotation.updated) {
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
