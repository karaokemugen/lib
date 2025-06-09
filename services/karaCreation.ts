/**
 * .kara.json files generation
 */

import { promises as fs } from 'fs';
import { decode, encodingExists } from 'iconv-lite';
import { detect } from 'jschardet';
import { convertKarToAss as karToASS, parseKar } from 'kar-to-ass';
import { convertToASS as kbpToASS } from 'kbp2ass';
import { convertKfnToAss as karafunToASS, parseKfn } from 'kfn-to-ass';
import { basename, dirname, extname, parse, resolve } from 'path';
import { convert as convertSub } from 'subsrt-ts';
import { convertToASS as ultrastarToASS } from 'ultrastar2ass';

import { getTag } from '../../services/tag.js';
import sentry from '../../utils/sentry.js';
import { applyKaraHooks } from '../dao/hook.js';
import { extractMediaTechInfos, verifyKaraData } from '../dao/karafile.js';
import { DBTag } from '../types/database/tag.js';
import { EditedKara, KaraFileV4 } from '../types/kara.js';
import { resolvedPath } from '../utils/config.js';
import { supportedFiles, tagTypes } from '../utils/constants.js';
import { ErrorKM } from '../utils/error.js';
import { embedCoverImage, extractAlbumArt, replaceAudioTrack, webOptimize } from '../utils/ffmpeg.js';
import { detectSubFileFormat, extnameLowercase, sanitizeFile, smartMove } from '../utils/files.js';
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
		const detectEncoding = detect(time);
		const encoding = (
			detectEncoding?.encoding && encodingExists(detectEncoding.encoding) ? detectEncoding.encoding : 'utf-8'
		) as BufferEncoding;
		if (subFormat === 'txt') {
			try {
				lyrics = ultrastarToASS(decode(time, encoding), {
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
				lyrics = kbpToASS(decode(time, encoding), {
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
					parseKfn(decode(time, encoding), encoding, 'utf-8'),
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
				lyrics = convertSub(decode(time, encoding), { format: 'ass' } as any);
			} catch (err) {
				logger.error('Error converting subfile to ASS format', {
					service,
					obj: err,
				});
				throw err;
			}
		} else if (subFormat === 'unknown') {
			throw new ErrorKM('SUBFILE_FORMAT_UNKNOWN', 400, false);
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

export async function defineSongname(kara: KaraFileV4, tagsArray?: DBTag[]): Promise<{ sanitizedFilename: string, songname: string }> {
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
	const langs = karaTags.langs.map(t => t.name.toUpperCase()).sort();
	const lang = langs.length > 0 ? langs.join(', ') : '';
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
	// We'll go simple this time but this should be simplified once #1605 is worked on.
	// Too much hardcoding there.
	const songnameArr = [];
	const group1 = series.join(', ') || singergroups.join(', ') || singers.join(', ');
	const group2 = `${extraType}${types}${kara.data.songorder || ''}`;
	const title = `${kara.data.titles[kara.data.titles_default_language] || 'No title'}${extraTitle}`;
	if (lang) songnameArr.push(lang);
	if (group1) songnameArr.push(group1);
	if (group2) songnameArr.push(group2);
	songnameArr.push(title);
	const songname = songnameArr.join(' - ');
	const finalFilename = sanitizeFile(kara.data.kid);
	return {
		sanitizedFilename: finalFilename,
		songname
	};
}

export async function processUploadedMedia(
	filename: string,
	origFilename: string,
	unlink = true,
) {
	try {
		let mediaPath = resolve(resolvedPath('Temp'), filename);
		const mediaDestBasename = `processed_${parse(filename).name}${extnameLowercase(origFilename)}`;
		const mediaDest = resolve(
			resolvedPath('Temp'),
			mediaDestBasename
		);
		const fileStat = await fs.stat(mediaPath);
		const baseDir = dirname(mediaPath);
		const baseFiles = await fs.readdir(baseDir);
		const base = new Set(baseFiles);
		if (supportedFiles.video.includes(
			extnameLowercase(origFilename).slice(1)
		)) {
			const videoMediaInfo = await extractMediaTechInfos(origFilename, null, false);
			if (!videoMediaInfo.hasAudioStream) {
				logger.info(`Media ${origFilename} has no audio stream, looking for similar audio files`, { service });
				// For ultrastar imports, we need to find out if a similar file with an audiofile extension exists. If so, we need to create a new video container with the audiofile as audiotrack
				// dirname returns . if the filename does not contain a path
				const dir = dirname(filename);
				const basefilename = basename(origFilename, extname(origFilename));
				for (const ext of supportedFiles.audio) {
					const possibleAudioFile = `${basefilename}.${ext}`;
					if (base.has(possibleAudioFile)) {
						const mergedMediaPath = resolve(resolvedPath('Temp'), `merged_${basefilename}.mkv`);
						await replaceAudioTrack(
							mediaPath,
							resolve(dir, possibleAudioFile),
							// mkv is decided, for now, as it supports more file formats and stuff than mp4
							mergedMediaPath
						)
						mediaPath = mergedMediaPath;
						// We're creating a file in temp folder so it can be safely unlinked
						unlink = true;
						break;
					}
				}
			}
			await webOptimize(mediaPath, mediaDest);
			if (unlink) await fs.unlink(mediaPath);
		} else if (supportedFiles.audio.includes(
			extnameLowercase(origFilename).slice(1)
		)) {
			// For Audio files, we'll check if we find a jpg for the cover next to it.
			// If so, we embed the cover
			const dir = dirname(filename);
			const basefilename = basename(origFilename, extname(origFilename));
			for (const ext of supportedFiles.pictures) {
				const possibleCoverFile = resolve(dir, `${basefilename}.${ext}`);
				if (base.has(possibleCoverFile)) {
					mediaPath = await embedCoverImage(
						mediaPath,
						possibleCoverFile,
						resolvedPath('Temp')
					)
					// We're creating a file in temp folder so it can be safely unlinked
					unlink = true;
					break;
				}
			}

			if (unlink) {
				await smartMove(mediaPath, mediaDest);
			} else {
				await fs.copyFile(mediaPath, mediaDest);
			}
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
	kid?: string
) {
	const mediafile = `${kid || kara.data.kid}${extname(kara.medias[0].filename)}`;
	const lyricsfiles = kara.medias[0].lyrics.map(
		// Defaulting to ASS, it'll be renamed later anyways via processSubfile
		lyric => `${kid || kara.data.kid}${(extname(lyric.filename || '') || '.ass')}`
	)
	return {
		mediafile,
		lyricsfiles,
	};
}
