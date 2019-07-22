/**
 * Tools used to manipulate .kara files : reading, extracting info, etc.
 * These functions do not resolve paths. Arguments should be resolved already.
 */

import {now} from '../utils/date';
import {subFileRegexp, uuidRegexp, mediaFileRegexp, bools, tagTypes} from '../utils/constants';
import uuidV4 from 'uuid/v4';
import logger from '../utils/logger';
import {resolve} from 'path';
import {parse as parseini, stringify} from 'ini';
import {checksum, asyncReadFile, asyncStat, asyncWriteFile, resolveFileInDirs, asyncReadDirFilter} from '../utils/files';
import {resolvedPathKaras, resolvedPathSubs, resolvedPathTemp, resolvedPathMedias, getConfig} from '../utils/config';
import {extractSubtitles, getMediaInfo} from '../utils/ffmpeg';
import {getState} from '../../utils/state';
import { KaraFileV3, KaraFileV4, Kara, MediaInfo, KaraList, KaraTag } from '../types/kara';
import {testJSON, check, initValidators} from '../utils/validators';
import parallel from 'async-await-parallel';
import { Config } from '../../types/config';
import { getTags } from '../../services/tag';
import cloneDeep from 'lodash.clonedeep';

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
	try {
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
		order: kara.data.songorder,
		sids: kara.data.sids,
		misc: kara.data.tags.misc ? kara.data.tags.misc.map(t => {return {tid: t}}) : [],
		songtypes: kara.data.tags.songtypes ? kara.data.tags.songtypes.map(t => {return {tid: t}}) : [],
		singers: kara.data.tags.singers ? kara.data.tags.singers.map(t => {return {tid: t}}) : [],
		songwriters: kara.data.tags.songwriters ? kara.data.tags.songwriters.map(t => {return {tid: t}}) : [],
		creators: kara.data.tags.creators ? kara.data.tags.creators.map(t => {return {tid: t}}) : [],
		groups: kara.data.tags.groups ? kara.data.tags.groups.map(t => {return {tid: t}}) : [],
		authors: kara.data.tags.authors ? kara.data.tags.authors.map(t => {return {tid: t}}) : [],
		langs: kara.data.tags.langs ? kara.data.tags.langs.map(t => {return {tid: t}}) : [],
		families: kara.data.tags.families ? kara.data.tags.families.map(t => {return {tid: t}}) : [],
		genres: kara.data.tags.genres ? kara.data.tags.genres.map(t => {return {tid: t}}) : [],
		origins: kara.data.tags.origins ? kara.data.tags.origins.map(t => {return {tid: t}}) : [],
		platforms: kara.data.tags.platforms ? kara.data.tags.platforms.map(t => {return {tid: t}}) : [],
		repo: kara.data.repository
	};
	} catch(err) {
		console.log(err);
	}
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

export async function writeKara(karafile: string, karaData: Kara): Promise<KaraFileV4|any> {
	const infosToWrite: KaraFileV4 = formatKaraV4(karaData);
	if (karaData.isKaraModified === false) return;
	// Since a karaoke has been modified, let's update its modified_at field
	const date = new Date();
	infosToWrite.data.modified_at = date.toString();
	karaData.modified_at = date;
	if (infosToWrite.data.songorder === null) infosToWrite.data.songorder = undefined;
	await asyncWriteFile(karafile, JSON.stringify(infosToWrite, null, 2));
	return infosToWrite;
}

export async function writeKaraV3(karafile: string, kara: Kara): Promise<KaraFileV3> {
	var karaData = cloneDeep(kara);
	if (karaData.isKaraModified === false) return;
	// Replace all TIDs by their names
	const tags = await getTags({});
	for (const type of Object.keys(tagTypes)) {
		if (karaData[type]) karaData[type].forEach((tag: KaraTag, i: number) => {
			let tagName = tag.name;
			if (!tag.name) {
				const tagDB = tags.content.find(t => t.tid === tag.tid);
				tagDB
					? tagName = tagDB.name
					: tagName = 'Unknown Tag ID!';
			}
			karaData[type][i] = {name: tagName};
		})
	}
	const infosToWrite: KaraFileV3 = formatKaraV3(karaData);
	infosToWrite.datemodif = now(true);
	karaData.modified_at = new Date();
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
		if (k.sid && k.sid.includes(sid)) return true;
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
			created_at: kara.created_at.toString(),
			kid: kara.kid || uuidV4(),
			modified_at: kara.modified_at.toString(),
			repository: kara.repo,
			sids: kara.sids,
			songorder: kara.order,
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
				singers: kara.singers.length > 0 ? kara.singers.map(t => t.tid) : undefined,
				songtypes: kara.songtypes.length > 0 ? kara.songtypes.map(t => t.tid) : undefined,
				songwriters: kara.songwriters.length > 0 ? kara.songwriters.map(t => t.tid) : undefined,
			},
			title: kara.title,
			year: kara.year
		}
	}
}

export function getTagV3Name (nameV4:string): string {
	var nameV3:string = null;
	if (nameV4 === 'Anime') nameV3 = 'TAG_ANIME';
	else if (nameV4 === 'Cover') nameV3 = 'TAG_COVER';
	else if (nameV4 === 'Fandub') nameV3 = 'TAG_FANDUB';
	else if (nameV4 === 'Drama') nameV3 = 'TAG_DRAMA';
	else if (nameV4 === 'Duet') nameV3 = 'TAG_DUO';
	else if (nameV4 === 'Dreamcast') nameV3 = 'TAG_DREAMCAST';
	else if (nameV4 === 'Gamecube') nameV3 = 'TAG_GAMECUBE';
	else if (nameV4 === 'Humor') nameV3 = 'TAG_HUMOR';
	else if (nameV4 === 'Idol') nameV3 = 'TAG_IDOL'
	else if (nameV4 === 'Hard Mode') nameV3 = 'TAG_HARDMODE';
	else if (nameV4 === 'Long') nameV3 = 'TAG_LONG';
	else if (nameV4 === 'Magical Girl') nameV3 = 'TAG_MAGICALGIRL';
	else if (nameV4 === 'Mecha') nameV3 = 'TAG_MECHA';
	else if (nameV4 === 'Mobage') nameV3 = 'TAG_MOBAGE';
	else if (nameV4 === 'Movie') nameV3 = 'TAG_MOVIE';
	else if (nameV4 === 'Parody') nameV3 = 'TAG_PARODY';
	else if (nameV4 === 'Playstation 2') nameV3 = 'TAG_PS2';
	else if (nameV4 === 'Playstation') nameV3 = 'TAG_PSX';
	else if (nameV4 === 'Playstation 3') nameV3 = 'TAG_PS3';
	else if (nameV4 === 'Playstation 4') nameV3 = 'TAG_PS4';
	else if (nameV4 === 'Playstation Portable') nameV3 = 'TAG_PSP';
	else if (nameV4 === 'Playstation Vita') nameV3 = 'TAG_PSV';
	else if (nameV4 === 'Real') nameV3 = 'TAG_REAL';
	else if (nameV4 === 'Remix') nameV3 = 'TAG_REMIX';
	else if (nameV4 === 'Saturn') nameV3 = 'TAG_SATURN';
	else if (nameV4 === 'Sega CD') nameV3 = 'TAG_SEGACD';
	else if (nameV4 === 'Shoujo') nameV3 = 'TAG_SHOUJO';
	else if (nameV4 === 'Shounen') nameV3 = 'TAG_SHOUNEN';
	else if (nameV4 === 'Audio Only') nameV3 = 'TAG_SOUNDONLY';
	else if (nameV4 === 'Special') nameV3 = 'TAG_SPECIAL';
	else if (nameV4 === 'Spoiler') nameV3 = 'TAG_SPOIL';
	else if (nameV4 === 'Switch') nameV3 = 'TAG_SWITCH';
	else if (nameV4 === 'Tokusatsu') nameV3 = 'TAG_TOKU';
	else if (nameV4 === 'TV Show') nameV3 = 'TAG_TVSHOW';
	else if (nameV4 === 'Video Game') nameV3 = 'TAG_VIDEOGAME';
	else if (nameV4 === 'Visual Novel') nameV3 = 'TAG_VN';
	else if (nameV4 === 'Vocaloid') nameV3 = 'TAG_VOCALOID';
	else if (nameV4 === 'Wii') nameV3 = 'TAG_WII';
	else if (nameV4 === 'Wii U') nameV3 = 'TAG_WIIU';
	else if (nameV4 === 'Boys\' love') nameV3 = 'TAG_YAOI';
	else if (nameV4 === 'Shoujo Ai') nameV3 = 'TAG_YURI';
	else if (nameV4 === 'XBOX 360') nameV3 = 'TAG_XBOX360';
	else if (nameV4 === 'XBOX ONE') nameV3 = 'TAG_XBOXONE';
	else if (nameV4 === 'Group') nameV3 = 'TAG_GROUP';
	else if (nameV4 === 'Creditless') nameV3 = 'TAG_CREDITLESS';
	else if (nameV4 === 'R18') nameV3 = 'TAG_R18';
	else if (nameV4 === 'OVA') nameV3 = 'TAG_OVA';
	else if (nameV4 === 'ONA') nameV3 = 'TAG_ONA';
	else if (nameV4 === 'DS') nameV3 = 'TAG_DS';
	else if (nameV4 === '3DS') nameV3 = 'TAG_3DS';
	else if (nameV4 === 'PC') nameV3 = 'TAG_PC';
	return nameV3;
}

export function getTagsV3(data:Kara): string {
    var tagNames = [];
    if (data.families) tagNames = tagNames.concat(data.families.map(e => getTagV3Name(e.name)).filter((e => e !== null)));
    if (data.platforms) tagNames = tagNames.concat(data.platforms.map(e => getTagV3Name(e.name)).filter((e => e !== null)));
    if (data.genres) tagNames = tagNames.concat(data.genres.map(e => getTagV3Name(e.name)).filter((e => e !== null)));
    if (data.origins) tagNames = tagNames.concat(data.origins.map(e => getTagV3Name(e.name)).filter((e => e !== null)));
    if (data.misc) tagNames = tagNames.concat(data.misc.map(e => getTagV3Name(e.name)).filter((e => e !== null)));
    return tagNames.length > 0 ? tagNames.join(',') : '';
  }

export function formatKaraV3(karaData: Kara): KaraFileV3 {
	return {
		mediafile: karaData.mediafile || '',
		subfile: karaData.subfile || 'dummy.ass',
		subchecksum: karaData.subchecksum || '',
		title: karaData.title || '',
		series: karaData.series.join(',') || '',
		type: (karaData.songtypes[0].name === 'CS' || karaData.songtypes[0].name === 'IS' ) ? 'OT' : karaData.songtypes[0].name,
		order: karaData.order || '',
		year: karaData.year || '',
		singer: karaData.singers.map(t => t.name).sort().join(',') || '',
		tags: getTagsV3(karaData),
		groups: karaData.groups.map(t => t.name).sort().join(',') || '',
		songwriter: karaData.songwriters.map(t => t.name).sort().join(',') || '',
		creator: karaData.creators.map(t => t.name).sort().join(',') || '',
		author: karaData.authors.map(t => t.name).sort().join(',') || '',
		lang: karaData.langs.map(t => t.name).sort().join(',') || 'und',
		KID: karaData.kid || uuidV4(),
		dateadded: Math.floor((karaData.created_at.getTime()-karaData.created_at.getTimezoneOffset()*60000) / 1000) || now(true),
        datemodif: Math.floor((karaData.modified_at.getTime()-karaData.modified_at.getTimezoneOffset()*60000) / 1000) || now(true),
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
