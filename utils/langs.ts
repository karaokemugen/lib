import { where } from 'langs';

export function convert1LangTo2B(lang1B: string): string {
	const lang = where('1', lang1B);
	return lang ? lang['2B'] : null;
}

/** Converts any language type to 2B */
export function convertLangTo2B(input: string) {
	const lang = where('1', input) 
		|| where('2', input)
		|| where('2B', input)
		|| where('3', input)
		|| where('2T', input)
		// @types/langs is not accurate so Typescript will complain.
		// @ts-ignore
		|| where('name', input)
		// @ts-ignore
		|| where('local', input);
	return lang ? lang['2B'] : null;
}
