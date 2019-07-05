/**
 * Tools used to manipulate .kara files : reading, extracting info, etc.
 * These functions do not resolve paths. Arguments should be resolved already.
 */

import {now} from '../utils/date';
import {karaTypes, subFileRegexp, uuidRegexp, mediaFileRegexp, bools} from '../utils/constants';
import uuidV4 from 'uuid/v4';
import logger from '../utils/logger';
import {resolve} from 'path';
import {parse as parseini, stringify} from 'ini';
import {checksum, asyncReadFile, asyncStat, asyncWriteFile, resolveFileInDirs, asyncReadDirFilter} from '../utils/files';
import {resolvedPathKaras, resolvedPathSubs, resolvedPathTemp, resolvedPathMedias, getConfig} from '../utils/config';
import {extractSubtitles, getMediaInfo} from '../utils/ffmpeg';
import {getState} from '../../utils/state';
import { KaraFileV3, KaraFileV4, Kara, MediaInfo, KaraList } from '../types/kara';
import {testJSON, check, initValidators} from '../utils/validators';
import parallel from 'async-await-parallel';
import { Config } from '../../types/config';
import { getTags } from '../../services/tag';

function strictModeError(karaData: KaraFileV4, data: string) {
	logger.error(`[Kara] STRICT MODE ERROR : ${data} - Kara data read : ${JSON.stringify(karaData,null,2)}`);
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
		mediaFile = await resolveFileInDirs(media.filename, resolvedPathMedias());
	} catch (err) {
		logger.debug(`[Kara] Media file not found : ${media.filename}`);
		if (state.opt.strict) strictModeError(kara, 'mediafile');
	}
	let lyricsFile = null;
	try {
		if (lyrics) {
			lyricsFile = lyrics.filename;
			const lyricsPath = await resolveFileInDirs(lyricsFile, resolvedPathSubs());
			subchecksum = await extractAssInfos(lyricsPath);
			if (subchecksum !== lyrics.subchecksum) {
				if (state.opt.strict) strictModeError(kara, `Sub checksum is not valid for ${lyricsFile}`);
				isKaraModified = true;
			}
			lyrics.subchecksum = subchecksum;
		}
	} catch (err) {
		logger.debug(`[Kara] Lyrics file not found : ${lyricsFile}`);
		if (state.opt.strict) strictModeError(kara, 'lyricsfile');
	}
	if (mediaFile && !state.opt.noMedia) {
		const mediaInfo = await extractMediaTechInfos(mediaFile, media.filesize);
		if (mediaInfo.error) {
			if (state.opt.strict && mediaInfo.size != null) {
				strictModeError(kara, `Media data is wrong for : ${mediaFile}`);
			}
			if (state.opt.strict && mediaInfo.size === null) {
				strictModeError(kara, `Media file could not be read by ffmpeg : ${mediaFile}`);
			}
			error = true;
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
		datemodif: new Date(kara.data.modified_at),
		dateadded: new Date(kara.data.created_at),
		error: error,
		isKaraModified: isKaraModified,
		year: kara.data.year,
		order: kara.data.songorder,
		sids: kara.data.sids,
		misc: kara.data.tags.misc,
		songtypes: kara.data.tags.songtypes,
		singers: kara.data.tags.singers,
		songwriters: kara.data.tags.songwriters,
		creators: kara.data.tags.creators,
		groups: kara.data.tags.groups,
		authors: kara.data.tags.authors,
		langs: kara.data.tags.langs,
		families: kara.data.tags.families,
		genres: kara.data.tags.genres,
		origins: kara.data.tags.origins,
		platforms: kara.data.tags.platforms,
		repo: kara.data.repository
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
		throw 'Subfile is empty';
	}
	return subChecksum;
}

export async function extractMediaTechInfos(mediaFile: string, size: number): Promise<MediaInfo> {
	// noInfo is when everything about the file is fine, sizes are the same, no need to fetch media info from ffmpeg.
	// errorInfo is when there's been an error (file not found, ffmpeg failed, etc.)
	const noInfo = {
		error: false,
		size: null,
		gain: null,
		duration: null
	};
	const errorInfo = {
		size: null,
		error: true,
		gain: null,
		duration: null
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
				duration: mediaData.duration
			};
		} else {
			return noInfo;
		}
	} else {
		return noInfo;
	}
}

export async function writeKara(karafile: string, karaData: Kara): Promise<KaraFileV4> {
	const infosToWrite: KaraFileV4 = formatKaraV4(karaData);
	if (karaData.isKaraModified === false) return;
	// Since a karaoke has been modified, let's update its modified_at field
	const date = new Date();
	infosToWrite.data.modified_at = date.toString();
	karaData.datemodif = date;
	if (infosToWrite.data.songorder === null) infosToWrite.data.songorder = undefined;
	await asyncWriteFile(karafile, JSON.stringify(infosToWrite, null, 2));
	return infosToWrite;
}

export async function writeKaraV3(karafile: string, karaData: Kara): Promise<KaraFileV3> {
	const infosToWrite: KaraFileV3 = formatKaraV3(karaData);
	if (karaData.isKaraModified === false) return;
	// Replace all TIDs by their names
	const tags = await getTags({});
	for (const type of Object.keys(karaTypes)) {
		if (karaData[type]) karaData[type].forEach((tid: string, i: number) => {
			const tag = tags.content.find(t => t.tid === tid);
			karaData[type][i] = tag.name;
		})
	}
	infosToWrite.datemodif = now(true);
	karaData.datemodif = new Date();
	await asyncWriteFile(karafile, stringify(infosToWrite));
	return infosToWrite;
}


export async function parseKara(karaFile: string): Promise<KaraFileV4> {
	let data: string;
	try {
		data = await asyncReadFile(karaFile, 'utf-8');
	} catch(err) {
		throw `Kara file ${karaFile} is not readable : ${err}`;
	}
	if (!data) throw `Kara file ${karaFile} is empty`
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

export async function removeSerieInKaras(sid: string, karas: KaraList) {
	logger.info(`[Kara] Removing serie ${sid} in .kara files`);
	const karasWithSerie = karas.content.filter((k: any) => {
		if (k.sid && k.sid.includes(sid)) return k.karafile;
	})
	if (karasWithSerie.length > 0) logger.info(`[Kara] Removing in ${karasWithSerie.length} files`);
	for (const karaWithSerie of karasWithSerie) {
		logger.info(`[Kara] Removing in ${karaWithSerie.karafile}...`);
		const karaPath = await resolveFileInDirs(karaWithSerie.karafile, resolvedPathKaras());
		const kara = await parseKara(karaPath);
		kara.data.sids = kara.data.sids.filter((s: any) => s !== sid);
		kara.data.modified_at = new Date().toString();
		await asyncWriteFile(karaPath, JSON.stringify(kara, null, 2));
	}
}

/**
 * Generate info to write in a .kara file from an object passed as argument by filtering out unnecessary fields and adding default values if needed.
 */
export function formatKaraV4(kara: Kara): KaraFileV4 {
	// Until we manage media version in the kara form, use this.
	const mediaVersionArr = kara.title.split(' ~ ');
	let mediaVersion = 'Default';
	if (mediaVersionArr.length > 1) mediaVersion = mediaVersionArr[mediaVersionArr.length - 1].replace(' Vers','');
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
			created_at: kara.dateadded.toString(),
			kid: kara.kid || uuidV4(),
			modified_at: kara.datemodif.toString(),
			repository: kara.repo,
			sids: kara.sids,
			songorder: kara.order,
			tags: {
				authors: kara.authors,
				creators: kara.creators,
				families: kara.families,
				genres: kara.genres,
				groups: kara.groups,
				langs: kara.langs,
				misc: kara.misc,
				origins: kara.origins,
				platforms: kara.platforms,
				singers: kara.singers,
				songtypes: kara.songtypes,
				songwriters: kara.songwriters			},
			title: kara.title,
			year: kara.year
		}
	}
}

export function formatKaraV3(karaData: Kara): KaraFileV3 {
	return {
		mediafile: karaData.mediafile || '',
		subfile: karaData.subfile || 'dummy.ass',
		subchecksum: karaData.subchecksum || '',
		title: karaData.title || '',
		series: karaData.series.join(',') || '',
		type: karaData.songtypes[0],
		order: karaData.order || '',
		year: karaData.year || '',
		singer: karaData.singers.join(',') || '',
		tags: karaData.misc.join(',') || '',
		groups: karaData.groups.join(',') || '',
		songwriter: karaData.songwriters.join(',') || '',
		creator: karaData.creators.join(',') || '',
		author: karaData.authors.join(',') || '',
		lang: karaData.langs.join(',') || 'und',
		KID: karaData.kid || uuidV4(),
		dateadded: Math.floor((karaData.dateadded.getTime()-karaData.dateadded.getTimezoneOffset()*60000) / 1000) || now(true),
        datemodif: Math.floor((karaData.datemodif.getTime()-karaData.datemodif.getTimezoneOffset()*60000) / 1000) || now(true),
		mediasize: karaData.mediasize || 0,
		mediagain: karaData.mediagain || 0,
		mediaduration: karaData.mediaduration || 0,
		version: karaData.version || 3
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
	'header.version': {numericality: {onlyInteger: true, equalTo: 4}},
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


export async function validateV3(appPath: string) {
	const conf = getConfig();
	const karaPath = resolve(appPath, conf.System.Path.Karas[0], '../karas');
	const karaFiles = await asyncReadDirFilter(karaPath, '.kara');
	const karaPromises = [];
	for (const karaFile of karaFiles) {
		karaPromises.push(() => validateKaraV3(karaPath, karaFile, conf, appPath));
	}
	await parallel(karaPromises, 32);
}

async function validateKaraV3(karaPath: string, karaFile: string, conf: Config, appPath: string) {
	const karaData = await asyncReadFile(resolve(karaPath, karaFile), 'utf-8');
	const kara = parseini(karaData);
	let subchecksum = kara.subchecksum;
	if (kara.subfile !== 'dummy.ass') {
		const subFile = resolve(appPath, conf.System.Path.Lyrics[0], kara.subfile);
		kara.subchecksum = await extractAssInfos(subFile);
	}
	const mediaInfo = await extractMediaTechInfos(resolve(appPath, conf.System.Path.Medias[0], kara.mediafile), +kara.mediasize);
	if (mediaInfo.error && !getState().opt.noMedia) {
		throw `Error reading file ${kara.mediafile}`;
	} else if (mediaInfo.size) {
		kara.mediasize = mediaInfo.size;
		kara.mediagain = mediaInfo.gain;
		kara.mediaduration = mediaInfo.duration;
	}
	if (mediaInfo.size || subchecksum !== kara.subchecksum) await asyncWriteFile(resolve(karaPath, karaFile), stringify(kara));
}

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

/** Only MV or LIVE types don't have to have a series filled. */
export function serieRequired(karaType: string): boolean {
	return karaType !== karaTypes.MV.type && karaType !== karaTypes.LIVE.type;
}