import { Kara } from '../types/kara';
import { tagTypes } from '../utils/constants';
import { updateKaraTags } from '../dao/tag';

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
