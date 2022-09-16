/*
 * Constants for KM (tags, langs, types, etc.).
 */

import { TagType, TagTypeNum } from '../types/tag';

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
		'm4v',
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
		'lrc',
		'vtt'
	],
	mpvlyrics: [
		'ass',
		'jss',
		'lrc',
		'mpl2',
		'rt',
		'smi',
		'srt',
		'stl',
		'sub',
		'vtt'
	],
	pictures: [
		'jpg',
		'jpeg',
		'png',
		'gif',
		'webp',
		'apng',
		'jng'
	]
};

/** Regexps for validation. */
export const uuidRegexp =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const uuidPlusTypeRegexp =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}~[0-9]+$/;
export const md5Regexp = '^[a-f0-9]{32}$';
export const mediaFileRegexp = new RegExp(
	`^.+\\.(${supportedFiles.video.concat(supportedFiles.audio).join('|')})$`
);
export const imageFileRegexp = new RegExp(`^.+\\.(${supportedFiles.pictures.join('|')})$`);
export const backgroundFileRegexp = new RegExp(
	`^.+\\.(${supportedFiles.video.concat(supportedFiles.pictures).join('|')})$`
);
export const subFileRegexp = new RegExp(
	`^.+\\.(${supportedFiles.lyrics.join('|')})$`
);
export const audioFileRegexp = new RegExp(
	`^.+\\.(${supportedFiles.audio.join('|')})$`
);
export const hostnameRegexp = /^[a-zA-Z0-9-.]+\.[a-zA-Z0-9-]+$/;
export const asciiRegexp = /^[\u0000-\u007F]+$/u;
export const imageFileTypes = ['jpg', 'jpeg', 'png', 'gif'];
export const bools = [true, false, 'true', 'false', undefined];

export function getTagTypeName(type: TagTypeNum): TagType {
	return (<TagType[]>Object.keys(tagTypes)).find(
		t => tagTypes[t] === type
	) as TagType;
}

export const userTypes = Object.freeze({
	admin: 0,
	maintainer: 0.5,
	contributor: 0.6,
	user: 1,
	guest: 2,
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
	versions: 14,
	warnings: 15,
	collections: 16,
	singergroups: 17,
	franchises: 18,
});

export const myanimelistStatusWatching = 1;
export const myanimelistStatusCompleted = 2;
export const myanimelistStatusOnHold = 3;
export const myanimelistStatusDropped = 4;
export const myanimelistStatusPlanToWatch = 5;
