import { contructArticlesFromData } from './parseAnnotatation';
import type { Article } from '../models';

const contructArticles = (apiDataList): Article[] => {
    // group returned annotations per article
    const presentArticles = contructArticlesFromData(apiDataList);

    // populate replies

    return presentArticles;
};

export default contructArticles;
