import { contructArticlesFromData } from './parseAnnotatation';
import type { Article, Highlights } from '../models';
import { settingsStore } from '~/store';
import { get } from 'svelte/store';

const contructArticles = async (apiDataList): Promise<Article[]> => {
    // group returned annotations per article
    const presentArticles = contructArticlesFromData(apiDataList);

    // populate replies
    const completeArticles = await Promise.all(
        presentArticles.map((article) => populateArticleReplies(article))
    );

    // filter visible annotations per article
    const filteredArticles = completeArticles.map(filterVisibleAnnotations);

    return filteredArticles;
};
export default contructArticles;

const populateArticleReplies = async (article: Article): Promise<Article> => {
    const annotationsMap: { [id: string]: Highlights } =
        article.highlights.reduce(
            (obj, annotation) => ({
                ...obj,
                [annotation.id]: annotation,
            }),
            {}
        );
    article.highlights.map((annotation) => {
        if (annotation.reply_to) {
            if (!annotationsMap[annotation.reply_to].replies) {
                annotationsMap[annotation.reply_to].replies = [];
            }
            annotationsMap[annotation.reply_to].replies.push(annotation);
        }
    });

    const completeAnnotations = Object.values(annotationsMap);

    return { ...article, highlights: completeAnnotations };
};

const filterVisibleAnnotations = (article: Article): Article => {
    const activeUser = get(settingsStore).user;
    const selectedGroups = get(settingsStore).groups;
    const filterAnnotation = (annotation: Highlights) => {
        return (
            annotation.user === activeUser &&
            selectedGroups.find((k) => k.id == annotation.group)
        );
    };

    const visibleAnnotations = article.highlights.filter((annotation) => {
        return (
            (filterAnnotation(annotation) && !annotation.reply_to) ||
            annotation.replies?.some(filterAnnotation)
        );
    });

    return { ...article, highlights: visibleAnnotations };
};
