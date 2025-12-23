import { getTag } from '../../services/tag.js';
import { writeTagFile } from '../dao/tagfile.js';
import { DBKaraTag } from '../types/database/kara.js';
import { KaraFileV4 } from '../types/kara.js';
import { resolvedPathRepos } from '../utils/config.js';
import { tagTypes } from '../utils/constants.js';
import { resolveFileInDirs, sanitizeFile } from '../utils/files.js';
import { profile } from '../utils/logger.js';

export function getTagNameInLanguage(tag: DBKaraTag, langs: string[]): string {
	let result: string = '';
	for (const lang of langs) {
		if (result) break;
		if (tag.i18n) {
			result = tag.i18n[lang];
		}
	}
	if (!result) result = tag.name;
	return result;
}

export async function consolidateTagsInRepo(kara: KaraFileV4) {
	profile('consolidateTagsInRepo');
	const copies = [];
	for (const tagType of Object.keys(tagTypes)) {
		if (kara.data.tags[tagType]) {
			for (const karaTag of kara.data.tags[tagType]) {
				const tag = await getTag(karaTag).catch(() => {});
				if (!tag) continue;
				if (tag.repository !== kara.data.repository) {
					// This might need to be copied
					tag.repository = kara.data.repository;
					const destPath = resolvedPathRepos('Tags', tag.repository);
					const tagFile = `${sanitizeFile(tag.name)}.${tag.tid.substring(0, 8)}.tag.json`;
					try {
						await resolveFileInDirs(tagFile, destPath);
					} catch {
						// File does not exist, let's write it.
						copies.push(writeTagFile(tag, destPath[0]));
					}
				}
			}
		}
	}
	await Promise.all(copies);
	profile('consolidateTagsInRepo');
}