import { Kara } from '../types/kara';
import { tagTypes } from '../utils/constants';
import {refreshTags, updateKaraTags, updateTagSearchVector} from '../dao/tag';
import logger, {profile} from '../utils/logger';
import {
	refreshKaras,
	refreshKarasDelete,
	refreshKarasInsert,
	refreshKarasUpdate,
	refreshParentSearchVectorTask,
	refreshYears,
	updateKaraSearchVector
} from '../dao/kara';


export async function refreshKarasAfterDBChange(action: 'ADD' | 'UPDATE' | 'DELETE' | 'ALL' = 'ALL', karas?: Kara[]) {
	profile('RefreshAfterDBChange');
	logger.debug('Refreshing DB after kara change', { service: 'DB' });
	await updateKaraSearchVector();
	if (action === 'ADD') {
		await refreshKarasInsert(karas.map(k => k.kid));
	} else if (action === 'UPDATE') {
		await refreshKarasUpdate(karas.map(k => k.kid));
	} else if (action === 'DELETE') {
		await refreshKarasDelete(karas.map(k => k.kid));
	} else if (action === 'ALL') {
		await refreshKaras();
	}
	refreshYears();
	const parentsToUpdate: Set<string> = new Set();
	for (const kara of karas) {
		if (kara.parents) {
			for (const parent of kara.parents) {
				parentsToUpdate.add(parent);
			}
		}
	}
	// If karas is not initialized then we're updating ALL search vectors
	karas ? refreshParentSearchVectorTask([...parentsToUpdate]) : refreshParentSearchVectorTask();
	refreshTagsAfterDBChange();
	logger.debug('Done refreshing DB after kara change', { service: 'DB' });
	profile('RefreshAfterDBChange');
}

async function refreshTagsAfterDBChange() {
	await updateTagSearchVector();
	refreshTags();
}

export async function updateTags(kara: Kara) {
	const tagsAndTypes = [];
	for (const type of Object.keys(tagTypes)) {
		if (kara[type])
			for (const tag of kara[type]) {
				// We can have either a name or a number for type
				tagsAndTypes.push({ tid: tag.tid, type: tagTypes[type] || type });
			}
	}
	await updateKaraTags(kara.kid, tagsAndTypes);
}
