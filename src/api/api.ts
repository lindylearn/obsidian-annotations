import { Notice, moment } from 'obsidian';
import axios from 'axios';

export default class ApiManager {
    readonly baseUrl: string = 'https://hypothes.is/api';
    private token: string;
    private userid: string;

    constructor(token: string, userid: string = undefined) {
        this.token = token;
        this.userid = userid;
    }

    private getHeaders() {
        return {
            AUTHORIZATION: `Bearer ${this.token}`,
            Accept: 'application/json',
        };
    }

    async getProfile() {
        try {
            const response = await axios.get(`${this.baseUrl}/profile`, {
                headers: this.getHeaders(),
            });
            const fullUserId = response.data.userid; // e.g. acct:remikalir@hypothes.is
            return fullUserId.match(/([^:]+)@/)[1];
        } catch (e) {
            new Notice(
                'Failed to authorize Hypothes.is user. Please check your API token and try again.'
            );
            console.error(e);
            return;
        }
    }

    async getHighlights(lastSyncDate?: Date, limit = 5000) {
        let annotations = [];

        try {
            // Paginate API calls via search_after param
            // search_after=null starts at with the earliest annotations
            let newestTimestamp =
                lastSyncDate && moment.utc(lastSyncDate).format();
            while (annotations.length < limit) {
                const response = await axios.get(`${this.baseUrl}/search`, {
                    params: {
                        limit: 200, // Max pagination size
                        sort: 'updated',
                        order: 'asc', // Get all annotations since search_after
                        search_after: newestTimestamp,
                        user: `acct:${this.userid}@hypothes.is`,
                    },
                    headers: this.getHeaders(),
                });
                const newAnnotations = response.data.rows;
                if (!newAnnotations.length) {
                    // No more annotations
                    break;
                }

                annotations = [...annotations, ...newAnnotations];
                newestTimestamp =
                    newAnnotations[newAnnotations.length - 1].updated;
            }
        } catch (e) {
            new Notice(
                'Failed to fetch Hypothes.is annotations. Please check your API token and try again.'
            );
            console.error(e);
        }

        return annotations;
    }

    async getHighlightWithUri(
        uri: string,
        filterToActiveUser: boolean = false,
        limit = 200
    ) {
        try {
            const response = await axios.get(`${this.baseUrl}/search`, {
                params: {
                    limit,
                    uri,
                    user: filterToActiveUser
                        ? `acct:${this.userid}@hypothes.is`
                        : undefined,
                    sort: 'updated',
                    order: 'asc',
                },
                headers: this.getHeaders(),
            });

            return response.data.rows;
        } catch (e) {
            new Notice(
                'Failed to fetch Hypothes.is annotations. Please check your API token and try again.'
            );
            console.error(e);
        }
    }

    async getGroups() {
        try {
            const response = await axios.get(`${this.baseUrl}/groups`, {
                headers: this.getHeaders(),
            });
            return response.data;
        } catch (e) {
            new Notice(
                'Failed to fetch Hypothes.is annotation groups. Please check your API token and try again.'
            );
            console.error(e);
        }
    }

    async updateAnnotation(annotationId: string, text: string, tags: string[]) {
        tags = ['via annotations.lindylearn.io'].concat(tags);

        try {
            const response = await axios.patch(
                `${this.baseUrl}/annotations/${annotationId}`,
                { text, tags },
                { headers: this.getHeaders() }
            );
            return response.data;
        } catch (e) {
            new Notice(
                'Failed to update Hypothes.is annotations. Please check your API token and try again.'
            );
            console.error(e);
        }
    }

    async createPageNote(uri: string, text: string, tags: string[]) {
        tags = ['via annotations.lindylearn.io'].concat(tags);

        try {
            const response = await axios.post(
                `${this.baseUrl}/annotations`,
                { uri, text, tags, group: '__world__' },
                { headers: this.getHeaders() }
            );
            return response.data;
        } catch (e) {
            new Notice(
                'Failed to update Hypothes.is annotations. Please check your API token and try again.'
            );
            console.error(e);
        }
    }
}
