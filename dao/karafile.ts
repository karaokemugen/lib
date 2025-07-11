/**
 * Tools used to manipulate .kara files : reading, extracting info, etc.
 */

import { promises as fs, Stats } from 'fs';
import { ensureDir } from 'fs-extra';
import { cloneDeep } from 'lodash';
import { basename, dirname, extname, resolve } from 'path';
import { v4 as uuidV4 } from 'uuid';

import { getState } from '../../utils/state.js';
import { determineRepo, getRepoManifest } from '../services/repo.js';
import { DownloadedStatus } from '../types/database/download.js';
import { DBKara, DBKaraTag } from '../types/database/kara.js';
import { KaraFileV4, MediaInfo } from '../types/kara.js';
import { resolvedPath, resolvedPathRepos } from '../utils/config.js';
import {
	bools,
	mediaFileRegexp,
	subFileRegexp,
	tagTypesKaraFileV4Order,
	uuidRegexp
} from '../utils/constants.js';
import { ErrorKM } from '../utils/error.js';
import { extractSubtitles, getMediaInfo } from '../utils/ffmpeg.js';
import { fileExists, resolveFileInDirs } from '../utils/files.js';
import logger from '../utils/logger.js';
import { validateMediaInfoByRules } from '../utils/mediaInfoValidation.js';
import { clearEmpties, sortJSON } from '../utils/objectHelpers.js';
import { check, initValidators } from '../utils/validators.js';

const service = 'KaraFile';

export async function getDataFromKaraFile(
	karaFile: string,
	silent = { media: false, lyrics: false },
	isValidate = false
): Promise<KaraFileV4> {
	const state = getState();
	let error = false;
	let isKaraModified = false;
	let mediaFile: string;
	let downloadStatus: DownloadedStatus;
	let kara: KaraFileV4;
	let rawData: string;
	try {
		rawData = await fs.readFile(karaFile, 'utf-8');
	} catch (err) {
		throw `Kara file ${karaFile} is not readable : ${err}`;
	}
	try {
		kara = JSON.parse(rawData);
	} catch (err) {
		throw `Kara file ${karaFile} is not valid JSON`;
	}
	verifyKaraData(kara);

	const media = kara.medias[0];
	const lyricsInfos = kara.medias[0].lyrics ?? [];
	kara.data.repository = determineRepo(karaFile);

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
		if (state.opt.strict && !state.opt.noMedia) {
			strictModeError(
				`Media file ${media.filename} is missing (double check that the repository is correct in the kara.json file and that the media file actually exists)`
				, kara.data.songname);
			error = true;
		}
		downloadStatus = 'MISSING';
	}
	for (const lyricsInfo of lyricsInfos) {
		let lyricsFile = null;
		try {
			if (lyricsInfo.filename) {
				lyricsFile = lyricsInfo.filename;
				await resolveFileInDirs(
					lyricsInfo.filename,
					resolvedPathRepos('Lyrics', kara.data.repository)
				);
			}
		} catch (err) {
			if (!silent.lyrics)
				logger.debug(`Lyrics file not found: ${lyricsFile}`, { service });
			if (state.opt.strict) {
				strictModeError(
					'Lyrics file is missing (double check that the repository is correct in the kara.json file and that the lyrics file actually exists)'
					, kara.data.songname);
				error = true;
			}
		}
	}

	if (mediaFile && (state.opt.strict || isValidate) && !state.opt.noMedia) {
		const mediaInfo = await extractMediaTechInfos(mediaFile, media.filesize);
		if (mediaInfo.error) {
			if (mediaInfo.size !== null && state.opt.strict && !state.opt.noMedia) {
				strictModeError(
					`Media data is wrong for: ${mediaFile}. Make sure you have uploaded the right file or that you have regenerated the kara.json file. Actual media file size : ${mediaInfo.size} - Media file size in kara.json : ${media.filesize}`
					, kara.data.songname);
				error = true;
			}
			if (mediaInfo.size === null && state.opt.strict) {
				strictModeError(
					`Media file could not be read by ffmpeg: ${mediaFile}`
					, kara.data.songname);
				error = true;
			}
		} else if (mediaInfo.size) {
			if (state.opt.strict) {
				strictModeError(
					`Media data is wrong for: ${mediaFile}. Make sure you have uploaded the right file or that you have regenerated the kara.json file. Actual media file size : ${mediaInfo.size} - Media file size in kara.json : ${media.filesize}`
					, kara.data.songname);
				error = true;
			}
			isKaraModified = true;
			kara.medias[0].filesize = mediaInfo.size;
			kara.medias[0].duration = mediaInfo.duration;
			kara.medias[0].loudnorm = mediaInfo.loudnorm;
		}
	}
	return {
		...kara,
		meta: {
			karaFile: basename(karaFile),
			error,
			isKaraModified,
			downloadStatus
		}
	};
}

export async function extractMediaTechInfos(
	mediaFile: string,
	size?: number,
	computeLoudnorm = true
): Promise<MediaInfo> {
	// noInfo is when everything about the file is fine, sizes are the same, no need to fetch media info from ffmpeg.
	// errorInfo is when there's been an error (file not found, ffmpeg failed, etc.)
	const noInfo = {
		error: false,
		size: null,
		loudnorm: null,
		duration: null,
		filename: basename(mediaFile),
	};
	const errorInfo = {
		error: true,
		size: null,
		loudnorm: null,
		duration: null,
		filename: basename(mediaFile),
	};
	if (!getState().opt.noMedia) {
		let mediaStats: Stats;
		try {
			mediaStats = await fs.stat(mediaFile);
		} catch (err) {
			// Return early if file isn't found
			return errorInfo;
		}
		if (mediaStats.size !== size) {
			const mediaData = await getMediaInfo(mediaFile, computeLoudnorm);
			if (mediaData.error) return errorInfo;
			return {
				error: false,
				size: mediaStats.size,
				duration: mediaData.duration,
				loudnorm: mediaData.loudnorm,
				filename: basename(mediaFile),
				fileExtension: extname(mediaFile).replace('.', ''),

				mediaType: mediaData.mediaType,
				overallBitrate: mediaStats.size / mediaData.duration,

				hasVideoStream: mediaData.hasVideoStream,
				videoCodec: mediaData.videoCodec,
				videoResolution: mediaData.videoResolution,
				videoColorspace: mediaData.videoColorspace,
				videoAspectRatio: mediaData.videoAspectRatio,
				videoFramerate: mediaData.videoFramerate,
				videoOffset: mediaData.videoOffset,

				hasAudioStream: mediaData.hasAudioStream,
				audioCodec: mediaData.audioCodec,
				audioSampleRate: mediaData.audioSampleRate,
				audioChannelLayout: mediaData.audioChannelLayout,
				audioOffset: mediaData.audioOffset,
				hasCoverArt: mediaData.mediaType === 'audio' && !!mediaData.videoResolution,

				warnings: mediaData.warnings
			};
		}
		return noInfo;
	}
	return noInfo;
}

export async function getMediaFileInfo(mediaFile: string, repo: string) {
	const mediaFilePath = await resolveFileInDirs(
		mediaFile,
		resolvedPathRepos('Medias', repo)
	);
	if (await fileExists(mediaFilePath[0]))
		return extractMediaTechInfos(mediaFilePath[0], undefined, false);
	throw 'Mediafile not found';
}

export async function validateMediaInfo(mediaInfo: MediaInfo, repo: string) {
	const manifest = getRepoManifest(repo);
	if (!manifest) throw new ErrorKM('UNKNOWN_REPOSITORY', 404, false);
	try {
		return validateMediaInfoByRules(mediaInfo, manifest);
	} catch (err) {
		logger.error(err, { service });
		throw new ErrorKM('MEDIA_VALIDATION_ERROR', 406, false);
	}
}

export async function writeKara(karafile: string, karaData: KaraFileV4) {
	const date = new Date();
	karaData.data.modified_at = date.toISOString();
	const dataToWrite = cloneDeep(karaData);
	delete dataToWrite.meta;
	clearEmpties(dataToWrite);
	if (dataToWrite.medias[0] && !dataToWrite.medias[0].lyrics) {
		dataToWrite.medias[0].lyrics = [];
	}
	dataToWrite.data = sortJSON(dataToWrite.data);
	dataToWrite.medias[0] = sortJSON(dataToWrite.medias[0]);
	if (dataToWrite.medias[0].lyrics[0]) dataToWrite.medias[0].lyrics[0] = sortJSON(dataToWrite.medias[0].lyrics[0]);
	const dir = dirname(karafile);
	await ensureDir(dir);
	await fs.writeFile(karafile, JSON.stringify(dataToWrite, null, 2));
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
	// We'll remove subtitles there. If the previous function returned something, then it means we have to remove them.
	logger.info(`Subtitles extracted from ${videoFile} to ${extractFile}`, { service })
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
	const tags = {};
	for (const tagType of Object.keys(tagTypesKaraFileV4Order)) {
		if (kara[tagType] && kara[tagType].length > 0) {
			tags[tagType] = kara[tagType].map((t: DBKaraTag) => t.tid);
		}
	}
	const json: KaraFileV4 = {
		header: {
			version: 4,
			description: 'Karaoke Mugen Karaoke Data File',
		},
		medias: [
			{
				default: true,
				duration: kara.duration || 0,
				filename: kara.mediafile,
				filesize: kara.mediasize || 0,
				loudnorm: kara.loudnorm || null,
				lyrics: kara.lyrics_infos,
				version: mediaVersion,
			},
		],
		data: {
			comment: kara.comment || undefined,
			created_at:
				typeof kara.created_at === 'object'
					? kara.created_at.toISOString()
					: kara.created_at,
			from_display_type: kara.from_display_type,
			ignoreHooks: kara.ignore_hooks || false,
			kid: kara.kid || uuidV4(),
			modified_at:
				typeof kara.modified_at === 'object'
					? kara.modified_at.toISOString()
					: kara.modified_at,
			parents: kara.parents?.length > 0 ? kara.parents.sort() : undefined,
			repository: kara.repository,
			songname: kara.songname || undefined,
			songorder: kara.songorder ? +kara.songorder : undefined,
			tags,
			titles: kara.titles,
			titles_default_language: kara.titles_default_language,
			titles_aliases:
				kara.titles_aliases?.length > 0 ? kara.titles_aliases : undefined,
			year: +kara.year,
		},
		meta: {}
	};
	json.data = sortJSON(json.data);
	json.medias[0] = sortJSON(json.medias[0]);
	if (json.medias[0].lyrics[0]) {
		json.medias[0].lyrics[0] = sortJSON(json.medias[0].lyrics[0]);
	}
	return json;
}

export const mediaConstraints = {
	filename: {
		presence: { allowEmpty: false },
		format: mediaFileRegexp,
	},
	filesize: { numericality: { onlyInteger: true, greaterThanOrEqualTo: 0 } },
	loudnorm: { presence: { allowEmpty: true } },
	duration: { numericality: { onlyInteger: true, greaterThanOrEqualTo: 0 } },
	version: { presence: { allowEmpty: false } },
	default: { inclusion: bools },
	lyrics: { karaLyricsValidator: true },
};

export const lyricsConstraints = {
	filename: {
		presence: { allowEmpty: false },
		format: subFileRegexp,
	},
	version: { presence: { allowEmpty: false } },
	default: { presence: true },
};

const karaConstraintsV4 = {
	'header.version': { semverInteger: 4 },
	'header.description': { inclusion: ['Karaoke Mugen Karaoke Data File'] },
	medias: { karaMediasValidator: true },
	'data.titles': { presence: { allowEmpty: false } },
	'data.tags.songtypes': { uuidArrayValidator: true },
	'data.tags.singergroups': { uuidArrayValidator: true },
	'data.tags.singers': { uuidArrayValidator: true },
	'data.tags.songwriters': { uuidArrayValidator: true },
	'data.tags.creators': { uuidArrayValidator: true },
	'data.tags.authors': { uuidArrayValidator: true },
	'data.tags.misc': { uuidArrayValidator: true },
	'data.tags.langs': { uuidArrayValidator: true },
	'data.tags.platforms': { uuidArrayValidator: true },
	'data.tags.origins': { uuidArrayValidator: true },
	'data.tags.genres': { uuidArrayValidator: true },
	'data.tags.families': { uuidArrayValidator: true },
	'data.tags.groups': { uuidArrayValidator: true },
	'data.tags.versions': { uuidArrayValidator: true },
	'data.tags.warnings': { uuidArrayValidator: true },
	'data.tags.franchises': { uuidArrayValidator: true },
	'data.songorder': { numericality: true },
	'data.year': { numericality: true },
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
		logger.error(`Invalid karaoke data: ${JSON.stringify(validationErrors)}`);
		throw new ErrorKM('INVALID_DATA', 400, false);
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

function strictModeError(data: string, songname: string) {
	logger.error(
		`STRICT MODE ERROR (${songname}) : ${data}`,
		{ service }
	);
}

export function trimKaraData(kara: KaraFileV4): KaraFileV4 {
	for (const lang of Object.keys(kara.data.titles)) {
		kara.data.titles[lang] = kara.data.titles[lang]
			.trim()
			.replaceAll('\\t', '')
			.replaceAll('\\n', '')
			.replaceAll('\\r', '');
	}
	if (kara.data.titles_aliases)
		kara.data.titles_aliases.forEach((_, i) => {
			kara.data.titles_aliases[i] = kara.data.titles_aliases[i]
				.trim()
				.replaceAll('\\t', '')
				.replaceAll('\\n', '')
				.replaceAll('\\r', '');
		});
	return kara;
}
