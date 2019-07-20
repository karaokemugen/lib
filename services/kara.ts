import { tagTypes } from "../utils/constants";
import { i18nData } from "../types/database/kara";

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
					} else if (translations[translations[0]] === tag.name) {
						// Do not create a i18n item if there is only one translation and it's the exact same thing as the tag name
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