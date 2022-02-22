import type { Article } from '../models'

const getTopLevelAnnotations = (articles: Article[]): Article[] => {
    return articles.map(article => {
        return {
            ...article,
            highlights: article.highlights.map(annotation => {
                if (annotation.replyTo) {
                    return {
                        ...annotation.replyTo,
                        replies: [annotation]
                    };
                } else {
                    return annotation;
                }
            })
        }
    });
}
export default getTopLevelAnnotations
