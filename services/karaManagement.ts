import {
	refreshKaras,
	refreshKarasDelete,
	refreshKarasInsert,
	refreshKarasUpdate,
	refreshParentSearchVectorTask,
	refreshYears,
	updateKaraSearchVector
} from '../dao/kara';
import {refreshTags, updateKaraTags, updateTagSearchVector} from '../dao/tag';
import { DBKara } from '../types/database/kara';
import { Kara } from '../types/kara';
import { tagTypes } from '../utils/constants';
import logger, {profile} from '../utils/logger';

const service = 'KaraManager';

export async function refreshKarasAfterDBChange(action: 'ADD' | 'UPDATE' | 'DELETE' | 'ALL' = 'ALL', karas?: Kara[], oldKara?: DBKara) {
	profile('RefreshAfterDBChange');
	logger.debug('Refreshing DB after kara change', { service });
	await updateKaraSearchVector(karas.map(k => k.kid));
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
	// If oldKara is provided it means we're only updating one single kara. This doesn't work yet with lots of songs
	if (oldKara?.parents) {
		const newKara = karas.find(k => k.kid === oldKara.kid);
		if (newKara) for (const parent of oldKara.parents) {
			if (!newKara.parents.includes(parent)) {
				// Parent got deleted, so this kara is marked for update
				parentsToUpdate.add(parent);
			}
		}
	}
	// If karas is not initialized then we're updating ALL search vectors
	karas ? refreshParentSearchVectorTask([...parentsToUpdate]) : refreshParentSearchVectorTask();
	refreshTagsAfterDBChange();
	logger.debug('Done refreshing DB after kara change', { service });
	profile('RefreshAfterDBChange');
}

async function refreshTagsAfterDBChange() {
	await updateTagSearchVector();
	refreshTags();
}

export async function updateTags(kara: Kara) {
	const tagsAndTypes = [];
	for (const type of Object.keys(tagTypes)) {
		if (kara.tags[type])
			for (const tag of kara.tags[type]) {
				// We can have either a name or a number for type
				tagsAndTypes.push({ tid: tag, type: tagTypes[type] || type });
			}
	}
	await updateKaraTags(kara.kid, tagsAndTypes);
}
