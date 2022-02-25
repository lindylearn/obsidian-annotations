import { settingsStore } from '~/store';
import { get } from 'svelte/store';
import ApiManager from '~/api/api';
import parseGroupsResponse from '~/parser/parseGroupResponse';

export default class SyncGroup {
    async startSync() {
        const token = get(settingsStore).token;
        const userid = get(settingsStore).user;

        const apiManager = new ApiManager(token, userid);

        const responseBody: [] = await apiManager.getGroups();

        const fetchedGroups = await parseGroupsResponse(responseBody);

        const currentGroups = get(settingsStore).groups;

        const mergedGroups = [...currentGroups, ...fetchedGroups];
        const set = new Set();

        const unionGroups = mergedGroups.filter((item) => {
            if (!set.has(item.id)) {
                set.add(item.id);
                return true;
            }
            return false;
        }, set);

        settingsStore.update({ groups: unionGroups });
    }
}
