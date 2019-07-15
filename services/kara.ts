import { tagTypes } from "../utils/constants";
import { i18nData } from "../types/database/kara";

export function consolidatei18n(data: any): i18nData {
	const i18n = {};
	for (const i in data) {
		for (const type of Object.keys(tagTypes)) {
			if (data[i][type]) for (const y in data[i][type]) {
				if (!i18n[data[i][type][y].tid]) {
					i18n[data[i][type][y].tid] = {...data[i][type][y].i18n}
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