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
import { applyKaraHooks } from '../dao/hook';
import { extractMediaTechInfos, verifyKaraData } from '../dao/karafile';
import { EditedKara, KaraFileV4 } from '../types/kara';
import { resolvedPath } from '../utils/config';
import { tagTypes } from '../utils/constants';
import { webOptimize } from '../utils/ffmpeg';
import { detectSubFileFormat, sanitizeFile } from '../utils/files';
import logger from '../utils/logger';

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

export async function previewHooks(editedKara: EditedKara) {
	const kara = editedKara.kara;
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
		fileTags.extras.length > 0 ? `${fileTags.extras.join(' ')} ` : '';
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
			kara.data.titles.eng || 'No title'
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
