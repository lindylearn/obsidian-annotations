import md5 from 'crypto-js/md5';
import type { Article, Highlights } from '../models';
import { settingsStore } from '~/store';
import { get } from 'svelte/store';

export const contructArticlesFromData = (apiDataList): Article[] => {
    // Group annotations per article
    const articlesMap = apiDataList.reduce((result, annotationData) => {
        const url = annotationData['uri'];
        const md5Hash = md5(url);

        const title =
            annotationData['document']?.['title']?.[0] ||
            parseTitleFromUrl(url);
        const author = parseAuthorUrl(url);
        // Set article metadata, if not already set by previous annotation
        if (!result[md5Hash]) {
            result[md5Hash] = {
                id: md5Hash,
                metadata: { title, url, author },
                highlights: [],
                page_note: null,
            };
        }

        const activeUser = get(settingsStore).user;
        const annotation = parseAnnotation(annotationData);
        if (
            !annotation.text &&
            !annotation.reply_to &&
            annotation.user === activeUser
        ) {
            // Treat other people's page notes as normal annotations
            // Only show the first page note to make editing simpler
            if (!result[md5Hash].page_note) {
                result[md5Hash].page_note = annotation;
            }
        } else {
            result[md5Hash].highlights.push(annotation);
        }

        return result;
    }, {});

    return Object.values(articlesMap);
};

export const parseAnnotation = (annotationData): Highlights => {
    try {
        // Get highlighted text or reply
        let reply_to,
            highlightText = null;
        const selector = annotationData['target'][0]['selector'];
        if (selector) {
            highlightText = selector.find(
                (item) => item.type === 'TextQuoteSelector'
            )?.exact;
        } else {
            // Could be page note or reply
            const references = annotationData['references'];
            if (references) {
                // last entry is direct parent
                reply_to = references[references.length - 1];
            }
        }

        return {
            id: annotationData['id'],
            created: new Date(annotationData['created']),
            updated: new Date(annotationData['updated']),
            text: highlightText && cleanTextSelectorHighlight(highlightText),
            // For replies, incontext link points to parent. So append actual annotationId for parsing in parseNotes.ts
            incontext: `${annotationData['links']['incontext']}#${annotationData['id']}`,
            user: annotationData['user'].match(/([^:]+)@/)[1],
            annotation: annotationData['text'],
            tags: annotationData['tags'].filter(
                (tag) => !excludedTags.includes(tag)
            ),
            group: annotationData['group'],
            reply_to,
        };
    } catch (error) {
        console.log(
            `Error parsing annotation format: ${error}`,
            annotationData
        );
        return null;
    }
};

const parseAuthorUrl = (url: string) => {
    const domain = new URL(url);
    const author = domain.hostname.replace('www.', '');
    return author;
};

const parseTitleFromUrl = (url: string) => {
    console.log(url);
    const domain = new URL(url);
    let pathname = domain.pathname;

    // Remove leading and optional trailing slash
    pathname = pathname.slice(1);
    if (pathname.endsWith('/')) {
        pathname = pathname.slice(0, pathname.length - 1);
    }

    return pathname.replaceAll('/', '-');
};

// Strip excessive whitespace and newlines from the TextQuoteSelector highlight text
// This mirrors how Hypothesis displays annotations, to remove artifacts from the HTML annotation anchoring
const cleanTextSelectorHighlight = (text: string): string => {
    text = text.replaceAll('\n', ' '); // e.g. http://www.paulgraham.com/venturecapital.html
    text = text.replace('\t', ' '); // e.g. https://sive.rs/about

    // Remove space-indented lines, e.g. https://calpaterson.com/bank-python.html
    while (text.contains('  ')) {
        text = text.replaceAll('  ', ' ');
    }

    return text;
};

export const excludedTags = [
    'via-lindylearn.io',
    'via annotations.lindylearn.io',
    'lindylearn',
];
