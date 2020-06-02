/**
 * Tools used to manipulate .kara files : reading, extracting info, etc.
 * These functions do not resolve paths. Arguments should be resolved already.
 */

import {subFileRegexp, uuidRegexp, mediaFileRegexp, bools, tagTypes} from '../utils/constants';
import { v4 as uuidV4 } from 'uuid';
import logger from '../utils/logger';
import {resolve} from 'path';
import {checksum, asyncReadFile, asyncStat, asyncWriteFile, resolveFileInDirs, asyncExists} from '../utils/files';
import {resolvedPathTemp, resolvedPathRepos} from '../utils/config';
import {extractSubtitles, getMediaInfo} from '../utils/ffmpeg';
import {getState} from '../../utils/state';
import { KaraFileV4, Kara, MediaInfo, KaraList } from '../types/kara';
import {testJSON, check, initValidators} from '../utils/validators';
import cloneDeep from 'lodash.clonedeep';

function strictModeError(karaData: KaraFileV4, data: string) {
	logger.error(`[Kara] STRICT MODE ERROR : ${data} - Kara data read : ${JSON.stringify(karaData)}`);
}



export async function getDataFromKaraFile(karafile: string, kara: KaraFileV4): Promise<Kara> {
	const state = getState();
	let error = false;
	let isKaraModified = false;
	let mediaFile: string;
	let subchecksum: string;
	const media = kara.medias[0];
	const lyrics = kara.medias[0].lyrics[0];
	try {
		const mediaFiles = await resolveFileInDirs(media.filename, resolvedPathRepos('Medias', kara.data.repository));
		mediaFile = mediaFiles[0];
	} catch (err) {
		logger.debug(`[Kara] Media file not found : ${media.filename}`);
		if (state.opt.strict) {
			strictModeError(kara, 'mediafile');
			error = true;
		}
	}
	let lyricsFile = null;
	try {
		if (lyrics) {
			lyricsFile = lyrics.filename;
			const lyricsPaths = await resolveFileInDirs(lyricsFile, resolvedPathRepos('Lyrics', kara.data.repository));
			const lyricsPath = lyricsPaths[0];
			subchecksum = await extractAssInfos(lyricsPath);
			if (subchecksum !== lyrics.subchecksum) {
				if (state.opt.strict) {
					strictModeError(kara, `Sub checksum is not valid for ${lyricsFile}`);
					error = true;
				}
				isKaraModified = true;
			}
			lyrics.subchecksum = subchecksum;
		}
	} catch (err) {
		logger.debug(`[Kara] Lyrics file not found : ${lyricsFile}`);
		if (state.opt.strict) {
			strictModeError(kara, 'lyricsfile');
			error = true;
		}
	}
	if (mediaFile && !state.opt.noMedia) {
		const mediaInfo = await extractMediaTechInfos(mediaFile, media.filesize);
		if (mediaInfo.error) {
			if (state.opt.strict && mediaInfo.size !== null) {
				strictModeError(kara, `Media data is wrong for : ${mediaFile}`);
				error = true;
			}
			if (state.opt.strict && mediaInfo.size === null) {
				strictModeError(kara, `Media file could not be read by ffmpeg : ${mediaFile}`);
				error = true;
			}
		} else if (mediaInfo.size) {
			isKaraModified = true;
			kara.medias[0].filesize = mediaInfo.size;
			kara.medias[0].audiogain = mediaInfo.gain;
			kara.medias[0].duration = mediaInfo.duration;
		}
	}
	return {
		kid: kara.data.kid,
		karafile: karafile,
		mediafile: kara.medias[0].filename,
		mediagain: kara.medias[0].audiogain,
		mediaduration: kara.medias[0].duration,
		mediasize: kara.medias[0].filesize,
		subfile: lyricsFile,
		subchecksum: subchecksum || null,
		title: kara.data.title,
		modified_at: new Date(kara.data.modified_at),
		created_at: new Date(kara.data.created_at),
		error: error,
		isKaraModified: isKaraModified,
		year: kara.data.year,
		songorder: kara.data.songorder,
		misc: kara.data.tags.misc ? kara.data.tags.misc.map(t => {
			return {tid: t};
		}) : [],
		songtypes: kara.data.tags.songtypes ? kara.data.tags.songtypes.map(t => {
			return {tid: t};
		}) : [],
		singers: kara.data.tags.singers ? kara.data.tags.singers.map(t => {
			return {tid: t};
		}) : [],
		songwriters: kara.data.tags.songwriters ? kara.data.tags.songwriters.map(t => {
			return {tid: t};
		}) : [],
		creators: kara.data.tags.creators ? kara.data.tags.creators.map(t => {
			return {tid: t};
		}) : [],
		groups: kara.data.tags.groups ? kara.data.tags.groups.map(t => {
			return {tid: t};
		}) : [],
		authors: kara.data.tags.authors ? kara.data.tags.authors.map(t => {
			return {tid: t};
		}) : [],
		langs: kara.data.tags.langs ? kara.data.tags.langs.map(t => {
			return {tid: t};
		}) : [],
		families: kara.data.tags.families ? kara.data.tags.families.map(t => {
			return {tid: t};
		}) : [],
		genres: kara.data.tags.genres ? kara.data.tags.genres.map(t => {
			return {tid: t};
		}) : [],
		origins: kara.data.tags.origins ? kara.data.tags.origins.map(t => {
			return {tid: t};
		}) : [],
		series: kara.data.tags.series ? kara.data.tags.series.map(t => {
			return {tid: t};
		}) : [],
		platforms: kara.data.tags.platforms ? kara.data.tags.platforms.map(t => {
			return {tid: t};
		}) : [],
		repository: kara.data.repository
	};
}

export async function extractAssInfos(subFile: string): Promise<string> {
	let ass: string;
	let subChecksum: string;
	if (subFile) {
		ass = await asyncReadFile(subFile, {encoding: 'utf8'});
		ass = ass.replace(/\r/g, '');
		subChecksum = checksum(ass);
	} else {
		throw 'Subfile could not be read';
	}
	return subChecksum;
}

export async function extractMediaTechInfos(mediaFile: string, size?: number): Promise<MediaInfo> {
	// noInfo is when everything about the file is fine, sizes are the same, no need to fetch media info from ffmpeg.
	// errorInfo is when there's been an error (file not found, ffmpeg failed, etc.)
	const noInfo = {
		error: false,
		size: null,
		gain: null,
		duration: null,
		filename: mediaFile
	};
	const errorInfo = {
		error: true,
		size: null,
		gain: null,
		duration: null,
		filename: mediaFile
	};
	if (!getState().opt.noMedia) {
		let mediaStats: any;
		try {
			mediaStats = await asyncStat(mediaFile);
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
	await asyncWriteFile(karafile, JSON.stringify(infosToWrite, null, 2));
	return infosToWrite;
}

export async function parseKara(karaFile: string): Promise<KaraFileV4> {
	let data: string;
	try {
		data = await asyncReadFile(karaFile, 'utf-8');
	} catch(err) {
		throw `Kara file ${karaFile} is not readable : ${err}`;
	}
	if (!data) throw `Kara file ${karaFile} is empty`;
	if (!testJSON(data)) throw `Kara file ${karaFile} is not valid JSON`;
	return JSON.parse(data);
}

export async function extractVideoSubtitles(videoFile: string, kid: string): Promise<string> {
	const extractFile = resolve(resolvedPathTemp(), `kara_extract.${kid}.ass`);
	try {
		await extractSubtitles(videoFile, extractFile);
		return extractFile;
	} catch (err) {
		throw err;
	}
}

export async function replaceTagInKaras(oldTID1: string, oldTID2: string, newTID: string, karas: KaraList): Promise<string[]> {
	logger.info(`[Kara] Replacing tag ${oldTID1} and ${oldTID2} by ${newTID} in .kara.json files`);
	const modifiedKaras:string[] = [];
	for (const kara of karas.content) {
		let modifiedKara = false;
		const karaPath = (await resolveFileInDirs(kara.karafile, resolvedPathRepos('Karas', kara.repository)))[0];
		const karaData = await parseKara(karaPath);
		karaData.data.modified_at = new Date().toISOString();
		for (const type of Object.keys(tagTypes)) {
			if (karaData.data.tags[type]?.includes(oldTID1) || karaData.data.tags[type]?.includes(oldTID2)) {
				karaData.data.tags[type] = karaData.data.tags[type].filter((t: any) => t !== oldTID1 && t !== oldTID2);
				karaData.data.tags[type].push(newTID);
				modifiedKara = true;
			}
		}
		if (modifiedKara) {
			await asyncWriteFile(karaPath, JSON.stringify(karaData, null, 2));
			modifiedKaras.push(karaPath);
		}
	}
	return modifiedKaras;
}

/**
 * Generate info to write in a .kara file from an object passed as argument by filtering out unnecessary fields and adding default values if needed.
 */
export function formatKaraV4(kara: Kara): KaraFileV4 {
	// Until we manage media version in the kara form, use this.
	const mediaVersionArr = kara.title.split(' ~ ');
	let mediaVersion = mediaVersionArr.length > 1
		? mediaVersionArr[mediaVersionArr.length - 1].replace(' Vers','')
		: 'Default';
	const lyricsArr = [];
	// In case subfile is empty (hardsub?)
	if (kara.subfile) lyricsArr.push({
		filename: kara.subfile,
		default: true,
		version: 'Default',
		subchecksum: kara.subchecksum
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
				audiogain: kara.mediagain || 0,
				filesize: kara.mediasize || 0,
				duration: kara.mediaduration || 0,
				default: true,
				lyrics: lyricsArr
			}
		],
		data: {
			created_at: typeof kara.created_at === 'object' ? kara.created_at.toISOString() : kara.created_at,
			kid: kara.kid || uuidV4(),
			modified_at: typeof kara.modified_at === 'object' ? kara.modified_at.toISOString() : kara.modified_at,
			repository: kara.repository,
			sids: kara.series ? kara.series.map(t => t.tid) : null,
			songorder: kara.songorder,
			tags: {
				authors: kara.authors.length > 0 ? kara.authors.map(t => t.tid) : undefined,
				creators: kara.creators.length > 0 ? kara.creators.map(t => t.tid) : undefined,
				families: kara.families.length > 0 ? kara.families.map(t => t.tid) : undefined,
				genres: kara.genres.length > 0 ? kara.genres.map(t => t.tid) : undefined,
				groups: kara.groups.length > 0 ? kara.groups.map(t => t.tid) : undefined,
				langs: kara.langs.length > 0 ? kara.langs.map(t => t.tid) : undefined,
				misc: kara.misc.length > 0 ? kara.misc.map(t => t.tid) : undefined,
				origins: kara.origins.length > 0 ? kara.origins.map(t => t.tid) : undefined,
				platforms: kara.platforms.length > 0 ? kara.platforms.map(t => t.tid) : undefined,
				series: kara.series.length > 0 ? kara.series.map(t => t.tid) : undefined,
				singers: kara.singers.length > 0 ? kara.singers.map(t => t.tid) : undefined,
				songtypes: kara.songtypes.length > 0 ? kara.songtypes.map(t => t.tid) : undefined,
				songwriters: kara.songwriters.length > 0 ? kara.songwriters.map(t => t.tid) : undefined,
			},
			title: kara.title,
			year: kara.year
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
	default: {presence: true},
	subchecksum: {presence: true}
};

const karaConstraintsV4 = {
	'header.version': {semverInteger: 4},
	'header.description': {inclusion: ['Karaoke Mugen Karaoke Data File']},
	medias: {karaMediasValidator: true},
	'data.title': {presence: {allowEmpty: false}},
	'data.repository': {presence: {allowEmpty: true}},
	'data.tags.songtypes': {presence: true, arrayValidator: true},
	'data.sids': {arrayValidator: true},
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
	'data.songorder': {numericality: true},
	'data.year': {integerValidator: true},
	'data.kid': {presence: true, format: uuidRegexp},
	'data.created_at': {presence: {allowEmpty: false}},
	'data.modified_at': {presence: {allowEmpty: false}},
};

export function karaDataValidationErrors(karaData: KaraFileV4): {} {
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
	if (await asyncExists(subfile[0])) return await asyncReadFile(subfile[0], 'utf-8');
	throw 'Subfile not found';
}
