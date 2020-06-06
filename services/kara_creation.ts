/**
 * .kara files generation
 */

import {convertKarToAss as karToASS, parseKar} from 'kar-to-ass';
import {convertKfnToAss as karafunToASS, parseKfn} from 'kfn-to-ass';
import {extname, resolve} from 'path';
import {convertToASS as toyundaToASS, findFPS, splitTime} from 'toyunda2ass';
import {convertToASS as ultrastarToASS} from 'ultrastar2ass';
import { v4 as uuidV4 } from 'uuid';

import {addTag, editTag, getOrAddTagID,getTag} from '../../services/tag';
import { getState } from '../../utils/state';
import {
	extractAssInfos, extractMediaTechInfos, extractVideoSubtitles, writeKara
} from '../dao/karafile';
import { DBKara } from '../types/database/kara';
import {Kara, NewKara} from '../types/kara';
import {resolvedPathImport, resolvedPathRepos,resolvedPathTemp} from '../utils/config';
import {audioFileRegexp,tagTypes} from '../utils/constants';
import { webOptimize } from '../utils/ffmpeg';
import {asyncCopy, asyncExists, asyncMove, asyncReadFile, asyncUnlink, asyncWriteFile, detectSubFileFormat, replaceExt, resolveFileInDirs,sanitizeFile} from '../utils/files';
import logger from '../utils/logger';
import {check} from '../utils/validators';

export async function generateKara(kara: Kara, karaDestDir: string, mediasDestDir: string, lyricsDestDir: string, oldKara?: DBKara) {
	logger.debug(`[KaraGen] Kara passed to generateKara: ${JSON.stringify(kara)}`);
	if (kara.singers.length < 1 && kara.series.length < 1) throw 'Series and singers cannot be empty in the same time';
	if (!kara.mediafile) throw 'No media file uploaded';
	const validationErrors = check(kara, {
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
		title: {presence: true}
	});
	// Move files from temp directory to import, depending on the different cases.
	// First name media files and subfiles according to their extensions
	// Since temp files don't have any extension anymore
	const newMediaFile = kara.mediafile_orig ? `${kara.mediafile}${extname(kara.mediafile_orig)}` : kara.mediafile;
	let newSubFile: string;
	kara.subfile && kara.subfile_orig
		? newSubFile = `${kara.subfile}${extname(kara.subfile_orig)}`
		: newSubFile = kara.subfile;
	// We don't need these anymore.
	delete kara.subfile_orig;
	delete kara.mediafile_orig;
	// Detect which subtitle format we received
	let sourceSubFile = '';
	let sourceMediaFile = '';
	if (kara.noNewVideo && oldKara) {
		try {
			sourceMediaFile = (await resolveFileInDirs(oldKara.mediafile, resolvedPathRepos('Medias', oldKara.repository)))[0];
		} catch (err) {
			//Non fatal
		}
	} else {
		sourceMediaFile = resolve(resolvedPathTemp(), kara.mediafile);
	}
	if (kara.subfile) {
		sourceSubFile = resolve(resolvedPathTemp(), kara.subfile);
		const time = await asyncReadFile(sourceSubFile);
		const subFormat = await detectSubFileFormat(time.toString());
		if (subFormat === 'toyunda') {
			try {
				const fps = await findFPS(sourceMediaFile, getState().binPath.ffmpeg);
				const toyundaData = splitTime(time.toString());
				const toyundaConverted = toyundaToASS(toyundaData, fps);
				await asyncWriteFile(sourceSubFile, toyundaConverted, 'utf-8');
			} catch(err) {
				logger.error(`[KaraGen] Error converting Toyunda subfile to ASS format : ${err}`);
				throw Error(err);
			}
		} else if (subFormat === 'ultrastar') {
			try {
				await asyncWriteFile(sourceSubFile, ultrastarToASS(time.toString(), {
					syllable_precision: true
				}), 'utf-8');
			} catch(err) {
				logger.error(`[KaraGen] Error converting Ultrastar subfile to ASS format : ${err}`);
				throw Error(err);
			}
		} else if (subFormat === 'kar') {
			try {
				await asyncWriteFile(sourceSubFile, karToASS(parseKar(time), {}), 'utf-8');
			} catch(err) {
				logger.error(`[KaraGen] Error converting Karafun subfile to ASS format : ${err}`);
				throw Error(err);
			}
		} else if (subFormat === 'karafun') {
			try {
				await asyncWriteFile(sourceSubFile, karafunToASS(parseKfn(time.toString(), 'utf-8', 'utf-8'), { offset: 0, useFileInstructions: true}), 'utf-8');
			} catch(err) {
				logger.error(`[KaraGen] Error converting Karafun subfile to ASS format : ${err}`);
				throw Error(err);
			}
		} else if (subFormat === 'unknown') throw 'Unable to determine sub file format';
	}
	// Let's move baby.
	if (sourceMediaFile) await asyncCopy(sourceMediaFile, resolve(resolvedPathImport(), newMediaFile), { overwrite: true });
	if (kara.subfile) await asyncCopy(sourceSubFile, resolve(resolvedPathImport(), newSubFile), { overwrite: true });
	try {
		if (validationErrors) throw JSON.stringify(validationErrors);
		kara.title = kara.title.trim();
		//Trim spaces before and after elements.
		kara.series.forEach((e,i) => kara.series[i].name = e.name.trim());
		kara.langs.forEach((e,i) => kara.langs[i].name = e.name.trim());
		kara.singers.forEach((e,i) => kara.singers[i].name = e.name.trim());
		kara.groups.forEach((e,i) => kara.groups[i].name = e.name.trim());
		kara.songwriters.forEach((e,i) => kara.songwriters[i].name = e.name.trim());
		kara.misc.forEach((e,i) => kara.misc[i].name = e.name.trim());
		kara.creators.forEach((e,i) => kara.creators[i].name = e.name.trim());
		kara.authors.forEach((e,i) => kara.authors[i].name = e.name.trim());
		kara.origins.forEach((e,i) => kara.origins[i].name = e.name.trim());
		kara.platforms.forEach((e,i) => kara.platforms[i].name = e.name.trim());
		kara.genres.forEach((e,i) => kara.genres[i].name = e.name.trim());
		kara.families.forEach((e,i) => kara.families[i].name = e.name.trim());
		// Format dates
		kara.created_at
			? kara.created_at = new Date(kara.created_at)
			: kara.created_at = new Date();
		kara.modified_at
			? kara.modified_at = new Date(kara.modified_at)
			: kara.modified_at = new Date();
		// Generate KID if not present
		if (!kara.kid) kara.kid = uuidV4();
		const newKara = await importKara(newMediaFile, newSubFile, kara, karaDestDir, mediasDestDir, lyricsDestDir, oldKara);
		return newKara;
	} catch(err) {
		logger.error(`[KaraGen] Error during generation : ${err}`);
		if (await asyncExists(newMediaFile)) await asyncUnlink(newMediaFile);
		if (newSubFile) if (await asyncExists(newSubFile)) await asyncUnlink(newSubFile);
		throw err;
	}
}

function defineFilename(data: Kara): string {
	// Generate filename according to tags and type.
	if (data) {
		const extraTags = [];
		if (data.misc.map(t => t.name).includes('Cover')) extraTags.push('COVER');
		if (data.misc.map(t => t.name).includes('Fandub')) extraTags.push('DUB');
		if (data.misc.map(t => t.name).includes('Remix')) extraTags.push('REMIX');
		if (data.origins.map(t => t.name).includes('Special')) extraTags.push('SPECIAL');
		if (data.origins.map(t => t.name).includes('OVA')) extraTags.push('OVA');
		if (data.origins.map(t => t.name).includes('ONA')) extraTags.push('ONA');
		if (data.origins.map(t => t.name).includes('Movie')) extraTags.push('MOVIE');
		if (data.platforms.map(t => t.name).includes('Playstation 3')) extraTags.push('PS3');
		if (data.platforms.map(t => t.name).includes('Playstation 2')) extraTags.push('PS2');
		if (data.platforms.map(t => t.name).includes('Playstation')) extraTags.push('PSX');
		if (data.platforms.map(t => t.name).includes('Playstation 4')) extraTags.push('PS4');
		if (data.platforms.map(t => t.name).includes('Playstation Vita')) extraTags.push('PSV');
		if (data.platforms.map(t => t.name).includes('Playstation Portable')) extraTags.push('PSP');
		if (data.platforms.map(t => t.name).includes('XBOX 360')) extraTags.push('XBOX360');
		if (data.platforms.map(t => t.name).includes('XBOX ONE')) extraTags.push('XBOXONE');
		if (data.platforms.map(t => t.name).includes('Gamecube')) extraTags.push('GAMECUBE');
		if (data.platforms.map(t => t.name).includes('N64')) extraTags.push('N64');
		if (data.platforms.map(t => t.name).includes('DS')) extraTags.push('DS');
		if (data.platforms.map(t => t.name).includes('3DS')) extraTags.push('3DS');
		if (data.platforms.map(t => t.name).includes('PC')) extraTags.push('PC');
		if (data.platforms.map(t => t.name).includes('Sega CD')) extraTags.push('SEGACD');
		if (data.platforms.map(t => t.name).includes('Saturn')) extraTags.push('SATURN');
		if (data.platforms.map(t => t.name).includes('Wii')) extraTags.push('WII');
		if (data.platforms.map(t => t.name).includes('Wii U')) extraTags.push('WIIU');
		if (data.platforms.map(t => t.name).includes('Switch')) extraTags.push('SWITCH');
		if (data.families.map(t => t.name).includes('Video Game')) extraTags.push('GAME');
		if (data.misc.map(t => t.name).includes('Audio Only')) extraTags.push('AUDIO');
		let extraType = '';
		if (extraTags.length > 0) extraType = extraTags.join(' ') + ' ';
		const fileLang = data.langs[0].name.toUpperCase();
		const singers = data.singers.map(t => t.name);
		singers.sort();
		const series = data.series.map(t => t.name);
		singers.sort();
		return sanitizeFile(`${fileLang} - ${series.slice(0, 3).join(', ') || singers.slice(0, 3).join(', ')} - ${extraType}${data.songtypes.map(s => s.name).join(' ')}${data.songorder || ''} - ${data.title}`);
	}
}

async function importKara(mediaFile: string, subFile: string, data: Kara, karaDestDir: string, mediasDestDir: string, lyricsDestDir: string, oldKara: DBKara) {
	if (data.platforms.length > 0 && !data.families.map(t => t.name).includes('Video Game')) data.families.push({name: 'Video Game'});
	if (mediaFile.match(audioFileRegexp) && !data.misc.map(t => t.name).includes('Audio Only')) data.misc.push({name: 'Audio Only'});

	// Extract media info first because we need duration to determine if we add the long tag or not automagically.
	let mediaPath;
	if (!data.noNewVideo) {
		mediaPath = resolve(resolvedPathImport(), mediaFile);
		const mediainfo = await extractMediaTechInfos(mediaPath);
		if (mediainfo.duration >= 300) data.misc.push({name: 'Long'});
	} else {
		mediaPath = resolve(mediasDestDir, mediaFile);
	}
	const kara = defineFilename(data);
	logger.info(`[KaraGen] Generating kara file for ${kara}`);
	let karaSubFile: string;
	!subFile
		? karaSubFile = subFile
		: karaSubFile = `${kara}${extname(subFile || '.ass')}`;
	data.mediafile = `${kara}${extname(mediaFile)}`;
	data.subfile = karaSubFile;

	let subPath: string;
	if (subFile) subPath = await findSubFile(mediaPath, data, subFile);

	// Autocreating groups based on song year
	// First remove all year groups.
	data.groups = data.groups.filter(t => t.name !== '50s' &&
		t.name !== '60s' &&
		t.name !== '70s' &&
		t.name !== '80s' &&
		t.name !== '90s' &&
		t.name !== '2000s' &&
		t.name !== '2010s' &&
		t.name !== '2020s'
	);
	if (+data.year >= 1950 && +data.year <= 1959) data.groups.push({name: '50s'});
	if (+data.year >= 1960 && +data.year <= 1969) data.groups.push({name: '60s'});
	if (+data.year >= 1970 && +data.year <= 1979) data.groups.push({name: '70s'});
	if (+data.year >= 1980 && +data.year <= 1989) data.groups.push({name: '80s'});
	if (+data.year >= 1990 && +data.year <= 1999) data.groups.push({name: '90s'});
	if (+data.year >= 2000 && +data.year <= 2009) data.groups.push({name: '2000s'});
	if (+data.year >= 2010 && +data.year <= 2019) data.groups.push({name: '2010s'});
	if (+data.year >= 2020 && +data.year <= 2029) data.groups.push({name: '2020s'});

	try {
		if (subFile) data.subchecksum = await extractAssInfos(subPath);
		data = await processTags(data, oldKara);
		return await generateAndMoveFiles(mediaPath, subPath, data, karaDestDir, mediasDestDir, lyricsDestDir, oldKara);
	} catch(err) {
		console.log(err);
		const error = `Error importing ${kara} : ${err}`;
		logger.error(`[KaraGen] ${error}`);
		throw error;
	}
}

/** Replace tags by UUIDs, create them if necessary */
async function processTags(kara: Kara, oldKara?: DBKara): Promise<Kara> {
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
				}, {refresh: false});
			}
			if (y > -1 && !allTags[y].tid) {
				// y has no TID either, we're going to merge them
				const types = [].concat(allTags[y].types, allTags[i].types);
				allTags[y].types = types;
				allTags[i].types = types;
				allTags[i].i18n = { eng: allTags[i].name };
				allTags[i].repository = kara.repository;
				allTags[y].repository = kara.repository;
				const knownTag = await addTag(allTags[i], {refresh: false});
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

	return kara;
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

async function generateAndMoveFiles(mediaPath: string, subPath: string, karaData: Kara, karaDestDir: string, mediaDestDir: string, lyricsDestDir: string, oldKara?: DBKara): Promise<NewKara> {
	// Generating kara file in the first kara folder
	const karaFilename = replaceExt(karaData.mediafile, '.kara');
	const karaPath = resolve(karaDestDir, `${karaFilename}.json`);
	if (!subPath) karaData.subfile = null;
	const mediaDest = karaData.noNewVideo && oldKara
		? resolve(mediaDestDir, oldKara.mediafile)
		: resolve(mediaDestDir, karaData.mediafile);
	let subDest: string;
	if (subPath && karaData.subfile) subDest = resolve(lyricsDestDir, karaData.subfile);
	try {
		// Moving media in the first media folder.
		if (!karaData.noNewVideo && extname(mediaDest).toLowerCase() === '.mp4') {
			await webOptimize(mediaPath, mediaDest);
			await asyncUnlink(mediaPath);
			delete karaData.noNewVideo;
		} else {
			if (!karaData.noNewVideo || mediaPath !== mediaDest) await asyncMove(mediaPath, mediaDest, { overwrite: true });
		}
		// Extracting media info here and now because we might have had to weboptimize it earlier.
		if (await asyncExists(mediaDest)) {
			const mediainfo = await extractMediaTechInfos(mediaDest, karaData.mediasize);
			if (mediainfo.size) {
				karaData.mediagain = mediainfo.gain;
				karaData.mediaduration = mediainfo.duration;
				karaData.mediasize = mediainfo.size;
			} else if (!mediainfo.size && oldKara) {
				karaData.mediagain = oldKara.gain;
				karaData.mediaduration = oldKara.duration;
				karaData.mediasize = oldKara.mediasize;
			}
		} else {
			if (oldKara) {
				karaData.mediagain = oldKara.gain;
				karaData.mediaduration = oldKara.duration;
				karaData.mediasize = oldKara.mediasize;
			} else {
				throw `WTF BBQ? Video ${mediaDest} has been removed while KM is running or something? Are you really trying to make devs' life harder by provoking bugs that should never happen? Do you think of the time we spend searching for bugs or fixing stuff Kmeuh finds weird but isn't? Huh?`;
			}
		}
		// Moving subfile in the first lyrics folder.
		if (subDest) await asyncMove(subPath, subDest, { overwrite: true });
	} catch (err) {
		throw `Error while moving files. (${err})`;
	}
	await writeKara(karaPath, karaData);
	return {
		data: karaData,
		file: karaPath
	};
}
