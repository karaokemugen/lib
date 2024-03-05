import { where } from 'langs';

export const nonLatinLanguages = [
	'amh', // amharic
	'ara', // arabic
	'arm', // armenian
	'bel', // belarusian
	'ben', // bengali
	'bul', // bulgarian
	'chi', // chinese
	'geo', // georgian
	'gre', // greek
	'guj', // gujarati
	'heb', // hebrew
	'hin', // hindi
	'jpn', // japanese
	'kan', // kannada
	'khm', // kmher
	'kir', // kyrgyz
	'kor', // korean
	'mac', // macedonian
	'mal', // malayalam
	'mar', // marathi
	'mon', // mongolian
	'nep', // nepali
	'ori', // oriya
	'pan', // punjabi
	'per', // persian
	'pus', // pashto
	'rus', // russian
	'san', // sanskrit
	'srp', // serbian
	'tam', // tamil
	'tel', // telugu
	'tha', // thai
	'tib', // tibetan
	'tir', // tigrinya
	'ukr', // ukrainian
	'urd', // urdu
	'vie', // vietnamese
];

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
