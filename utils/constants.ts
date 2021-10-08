/*
 * Constants for KM (tags, langs, types, etc.).
 */

export const supportedFiles = {
	video: [
		'avi',
		'mkv',
		'mp4',
		'webm',
		'mov',
		'wmv',
		'mpg',
		'm2ts',
		'rmvb',
		'ts',
		'm4v'
	],
	audio: [
		'ogg',
		'm4a',
		'mp3',
		'wav',
		'flac',
		'mid'
	],
	lyrics: [
		'ass',
		'srt',
		'kar',
		'txt',
		'kfn',
		'lrc'
	]
};

/** Regexps for validation. */
export const uuidRegexp = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
export const uuidPlusTypeRegexp = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}~[0-9]+$';
export const md5Regexp = '^[a-f0-9]{32}$';
export const mediaFileRegexp = `^.+\\.(${supportedFiles.video.concat(supportedFiles.audio).join('|')})$`;
export const imageFileRegexp = '^.+\\.(jpg|jpeg|png|gif)$';
export const subFileRegexp = `^.+\\.(${supportedFiles.lyrics.join('|')})$`;
export const audioFileRegexp = `^.+\\.(${supportedFiles.audio.join('|')})$`;
export const hostnameRegexp = /^[a-zA-Z0-9-.]+\.[a-zA-Z0-9-]+$/;
export const asciiRegexp = /^[\u0000-\u007F]+$/u;
export const imageFileTypes = ['jpg', 'jpeg', 'png', 'gif'];
export const bools = [true, false, 'true', 'false', undefined];

export function getTagTypeName(type: number): string {
	return Object.keys(tagTypes).find(t => tagTypes[t] === type);
}

export const userTypes = Object.freeze({
	admin: 0,
	user: 1,
	guest: 2
});

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
	platforms: 13,
	versions: 14
});

