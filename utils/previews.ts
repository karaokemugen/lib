import {getConfig, resolvedPathMedias} from './config';
import {getAllKaras} from '../../services/kara';
import { asyncReadDir, asyncUnlink, asyncExists, resolveFileInDirs } from './files';
import {resolve} from 'path';
import { createThumbnail } from './ffmpeg';
import logger from './logger';
import { getState } from '../../utils/state';


let creatingThumbnails = false;

export async function createVideoPreviews() {
	if (creatingThumbnails) throw 'Creating video previews in progress, please wait a moment and try again later';
	creatingThumbnails = true;
	const conf = getConfig();
	const karas = await getAllKaras();
	const previewFiles = await asyncReadDir(resolve(getState().appPath, conf.System.Path.Previews));
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
