/**
 * .kara.json files generation
 */

import { promises as fs } from 'fs';
import { convertKarToAss as karToASS, parseKar } from 'kar-to-ass';
import { convertKfnToAss as karafunToASS, parseKfn } from 'kfn-to-ass';
import { extname, resolve } from 'path';
import { convertToASS as toyundaToASS, findFPS, splitTime } from 'toyunda2ass';
import { convertToASS as ultrastarToASS } from 'ultrastar2ass';

import { getTag } from '../../services/tag';
import { getState } from '../../utils/state';
import { hooks } from '../dao/hook';
import { extractMediaTechInfos, verifyKaraData } from '../dao/karafile';
import { KaraFileV4 } from '../types/kara';
import { Tag } from '../types/tag';
import { resolvedPath } from '../utils/config';
import { getTagTypeName, tagTypes } from '../utils/constants';
import { webOptimize } from '../utils/ffmpeg';
import { detectSubFileFormat, sanitizeFile } from '../utils/files';
import logger from '../utils/logger';
import { regexFromString } from '../utils/objectHelpers';

export async function processSubfile(file: string, mediafile: string) {
	const subfile = resolve(resolvedPath('Temp'), file);
	const time = await fs.readFile(subfile);
	const subFormat = detectSubFileFormat(time.toString());
	let lyrics = '';
	if (subFormat === 'toyunda') {
		try {
			const fps = await findFPS(mediafile, getState().binPath.ffmpeg);
			const toyundaData = splitTime(time.toString('utf-8'));
			lyrics = toyundaToASS(toyundaData, fps);
		} catch (err) {
			logger.error('Error converting Toyunda subfile to ASS format', {
				service: 'KaraGen',
				obj: err,
			});
			throw err;
		}
	} else if (subFormat === 'ultrastar') {
		try {
			lyrics = ultrastarToASS(time.toString('latin1'), {
				syllable_precision: true,
			});
		} catch (err) {
			logger.error('Error converting Ultrastar subfile to ASS format', {
				service: 'KaraGen',
				obj: err,
			});
			throw err;
		}
	} else if (subFormat === 'kar') {
		try {
			lyrics = karToASS(parseKar(time), {});
		} catch (err) {
			logger.error('Error converting KaraWin subfile to ASS format', {
				service: 'KaraGen',
				obj: err,
			});
			throw err;
		}
	} else if (subFormat === 'karafun') {
		try {
			lyrics = karafunToASS(
				parseKfn(time.toString('utf-8'), 'utf-8', 'utf-8'),
				{ offset: 0, useFileInstructions: true }
			);
		} catch (err) {
			logger.error('Error converting Karafun subfile to ASS format', {
				service: 'KaraGen',
				obj: err,
			});
			throw err;
		}
	} else if (subFormat === 'unknown')
		throw { code: 400, msg: 'SUBFILE_FORMAT_UNKOWN' };
	if (subFormat !== 'ass') await fs.writeFile(subfile, lyrics, 'utf-8');
}

export async function previewHooks(kara: KaraFileV4) {
	try {
		verifyKaraData(kara);
	} catch (err) {
		throw { code: 400, msg: err };
	}
	const addedTags = await applyKaraHooks(kara);
	return addedTags;
}

export async function defineFilename(kara: KaraFileV4): Promise<string> {
	// Generate filename according to tags and type.
	const fileTags = {
		extras: [],
		types: [],
	};
	const karaTags = {
		singers: [],
		series: [],
		langs: [],
		versions: [],
	};
	// Let's browse tags to add those which have a karafile_tag
	for (const tagType of Object.keys(tagTypes)) {
		if (kara.data.tags[tagType]) {
			for (const tid of kara.data.tags[tagType]) {
				const tag = await getTag(tid);
				if (tag.karafile_tag) {
					if (tagType === 'songtypes') {
						fileTags.types.push(tag.karafile_tag);
					} else {
						fileTags.extras.push(tag.karafile_tag);
					}
				}
				if (
					tagType === 'versions' ||
					tagType === 'langs' ||
					tagType === 'singers' ||
					tagType === 'series'
				) {
					karaTags[tagType].push(tag);
				}
			}
		}
	}
	const extraType =
		fileTags.extras.length > 0 ? fileTags.extras.join(' ') + ' ' : '';
	const langs = karaTags.langs.map(t => t.name).sort();
	const lang = langs[0].toUpperCase();
	const singers = karaTags.singers
		? karaTags.singers.map(t => t.name).sort()
		: [];
	const series = karaTags.series ? karaTags.series.map(t => t.name).sort() : [];

	const types = fileTags.types.sort().join(' ');
	const extraTitle =
		karaTags.versions.length > 0
			? ` ~ ${karaTags.versions
					.map(t => t.name)
					.sort()
					.join(' ')} Vers`
			: '';
	return sanitizeFile(
		`${lang} - ${
			series.slice(0, 3).join(', ') || singers.slice(0, 3).join(', ')
		} - ${extraType}${types}${kara.data.songorder || ''} - ${
			kara.data.titles['eng'] || 'No title'
		}${extraTitle}`
	);
}

export async function processUploadedMedia(
	filename: string,
	origFilename: string
) {
	const mediaPath = resolve(resolvedPath('Temp'), filename);
	const mediaDest = resolve(
		resolvedPath('Temp'),
		`processed_${filename}${extname(origFilename)}`
	);
	if (origFilename.endsWith('.mp4')) {
		await webOptimize(mediaPath, mediaDest);
		await fs.unlink(mediaPath);
	} else {
		await fs.rename(mediaPath, mediaDest);
	}
	return extractMediaTechInfos(mediaDest);
}

export function determineMediaAndLyricsFilenames(
	kara: KaraFileV4,
	karaFile: string
) {
	const mediafile = karaFile + extname(kara.medias[0].filename);
	const lyricsfile =
		kara.medias[0].lyrics.length > 0
			? karaFile + (extname(kara.medias[0].lyrics[0].filename || '') || '.ass')
			: undefined;
	return {
		mediafile,
		lyricsfile,
	};
}

function testCondition(condition: string, value: number): boolean {
	if (condition.startsWith('<')) {
		return value < +condition.replace(/</, '');
	} else if (condition.startsWith('>')) {
		return value > +condition.replace(/>/, '');
	} else if (condition.startsWith('<=')) {
		return value <= +condition.replace(/<=/, '');
	} else if (condition.startsWith('>=')) {
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
export async function applyKaraHooks(kara: KaraFileV4): Promise<Tag[]> {
	const addedTags: Tag[] = [];
	for (const hook of hooks.filter(h => h.repository === kara.data.repository)) {
		// First check if conditions are met.
		let conditionsMet = false;
		if (hook.conditions.duration) {
			conditionsMet = testCondition(
				hook.conditions.duration,
				kara.medias[0].duration
			);
		}
		if (hook.conditions.year) {
			conditionsMet = testCondition(hook.conditions.year, kara.data.year);
		}
		if (hook.conditions.mediaFileRegexp) {
			const regexp = regexFromString(hook.conditions.mediaFileRegexp);
			if (regexp instanceof RegExp) {
				conditionsMet = regexp.test(kara.medias[0].filename);
			}
		}
		if (hook.conditions.tagPresence) {
			for (const tid of hook.conditions.tagPresence) {
				if (conditionsMet) break;
				for (const type of Object.keys(tagTypes)) {
					if (conditionsMet) break;
					if (kara.data.tags[type] && kara.data.tags[type].includes(tid)) {
						conditionsMet = true;
					}
				}
			}
		}
		if (hook.conditions.tagNumber) {
			for (const type of Object.keys(hook.conditions.tagNumber)) {
				if (isNaN(hook.conditions.tagNumber[type])) break;
				if (
					kara.data.tags[type] &&
					kara.data.tags[type].length > hook.conditions.tagNumber[type]
				) {
					conditionsMet = true;
					break;
				}
			}
		}

		// Finished testing conditions.
		if (conditionsMet) {
			logger.info(`Applying hook "${hook.name}" to karaoke data`, {
				service: 'Hooks',
			});
			if (hook.actions.addTag) {
				for (const addTag of hook.actions.addTag) {
					const tag = await getTag(addTag.tid);
					if (!tag) {
						logger.warn(
							`Unable to find tag ${addTag.tid} in database, skipping`,
							{ service: 'Hooks' }
						);
						continue;
					}
					addedTags.push(tag);
					const type = getTagTypeName(addTag.type);
					if (kara.data.tags[type]) {
						if (!kara.data.tags[type].includes(addTag.tid)) kara.data.tags[type].push(tag.tid);
					} else {
						kara.data.tags[type] = [tag.tid];
					}
				}
			}
		}
	}
	return addedTags;
}
