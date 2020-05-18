import {where} from 'langs';

export function convert1LangTo2B(lang1B: string): string {
	const lang = where('1', lang1B);
	return lang
		? lang['2B']
		: null
}
