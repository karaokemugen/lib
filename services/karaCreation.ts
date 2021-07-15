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
import { hooks } from '../dao/hook';
import {
	extractAssInfos, extractMediaTechInfos, extractVideoSubtitles, writeKara
} from '../dao/karafile';
import { DBKara } from '../types/database/kara';
import {Kara, MediaInfo, NewKara} from '../types/kara';
import { Tag } from '../types/tag';
import {resolvedPathImport, resolvedPathRepos,resolvedPathTemp} from '../utils/config';
import {getTagTypeName, tagTypes} from '../utils/constants';
import { webOptimize } from '../utils/ffmpeg';
import {asyncExists, asyncMove, detectSubFileFormat, replaceExt, resolveFileInDirs,sanitizeFile} from '../utils/files';
import logger from '../utils/logger';
import { regexFromString } from '../utils/objectHelpers';
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
		title: {presence: true},
		ignoreHooks: {boolUndefinedValidator: true}
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
		const fileTags = {
			extras: [],
			types: []
		};
		// Let's browse tags to add those which have a karafile_tag
		for (const tagType of Object.keys(tagTypes)) {
			for (const tag of kara[tagType]) {
				if (tag.karafile_tag) {
					if (tagType === 'songtypes') {
						fileTags.types.push(tag.karafile_tag);
					} else {
						fileTags.extras.push(tag.karafile_tag);
					}
				}
			}
		}
		const extraType = fileTags.extras.length > 0
			? fileTags.extras.join(' ') + ' '
			: '';
		const langs = kara.langs.map(t => t.name).sort();
		const lang = langs[0].toUpperCase();
		const singers = kara.singers.map(t => t.name).sort();
		const series = kara.series.map(t => t.name).sort();
		const types = fileTags.types.sort().join(' ');
		const extraTitle = kara.versions.length > 0
			? ` ~ ${kara.versions.map(t => t.name).sort().join(' ')} Vers`
			: '';
		return sanitizeFile(`${lang} - ${series.slice(0, 3).join(', ') || singers.slice(0, 3).join(', ')} - ${extraType}${types}${kara.songorder || ''} - ${kara.title}${extraTitle}`);
	}
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

		// Processing tags in our kara to determine which we merge, which we create, etc. Basically assigns them UUIDs.

		await processTags(kara, oldKara);

		await applyKaraHooks(kara, mediaFile);

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

		return await generateAndMoveFiles(mediaPath, subPath, kara, karaDestDir, mediasDestDir, lyricsDestDir, oldKara);
	} catch(err) {
		sentry.addErrorInfo('args', JSON.stringify(arguments, null, 0));
		sentry.error(err);
		logger.error(`Error importing ${kara}`, {service: 'KaraGen', obj: err});
		throw err;
	}
}

function testCondition(condition: string, value: number): boolean {
	if (condition.startsWith('<')) {
		return value < +condition.replace(/</, '');
	} else if (condition.startsWith('>')) {
		return value > +condition.replace(/>/, '');
	} else if (condition.startsWith('<=')) {
		return value <= +condition.replace(/<=/, '');
	} else if (condition.startsWith('>+')) {
		return value >= +condition.replace(/>=/, '');
	} else if (condition.includes('-')) {
		const [low, high] = condition.split('-');
		return value >= +low && value <= +high;
	} else {
		// Should not happen but you never know.
		return false;
	}
}

/** Read all hooks and apply them accordingly */
async function applyKaraHooks(kara: Kara, mediaFile: string) {
	for (const hook of hooks.filter(h => h.repository === kara.repository)) {
		// First check if conditions are met.
		let conditionsMet = false;
		if (hook.conditions.duration) {
			conditionsMet = testCondition(hook.conditions.duration, kara.duration);
		}
		if (hook.conditions.year) {
			conditionsMet = testCondition(hook.conditions.year, kara.year);
		}
		if (hook.conditions.mediaFileRegexp) {
			const regexp = regexFromString(hook.conditions.mediaFileRegexp);
			if (regexp instanceof RegExp) {
				conditionsMet = regexp.test(mediaFile);
			}
		}
		if (hook.conditions.tagPresence) {
			for (const tid of hook.conditions.tagPresence) {
				if (conditionsMet) break;
				for (const type of Object.keys(tagTypes)) {
					if (conditionsMet) break;
					if (kara[type] && kara[type].find((t: Tag) => t.tid === tid)) {
						conditionsMet = true;
					}
				}
			}
		}
		if (hook.conditions.tagNumber) {
			for (const type of Object.keys(hook.conditions.tagNumber)) {
				if (isNaN(hook.conditions.tagNumber[type])) break;
				if (kara[type] && kara[type].length > hook.conditions.tagNumber[type]) {
					conditionsMet = true;
					break;
				}
			}
		}

		// Finished testing conditions.
		if (conditionsMet) {
			logger.info(`Applying hook ${hook.name} to karaoke data`, {service: 'Hooks'});
			if (hook.actions.addTag) {
				for (const addTag of hook.actions.addTag) {
					const tag = await getTag(addTag.tid);
					if (!tag) {
						logger.warn(`Unable to find tag ${addTag.tid} in database, skipping`, {service: 'Hooks'});
						continue;
					}
					const type = getTagTypeName(addTag.type);
					if (!kara[type].includes(addTag.tid)) kara[type].push(addTag.tid);
				}
			}
		}
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
					karafile_tag: kara[type][i].karafile_tag,
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
