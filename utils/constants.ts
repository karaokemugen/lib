/*
 * Constants for KM (tags, langs, types, etc.).
 */

/** Regexps for validation. */
export const uuidRegexp = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
export const mediaFileRegexp = '^.+\\.(avi|mkv|mp4|webm|mov|wmv|mpg|ogg|m4a|mp3|wav|flac|m2ts)$';
export const imageFileRegexp = '^.+\\.(jpg|jpeg|png|gif)$';
export const subFileRegexp = '^.+\\.ass$';
export const audioFileRegexp = '^.+\\.(ogg|m4a|mp3|wav|flac)$';
export const imageFileTypes = ['jpg', 'jpeg', 'png', 'gif'];
export const bools = [true, false, 'true', 'false', undefined];

export function getTagTypeName(type: number): string {
	return Object.keys(tagTypes).find(t => tagTypes[t] === type);
}

export const tagTypes = Object.freeze({
	series: 1,
	singers: 2,
	songtypes: 3,
	creators: 4,
	langs: 5,
	authors: 6,
	misc: 7,
	songwriters: 8,
	groups: 9,
	families: 10,
	origins: 11,
	genres: 12,
	platforms: 13
});

