import { execa } from 'execa';
import { existsSync } from 'fs';
import { unlink } from 'fs/promises';
import { basename, extname, resolve } from 'path';

import { getState } from '../../utils/state.js';
import { MediaInfo } from '../types/kara.js';
import { resolvedPath } from './config.js';
import { ffmpegParseAudioInfo, ffmpegParseDuration, ffmpegParseLourdnorm, ffmpegParseVideoInfo } from './ffmpeg.parser.js';
import { fileRequired, replaceExt } from './files.js';
import logger from './logger.js';
import { supportedFiles } from './constants.js';

const service = 'FFmpeg';

const getFfmpegCapabilities = async () => {
	return (await execa(getState().binPath.ffmpeg, ['-codecs', '-formats'])).stdout;
};

export async function createHardsub(
	mediaPath: string,
	assPath: string,
	outputFile: string,
	loudnorm: string,
	metadata?: {
		// all mp4 meta tags allowed here
		[key: string]: string

		title?: string,
		comment?: string,
	},
) {
	const ffmpegCapabilities = await getFfmpegCapabilities();
	const aacEncoder = ffmpegCapabilities.includes('libfdk_aac') ? 'libfdk_aac' : ffmpegCapabilities.includes('aac_at') ? 'aac_at' : 'aac';

	const metadataParams = metadata? metadata && Object.keys(metadata)
		.filter(key => metadata[key])
		.map(key => ['-metadata', `${key}="${metadata[key]}"`])
		.flatMap(params => params): [];

	const [input_i, input_tp, input_lra, input_thresh, target_offset] = loudnorm.split(',');
	try {
		if (supportedFiles.audio.includes(extname(mediaPath).slice(1))) {
			const jpg = await extractCover(mediaPath);
			await execa(getState().binPath.ffmpeg, [
				'-y',
				'-nostdin',
				'-r',
				'30',
				'-i',
				jpg,
				'-i',
				mediaPath,
				'-c:a',
				aacEncoder,
				'-b:a',
				'320k',
				'-vbr', // Overrides b:a when using compatible lib like libfdk_aac
				'5',
				'-global_quality:a', // Overrides b:a when using aac_at (macos)
				'14',
				'-ac',
				'2',
				'-c:v',
				'libx264',
				'-pix_fmt',
				'yuv420p',
				'-af',
				`loudnorm=measured_i=${input_i}:measured_tp=${input_tp}:measured_lra=${input_lra}:measured_thresh=${input_thresh}:linear=true:offset=${target_offset}:lra=15:i=-15`,
				'-vf',
				`loop=loop=-1:size=1,scale=(iw*sar)*min(1980/(iw*sar)\\,1080/ih):ih*min(1920/(iw*sar)\\,1080/ih), pad=1920:1080:(1920-iw*min(1920/iw\\,1080/ih))/2:(1080-ih*min(1920/iw\\,1080/ih))/2,ass=${assPath}`,
				'-preset',
				'slow',
				'-movflags',
				'+faststart',
				'-shortest',
				...metadataParams,
				outputFile,
			]);
			// If unlink fails it'll be caught by find-remove tmp dir. Probably.
			await unlink(jpg).catch(() => {});
		} else {
			await execa(
				getState().binPath.ffmpeg,
				[
					'-y',
					'-nostdin',
					'-i',
					mediaPath,
					'-c:a',
					aacEncoder,
					'-b:a',
					'320k',
					'-vbr', // Overwrites b:a when using compatible lib like libfdk_aac
					'5',
					'-global_quality:a', // Overwrites b:a when using aac_at (macos)
					'14',
					'-ac',
					'2',
					'-c:v',
					'libx264',
					'-pix_fmt',
					'yuv420p',
					'-af',
					`loudnorm=measured_i=${input_i}:measured_tp=${input_tp}:measured_lra=${input_lra}:measured_thresh=${input_thresh}:linear=true:offset=${target_offset}:lra=15:i=-15`,
					assPath ? '-vf' : null,
					assPath ? `ass=${assPath}` : null,
					'-preset',
					'slow',
					'-movflags',
					'+faststart',
					outputFile,
				].filter(x => !!x)
			);
		}
	} catch (e) {
		// Delete failed file so it won't block further generation
		if (existsSync(outputFile)) { 
			logger.info(`ffmpeg command failed, deleting incomplete file ${outputFile}`, { service });
			await unlink(outputFile);
		}
		throw e;
	}
}

export async function extractCover(musicfile: string) {
	const jpg = resolve(resolvedPath('Temp'), `${basename(musicfile)}.jpg`);
	await execa(getState().binPath.ffmpeg, [
		'-y',
		'-nostdin',
		'-i',
		musicfile,
		jpg,
	]);
	return jpg;
}

export async function extractSubtitles(videofile: string, extractfile: string) {
	await execa(getState().binPath.ffmpeg, ['-y', '-i', videofile, extractfile], {
		encoding: 'utf8',
	});

	// Verify if the subfile exists. If it doesn't, it means ffmpeg didn't extract anything
	return fileRequired(extractfile);
}

export async function webOptimize(source: string, destination: string) {
	try {
		return await execa(
			getState().binPath.ffmpeg,
			[
				'-y',
				'-i',
				source,
				'-movflags',
				'faststart',
				'-acodec',
				'copy',
				'-vcodec',
				'copy',
				destination,
			],
			{ encoding: 'utf8' }
		);
	} catch (err) {
		logger.error(`Video ${source} could not be faststarted`, {
			service,
			obj: err,
		});
		throw err;
	}
}

export async function getMediaInfo(
	mediafile: string,
	computeLoudnorm = true
): Promise<MediaInfo> {
	try {
		logger.info(`Analyzing ${mediafile}`, { service });
		const ffmpeg = getState().binPath.ffmpeg;
		const ffmpegExecResult = await execa(
			ffmpeg,
			['-i', mediafile, '-vn', '-af', `replaygain${computeLoudnorm ? ',loudnorm=print_format=json' : ''}`, '-f', 'null', '-'],
			{ encoding: 'utf8' }
		);

		let error = false;
		const outputArraySpaceSplitted = ffmpegExecResult.stderr.split(' ');
		const outputArrayNewlineSplitted = ffmpegExecResult.stderr.split('\n');
		logger.debug(`ffmpeg output lines count: ${outputArrayNewlineSplitted?.length}`, {service, obj: {ffmpegExecResult}});
		const videoInfo = ffmpegParseVideoInfo(outputArraySpaceSplitted);
		const audioInfo = ffmpegParseAudioInfo(outputArraySpaceSplitted);
		const duration = ffmpegParseDuration(outputArraySpaceSplitted);
		if (!duration) {
			error = true;
		}

		const loudnormString = computeLoudnorm && ffmpegParseLourdnorm(outputArrayNewlineSplitted);

		const mediaInfo: MediaInfo = {
			duration: +duration,
			loudnorm: loudnormString,
			error,
			filename: basename(mediafile),
			mediaType: (videoInfo.isPicture || !videoInfo.videoResolution) ? 'audio' : 'video',
			
			...videoInfo,
			...audioInfo,
		};
		logger.debug('Finished parsing ffmpeg output', {service, obj: {mediaInfo}});
		return mediaInfo;
	} catch (err) {
		logger.warn(`Video ${mediafile} probe error`, {
			service,
			obj: err,
		});
		return {
			duration: 0,
			loudnorm: '',
			error: true,
			filename: basename(mediafile),
		};
	}
}

export async function createThumbnail(
	mediafile: string,
	percent: number,
	mediaduration: number,
	mediasize: number,
	uuid: string,
	thumbnailWidth = 600
) {
	try {
		const time = Math.floor(mediaduration * (percent / 100));
		const previewfile = resolve(
			resolvedPath('Previews'),
			`${uuid}.${mediasize}.${percent}.jpg`
		);
		await execa(
			getState().binPath.ffmpeg,
			[
				'-ss',
				`${time}`,
				'-i',
				mediafile,
				'-vframes',
				'1',
				'-filter:v',
				`scale='min(${thumbnailWidth},iw):-1'`,
				previewfile,
			],
			{ encoding: 'utf8' }
		);
	} catch (err) {
		logger.warn(`Unable to create preview for ${mediafile}`, {
			service,
			obj: err,
		});
	}
}

export async function extractAlbumArt(
	mediafile: string,
	mediasize: number,
	uuid: string,
	thumbnailWidth = 600
) {
	try {
		const previewFile = resolve(
			resolvedPath('Previews'),
			`${uuid}.${mediasize}.25.jpg`
		);
		await execa(
			getState().binPath.ffmpeg,
			[
				'-i',
				mediafile,
				'-filter:v',
				`scale='min(${thumbnailWidth},iw):-1'`,
				previewFile,
			],
			{ encoding: 'utf8' }
		);
	} catch (err) {
		logger.warn(`Unable to create preview (album art) for ${mediafile}`, {
			service,
			obj: err,
		});
	}
}

const avatarCache = new Map<string, number>();

export async function getAvatarResolution(avatar: string): Promise<number> {
	try {
		if (avatarCache.has(avatar)) return avatarCache.get(avatar);
		const reso = await execa(getState().binPath.ffmpeg, ['-i', avatar], {
			encoding: 'utf8',
		}).catch(err => err);
		const res = /, ([0-9]+)x([0-9]+)/.exec(reso.stderr);
		if (res) {
			avatarCache.set(avatar, +res[1]);
			return +res[1];
		}
		avatarCache.set(avatar, 250);
		return 250;
	} catch (err) {
		logger.warn('Cannot compute avatar resolution', {
			service,
			obj: err,
		});
		return 250;
	}
}

export async function convertAvatar(avatar: string, replace = false) {
	try {
		logger.debug(`Converting avatar ${avatar}`, { service });
		const thumbnailWidth = 256;
		const originalFile = resolve(avatar);
		const optimizedFile = replace
			? resolve(replaceExt(avatar, '.jpg'))
			: resolve(`${avatar}.optimized.jpg`);
		await execa(
			getState().binPath.ffmpeg,
			[
				'-i',
				originalFile,
				'-y',
				'-q:v',
				'8',
				'-filter:v',
				`scale='min(${thumbnailWidth},iw)':-1`,
				'-frames:v',
				'1',
				optimizedFile,
			],
			{ encoding: 'utf8' }
		);
		return optimizedFile;
	} catch (err) {
		logger.warn(`Unable to create optimized version for ${avatar}`, {
			service,
			obj: err,
		});
		throw err;
	}
}
