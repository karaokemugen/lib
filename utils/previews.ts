import { promises as fs } from 'fs';
import { resolve } from 'path';

import { KaraList } from '../types/kara.js';
import { resolvedPath, resolvedPathRepos } from './config.js';
import { createThumbnail, extractAlbumArt } from './ffmpeg.js';
import { resolveFileInDirs } from './files.js';
import logger, { profile } from './logger.js';
import { supportedFiles } from './constants.js';

const service = 'Previews';

export async function createImagePreviews(
	karas: KaraList,
	thumbnailType?: 'single' | 'full',
	width = 600
) {
	if (karas.content.length === 0) return;
	logger.debug(`Computing previews for ${karas.content.length} songs`, { service });
	thumbnailType = thumbnailType || 'full'; // default
	let previewFiles: string[];
	try {
		previewFiles = await fs.readdir(resolvedPath('Previews'));
	} catch (err) {
		logger.error(`Unable to read preview folder ${resolvedPath('Previews')}`, { service, obj: err });
		throw err;
	}
	const previewSet = new Set<string>(previewFiles);
	// Remove unused previewFiles
	profile('removePreviews');
	const mediaMap = new Map<string, number>();
	for (const kara of karas.content) {
		mediaMap.set(kara.kid, kara.mediasize);
	}
	previewFiles.forEach((file: string) => {
		const fileParts = file.split('.');
		if (mediaMap.has(fileParts[0])) {
			// Compare mediasizes. If mediasize is different, remove file
			if (mediaMap.get(fileParts[0]) !== +fileParts[1])
				fs.unlink(resolve(resolvedPath('Previews'), file)).catch(); // Non-fatal
		}
	});
	profile('removePreviews');
	logger.debug('Removed unused previews', { service });
	profile('createPreviews');
	for (const index in karas.content) {
		if ({}.hasOwnProperty.call(karas.content, index)) {
			const kara = karas.content[index];
			try {
				if (
					!previewSet.has(
						`${kara.kid}.${kara.mediasize}.25.jpg`
					)
				) {
					// logger.debug(`Creating preview for ${kara.karafile}`, { service });
					if (!supportedFiles.audio.some((extension) => kara.mediafile.endsWith(extension))) {
						let mediaPath: string[];
						try {
							mediaPath = await resolveFileInDirs(
								kara.mediafile,
								resolvedPathRepos('Medias')
							);
						} catch (err) {
							continue;
						}
						const creates = [
							createThumbnail(
								mediaPath[0],
								25,
								kara.duration,
								kara.mediasize,
								kara.kid,
								width
							),
						];
						if (thumbnailType === 'full') {
							creates.push(
								createThumbnail(
									mediaPath[0],
									33,
									kara.duration,
									kara.mediasize,
									kara.kid,
									width
								)
							);
							creates.push(
								createThumbnail(
									mediaPath[0],
									50,
									kara.duration,
									kara.mediasize,
									kara.kid,
									width
								)
							);
							creates.push(
								createThumbnail(
									mediaPath[0],
									75,
									kara.duration,
									kara.mediasize,
									kara.kid,
									width
								)
							);
						}
						await Promise.all(creates);
					} else {
						let mediaPath: string[];
						try {
							mediaPath = await resolveFileInDirs(
								kara.mediafile,
								resolvedPathRepos('Medias')
							);
						} catch (err) {
							continue;
						}
						await extractAlbumArt(
							mediaPath[0],
							kara.mediasize,
							kara.kid,
							width
						);
					}
				}
			} catch (error) {
				logger.debug(
					`Error when creating thumbnail for ${kara.mediafile}: ${error}`,
					{ service }
				);
			}
		}
	}
	logger.debug(`Done creating preview for ${karas.content.length} songs`, { service });
	profile('createPreviews');
}
