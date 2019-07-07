/**
 * .kara files generation
 */

import logger from '../utils/logger';
import {extname, resolve} from 'path';
import {resolvedPathImport, resolvedPathTemp} from '../utils/config';
import {sanitizeFile, asyncCopy, asyncUnlink, asyncExists, asyncMove, replaceExt} from '../utils/files';
import {
	extractAssInfos, extractVideoSubtitles, extractMediaTechInfos, writeKara, writeKaraV3
} from '../dao/karafile';
import {tagTypes} from '../utils/constants';
import {Kara, NewKara} from '../types/kara';
import {check} from '../utils/validators';
import {getOrAddSerieID} from '../../services/series';
import {getOrAddTagID} from '../../services/tag';
import { webOptimize } from '../utils/ffmpeg';
import uuidV4 from 'uuid/v4';


export async function generateKara(kara: Kara, karaDestDir: string, mediasDestDir: string, lyricsDestDir: string) {
	if ((!kara.songtypes.includes('MV') && !kara.songtypes.includes('LIVE')) && kara.series.length < 1) throw 'Series cannot be empty if type is not MV or LIVE';
	if (!kara.mediafile) throw 'No media file uploaded';
	const validationErrors = check(kara, {
		year: {integerValidator: true},
		langs: {arrayNoCommaValidator: true},
		misc: {arrayNoCommaValidator: true},
		songtypes: {arrayNoCommaValidator: true},
		series: {arrayNoCommaValidator: true},
		singers: {arrayNoCommaValidator: true},
		authors: {arrayNoCommaValidator: true},
		songwriters: {arrayNoCommaValidator: true},
		creators: {arrayNoCommaValidator: true},
		groups: {arrayNoCommaValidator: true},
		families: {arrayNoCommaValidator: true},
		genres: {arrayNoCommaValidator: true},
		platforms: {arrayNoCommaValidator: true},
		origins: {arrayNoCommaValidator: true},
		title: {presence: true}
	});
	// Move files from temp directory to import, depending on the different cases.
	// First name media files and subfiles according to their extensions
	// Since temp files don't have any extension anymore
	const newMediaFile = `${kara.mediafile}${extname(kara.mediafile_orig)}`;
	let newSubFile: string;
	kara.subfile && kara.subfile_orig
		? newSubFile = `${kara.subfile}${extname(kara.subfile_orig)}`
		: newSubFile = kara.subfile;
	// We don't need these anymore.
	delete kara.subfile_orig;
	delete kara.mediafile_orig;
	// Let's move baby.
	await asyncCopy(resolve(resolvedPathTemp(),kara.mediafile),resolve(resolvedPathImport(),newMediaFile), { overwrite: true });
	if (kara.subfile) await asyncCopy(resolve(resolvedPathTemp(),kara.subfile),resolve(resolvedPathImport(),newSubFile), { overwrite: true });

	try {
		if (validationErrors) throw JSON.stringify(validationErrors);
		kara.title = kara.title.trim();
		//Trim spaces before and after elements.
		kara.series.forEach((e,i) => kara.series[i] = e.trim());
		kara.langs.forEach((e,i) => kara.langs[i] = e.trim());
		kara.singers.forEach((e,i) => kara.singers[i] = e.trim());
		kara.groups.forEach((e,i) => kara.groups[i] = e.trim());
		kara.songwriters.forEach((e,i) => kara.songwriters[i] = e.trim());
		kara.misc.forEach((e,i) => kara.misc[i] = e.trim());
		kara.creators.forEach((e,i) => kara.creators[i] = e.trim());
		kara.authors.forEach((e,i) => kara.authors[i] = e.trim());
		kara.origins.forEach((e,i) => kara.origins[i] = e.trim());
		kara.platforms.forEach((e,i) => kara.platforms[i] = e.trim());
		kara.genres.forEach((e,i) => kara.genres[i] = e.trim());
		kara.families.forEach((e,i) => kara.families[i] = e.trim());
		// Format dates
		kara.dateadded
			? kara.dateadded = new Date(kara.dateadded)
			: kara.dateadded = new Date()
		kara.datemodif = new Date(kara.datemodif);
		// Generate KID if not present
		if (!kara.kid) kara.kid = uuidV4();
		// Default repository for now
		kara.repo = 'kara.moe';
		const newKara = await importKara(newMediaFile, newSubFile, kara, karaDestDir, mediasDestDir, lyricsDestDir);
		return newKara;
	} catch(err) {
		logger.error(`[Karagen] Error during generation : ${err}`);
		if (await asyncExists(newMediaFile)) await asyncUnlink(newMediaFile);
		if (newSubFile) if (await asyncExists(newSubFile)) await asyncUnlink(newSubFile);
		throw err;
	}
}

function defineFilename(data: Kara): string {
	// Generate filename according to tags and type.
	if (data) {
		const extraTags = [];
		if (data.platforms.includes('Playstation 3')) extraTags.push('PS3');
		if (data.platforms.includes('Playstaiton 2')) extraTags.push('PS2');
		if (data.platforms.includes('Playstation')) extraTags.push('PSX');
		if (data.misc.includes('Special')) extraTags.push('SPECIAL');
		if (data.misc.includes('Cover')) extraTags.push('COVER');
		if (data.misc.includes('Fandub')) extraTags.push('DUB');
		if (data.misc.includes('Remix')) extraTags.push('REMIX');
		if (data.origins.includes('OVA')) extraTags.push('OVA');
		if (data.origins.includes('ONA')) extraTags.push('ONA');
		if (data.origins.includes('Movie')) extraTags.push('MOVIE');
		if (data.platforms.includes('Playstation 4')) extraTags.push('PS4');
		if (data.platforms.includes('Playstation Vita')) extraTags.push('PSV');
		if (data.platforms.includes('Playstation Portable')) extraTags.push('PSP');
		if (data.platforms.includes('XBOX 360')) extraTags.push('XBOX360');
		if (data.platforms.includes('Gamecube')) extraTags.push('GAMECUBE');
		if (data.platforms.includes('N64')) extraTags.push('N64');
		if (data.platforms.includes('DS')) extraTags.push('DS');
		if (data.platforms.includes('3DS')) extraTags.push('3DS');
		if (data.platforms.includes('PC')) extraTags.push('PC');
		if (data.platforms.includes('Sega CD')) extraTags.push('SEGACD');
		if (data.platforms.includes('Saturn')) extraTags.push('SATURN');
		if (data.platforms.includes('Wii')) extraTags.push('WII');
		if (data.platforms.includes('Wii U')) extraTags.push('WIIU');
		if (data.platforms.includes('Switch')) extraTags.push('SWITCH');
		if (data.families.includes('Video Game')) extraTags.push('GAME');
		if (data.misc.includes('Audio Only')) extraTags.push('AUDIO');
		let extraType = '';
		if (extraTags.length > 0) extraType = extraTags.join(' ') + ' ';
		const fileLang = data.langs[0].toUpperCase();
		return sanitizeFile(`${fileLang} - ${data.series[0] || data.singers.join(',')} - ${extraType}${data.songtypes[0]}${data.order || ''} - ${data.title}`);
	}
}

async function importKara(mediaFile: string, subFile: string, data: Kara, karaDestDir: string, mediasDestDir: string, lyricsDestDir: string) {
	if (data.platforms.length > 0 && !data.families.includes('Video Game')) data.families.push('Video Game');
	if (mediaFile.match('^.+\\.(ogg|m4a|mp3)$') && !data.misc.includes('Audio Only')) data.misc.push('Audio Only');


	const kara = defineFilename(data);
	logger.info(`[KaraGen] Generating kara file for ${kara}`);
	let karaSubFile: string;
	!subFile
		? karaSubFile = subFile
		: karaSubFile = `${kara}${extname(subFile || '.ass')}`;
	data.mediafile = `${kara}${extname(mediaFile)}`;
	data.subfile = karaSubFile;

	// Extract media info, find subfile, and process series before moving files
	const mediaPath = resolve(resolvedPathImport(), mediaFile);
	let subPath: string;
	if (subFile) subPath = await findSubFile(mediaPath, data, subFile);

	if (data.platforms.length > 0 && !data.families.includes('Video Game')) data.families.push('Video Game');
	if (mediaFile.match('^.+\\.(ogg|m4a|mp3)$') && !data.misc.includes('Audio Only')) data.misc.push('Audio Only');

	// Autocreating groups based on song year
	if (+data.year >= 1950 && +data.year <= 1959 && !data.groups.includes('50s')) data.groups.push('50s');
	if (+data.year >= 1960 && +data.year <= 1969 && !data.groups.includes('60s')) data.groups.push('60s');
	if (+data.year >= 1970 && +data.year <= 1979 && !data.groups.includes('70s')) data.groups.push('70s');
	if (+data.year >= 1980 && +data.year <= 1989 && !data.groups.includes('80s')) data.groups.push('80s');
	if (+data.year >= 1990 && +data.year <= 1999 && !data.groups.includes('90s')) data.groups.push('90s');
	if (+data.year >= 2000 && +data.year <= 2009 && !data.groups.includes('2000s')) data.groups.push('2000s');
	if (+data.year >= 2010 && +data.year <= 2019 && !data.groups.includes('2010s')) data.groups.push('2010s');
	if (+data.year >= 2020 && +data.year <= 2029 && !data.groups.includes('2010s')) data.groups.push('2020s');

	try {
		if (subFile) data.subchecksum = await extractAssInfos(subPath);
		data.sids = await processSeries(data);
		data = await processTags(data);
		return await generateAndMoveFiles(mediaPath, subPath, data, karaDestDir, mediasDestDir, lyricsDestDir);
	} catch(err) {
		const error = `Error importing ${kara} : ${err}`;
		logger.error(`[KaraGen] ${error}`);
		throw error;
	}
}

/** Replace tags by UUIDs, create them if necessary */
async function processTags(kara: Kara): Promise<Kara> {
	for (const type of Object.keys(tagTypes)) {
		if (kara[type]) {
			const tids = [];
			for (const i in kara[type]) {
				const tagObj = {
					name: kara[type][i],
					i18n: { eng: kara[type][i] },
					tid: uuidV4(),
					types: [tagTypes[type]]
				}
				tids.push(await getOrAddTagID(tagObj))
			}
			kara[type] = tids.sort();
		}
	}
	return kara;
}

async function processSeries(kara: Kara): Promise<string[]> {
	//Creates series in kara if they do not exist already.
	let sids = [];
	for (const serie of kara.series) {
		const serieObj = {
			name: serie,
			i18n: {},
			sid: uuidV4()
		};
		serieObj.i18n[kara.langs[0]] = serie;
		sids.push(await getOrAddSerieID(serieObj));
	}
	return sids.sort();
}

async function findSubFile(mediaPath: string, karaData: Kara, subFile: string): Promise<string> {
	// Replacing file extension by .ass in the same directory
	// Default is media + .ass instead of media extension.
	// If subfile exists, assFile becomes that.
	let assFile = replaceExt(mediaPath, '.ass');
	if (subFile) assFile = resolve(resolvedPathImport(), subFile);
	if (await asyncExists(assFile) && subFile) {
		// If a subfile is found, adding it to karaData
		karaData.subfile = replaceExt(karaData.mediafile, '.ass');
		return assFile;
	} else if (mediaPath.endsWith('.mkv')) {
		// In case of a mkv, we're going to extract its subtitles track
		try {
			const extractFile = await extractVideoSubtitles(mediaPath, karaData.kid);
			karaData.subfile = replaceExt(karaData.mediafile, '.ass');
			return extractFile;
		} catch (err) {
			// Non-blocking.
			logger.info('[KaraGen] Could not extract subtitles from video file ' + mediaPath + ' : ' + err);
			return null;
		}
	} else {
		return null;
	}
}

async function generateAndMoveFiles(mediaPath: string, subPath: string, karaData: Kara, karaDestDir: string, mediaDestDir: string, lyricsDestDir: string): Promise<NewKara> {
	// Generating kara file in the first kara folder
	const karaFilename = replaceExt(karaData.mediafile, '.kara');
	const karaPath = resolve(karaDestDir, `${karaFilename}.json`);
	const karaPathV3 = karaDestDir.includes('inbox') ? resolve(karaDestDir, karaFilename) : resolve(karaDestDir, '../karas/', karaFilename);
	if (!subPath) karaData.subfile = null;
	const mediaDest = resolve(mediaDestDir, karaData.mediafile);
	let subDest: string;
	if (subPath && karaData.subfile) subDest = resolve(lyricsDestDir, karaData.subfile);
	try {
		// Moving media in the first media folder.
		if (extname(mediaDest).toLowerCase() === '.mp4' && !karaData.noNewVideo) {
			await webOptimize(mediaPath, mediaDest);
			await asyncUnlink(mediaPath);
			delete karaData.noNewVideo;
		} else {
			await asyncMove(mediaPath, mediaDest, { overwrite: true });
		}
		// Extracting media info here and now because we might have had to weboptimize it earlier.
		const mediainfo = await extractMediaTechInfos(mediaDest, karaData.mediasize);
		karaData.mediagain = mediainfo.gain;
		karaData.mediaduration = mediainfo.duration;
		karaData.mediasize = mediainfo.size;
		// Moving subfile in the first lyrics folder.
		if (subDest) await asyncMove(subPath, subDest, { overwrite: true });
	} catch (err) {
		throw `Error while moving files. (${err})`;
	}
	const karaFileData = await writeKara(karaPath, karaData);
	// Write KaraV3 too
	await writeKaraV3(karaPathV3, karaData);
	return {
		data: karaData,
		file: karaPath,
		fileData: karaFileData
	};
}