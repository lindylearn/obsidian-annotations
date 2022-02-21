import md5 from 'crypto-js/md5';
import { moment } from 'obsidian';
import { settingsStore } from '~/store';
import { get } from 'svelte/store';
import type { Article, Highlights } from '../models'

const parseAuthorUrl = (url: string) => {
    const domain = (new URL(url));
    const author = domain.hostname.replace('www.', '');
    return author;
}

const parseTitleFromUrl = (url: string) => {
    const domain = (new URL(url));
    const title = domain.pathname
        .slice(1) // remove leading slash
        .replaceAll('/', '-');
    return title;
}

const parseHighlight = (annotationData, momentFormat: string): Highlights => {
    try {   
        // Get highlighted text or reply
        let isReply, highlightText = null;
        const selector = annotationData['target'][0]['selector']
        if (selector) {
            highlightText = selector
                .find(item => item.type === "TextQuoteSelector")
                ?.exact
        } else {
            // Could be page note or reply
            isReply = !!annotationData["references"]
        }
    
        const excludedTags = ["via-lindylearn.io", "via annotations.lindylearn.io", "lindylearn"];
    
        return {
            id: annotationData['id'],
            created: moment(annotationData['created']).format(momentFormat),
            updated: moment(annotationData['updated']).format(momentFormat),
            text: highlightText,
            incontext: annotationData['links']['incontext'],
            user: annotationData['user'],
            annotation: annotationData['text'],
            tags: annotationData['tags'].filter(tag => !excludedTags.includes(tag)),
            group: annotationData.name,
            isReply
        }
    } catch (error) {

        console.log(`Error parsing annotation format: ${error}`, annotationData);
        return null
    }
}


const parseSyncResponse = async (data): Promise<Article[]> => {
    const momentFormat = get(settingsStore).dateTimeFormat;
    const groups = get(settingsStore).groups;

    return data.reduce((result, annotationData) => {
        const url = annotationData['uri'];
        const md5Hash = md5(url);

        // Skip pdf source
        if ((url).startsWith('urn:x-pdf')) {
            return result;
        }

        // Check if group is selected
        const group = groups.find(k => k.id == annotationData['group']);
        if (!group.selected) {
            return result;
        }
       
        const title = annotationData['document']['title']?.[0] || parseTitleFromUrl(url);
        const author = parseAuthorUrl(url);
        // Set article metadata, if not already set by previous annotation
        if (!result[md5Hash]) {
            result[md5Hash] = { id: md5Hash, metadata: { title, url, author }, highlights: [], page_notes: [] };
        }

        const annotation = parseHighlight(annotationData, momentFormat)
        if (annotation.text) {
            result[md5Hash].highlights.push(annotation);
        } else if (!annotation.isReply) {
            result[md5Hash].page_notes.push(annotation);
        }
        
        return result;
    }, {});

}

export default parseSyncResponse;