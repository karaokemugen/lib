import { tagTypes } from "../utils/constants";
import { KaraListData, DBKara } from "../types/database/kara";

/** Remove unused languages from a i18nData object */
export function removeUnusedLangs(i18n: KaraListData, langs: string[]): KaraListData {
	for (const lang of Object.keys(i18n)) {
		if (!langs.includes(lang)) delete i18n[lang];
	}
	return i18n;
}

/** Cleanup tags unused by frontend*/
export function removeUnusedTagData(karas: DBKara[]): DBKara[] {
	for (const i in karas) {
		delete karas[i].count;
		for (const tagType of Object.keys(tagTypes)) {
			for (const y in karas[i][tagType]) {
				delete karas[i][tagType][y].aliases;
				delete karas[i][tagType][y].types;
			}
		}
	}
	return karas;
}

/** Pick all i18n items from tags in karalist, consolidate them and remove duplicates */
export function consolidateData(data: any, langs: string[]): KaraListData {
	const i18n = {};
	const avatars = {};
	for (const i in data) {
		// Consolidating avatar data
		if (data[i].username) {
			avatars[data[i].username] = data[i].avatar_file;
			delete data[i].avatar_file;
		}
		// Consolidating i18n data
		for (const type of Object.keys(tagTypes)) {
			if (data[i][type]) for (const y in data[i][type]) {
				const tag = data[i][type][y];
				if (!i18n[tag.tid]) {
					const translations = Object.keys(tag.i18n);
					if (translations.length > 1) {
						i18n[tag.tid] = removeUnusedLangs({...tag.i18n}, langs);
					} else if (tag.i18n[translations[0]] !== tag.name) {
						i18n[tag.tid] = removeUnusedLangs({...tag.i18n}, langs);
					}
					delete data[i][type][y].i18n;
				} else {
					delete data[i][type][y].i18n;
				}
			}
		}
	}
	return {
		avatars: avatars,
		data: data,
		i18n: i18n
	}
}