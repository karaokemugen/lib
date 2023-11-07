/* eslint-disable guard-for-in */
import { DBKara, KaraListData } from '../types/database/kara.js';
import { KaraList } from '../types/kara.js';
import { tagTypes } from '../utils/constants.js';

/** Cleanup tag data unused by frontend */

export function formatKaraList(karaList: any, from: number, count: number): KaraList {
	karaList = removeUnusedTagData(karaList);
	const { i18n, avatars, data } = consolidateData(karaList);
	return {
		infos: {
			count,
			from: from || 0,
			to: (from || 0) + data.length,
		},
		i18n,
		avatars,
		content: data,
	};
}

function removeUnusedTagData(karas: DBKara[]): DBKara[] {
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
function consolidateData(data: any): KaraListData {
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
			if (data[i][type])
				for (const y in data[i][type]) {
					const tag = data[i][type][y];
					if (!i18n[tag.tid]) {
						const translations = Object.keys(tag.i18n);
						if (translations.length > 1 || tag.i18n?.eng !== tag.name) {
							i18n[tag.tid] = { ...tag.i18n };
						}
					}
					delete data[i][type][y].i18n;
				}
		}
	}
	return {
		avatars,
		data,
		i18n,
	};
}
