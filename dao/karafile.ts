/**
 * Tools used to manipulate .kara files : reading, extracting info, etc.
 */

import { promises as fs } from 'fs';
import { cloneDeep } from 'lodash';
import { basename, resolve } from 'path';
import { v4 as uuidV4 } from 'uuid';

import { getRepo } from '../../services/repo';
import { getState } from '../../utils/state';
import { DownloadedStatus } from '../types/database/download';
import { DBKara } from '../types/database/kara';
import { KaraFileV4, MediaInfo } from '../types/kara';
import { resolvedPath, resolvedPathRepos } from '../utils/config';
import {
	bools,
	mediaFileRegexp,
	subFileRegexp,
	uuidRegexp,
} from '../utils/constants';
import { extractSubtitles, getMediaInfo } from '../utils/ffmpeg';
import { fileExists, resolveFileInDirs } from '../utils/files';
import logger from '../utils/logger';
import { check, initValidators, testJSON } from '../utils/validators';

const service = 'KaraFile';

export async function getDataFromKaraFile(
	karaFile: string,
	kara: KaraFileV4,
	silent = { media: false, lyrics: false },
	isValidate = false
): Promise<KaraFileV4> {
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
			strictModeError(
				`Kara ${karaFile} has an unknown repository (${kara.data.repository}`
			);
			error = true;
		}
	}
	try {
		await resolveFileInDirs(
			basename(karaFile),
			resolvedPathRepos('Karaokes', kara.data.repository)
		);
	} catch (err) {
		if (state.opt.strict) {
			strictModeError(
				`Kara ${karaFile} is not in the right repository directory (not found in its repo directory). Check that its repository is correct. Repository in kara : ${kara.data.repository}`
			);
			error = true;
		}
	}
	try {
		const mediaFiles = await resolveFileInDirs(
			media.filename,
			resolvedPathRepos('Medias', kara.data.repository)
		);
		mediaFile = mediaFiles[0];
		downloadStatus = 'DOWNLOADED';
	} catch (err) {
		if (!silent.media)
			logger.debug(`Media file not found: ${media.filename}`, { service });
		if (state.opt.strict) {
			strictModeError(
				'Media file is missing (double check that the repository is correct in the kara.json file and that the media file actually exists)'
			);
			error = true;
		}
		downloadStatus = 'MISSING';
	}
	let lyricsFile = null;
	try {
		if (lyrics) {
			lyricsFile = lyrics.filename;
			await resolveFileInDirs(
				lyrics.filename,
				resolvedPathRepos('Lyrics', kara.data.repository)
			);
		}
	} catch (err) {
		if (!silent.lyrics)
			logger.debug(`Lyrics file not found: ${lyricsFile}`, { service });
		if (state.opt.strict) {
			strictModeError(
				'Lyrics file is missing (double check that the repository is correct in the kara.json file and that the lyrics file actually exists)'
			);
			error = true;
		}
	}
	if (mediaFile && (state.opt.strict || isValidate) && !state.opt.noMedia) {
		const mediaInfo = await extractMediaTechInfos(mediaFile, media.filesize);
		if (mediaInfo.error) {
			if (mediaInfo.size !== null) {
				strictModeError(
					`Media data is wrong for: ${mediaFile}. Make sure you have uploaded the right file or that you have regenerated the kara.json file. Actual media file size : ${mediaInfo.size} - Media file size in kara.json : ${media.filesize}`
				);
				error = true;
			}
			if (mediaInfo.size === null) {
				strictModeError(
					`Media file could not be read by ffmpeg: ${mediaFile}`
				);
				error = true;
			}
		} else if (mediaInfo.size) {
			strictModeError(
				`Media data is wrong for: ${mediaFile}. Make sure you have uploaded the right file or that you have regenerated the kara.json file. Actual media file size : ${mediaInfo.size} - Media file size in kara.json : ${media.filesize}`
			);
			error = true;
			isKaraModified = true;
			kara.medias[0].filesize = mediaInfo.size;
			kara.medias[0].audiogain = mediaInfo.gain;
			kara.medias[0].duration = mediaInfo.duration;
			kara.medias[0].loudnorm = mediaInfo.loudnorm;
		}
	}
	// Remove this in KM 7.0
	// This is for people who upgrade to KM 6.0 but don't have an upgraded karabase yet.
	if (!kara.data.titles) {
		kara.data.titles = { eng: kara.data.title };
	}
	return {
		...kara,
		meta: {
			karaFile,
			error,
			isKaraModified,
			downloadStatus
		}
	};
}

export async function extractMediaTechInfos(
	mediaFile: string,
	size?: number
): Promise<MediaInfo> {
	// noInfo is when everything about the file is fine, sizes are the same, no need to fetch media info from ffmpeg.
	// errorInfo is when there's been an error (file not found, ffmpeg failed, etc.)
	const noInfo = {
		error: false,
		size: null,
		gain: null,
		loudnorm: null,
		duration: null,
		filename: basename(mediaFile),
	};
	const errorInfo = {
		error: true,
		size: null,
		gain: null,
		loudnorm: null,
		duration: null,
		filename: basename(mediaFile),
	};
	if (!getState().opt.noMedia) {
		let mediaStats: any;
		try {
			mediaStats = await fs.stat(mediaFile);
		} catch (err) {
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
				filename: basename(mediaFile),
			};
		}
		return noInfo;
	}
	return noInfo;
}

export async function writeKara(
	karafile: string,
	karaData: KaraFileV4
) {
	const date = new Date();
	karaData.data.modified_at = date.toISOString();
	const dataToWrite = cloneDeep(karaData);
	delete dataToWrite.meta;
	await fs.writeFile(karafile, JSON.stringify(dataToWrite, null, 2));
}

export async function parseKara(karaFile: string): Promise<KaraFileV4> {
	let data: string;
	try {
		data = await fs.readFile(karaFile, 'utf-8');
	} catch (err) {
		throw `Kara file ${karaFile} is not readable : ${err}`;
	}
	if (!testJSON(data)) throw `Kara file ${karaFile} is not valid JSON`;
	return JSON.parse(data);
}

export async function extractVideoSubtitles(
	videoFile: string,
	kid: string
): Promise<string> {
	// FIXME: For now we only support extracting ASS from a container.
	// If a MKV or MP4 contains SRT or LRC streams, we have no way to know about them yet.
	// Deal with it for now.
	// We'd need to first scan the file with ffmpeg to identify subtitle streams and then extract the first one depending on what it reports to be.
	const extractFile = resolve(resolvedPath('Temp'), `kara_extract.${kid}.ass`);
	await extractSubtitles(videoFile, extractFile);
	return extractFile;
}

/**
 * Generate info to write in a .kara.json file from an object passed as argument by filtering out unnecessary fields and adding default values if needed.
 */
export function formatKaraV4(kara: DBKara): KaraFileV4 {
	// Until we manage media version in the kara form, use this.
	const mediaVersionArr = kara.titles[kara.titles_default_language || 'eng'].split(' ~ ');
	const mediaVersion =
		mediaVersionArr.length > 1
			? mediaVersionArr[mediaVersionArr.length - 1].replace(' Vers', '')
			: 'Default';
	const lyricsArr = [];
	// In case subfile is empty (hardsub?)
	if (kara.subfile)
		lyricsArr.push({
			filename: kara.subfile,
			default: true,
			version: 'Default',
		});
	return {
		header: {
			version: 4,
			description: 'Karaoke Mugen Karaoke Data File',
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
				lyrics: lyricsArr,
			},
		],
		data: {
			comment: kara.comment || undefined,
			created_at:
				typeof kara.created_at === 'object'
					? kara.created_at.toISOString()
					: kara.created_at,
			ignoreHooks: kara.ignoreHooks || undefined,
			kid: kara.kid || uuidV4(),
			modified_at:
				typeof kara.modified_at === 'object'
					? kara.modified_at.toISOString()
					: kara.modified_at,
			parents: kara.parents?.length > 0 ? kara.parents.sort() : undefined,
			repository: kara.repository,
			songorder: kara.songorder ? +kara.songorder : undefined,
			tags: {
				authors:
					kara.authors && kara.authors.length > 0
						? kara.authors.map(t => t.tid).sort()
						: undefined,
				creators:
					kara.creators && kara.creators.length > 0
						? kara.creators.map(t => t.tid).sort()
						: undefined,
				families:
					kara.families && kara.families.length > 0
						? kara.families.map(t => t.tid).sort()
						: undefined,
				genres:
					kara.genres && kara.genres.length > 0
						? kara.genres.map(t => t.tid).sort()
						: undefined,
				groups:
					kara.groups && kara.groups.length > 0
						? kara.groups.map(t => t.tid).sort()
						: undefined,
				langs:
					kara.langs && kara.langs.length > 0
						? kara.langs.map(t => t.tid).sort()
						: undefined,
				misc:
					kara.misc && kara.misc.length > 0
						? kara.misc.map(t => t.tid).sort()
						: undefined,
				origins:
					kara.origins && kara.origins.length > 0
						? kara.origins.map(t => t.tid).sort()
						: undefined,
				platforms:
					kara.platforms && kara.platforms.length > 0
						? kara.platforms.map(t => t.tid).sort()
						: undefined,
				series:
					kara.series && kara.series.length > 0
						? kara.series.map(t => t.tid).sort()
						: undefined,
				singers:
					kara.singers && kara.singers.length > 0
						? kara.singers.map(t => t.tid).sort()
						: undefined,
				songtypes:
					kara.songtypes && kara.songtypes.length > 0
						? kara.songtypes.map(t => t.tid).sort()
						: undefined,
				songwriters:
					kara.songwriters && kara.songwriters.length > 0
						? kara.songwriters.map(t => t.tid).sort()
						: undefined,
				versions:
					kara.versions && kara.versions.length > 0
						? kara.versions.map(t => t.tid).sort()
						: undefined,
				collections:
					kara.collections && kara.collections.length > 0
						? kara.collections.map(t => t.tid).sort()
						: undefined,
				warnings:
					kara.warnings && kara.warnings.length > 0
						? kara.warnings.map(t => t.tid).sort()
						: undefined,
			},
			titles: kara.titles,
			titles_default_language: kara.titles_default_language,
			titles_aliases:
				kara.titles_aliases?.length > 0 ? kara.titles_aliases : undefined,
			title: kara.titles[kara.titles_default_language], // Remove when we hit KM 7.0
			year: +kara.year,
		},
		meta: {}
	};
}

export const mediaConstraints = {
	filename: {
		presence: { allowEmpty: false },
		format: mediaFileRegexp,
	},
	size: { numericality: { onlyInteger: true, greaterThanOrEqualTo: 0 } },
	audiogain: { numericality: true },
	loudnorm: { presence: { allowEmpty: true } },
	duration: { numericality: { onlyInteger: true, greaterThanOrEqualTo: 0 } },
	name: { presence: { allowEmpty: false } },
	default: { inclusion: bools },
	lyrics: { karaLyricsValidator: true },
};

export const lyricsConstraints = {
	filename: {
		presence: { allowEmpty: false },
		format: subFileRegexp,
	},
	name: { presence: { allowEmpty: false } },
	default: { presence: true },
};

const karaConstraintsV4 = {
	'header.version': { semverInteger: 4 },
	'header.description': { inclusion: ['Karaoke Mugen Karaoke Data File'] },
	medias: { karaMediasValidator: true },
	'data.titles': { presence: { allowEmpty: false } },
	'data.repository': { presence: { allowEmpty: true } },
	'data.tags.songtypes': { presence: true, arrayValidator: true },
	'data.tags.singers': { uuidArrayValidator: true },
	'data.tags.songwriters': { uuidArrayValidator: true },
	'data.tags.creators': { uuidArrayValidator: true },
	'data.tags.authors': { uuidArrayValidator: true },
	'data.tags.misc': { uuidArrayValidator: true },
	'data.tags.langs': { presence: true, uuidArrayValidator: true },
	'data.tags.platforms': { uuidArrayValidator: true },
	'data.tags.origins': { uuidArrayValidator: true },
	'data.tags.genres': { uuidArrayValidator: true },
	'data.tags.families': { uuidArrayValidator: true },
	'data.tags.groups': { uuidArrayValidator: true },
	'data.tags.versions': { uuidArrayValidator: true },
	'data.tags.warnings': { uuidArrayValidator: true },
	'data.songorder': { numericality: true },
	'data.year': { integerValidator: true },
	'data.kid': { presence: true, format: uuidRegexp },
	'data.created_at': { presence: { allowEmpty: false } },
	'data.modified_at': { presence: { allowEmpty: false } },
	'data.ignoreHooks': { boolUndefinedValidator: true },
};

export function karaDataValidationErrors(karaData: KaraFileV4) {
	initValidators();
	return check(karaData, karaConstraintsV4);
}

export function verifyKaraData(karaData: KaraFileV4) {
	const validationErrors = karaDataValidationErrors(karaData);
	if (validationErrors) {
		throw `Karaoke data is not valid: ${JSON.stringify(validationErrors)}`;
	}
}

export async function getLyrics(sub: string, repo: string): Promise<string> {
	const subfile = await resolveFileInDirs(
		sub,
		resolvedPathRepos('Lyrics', repo)
	);
	if (await fileExists(subfile[0])) return fs.readFile(subfile[0], 'utf-8');
	throw 'Subfile not found';
}

function strictModeError(data: string) {
	logger.error(
		`STRICT MODE ERROR : ${data}`,
		{ service }
	);
}
