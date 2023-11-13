import { DBKaraTag } from '../types/database/kara.js';

export function getTagNameInLanguage(tag: DBKaraTag, langs: string[]): string {
	let result: string;
	for (const lang of langs) {
		if (result) break;
		if (tag.i18n) {
			result = tag.i18n[lang];
		}
	}
	if (!result) result = tag.name;
	return result;
}
