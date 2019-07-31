import { tagTypes } from "../utils/constants";
import { i18nData } from "../types/database/kara";

/** Pick all i18n items from tags in karalist, consolidate them and remove duplicates */
export function consolidatei18n(data: any): i18nData {
	const i18n = {};
	for (const i in data) {
		for (const type of Object.keys(tagTypes)) {
			if (data[i][type]) for (const y in data[i][type]) {
				const tag = data[i][type][y];
				if (!i18n[tag.tid]) {
					const translations = Object.keys(tag.i18n);
					if (translations.length > 1) {
						i18n[tag.tid] = {...tag.i18n}
					} else if (tag.i18n[translations[0]] !== tag.name) {
						i18n[tag.tid] = {...tag.i18n}
					}
					delete data[i][type][y].i18n;
				}
			}
		}
	}
	return {
		data: data,
		i18n: i18n
	}
}