import {
	refreshKaras,
	refreshKarasDelete,
	refreshKarasInsert,
	refreshKarasUpdate,
	refreshParentSearchVectorTask,
	refreshSortables,
	refreshSortablesDelete,
	refreshSortablesUpdate,
	updateKaraSearchVector
} from '../dao/kara.js';
import {refreshTags, updateKaraTags, updateTagSearchVector} from '../dao/tag.js';
import { KaraOldData } from '../types/database/kara.js';
import { Kara } from '../types/kara.js';
import { tagTypes } from '../utils/constants.js';
import logger, {profile} from '../utils/logger.js';
import { emitWS } from '../utils/ws.js';

const service = 'KaraManager';

export async function refreshKarasAfterDBChange(action: 'ADD' | 'UPDATE' | 'DELETE' | 'ALL' = 'ALL', karas?: Kara[], oldKara?: KaraOldData) {
	profile('RefreshAfterDBChange');
	logger.debug('Refreshing DB after kara change', { service });
	await updateKaraSearchVector(karas?.map(k => k.kid));
	if (action === 'ADD') {
		await Promise.all([
			refreshKarasInsert(karas.map(k => k.kid)),
			refreshSortablesUpdate(karas.map(k => k.kid))
		]);
	} else if (action === 'UPDATE') {
		await Promise.all([
			refreshKarasUpdate(karas.map(k => k.kid)),
			refreshSortablesUpdate(karas.map(k => k.kid))
		]);
	} else if (action === 'DELETE') {
		await Promise.all([
			refreshKarasDelete(karas.map(k => k.kid)),
			refreshSortablesDelete(karas.map(k => k.kid))
		]);
	} else if (action === 'ALL') {
		await Promise.all([
			refreshKaras(),
			refreshSortables(),
		]);
	}
	const parentsToUpdate: Set<string> = new Set();
	if (karas) for (const kara of karas) {
		// By default all karas need to update their search vectors parents as they need to be the same as their initial search vector
		parentsToUpdate.add(kara.kid);
		// Then we look for parents to update too
		if (kara.parents) {
			for (const parent of kara.parents) {
				parentsToUpdate.add(parent);
			}
		}
	}
	// If oldKara is provided it means we're only updating one single kara. This doesn't work yet with lots of songs
	if (oldKara?.old_parents) {
		const newKara = karas[0];
		if (newKara) for (const parent of oldKara.old_parents) {
			if (newKara.parents && !newKara.parents.includes(parent)) {
				// Parent got deleted, so this kara is marked for update
				parentsToUpdate.add(parent);
			}
		}
	}
	// If karas is not initialized then we're updating ALL search vectors
	Promise.all([
		karas ? refreshParentSearchVectorTask([...parentsToUpdate]) : refreshParentSearchVectorTask(),
		refreshTagsAfterDBChange()
	]).then(() => {
		emitWS('refreshLibrary');
	});
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
