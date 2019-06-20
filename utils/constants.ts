/*
 * Constants for KM (tags, langs, types, etc.).
 */

/** Regexps for validation. */
export const uuidRegexp = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
export const mediaFileRegexp = '^.+\\.(avi|mkv|mp4|webm|mov|wmv|mpg|ogg|m4a|mp3)$';
export const imageFileRegexp = '^.+\\.(jpg|jpeg|png|gif)$';
export const subFileRegexp = '^.+\\.ass$';
export const md5Regexp = '[0-9a-f]{32}';
export const imageFileTypes = ['jpg', 'jpeg', 'png', 'gif'];
export const bools = [true, false, 'true', 'false', undefined];

export const karaTypes = Object.freeze({
	OP: {type: 'OP', dbType: 'TYPE_OP'},
	ED: {type: 'ED', dbType: 'TYPE_ED'},
	IN: {type: 'IN', dbType: 'TYPE_IN'},
	MV: {type: 'MV', dbType: 'TYPE_MV'},
	PV: {type: 'PV', dbType: 'TYPE_PV'},
	CM: {type: 'CM', dbType: 'TYPE_CM'},
	OT: {type: 'OT', dbType: 'TYPE_OT'},
	AMV: {type: 'AMV', dbType: 'TYPE_AMV'},
	LIVE: {type: 'LIVE', dbType: 'TYPE_LIVE'}
});

export const karaTypesArray = Object.freeze(Object.keys(karaTypes));

export function getTagTypeName(type: number): string {
	return Object.keys(tagTypes).find(t => tagTypes[t] === type);
}

export const tagTypes = Object.freeze({
	singer: 2,
	songtype: 3,
	creator: 4,
	lang: 5,
	author: 6,
	misc: 7,
	songwriter: 8,
	group: 9
});

/** Map used for database generation */
export const karaTypesMap: Readonly<Map<string, string>> = Object.freeze(new Map([
	[karaTypes.OP.type, 'TYPE_OP,3'],
	[karaTypes.ED.type, 'TYPE_ED,3'],
	[karaTypes.IN.type, 'TYPE_IN,3'],
	[karaTypes.MV.type, 'TYPE_MV,3'],
	[karaTypes.PV.type, 'TYPE_PV,3'],
	[karaTypes.CM.type, 'TYPE_CM,3'],
	[karaTypes.OT.type, 'TYPE_OT,3'],
	[karaTypes.AMV.type, 'TYPE_AMV,3'],
	[karaTypes.LIVE.type, 'TYPE_LIVE,3'],
]));

/** Extracting type from a string */
export function getType(types: string): string {
	return types.split(/\s+/).find(t => karaTypesArray.includes(t));
}

export const tags = [
	'3DS',
	'ANIME',
	'CREDITLESS',
	'COVER',
	'DUB',
	'DRAMA',
	'DREAMCAST',
	'DUO',
	'DS',
	'GAMECUBE',
	'HUMOR',
	'IDOL',
	'HARDMODE',
	'LONG',
	'MAGICALGIRL',
	'MECHA',
	'MOBAGE',
	'MOVIE',
	'N64',
	'OVA',
	'ONA',
	'PARODY',
	'PC',
	'PS2',
	'PS3',
	'PS4',
	'PSP',
	'PSV',
	'PSX',
	'R18',
	'REAL',
	'REMIX',
	'SATURN',
	'SEGACD',
	'SHOUJO',
	'SHOUNEN',
	'SOUNDONLY',
	'SPECIAL',
	'SPOIL',
	'SWITCH',
	'TOKU',
	'TVSHOW',
	'VIDEOGAME',
	'VN',
	'VOCALOID',
	'WII',
	'WIIU',
	'YAOI',
	'YURI',
	'XBOX360',
	'XBOXONE'
];