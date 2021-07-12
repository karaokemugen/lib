/**
 * .kara.json files generation
 */

import { promises as fs } from 'fs';
import { copy } from 'fs-extra';
import {convertKarToAss as karToASS, parseKar} from 'kar-to-ass';
import {convertKfnToAss as karafunToASS, parseKfn} from 'kfn-to-ass';
import {extname, resolve} from 'path';
import {convertToASS as toyundaToASS, findFPS, splitTime} from 'toyunda2ass';
import {convertToASS as ultrastarToASS} from 'ultrastar2ass';
import { v4 as uuidV4 } from 'uuid';

import {addTag, editTag, getOrAddTagID,getTag} from '../../services/tag';
import sentry from '../../utils/sentry';
import { getState } from '../../utils/state';
import {
	extractAssInfos, extractMediaTechInfos, extractVideoSubtitles, writeKara
} from '../dao/karafile';
import { DBKara } from '../types/database/kara';
import {Kara, MediaInfo, NewKara} from '../types/kara';
import { Tag } from '../types/tag';
import {resolvedPathImport, resolvedPathRepos,resolvedPathTemp} from '../utils/config';
import {audioFileRegexp,tagTypes} from '../utils/constants';
import { webOptimize } from '../utils/ffmpeg';
import {asyncExists, asyncMove, detectSubFileFormat, replaceExt, resolveFileInDirs,sanitizeFile} from '../utils/files';
import logger from '../utils/logger';
import {check} from '../utils/validators';

export function validateNewKara(kara: Kara) {
	if (kara.singers.length < 1 && kara.series.length < 1) throw 'Series and singers cannot be empty in the same time';
	const validationErrors = check(kara, {
		mediafile: {presence: true},
		year: {integerValidator: true},
		langs: {tagValidator: true},
		misc: {tagValidator: true},
		songtypes: {tagValidator: true},
		series: {tagValidator: true},
		singers: {tagValidator: true},
		authors: {tagValidator: true},
		songwriters: {tagValidator: true},
		creators: {tagValidator: true},
		groups: {tagValidator: true},
		families: {tagValidator: true},
		genres: {tagValidator: true},
		platforms: {tagValidator: true},
		origins: {tagValidator: true},
		versions: {tagValidator: true},
		title: {presence: true}
	});
	return validationErrors;
}

function cleanKara(kara: Kara) {
	kara.title = kara.title.trim();
	//Trim spaces before and after elements.
	kara.series.forEach((e,i) => kara.series[i].name = e.name?.trim());
	kara.langs.forEach((e,i) => kara.langs[i].name = e.name?.trim());
	kara.singers.forEach((e,i) => kara.singers[i].name = e.name?.trim());
	kara.groups.forEach((e,i) => kara.groups[i].name = e.name?.trim());
	kara.songwriters.forEach((e,i) => kara.songwriters[i].name = e.name?.trim());
	kara.misc.forEach((e,i) => kara.misc[i].name = e.name?.trim());
	kara.creators.forEach((e,i) => kara.creators[i].name = e.name?.trim());
	kara.authors.forEach((e,i) => kara.authors[i].name = e.name?.trim());
	kara.origins.forEach((e,i) => kara.origins[i].name = e.name?.trim());
	kara.platforms.forEach((e,i) => kara.platforms[i].name = e.name?.trim());
	kara.versions.forEach((e,i) => kara.versions[i].name = e.name?.trim());
	kara.genres.forEach((e,i) => kara.genres[i].name = e.name?.trim());
	kara.families.forEach((e,i) => kara.families[i].name = e.name?.trim());
	// Format dates
	kara.created_at
		? kara.created_at = new Date(kara.created_at)
		: kara.created_at = new Date();
	kara.modified_at
		? kara.modified_at = new Date(kara.modified_at)
		: kara.modified_at = new Date();
	// Generate KID if not present
	if (!kara.kid) kara.kid = uuidV4();
}

interface ImportedFiles {
	lyrics: string,
	media: string
}

async function moveKaraToImport(kara: Kara, oldKara: DBKara): Promise<ImportedFiles> {
	const newMediaFile = kara.mediafile_orig
		? kara.mediafile + extname(kara.mediafile_orig)
		: kara.mediafile;
	const newSubFile = kara.subfile && kara.subfile_orig
		? kara.subfile + extname(kara.subfile_orig)
		: kara.subfile;
	// We don't need these anymore.
	delete kara.subfile_orig;
	delete kara.mediafile_orig;
	let sourceSubFile = '';
	let sourceMediaFile = '';
	// If we're modifying an existing song, we do different things depending on if the user submitted a new video or not.
	if (kara.noNewVideo && oldKara) {
		try {
			sourceMediaFile = (await resolveFileInDirs(oldKara.mediafile, resolvedPathRepos('Medias', oldKara.repository)))[0];
		} catch (err) {
			//Non fatal
		}
	} else {
		sourceMediaFile = resolve(resolvedPathTemp(), kara.mediafile);
	}
	// Detect which subtitle format we received
	if (kara.subfile) {
		sourceSubFile = resolve(resolvedPathTemp(), kara.subfile);
		const time = await fs.readFile(sourceSubFile);
		const subFormat = detectSubFileFormat(time.toString());
		let lyrics = '';
		if (subFormat === 'toyunda') {
			try {
				const fps = await findFPS(sourceMediaFile, getState().binPath.ffmpeg);
				const toyundaData = splitTime(time.toString('utf-8'));
				lyrics = toyundaToASS(toyundaData, fps);
			} catch(err) {
				logger.error('Error converting Toyunda subfile to ASS format', {service: 'KaraGen', obj: err});
				throw err;
			}
		} else if (subFormat === 'ultrastar') {
			try {
				lyrics = ultrastarToASS(time.toString('latin1'), {
					syllable_precision: true
				});
			} catch(err) {
				logger.error('Error converting Ultrastar subfile to ASS format', {service: 'KaraGen', obj: err});
				throw err;
			}
		} else if (subFormat === 'kar') {
			try {
				lyrics = karToASS(parseKar(time), {});
			} catch(err) {
				logger.error('Error converting KaraWin subfile to ASS format', {service: 'KaraGen', obj: err});
				throw err;
			}
		} else if (subFormat === 'karafun') {
			try {
				lyrics = karafunToASS(parseKfn(time.toString('utf-8'), 'utf-8', 'utf-8'), { offset: 0, useFileInstructions: true});
			} catch(err) {
				logger.error('Error converting Karafun subfile to ASS format', {service: 'KaraGen', obj: err});
				throw err;
			}
		} else if (subFormat === 'unknown') throw {code: 400, msg: 'SUBFILE_FORMAT_UNKOWN'};
		if (subFormat !== 'ass') await fs.writeFile(sourceSubFile, lyrics, 'utf-8');
	}
	// Let's move baby.
	if (sourceMediaFile) await copy(sourceMediaFile, resolve(resolvedPathImport(), newMediaFile), { overwrite: true });
	if (kara.subfile) await copy(sourceSubFile, resolve(resolvedPathImport(), newSubFile), { overwrite: true });
	return {
		lyrics: newSubFile,
		media: newMediaFile
	};
}

export async function generateKara(kara: Kara, karaDestDir: string, mediasDestDir: string, lyricsDestDir: string, oldKara?: DBKara) {
	logger.debug(`Kara passed to generateKara: ${JSON.stringify(kara)}`, {service: 'KaraGen'});
	let importFiles: ImportedFiles;
	try {
		cleanKara(kara);
		// Move files from temp directory to import, depending on the different cases.
		// First name media files and subfiles according to their extensions
		// Since temp files don't have any extension anymore
		importFiles = await moveKaraToImport(kara, oldKara);
		const newKara = await importKara(importFiles.media, importFiles.lyrics, kara, karaDestDir, mediasDestDir, lyricsDestDir, oldKara);
		return newKara;
	} catch(err) {
		logger.error('Error during generation', {service: 'KaraGen', obj: err});
		throw err;
	} finally {
		try {
			if (importFiles?.media) await fs.unlink(resolve(resolvedPathImport(), importFiles.media));
			if (importFiles?.lyrics) await fs.unlink(resolve(resolvedPathImport(), importFiles.lyrics));
		} catch(err) {
			// Non fatal
		}

	}
}

function defineFilename(kara: Kara): string {
	// Generate filename according to tags and type.
	if (kara) {
		const extraTags = [];
		if (kara.misc.map(t => t.name).includes('Fandub')) extraTags.push('DUB');
		if (kara.misc.map(t => t.name).includes('Remix')) extraTags.push('REMIX');
		if (kara.origins.map(t => t.name).includes('Special')) extraTags.push('SPECIAL');
		if (kara.origins.map(t => t.name).includes('OVA')) extraTags.push('OVA');
		if (kara.origins.map(t => t.name).includes('ONA')) extraTags.push('ONA');
		if (kara.origins.map(t => t.name).includes('Movie')) extraTags.push('MOVIE');
		if (kara.platforms.map(t => t.name).includes('Playstation 3')) extraTags.push('PS3');
		if (kara.platforms.map(t => t.name).includes('Playstation 2')) extraTags.push('PS2');
		if (kara.platforms.map(t => t.name).includes('Playstation')) extraTags.push('PSX');
		if (kara.platforms.map(t => t.name).includes('Playstation 4')) extraTags.push('PS4');
		if (kara.platforms.map(t => t.name).includes('Playstation Vita')) extraTags.push('PSV');
		if (kara.platforms.map(t => t.name).includes('Playstation Portable')) extraTags.push('PSP');
		if (kara.platforms.map(t => t.name).includes('XBOX 360')) extraTags.push('XBOX360');
		if (kara.platforms.map(t => t.name).includes('XBOX ONE')) extraTags.push('XBOXONE');
		if (kara.platforms.map(t => t.name).includes('Gamecube')) extraTags.push('GAMECUBE');
		if (kara.platforms.map(t => t.name).includes('N64')) extraTags.push('N64');
		if (kara.platforms.map(t => t.name).includes('DS')) extraTags.push('DS');
		if (kara.platforms.map(t => t.name).includes('3DS')) extraTags.push('3DS');
		if (kara.platforms.map(t => t.name).includes('PC')) extraTags.push('PC');
		if (kara.platforms.map(t => t.name).includes('Sega CD')) extraTags.push('SEGACD');
		if (kara.platforms.map(t => t.name).includes('Saturn')) extraTags.push('SATURN');
		if (kara.platforms.map(t => t.name).includes('Wii')) extraTags.push('WII');
		if (kara.platforms.map(t => t.name).includes('Wii U')) extraTags.push('WIIU');
		if (kara.platforms.map(t => t.name).includes('Switch')) extraTags.push('SWITCH');
		if (kara.platforms.map(t => t.name).includes('Dreamcast')) extraTags.push('DC');
		if (kara.families.map(t => t.name).includes('Video Game')) extraTags.push('GAME');
		const extraType = extraTags.length > 0
			? extraTags.join(' ') + ' '
			: '';
		const langs = kara.langs.map(t => t.name).sort();
		const lang = langs[0].toUpperCase();
		const singers = kara.singers.map(t => t.name).sort();
		const series = kara.series.map(t => t.name).sort();
		const types = kara.songtypes.map(t => t.name).sort();
		const extraTitle = kara.versions.length > 0
			? ` ~ ${kara.versions.map(t => t.name).sort().join(' ')} Vers`
			: '';
		return sanitizeFile(`${lang} - ${series.slice(0, 3).join(', ') || singers.slice(0, 3).join(', ')} - ${extraType}${types.join(' ')}${kara.songorder || ''} - ${kara.title}${extraTitle}`);
	}
}

function autoFillTags(kara: Kara, mediaFile: string) {
	if (kara.platforms.length > 0 && !kara.families.find((t: Tag) => t.name === 'Video Game')) {
		kara.families.push({name: 'Video Game'});
	}
	if (mediaFile.match(audioFileRegexp) && !kara.songtypes.find((t: Tag) => t.name === 'AUDIO')) {
		kara.songtypes.push({name: 'AUDIO'});
	}
	if (kara.duration >= 300 && !kara.misc.find((t: Tag) => t.name === 'Long')) {
		kara.misc.push({name: 'Long'});
	}
	// Autocreating groups based on song year
	// First remove all year groups.
	kara.groups = kara.groups.filter(t => t.name !== '50s' &&
		t.name !== '60s' &&
		t.name !== '70s' &&
		t.name !== '80s' &&
		t.name !== '90s' &&
		t.name !== '2000s' &&
		t.name !== '2010s' &&
		t.name !== '2020s'
	);
	if (+kara.year >= 1950 && +kara.year <= 1959) kara.groups.push({name: '50s'});
	if (+kara.year >= 1960 && +kara.year <= 1969) kara.groups.push({name: '60s'});
	if (+kara.year >= 1970 && +kara.year <= 1979) kara.groups.push({name: '70s'});
	if (+kara.year >= 1980 && +kara.year <= 1989) kara.groups.push({name: '80s'});
	if (+kara.year >= 1990 && +kara.year <= 1999) kara.groups.push({name: '90s'});
	if (+kara.year >= 2000 && +kara.year <= 2009) kara.groups.push({name: '2000s'});
	if (+kara.year >= 2010 && +kara.year <= 2019) kara.groups.push({name: '2010s'});
	if (+kara.year >= 2020 && +kara.year <= 2029) kara.groups.push({name: '2020s'});
}

async function importKara(mediaFile: string, subFile: string, kara: Kara, karaDestDir: string, mediasDestDir: string, lyricsDestDir: string, oldKara: DBKara) {
	try {
		logger.info(`Generating kara file for ${kara.title}`, {service: 'KaraGen'});
		// Extract media info first because we need duration to determine if we add the long tag or not automagically.
		let mediaPath: string;
		let mediaInfo: MediaInfo;
		if (!kara.noNewVideo) {
			mediaPath = resolve(resolvedPathImport(), mediaFile);
			mediaInfo = await extractMediaTechInfos(mediaPath);
			kara.duration = mediaInfo.duration;
			kara.gain = mediaInfo.gain;
			kara.loudnorm = mediaInfo.loudnorm;
		} else {
			mediaPath = resolve(mediasDestDir, mediaFile);
		}

		autoFillTags(kara, mediaFile);

		// Determine kara file final form
		const karaFile = defineFilename(kara);

		// Determine subfile name
		kara.mediafile = karaFile + extname(mediaFile);
		kara.subfile = subFile ?
			karaFile + extname(subFile || '.ass')
			: undefined;

		// Determine subfile / extract it from MKV depending on what we have
		const subPath = await findSubFile(mediaPath, kara, subFile);
		if(subPath) kara.subchecksum = await extractAssInfos(subPath);

		// Processing tags in our kara to determine which we merge, which we create, etc. Basically assigns them UUIDs.

		await processTags(kara, oldKara);

		return await generateAndMoveFiles(mediaPath, subPath, kara, karaDestDir, mediasDestDir, lyricsDestDir, oldKara);
	} catch(err) {
		sentry.addErrorInfo('args', JSON.stringify(arguments, null, 0));
		sentry.error(err);
		logger.error(`Error importing ${kara}`, {service: 'KaraGen', obj: err});
		throw err;
	}
}

/** Replace tags by UUIDs, create them if necessary */
async function processTags(kara: Kara, oldKara?: DBKara) {
	const allTags = [];
	for (const type of Object.keys(tagTypes)) {
		if (kara[type]) {
			// Remove duplicates
			kara[type] = kara[type].filter((tag: any, i: number, self: any) => i === self.findIndex((t: any) => t.name === tag.name));
			// Push tags
			for (const i in kara[type]) {
				allTags.push({
					name: kara[type][i].name,
					tid: kara[type][i].tid,
					types: [tagTypes[type]],
					karaType: tagTypes[type],
					repository: kara.repository
				});
			}
		}
	}
	for (const i in allTags) {
		const tag = allTags[i];
		// TID is not provided. We'll try to find a similar tag
		if (!tag.tid) {
			const y = allTags.findIndex(t => t.name === tag.name && t.karaType !== tag.karaType);
			if (y > -1 && allTags[y].tid) {
				// y has a TID so it's known, we'll use it as reference
				allTags[i].tid = allTags[y].tid;
				// Add type of i to y
				let knownTag = await getTag(allTags[y].tid);
				// Tag not found in base, but we have its TID, so... it must be added with this song.
				if (!knownTag) knownTag = allTags[y];
				const types = [].concat(knownTag.types, allTags[i].types);
				allTags[i].types = types;
				allTags[y].types = types;
				await editTag(allTags[y].tid, {
					...knownTag,
					types: allTags[y].types
				}, {silent: false, refresh: false, repoCheck: true});
			}
			if (y > -1 && !allTags[y].tid) {
				// y has no TID either, we're going to merge them
				const types = [].concat(allTags[y].types, allTags[i].types);
				allTags[y].types = types;
				allTags[i].types = types;
				allTags[i].i18n = { eng: allTags[i].name };
				allTags[i].repository = kara.repository;
				allTags[y].repository = kara.repository;
				const knownTag = await addTag(allTags[i], {silent: false, refresh: false});
				allTags[y].tid = knownTag.tid;
				allTags[i].tid = knownTag.tid;
			}
			if (y < 0) {
				// No dupe found
				allTags[i].i18n = { eng: allTags[i].name };
				allTags[i].repository = kara.repository;
				const knownTag = await getOrAddTagID(allTags[i]);
				allTags[i].tid = knownTag.id;
				if (!kara.newTags) kara.newTags = knownTag.new;
			}
		}
	}
	for (const type of Object.keys(tagTypes)) {
		if (kara[type]) {
			const tids = [];
			allTags.forEach(t => {
				if (t.karaType === tagTypes[type]) {
					tids.push({tid: t.tid, name: t.name, repository: t.repository});
				}
			});
			kara[type] = tids;
		}
	}
	//If oldKara is provided, it means we're editing a kara.
	//Checking if tags differ so we set the newTags boolean accordingly
	if (oldKara) {
		const newTags = allTags.map(t => `${t.tid}~${t.karaType}`).filter((elem, pos, arr) => arr.indexOf(elem) === pos);
		kara.newTags = newTags.sort().toString() !== oldKara.tid.sort().toString();
	}
}

async function findSubFile(mediaPath: string, kara: Kara, subFile: string): Promise<string> {
	// Replacing file extension by .ass in the same directory
	// Default is media + .ass instead of media extension.
	// If subfile exists, assFile becomes that.
	const assFile = subFile
		? resolve(resolvedPathImport(), subFile)
		: undefined;
	if (await asyncExists(assFile) && subFile) {
		// If a subfile is found, adding it to karaData
		kara.subfile = replaceExt(kara.mediafile, '.ass');
		return assFile;
	} else if (mediaPath.endsWith('.mkv')) {
		// In case of a mkv, we're going to extract its subtitles track
		try {
			const extractFile = await extractVideoSubtitles(mediaPath, kara.kid);
			kara.subfile = replaceExt(kara.mediafile, '.ass');
			return extractFile;
		} catch (err) {
			// Non-blocking.
			logger.info(`Could not extract subtitles from video file ${mediaPath}`, {service: 'KaraGen', obj: err});
			return null;
		}
	} else {
		return null;
	}
}

async function generateAndMoveFiles(mediaPath: string, subPath: string, kara: Kara, karaDestDir: string, mediaDestDir: string, lyricsDestDir: string, oldKara?: DBKara): Promise<NewKara> {
	// Generating kara file in the first kara folder
	const karaFilename = replaceExt(kara.mediafile, '.kara.json');
	const karaPath = resolve(karaDestDir, karaFilename);
	if (!subPath) kara.subfile = null;
	const mediaDest = kara.noNewVideo && oldKara
		? resolve(mediaDestDir, oldKara.mediafile)
		: resolve(mediaDestDir, kara.mediafile);
	const subDest = subPath && kara.subfile
		? resolve(lyricsDestDir, kara.subfile)
		: undefined;
	try {
		// Moving media in the first media folder.
		if (!kara.noNewVideo && extname(mediaDest).toLowerCase() === '.mp4') {
			// This kind of copies the new mediafile, so we unlink it after that.
			await webOptimize(mediaPath, mediaDest);
			await fs.unlink(mediaPath);
			delete kara.noNewVideo;
		} else {
			if (!kara.noNewVideo || mediaPath !== mediaDest) await asyncMove(mediaPath, mediaDest, { overwrite: true });
		}
		// Extracting media info again here and now because we might have had to weboptimize it earlier.
		if (await asyncExists(mediaDest)) {
			const mediainfo = await extractMediaTechInfos(mediaDest, kara.mediasize);
			if (mediainfo.size) {
				kara.gain = mediainfo.gain;
				kara.duration = mediainfo.duration;
				kara.mediasize = mediainfo.size;
				kara.loudnorm = mediainfo.loudnorm;
			} else if (!mediainfo.size && oldKara) {
				kara.gain = oldKara.gain;
				kara.duration = oldKara.duration;
				kara.mediasize = oldKara.mediasize;
				kara.loudnorm = oldKara.loudnorm;
			}
		} else {
			if (oldKara) {
				kara.gain = oldKara.gain;
				kara.duration = oldKara.duration;
				kara.mediasize = oldKara.mediasize;
				kara.loudnorm = oldKara.loudnorm;
			} else {
				throw `WTF BBQ? Video ${mediaDest} has been removed while KM is running or something? Are you really trying to make devs' life harder by provoking bugs that should never happen? Do you think of the time we spend searching for bugs or fixing stuff Kmeuh finds weird but isn't? Huh?`;
			}
		}
		// Moving subfile in the first lyrics folder.
		if (subDest) await asyncMove(subPath, subDest, { overwrite: true });
	} catch (err) {
		throw `Error while moving files. (${err})`;
	}
	await writeKara(karaPath, kara);
	return {
		data: kara,
		file: karaPath
	};
}
