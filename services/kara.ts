/* eslint-disable guard-for-in */
import { getState } from '../../utils/state.js';
import { DBKara, KaraListData } from '../types/database/kara.js';
import { KaraList } from '../types/kara.js';
import { tagTypes } from '../utils/constants.js';
import { convert1LangTo2B } from '../utils/langs.js';
import { getTagNameInLanguage } from './tag.js';

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

/** Returns a string with series or singers with their correct i18n.
 * If from_display_type exists, we use that.
 * If series, only first one is returned
 * If singers only, only first two singers are returned with a "..." string added if there are more
 */
export function getSongSeriesSingers(kara: DBKara, optionalLang?: string): string {
	const langs = [optionalLang, convert1LangTo2B(getState().defaultLocale), 'eng'];
	if (kara.from_display_type) {
		const result = kara[kara.from_display_type].slice(0, 2).map(t => getTagNameInLanguage(t, langs));
		if (kara[kara.from_display_type].length > 2) result.push('...');
		return result.join(', ');
	}
	// If the from_display_type isn't present, we'll guess like we did before.
	// Multiple series aren't very common, so we return always the first one
	if (kara.series?.length > 0) {
		return getTagNameInLanguage(kara.series[0], langs);
	}
	// Multiple singer groups aren't too common but you never know : we'll return at least 2, then add ... if needs be.
	if (kara.singergroups?.length > 0) {
		const result = kara.singergroups.slice(0, 2).map(sg => getTagNameInLanguage(sg, langs));
		if (kara.singergroups.length > 2) result.push('...');
		return result.join(', ');
	}
	// Same with singers
	const result = kara.singers.map(s => getTagNameInLanguage(s, langs)).slice(0, 2);
	if (kara.singers.length > 2) result.push('...');
	return result.join(', ');
}

/** Get kara's default title */
export function getSongTitle(kara: DBKara, optionalLang?: string): string {
	const lang = optionalLang || convert1LangTo2B(getState().defaultLocale);
	return kara.titles[lang] || kara.titles[kara.titles_default_language];
}

export function getSongVersion(kara: DBKara, optionalLang?: string): string {
	if (kara.versions?.length > 0) {
		const versions = kara.versions.map(v => {
			const lang = optionalLang || convert1LangTo2B(getState().defaultLocale) || 'eng';
			return `[${v.i18n[lang] || v.i18n?.eng || v.i18n?.qro || v.name}]`;
		});
		return ` ${versions.join(' ')}`;
	}
	return '';
}
