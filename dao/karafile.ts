/**
 * Tools used to manipulate .kara files : reading, extracting info, etc.
 * These functions do not resolve paths. Arguments should be resolved already.
 */

import { promises as fs } from 'fs';
import cloneDeep from 'lodash.clonedeep';
import {basename, resolve} from 'path';
import { v4 as uuidV4 } from 'uuid';

import { getRepo } from '../../services/repo';
import { getState } from '../../utils/state';
import { DownloadedStatus } from '../types/database/download';
import { Kara, KaraFileV4, MediaInfo } from '../types/kara';
import { resolvedPath,resolvedPathRepos } from '../utils/config';
import { bools, mediaFileRegexp, subFileRegexp, uuidRegexp } from '../utils/constants';
import { extractSubtitles, getMediaInfo } from '../utils/ffmpeg';
import { asyncExists, resolveFileInDirs } from '../utils/files';
import logger from '../utils/logger';
import { check, initValidators, testJSON } from '../utils/validators';

export async function getDataFromKaraFile(karafile: string, kara: KaraFileV4, silent = {media: false, lyrics: false}): Promise<Kara> {
	const state = getState();
	let error = false;
	let isKaraModified = false;
	let mediaFile: string;
	let downloadStatus: DownloadedStatus;
	const media = kara.medias[0];
	const lyrics = kara.medias[0].lyrics[0];
	const repo = getRepo(kara.data.repository);
	if (!repo) {
		if (state.opt.strict) {
			strictModeError(kara, `Kara ${karafile} has an unknown repository (${kara.data.repository}`);
			error = true;
		}
	}
	try {
		await resolveFileInDirs(basename(karafile), resolvedPathRepos('Karaokes', kara.data.repository));
	} catch(err) {
		if (state.opt.strict) {
			strictModeError(kara, `Kara ${karafile} is not in the right repository directory (not found in its repo directory). Check that its repository is correct.`);
			error = true;
		}
	}
	try {
		const mediaFiles = await resolveFileInDirs(media.filename, resolvedPathRepos('Medias', kara.data.repository));
		mediaFile = mediaFiles[0];
		downloadStatus = 'DOWNLOADED';
	} catch (err) {
		if (!silent.media) logger.debug(`Media file not found: ${media.filename}`, {service: 'Kara'});
		if (state.opt.strict) {
			strictModeError(kara, 'Media file is missing (double check that the repository is correct in the kara.json file and that the media file actually exists)');
			error = true;
		}
		downloadStatus = 'MISSING';
	}
	let lyricsFile = null;
	try {
		if (lyrics) {
			lyricsFile = lyrics.filename;
			await resolveFileInDirs(lyrics.filename, resolvedPathRepos('Lyrics', kara.data.repository));
		}
	} catch (err) {
		if (!silent.lyrics) logger.debug(`Lyrics file not found: ${lyricsFile}`, {service: 'Kara'});
		if (state.opt.strict) {
			strictModeError(kara, 'Lyrics file is missing (double check that the repository is correct in the kara.json file and that the lyrics file actually exists)');
			error = true;
		}
	}
	if (mediaFile && !state.opt.noMedia) {
		const mediaInfo = await extractMediaTechInfos(mediaFile, media.filesize);
		if (mediaInfo.error) {
			if (state.opt.strict && mediaInfo.size !== null) {
				strictModeError(kara, `Media data is wrong for: ${mediaFile}`);
				error = true;
			}
			if (state.opt.strict && mediaInfo.size === null) {
				strictModeError(kara, `Media file could not be read by ffmpeg: ${mediaFile}`);
				error = true;
			}
		} else if (mediaInfo.size) {
			if (state.opt.strict) {
				strictModeError(kara, `Media data is wrong for: ${mediaFile}`);
				error = true;
			}
			isKaraModified = true;
			kara.medias[0].filesize = mediaInfo.size;
			kara.medias[0].audiogain = mediaInfo.gain;
			kara.medias[0].duration = mediaInfo.duration;
			kara.medias[0].loudnorm = mediaInfo.loudnorm;
		}
	}
	return {
		kid: kara.data.kid,
		karafile: karafile,
		mediafile: kara.medias[0].filename,
		gain: kara.medias[0].audiogain,
		loudnorm: kara.medias[0].loudnorm,
		duration: kara.medias[0].duration,
		mediasize: kara.medias[0].filesize,
		subfile: lyricsFile,
		titles: kara.data.titles,
		comment: kara.data.comment,
		parents: kara.data.parents,
		modified_at: new Date(kara.data.modified_at),
		created_at: new Date(kara.data.created_at),
		error: error,
		isKaraModified: isKaraModified,
		year: kara.data.year,
		songorder: kara.data.songorder,
		misc: kara.data.tags.misc
			? kara.data.tags.misc.map((t) => {
				return { tid: t };
			  })
			: [],
		songtypes: kara.data.tags.songtypes
			? kara.data.tags.songtypes.map((t) => {
				return { tid: t };
			  })
			: [],
		singers: kara.data.tags.singers
			? kara.data.tags.singers.map((t) => {
				return { tid: t };
			  })
			: [],
		songwriters: kara.data.tags.songwriters
			? kara.data.tags.songwriters.map((t) => {
				return { tid: t };
			  })
			: [],
		creators: kara.data.tags.creators
			? kara.data.tags.creators.map((t) => {
				return { tid: t };
			  })
			: [],
		groups: kara.data.tags.groups
			? kara.data.tags.groups.map((t) => {
				return { tid: t };
			  })
			: [],
		authors: kara.data.tags.authors
			? kara.data.tags.authors.map((t) => {
				return { tid: t };
			  })
			: [],
		langs: kara.data.tags.langs
			? kara.data.tags.langs.map((t) => {
				return { tid: t };
			  })
			: [],
		families: kara.data.tags.families
			? kara.data.tags.families.map((t) => {
				return { tid: t };
			  })
			: [],
		genres: kara.data.tags.genres
			? kara.data.tags.genres.map((t) => {
				return { tid: t };
			  })
			: [],
		origins: kara.data.tags.origins
			? kara.data.tags.origins.map((t) => {
				return { tid: t };
			  })
			: [],
		series: kara.data.tags.series
			? kara.data.tags.series.map((t) => {
				return { tid: t };
			  })
			: [],
		platforms: kara.data.tags.platforms
			? kara.data.tags.platforms.map((t) => {
				return { tid: t };
			  })
			: [],
		versions: kara.data.tags.versions
			? kara.data.tags.versions.map((t) => {
				return { tid: t };
			  })
			: [],
		repository: kara.data.repository,
		download_status: downloadStatus,
		ignoreHooks: kara.data.ignoreHooks
	};
}

export async function extractMediaTechInfos(mediaFile: string, size?: number): Promise<MediaInfo> {
	// noInfo is when everything about the file is fine, sizes are the same, no need to fetch media info from ffmpeg.
	// errorInfo is when there's been an error (file not found, ffmpeg failed, etc.)
	const noInfo = {
		error: false,
		size: null,
		gain: null,
		loudnorm: null,
		duration: null,
		filename: mediaFile
	};
	const errorInfo = {
		error: true,
		size: null,
		gain: null,
		loudnorm: null,
		duration: null,
		filename: mediaFile
	};
	if (!getState().opt.noMedia) {
		let mediaStats: any;
		try {
			mediaStats = await fs.stat(mediaFile);
		} catch(err) {
			// Return early if file isn't found
			return errorInfo;
		}
		if (mediaStats.size !== size) {
			const mediaData = await getMediaInfo(mediaFile);
			if (mediaData.error) return errorInfo;
			return {
				error: false,
				size: mediaStats.size,
				gain: mediaData.gain,
				duration: mediaData.duration,
				loudnorm: mediaData.loudnorm,
				filename: mediaFile
			};
		} else {
			return noInfo;
		}
	} else {
		return noInfo;
	}
}

export async function writeKara(karafile: string, karaData: Kara): Promise<KaraFileV4> {
	const kara = cloneDeep(karaData);
	const infosToWrite: KaraFileV4 = formatKaraV4(kara);
	if (karaData.isKaraModified === false) return;
	// Since a karaoke has been modified, let's update its modified_at field
	const date = new Date();
	infosToWrite.data.modified_at = date.toISOString();
	karaData.modified_at = date;
	if (infosToWrite.data.songorder === null) delete infosToWrite.data.songorder;
	await fs.writeFile(karafile, JSON.stringify(infosToWrite, null, 2));
	return infosToWrite;
}

export async function parseKara(karaFile: string): Promise<KaraFileV4> {
	let data: string;
	try {
		data = await fs.readFile(karaFile, 'utf-8');
	} catch(err) {
		throw `Kara file ${karaFile} is not readable : ${err}`;
	}
	if (!data) throw `Kara file ${karaFile} is empty`;
	if (!testJSON(data)) throw `Kara file ${karaFile} is not valid JSON`;
	return JSON.parse(data);
}

export async function extractVideoSubtitles(videoFile: string, kid: string): Promise<string> {
	const extractFile = resolve(resolvedPath('Temp'), `kara_extract.${kid}.ass`);
	await extractSubtitles(videoFile, extractFile);
	return extractFile;
}

/**
 * Generate info to write in a .kara file from an object passed as argument by filtering out unnecessary fields and adding default values if needed.
 */
export function formatKaraV4(kara: Kara): KaraFileV4 {
	// Until we manage media version in the kara form, use this.
	const mediaVersionArr = kara.titles.eng.split(' ~ ');
	const mediaVersion = mediaVersionArr.length > 1
		? mediaVersionArr[mediaVersionArr.length - 1].replace(' Vers','')
		: 'Default';
	const lyricsArr = [];
	// In case subfile is empty (hardsub?)
	if (kara.subfile) lyricsArr.push({
		filename: kara.subfile,
		default: true,
		version: 'Default'
	});
	return {
		header: {
			version: 4,
			description: 'Karaoke Mugen Karaoke Data File'
		},
		medias: [
			{
				version: mediaVersion,
				filename: kara.mediafile,
				audiogain: kara.gain || 0,
				loudnorm: kara.loudnorm || null,
				filesize: kara.mediasize || 0,
				duration: kara.duration || 0,
				default: true,
				lyrics: lyricsArr
			}
		],
		data: {
			comment: kara.comment || undefined,			
			created_at: typeof kara.created_at === 'object' ? kara.created_at.toISOString() : kara.created_at,
			ignoreHooks: kara.ignoreHooks || undefined,
			kid: kara.kid || uuidV4(),
			modified_at: typeof kara.modified_at === 'object' ? kara.modified_at.toISOString() : kara.modified_at,
			parents: kara.parents || [],			
			repository: kara.repository,
			songorder: kara.songorder ? +kara.songorder : null,
			tags: {
				authors: kara.authors && kara.authors.length > 0 ? kara.authors.map(t => t.tid).sort() : undefined,
				creators: kara.creators && kara.creators.length > 0 ? kara.creators.map(t => t.tid).sort() : undefined,
				families: kara.families && kara.families.length > 0 ? kara.families.map(t => t.tid).sort() : undefined,
				genres: kara.genres && kara.genres.length > 0 ? kara.genres.map(t => t.tid).sort() : undefined,
				groups: kara.groups && kara.groups.length > 0 ? kara.groups.map(t => t.tid).sort() : undefined,
				langs: kara.langs && kara.langs.length > 0 ? kara.langs.map(t => t.tid).sort() : undefined,
				misc: kara.misc && kara.misc.length > 0 ? kara.misc.map(t => t.tid).sort() : undefined,
				origins: kara.origins && kara.origins.length > 0 ? kara.origins.map(t => t.tid).sort() : undefined,
				platforms: kara.platforms && kara.platforms.length > 0 ? kara.platforms.map(t => t.tid).sort() : undefined,
				series: kara.series && kara.series.length > 0 ? kara.series.map(t => t.tid).sort() : undefined,
				singers: kara.singers && kara.singers.length > 0 ? kara.singers.map(t => t.tid).sort() : undefined,
				songtypes: kara.songtypes && kara.songtypes.length > 0 ? kara.songtypes.map(t => t.tid).sort() : undefined,
				songwriters: kara.songwriters && kara.songwriters.length > 0 ? kara.songwriters.map(t => t.tid).sort() : undefined,
				versions: kara.versions && kara.versions.length > 0 ? kara.versions.map(t => t.tid).sort() : undefined,
			},
			titles: kara.titles,
			title: kara.titles.eng || kara.titles.qjr,
			year: +kara.year,			
		}
	};
}

export const mediaConstraints = {
	filename: {
		presence: {allowEmpty: false},
		format: mediaFileRegexp
	},
	size: {numericality: {onlyInteger: true, greaterThanOrEqualTo: 0}},
	audiogain: {numericality: true},
	loudnorm: {presence: {allowEmpty: true}},
	duration: {numericality: {onlyInteger: true, greaterThanOrEqualTo: 0}},
	name: {presence: {allowEmpty: false}},
	default: {inclusion: bools},
	lyrics: {karaLyricsValidator: true}
};

export const lyricsConstraints = {
	filename: {
		presence: {allowEmpty: false},
		format: subFileRegexp
	},
	name: {presence: {allowEmpty: false}},
	default: {presence: true}
};

const karaConstraintsV4 = {
	'header.version': {semverInteger: 4},
	'header.description': {inclusion: ['Karaoke Mugen Karaoke Data File']},
	medias: {karaMediasValidator: true},
	'data.titles': {presence: {allowEmpty: false}},
	'data.repository': {presence: {allowEmpty: true}},
	'data.tags.songtypes': {presence: true, arrayValidator: true},
	'data.tags.singers': {arrayValidator: true},
	'data.tags.songwriters': {arrayValidator: true},
	'data.tags.creators': {arrayValidator: true},
	'data.tags.authors': {arrayValidator: true},
	'data.tags.misc': {arrayValidator: true},
	'data.tags.langs': {presence: true, uuidArrayValidator: true},
	'data.tags.platforms': {arrayValidator: true},
	'data.tags.origins': {arrayValidator: true},
	'data.tags.genres': {arrayValidator: true},
	'data.tags.families': {arrayValidator: true},
	'data.tags.groups': {arrayValidator: true},
	'data.tags.versions': {arrayValidator: true},
	'data.songorder': {numericality: true},
	'data.year': {integerValidator: true},
	'data.kid': {presence: true, format: uuidRegexp},
	'data.created_at': {presence: {allowEmpty: false}},
	'data.modified_at': {presence: {allowEmpty: false}},
	'data.ignoreHooks': {boolUndefinedValidator: true}
};

export function karaDataValidationErrors(karaData: KaraFileV4) {
	initValidators();
	return check(karaData, karaConstraintsV4);
}

export function verifyKaraData(karaData: KaraFileV4) {
	// Version 3 is considered deprecated, so let's throw an error.
	if (karaData.header.version < 4) throw 'Karaoke version 3 or lower is deprecated';
	const validationErrors = karaDataValidationErrors(karaData);
	if (validationErrors) {
		throw `Karaoke data is not valid: ${JSON.stringify(validationErrors)}`;
	}
}

export async function getASS(sub: string, repo: string): Promise<string> {
	const subfile = await resolveFileInDirs(sub, resolvedPathRepos('Lyrics', repo));
	if (await asyncExists(subfile[0])) return fs.readFile(subfile[0], 'utf-8');
	throw 'Subfile not found';
}

function strictModeError(karaData: KaraFileV4, data: string) {
	logger.error(`STRICT MODE ERROR : ${data} - Kara data read : ${JSON.stringify(karaData)}`, {service: 'Kara'});
}
