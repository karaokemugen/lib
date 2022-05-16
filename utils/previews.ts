import { promises as fs } from 'fs';
import { resolve } from 'path';

import { KaraList } from '../types/kara';
import { resolvedPath, resolvedPathRepos } from './config';
import { createThumbnail, extractAlbumArt } from './ffmpeg';
import { resolveFileInDirs } from './files';
import logger, { profile } from './logger';

const service = 'Previews';

export async function createImagePreviews(
	karas: KaraList,
	thumbnailType?: 'single' | 'full',
	width = 600
) {
	if (karas.content.length === 0) return;
	thumbnailType = thumbnailType || 'full'; // default
	const previewFiles = await fs.readdir(resolvedPath('Previews'));
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

	profile('createPreviews');
	for (const index in karas.content) {
		if ({}.hasOwnProperty.call(karas.content, index)) {
			const kara = karas.content[index];
			try {
				if (
					!previewSet.has(
						`${kara.kid}.${kara.mediasize}.25${width > 600 ? '.hd' : ''}.jpg`
					)
				) {
					if (!kara.mediafile.endsWith('.mp3')) {
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
	profile('createPreviews');
}
