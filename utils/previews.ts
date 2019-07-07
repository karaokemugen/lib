import {getConfig, resolvedPathMedias, resolvedPathPreviews} from './config';
import { asyncReadDir, asyncUnlink, asyncExists, resolveFileInDirs } from './files';
import {resolve} from 'path';
import { createThumbnail, createPreview } from './ffmpeg';
import logger from './logger';
import { getState } from '../../utils/state';
import { KaraList } from '../types/kara';


let creatingThumbnails = false;

export async function createImagePreviews(karas: KaraList) {
	if (creatingThumbnails) throw 'Creating video previews in progress, please wait a moment and try again later';
	creatingThumbnails = true;
	const conf = getConfig();
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
			if (mediasize !== +fileParts[1]) asyncUnlink(resolve(getState().appPath, conf.System.Path.Previews, file));
		} else {
			// No kara with that KID found in database, the preview files must be removed
			asyncUnlink(resolve(getState().appPath, conf.System.Path.Previews, file));
		}
	}
	// Now create non-existing previews
	for (const index in karas.content) {
		const kara = karas.content[index];
		const counter = +index + 1;
		if (!await asyncExists(resolve(getState().appPath, conf.System.Path.Previews, `${kara.kid}.${kara.mediasize}.25.jpg`)) && !kara.mediafile.endsWith('.mp3')) {
			logger.info(`[Previews] Creating thumnbails for ${kara.mediafile} (${counter}/${karas.content.length})`);
			const mediaPath = await resolveFileInDirs(kara.mediafile, resolvedPathMedias());
			const creates = [
				createThumbnail(
					mediaPath,
					25,
					kara.duration,
					kara.mediasize,
					kara.kid
				),
				createThumbnail(
					mediaPath,
					33,
					kara.duration,
					kara.mediasize,
					kara.kid
				),
				createThumbnail(
					mediaPath,
					50,
					kara.duration,
					kara.mediasize,
					kara.kid
				)
			];
			await Promise.all(creates);
		}
	};
	logger.info('[Previews] Finished generating thumbnails');
	creatingThumbnails = false;
}


async function extractPreviewFiles(previewDir: string): Promise<string[]> {
	const dirListing = await asyncReadDir(previewDir);
	return dirListing.filter((file: string) => {
		return (!file.startsWith('.') && (!file.startsWith('output')) && file.endsWith('.mp4'));
	});
}

export async function isPreviewAvailable(kid: string, mediasize: number): Promise<string> {
	const previewDir = resolvedPathPreviews();
	if (await asyncExists(resolve(previewDir, `${kid}.${mediasize}.mp4`))) {
		return `${kid}.${mediasize}.mp4`;
	} else {
		return null;
	}
}

export async function createVideoPreviews(karas: KaraList) {
	logger.debug('[Previews] Starting preview generation');
	const previewDir = resolvedPathPreviews();
	const previewFiles = await extractPreviewFiles(previewDir);
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
			if (mediasize !== +fileParts[1]) asyncUnlink(resolve(previewDir, file));
		} else {
			// No kara with that KID found in database, the preview files must be removed
			asyncUnlink(resolve(previewDir, file));
		}
	}
	// Now create non-existing previews
	for (const index in karas.content) {
		const kara = karas.content[index];
		const counter = +index + 1;
		if (!await asyncExists(resolve(previewDir, `${kara.kid}.${kara.mediasize}.mp4`)) && !kara.mediafile.endsWith('.mp3')) {
			logger.info(`[Previews] Creating preview for ${kara.mediafile} (${counter}/${karas.content.length})`);
			let mediaFile: string;
			try {
				mediaFile = await resolveFileInDirs(kara.mediafile, resolvedPathMedias());
			} catch(err) {
				logger.warn(`[Previews] Failed to create preview for ${kara.mediafile} : File not found`);
			}
			try {
				if (mediaFile) await createPreview({
					videofile: mediaFile,
					previewfile: resolve(previewDir, `${kara.kid}.${kara.mediasize}.mp4`)
				});
			} catch(err) {
				logger.warn(`[Previews] Failed to create preview for ${kara.mediafile} : ${err}`);
			}
		}
	}
	logger.info('[Previews] Finished generating preview');
}