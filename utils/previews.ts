import { resolve } from 'path';

import { KaraList } from '../types/kara';
import { resolvedPathPreviews, resolvedPathRepos } from './config';
import { createThumbnail, extractAlbumArt } from './ffmpeg';
import { asyncExists, asyncReadDir, asyncUnlink, resolveFileInDirs } from './files';
import logger from './logger';


let creatingThumbnails = false;

export async function createImagePreviews(karas: KaraList, thumbnailType?: 'single' | 'full' ) {
	thumbnailType = thumbnailType || 'full'; // default
	if (creatingThumbnails) {
		logger.warn('Creating previews in progress, please wait a moment and try again later', {service: 'Previews'});
		return;
	}
	creatingThumbnails = true;
	const previewFiles = await asyncReadDir(resolvedPathPreviews());
	// Remove unused previewFiles
	for (const file of previewFiles) {
		const fileParts = file.split('.');
		let mediasize: number;
		const found = karas.content.some(k => {
			// If it returns true, we found a karaoke. We'll check mediasize of that kara to determine if we need to remove the preview and recreate it.
			// Since .some stops after a match, mediasize will be equal to the latest kara parsed's mediafile
			mediasize = k.mediasize;
			return k.kid === fileParts[0];
		});
		if (found) {
			// Compare mediasizes. If mediasize is different, remove file
			if (mediasize !== +fileParts[1]) asyncUnlink(resolve(resolvedPathPreviews(), file));
		}
	}
	// Now create non-existing previews
	for (const index in karas.content) {
		const kara = karas.content[index];
		const counter = +index + 1;
		try {
			if (!await asyncExists(resolve(resolvedPathPreviews(), `${kara.kid}.${kara.mediasize}.25.jpg`))) {
				if (!kara.mediafile.endsWith('.mp3')) {
					logger.info(`Creating thumbnails for ${kara.mediafile} (${counter}/${karas.content.length})`, {service: 'Previews'});
					const mediaPath = await resolveFileInDirs(kara.mediafile, resolvedPathRepos('Medias'));
					const creates = [
						createThumbnail(
							mediaPath[0],
							25,
							kara.duration,
							kara.mediasize,
							kara.kid
						)];
					if (thumbnailType === 'full') {
						creates.push(createThumbnail(
							mediaPath[0],
							33,
							kara.duration,
							kara.mediasize,
							kara.kid
						));
						creates.push(createThumbnail(
							mediaPath[0],
							50,
							kara.duration,
							kara.mediasize,
							kara.kid
						));
					}
					await Promise.all(creates);
				} else {
					logger.info(`Creating thumbnail for ${kara.mediafile} (${counter}/${karas.content.length})`, {service: 'Previews'});
					const mediaPath = await resolveFileInDirs(kara.mediafile, resolvedPathRepos('Medias'));
					await extractAlbumArt(
						mediaPath[0],
						kara.mediasize,
						kara.kid
					);
				}
			}
		} catch (error) {
			logger.error(`Error when creating thumbnail for ${kara.mediafile}: ${error}`, {service: 'Previews'});
		}
	}
	logger.info('Finished generating thumbnails', {service: 'Previews'});
	creatingThumbnails = false;
}

