/**
 * .kara.json files generation
 */

import { promises as fs } from 'fs';
import { convertKarToAss as karToASS, parseKar } from 'kar-to-ass';
import { convertToASS as kbpToASS } from 'kbp2ass';
import { convertKfnToAss as karafunToASS, parseKfn } from 'kfn-to-ass';
import { extname, resolve } from 'path';
import { convert as convertSub } from 'subsrt-ts';
import { convertToASS as ultrastarToASS } from 'ultrastar2ass';

import { getTag } from '../../services/tag.js';
import sentry from '../../utils/sentry.js';
import { applyKaraHooks } from '../dao/hook.js';
import { extractMediaTechInfos, verifyKaraData } from '../dao/karafile.js';
import { DBKara } from '../types/database/kara.js';
import { DBTag } from '../types/database/tag.js';
import { EditedKara, KaraFileV4 } from '../types/kara.js';
import { resolvedPath } from '../utils/config.js';
import { supportedFiles, tagTypes } from '../utils/constants.js';
import { ErrorKM } from '../utils/error.js';
import { extractAlbumArt, webOptimize } from '../utils/ffmpeg.js';
import { detectSubFileFormat, sanitizeFile } from '../utils/files.js';
import logger from '../utils/logger.js';

const service = 'KaraCreation';

export async function processSubfile(file: string): Promise<string> {
	try {
		const subfile = resolve(resolvedPath('Temp'), file);
		const time = await fs.readFile(subfile);
		const subFormat = detectSubFileFormat(time.toString());
		let lyrics = '';
		const ext = '.ass';
		let writeFile = true;
		// Some formats are converted, others are simply copied.
		if (subFormat === 'txt') {
			try {
				lyrics = ultrastarToASS(time.toString('utf-8'), {
					syllable_precision: true,
				});
			} catch (err) {
				logger.error('Error converting Ultrastar subfile to ASS format', {
					service,
					obj: err,
				});
				throw err;
			}
		} else if (subFormat === 'kbp') {
			try {
				lyrics = kbpToASS(time.toString('utf-8'), {
					minimumProgressionDuration: 1000,
				});
			} catch (err) {
				logger.error('Error converting KBP subfile to ASS format', {
					service,
					obj: err,
				});
				throw err;
			}
		} else if (subFormat === 'kar') {
			try {
				lyrics = karToASS(parseKar(time), {});
			} catch (err) {
				logger.error('Error converting KaraWin subfile to ASS format', {
					service,
					obj: err,
				});
				throw err;
			}
		} else if (subFormat === 'kfn') {
			try {
				lyrics = karafunToASS(
					parseKfn(time.toString('utf-8'), 'utf-8', 'utf-8'),
					{ offset: 0, useFileInstructions: true }
				);
			} catch (err) {
				logger.error('Error converting Karafun subfile to ASS format', {
					service,
					obj: err,
				});
				throw err;
			}
		} else if (subFormat === 'ass') {
			// We treat ASS as-is.
			writeFile = false;
			// All other formats get handled by subsrt and converted to ass
		} else if (subFormat !== 'unknown') {
			try {
				lyrics = convertSub(time.toString('utf-8'), { format: 'ass' } as any);
			} catch (err) {
				logger.error('Error converting subfile to ASS format', {
					service,
					obj: err,
				});
				throw err;
			}
		} else if (subFormat === 'unknown') {
			throw new ErrorKM('SUBFILE_FORMAT_UNKNOWN', 400);
		}
		if (writeFile) await fs.writeFile(subfile, lyrics, 'utf-8');
		return ext;
	} catch (err) {
		logger.error(`Error processing subfile : ${err}`, { service, obj: err });
		sentry.error(err);
		throw err instanceof ErrorKM ? err : new ErrorKM('SUBFILE_PROCESS_ERROR');
	}
}

export async function previewHooks(editedKara: EditedKara) {
	try {
		const kara = editedKara.kara;
		verifyKaraData(kara);
		const modifiedTags = await applyKaraHooks(kara, true);
		return modifiedTags;
	} catch (err) {
		logger.error(`Error previewing hooks : ${err}`, { service, obj: err });
		sentry.error(err);
		throw err instanceof ErrorKM ? err : new ErrorKM('PREVIEW_HOOKS_ERROR');
	}
}

export async function defineSongname(kara: KaraFileV4, oldKara?: DBKara, tagsArray?: DBTag[]): Promise<string> {
	// Generate filename according to tags and type.
	const fileTags = {
		extras: [],
		types: [],
	};
	const karaTags = {
		singergroups: [],
		singers: [],
		series: [],
		langs: [],
		versions: [],
	};
	// Let's browse tags to add those which have a karafile_tag
	for (const tagType of Object.keys(tagTypes)) {
		if (kara.data.tags[tagType]) {
			for (const tid of kara.data.tags[tagType]) {
				let tag: DBTag;
				try {
					// Remove that when we've completed the create base wizard issue.
					if (tagsArray) {
						tag = tagsArray.find(t => t.tid === tid);
						if (!tag) throw new ErrorKM('UNKNOWN_TAG', 404, false);
					} else {
						tag = await getTag(tid).catch(err => {
							throw err;
						});
					}
				} catch (err) {
					logger.error(`Unable to find tag ${tid} when defining filename for kara ${kara.data.kid}`, { service, obj: err });
					throw err;
				}
				if (tag.karafile_tag) {
					if (tagType === 'songtypes') {
						fileTags.types.push(tag.karafile_tag);
					} else if (fileTags.extras.length < 2) {
						fileTags.extras.push(tag.karafile_tag);
					}
				}
				if (tagType === 'versions') {
					if (karaTags[tagType].length < 3) karaTags[tagType].push(tag);
				} else if (
					tagType === 'langs' ||
					tagType === 'singergroups' ||
					tagType === 'singers' ||
					tagType === 'series'
				) {
					if (karaTags[tagType].length < 2) karaTags[tagType].push(tag);
				}
			}
		}
	}
	const extraType =
		fileTags.extras.length > 0 ? `${fileTags.extras.join(' ')} ` : '';
	const langs = karaTags.langs.map(t => t.name).sort();
	const lang = langs[0].toUpperCase();
	const singergroups = karaTags.singergroups
		? karaTags.singergroups.map(t => t.name).sort()
		: [];
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
	const songname = `${lang} - ${series.join(', ') || singergroups.join(', ') || singers.join(', ')
		} - ${extraType}${types}${kara.data.songorder || ''} - ${kara.data.titles[kara.data.titles_default_language] || 'No title'
		}${extraTitle}`;
	const finalFilename = sanitizeFile(songname);
	// This isn't my final form yet!
	// We only test this on win32 because git for win32 won't detect a file rename if the old and new name look the same lowercase (NTFS is case-insensitive).
	// Git not renaming files on Windows for maintainers has been such a pain that ANYONE who'll remove this will have to face the consequences ALONE. :)
	if (oldKara) {
		const oldFilename = oldKara.karafile.replaceAll('.kara.json', '');
		if (process.platform === 'win32' && oldFilename !== finalFilename && oldFilename.toLowerCase() === finalFilename.toLowerCase()) return oldFilename;}
	return finalFilename;
}

export async function processUploadedMedia(
	filename: string,
	origFilename: string
) {
	try {
		const mediaPath = resolve(resolvedPath('Temp'), filename);
		const mediaDestBasename = `processed_${filename}${extname(origFilename)}`;
		const mediaDest = resolve(
			resolvedPath('Temp'),
			mediaDestBasename
		);
		const fileStat = await fs.stat(mediaPath);
		if (supportedFiles.video.includes(
			extname(origFilename).slice(1)
		)) {
			await webOptimize(mediaPath, mediaDest);
			await fs.unlink(mediaPath);
		} else if (supportedFiles.audio.includes(
			extname(origFilename).slice(1)
		)) {
			await fs.rename(mediaPath, mediaDest);
			// Extract cover preview for showing and editing it in karaform
			await extractAlbumArt(
				mediaDest,
				fileStat.size,
				mediaDestBasename
			);
		} else {
			throw new ErrorKM('UPLOADED_MEDIA_ERROR', 400, false); // Unknown format
		}
		const mediaInfo = await extractMediaTechInfos(mediaDest);
		if (mediaInfo.error) throw new ErrorKM('UPLOADED_MEDIA_ERROR', 400, false);
		return mediaInfo;
	} catch (err) {
		logger.error(`Error processing media ${origFilename}`, { service, obj: err });
		sentry.error(err);
		throw err instanceof ErrorKM ? err : new ErrorKM('UPLOADED_MEDIA_ERROR');
	}
}

export function determineMediaAndLyricsFilenames(
	kara: KaraFileV4,
	karaFile: string
) {
	const mediafile = karaFile + extname(kara.medias[0].filename);
	const lyricsfiles = kara.medias[0].lyrics.map(
		// Defaulting to ASS, it'll be renamed later anyways via processSubfile
		lyric => karaFile + (extname(lyric.filename || '') || '.ass')
	)
	return {
		mediafile,
		lyricsfiles,
	};
}
