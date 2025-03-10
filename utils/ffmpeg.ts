import { encode as encodeCoverImage } from '@hiogawa/flac-picture';
import { randomUUID } from 'crypto';
import { execa, type ResultPromise } from 'execa';
import { existsSync } from 'fs';
import { appendFile, readFile, unlink } from 'fs/promises';
import { basename, extname, join, resolve } from 'path';

import { getState } from '../../utils/state.js';
import {
	FFmpegBlackdetectLine,
	FFmpegEncodingOptions,
	FFmpegProgress,
	FFmpegSilencedetectLine,
} from '../types/ffmpeg.js';
import { MediaInfo, MediaInfoWarning } from '../types/kara.js';
import { resolvedPath } from './config.js';
import {
	audioVbrParamsMap,
	crfStartValueMap,
	getEncoderMap,
	supportedFiles,
	videoEncoderParamMap,
} from './constants.js';
import { ErrorKM } from './error.js';
import {
	ffmpegParseAudioInfo,
	ffmpegParseBlackdetect,
	ffmpegParseDuration,
	ffmpegParseLourdnorm,
	ffmpegParseProgressLine,
	ffmpegParseSilencedetect,
	ffmpegParseVideoInfo,
} from './ffmpeg.parser.js';
import { fileRequired, replaceExt } from './files.js';
import logger from './logger.js';

const service = 'FFmpeg';

const getFFmpegCapabilities = async () => {
	return (await execa(getState().binPath.ffmpeg, ['-codecs', '-formats']))
		.stdout;
};

export async function createHardsub(
	mediaPath: string,
	assPath: string,
	fontsDir: string,
	outputFile: string,
	loudnorm: string,
	metadata?: {
		// all mp4 meta tags allowed here
		[key: string]: string;

		title?: string;
		comment?: string;
	}
) {
	const ffmpegCapabilities = await getFFmpegCapabilities();
	const aacEncoder = ffmpegCapabilities.includes('libfdk_aac')
		? 'libfdk_aac'
		: ffmpegCapabilities.includes('aac_at')
			? 'aac_at'
			: 'aac';

	const metadataParams = metadata
		? metadata &&
		Object.keys(metadata)
			.filter(key => metadata[key])
			.map(key => ['-metadata', `${key}="${metadata[key]}"`])
			.flatMap(params => params)
		: [];

	const [input_i, input_tp, input_lra, input_thresh, target_offset] =
		loudnorm.split(',');
	const isAudioFile = supportedFiles.audio.includes(
		extname(mediaPath).slice(1)
	);

	try {
		const commonFFmpegParams = [
			'-y',
			'-nostdin',
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
			'-ac', // Two channel stereo
			'2',
			'-ar', // Resample to common 44100 Hz
			'44100',
			'-c:v',
			'libx264',
			'-pix_fmt',
			'yuv420p',
			'-af',
			`loudnorm=measured_i=${input_i}:measured_tp=${input_tp}:measured_lra=${input_lra}:measured_thresh=${input_thresh}:linear=true:offset=${target_offset}:lra=15:i=-15`,
			'-preset',
			'slow',
			'-movflags',
			'+faststart',
			'-shortest',
			...metadataParams,
		];
		if (isAudioFile) {
			const cover = await extractCover(mediaPath);
			await execa(getState().binPath.ffmpeg, [
				'-r',
				'30',
				'-i',
				cover,
				...commonFFmpegParams,
				'-vf',
				`loop=loop=-1:size=1,scale=(iw*sar)*min(1920/(iw*sar)\\,1080/ih):ih*min(1920/(iw*sar)\\,1080/ih), pad=1920:1080:(1920-iw*min(1920/iw\\,1080/ih))/2:(1080-ih*min(1920/iw\\,1080/ih))/2,subtitles=${assPath}:fontsdir=${fontsDir}`,
				outputFile,
			]);
			// If unlink fails it'll be caught by find-remove tmp dir. Probably.
			await unlink(cover).catch(() => { });
		} else {
			await execa(
				getState().binPath.ffmpeg,
				[
					...commonFFmpegParams,
					assPath ? '-vf' : null,
					assPath ? `subtitles=${assPath}:fontsdir=${fontsDir}` : null,
					outputFile,
				].filter(x => !!x)
			);
		}
	} catch (e) {
		// Delete failed file so it won't block further generation
		if (existsSync(outputFile)) {
			logger.info(
				`ffmpeg command failed, deleting incomplete file ${outputFile}`,
				{ service }
			);
			await unlink(outputFile);
		}
		throw e;
	}
}

export async function extractCover(musicfile: string) {
	const cover = resolve(resolvedPath('Temp'), `${basename(musicfile)}.bmp`);
	await execa(getState().binPath.ffmpeg, [
		'-y',
		'-nostdin',
		'-i',
		musicfile,
		cover,
	]);
	return cover;
}

export async function removeSubtitles(source: string, dest: string) {
	await execa(getState().binPath.ffmpeg, [
		'-y',
		'-i', source,
		'-c', 'copy',
		'-sn', // No subtitle streams
		dest
	], {
		encoding: 'utf8',
	});
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
		return await encodeMedia({
			audioCodec: 'copy',
			videoCodec: 'copy',
			sourceFile: source,
			destFile: destination,
		});
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
			[
				'-i',
				mediafile,
				'-vn',
				'-af',
				`replaygain${computeLoudnorm ? ',loudnorm=print_format=json' : ''}`,
				'-f',
				'null',
				'-',
			],
			{ encoding: 'utf8' }
		);

		let error = false;
		const outputArraySpaceSplitted = ffmpegExecResult.stderr.split(' ');
		const outputArrayNewlineSplitted = ffmpegExecResult.stderr.split('\n');
		logger.debug(
			`ffmpeg output lines count: ${outputArrayNewlineSplitted?.length}`,
			{ service, obj: { ffmpegExecResult } }
		);
		const videoInfo = ffmpegParseVideoInfo(outputArraySpaceSplitted);
		const audioInfo = ffmpegParseAudioInfo(outputArraySpaceSplitted);
		const duration = ffmpegParseDuration(outputArraySpaceSplitted);
		if (!duration) {
			error = true;
		}

		const loudnormString =
			computeLoudnorm ? ffmpegParseLourdnorm(outputArrayNewlineSplitted) : null;
		let mediaType: 'audio' | 'video';
		if (supportedFiles.audio.some(extension => mediafile.endsWith(extension)))
			mediaType = 'audio';
		else if (
			supportedFiles.video.some(extension => mediafile.endsWith(extension))
		)
			mediaType = 'video';
		else {
			logger.error(
				`Could not determine mediaType (audio or video) for file: ${mediafile}`,
				{ service, obj: { ffmpegExecResult } }
			);
			mediaType =
				videoInfo.isPicture || !videoInfo.videoResolution ? 'audio' : 'video'; // Fallback
		}

		const mediaWarnings: Array<MediaInfoWarning> = [];
		const isUsingFFmpegAacEncoder =
			audioInfo.audioCodec === 'aac' &&
			(await detectFFmpegAacEncoder(mediafile));
		if (isUsingFFmpegAacEncoder) mediaWarnings.push('LIBAVCODEC_ENCODER');

		const mediaInfo: MediaInfo = {
			duration: +duration,
			loudnorm: loudnormString,
			error,
			filename: basename(mediafile),
			mediaType,
			warnings: mediaWarnings,

			...videoInfo,
			...audioInfo,
		};
		logger.debug('Finished parsing ffmpeg output', {
			service,
			obj: { mediaInfo },
		});
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

export async function computeMediaTrimData(mediafile: string) {
	logger.info(`Detecting silence and black frames on ${basename(mediafile)}`, {
		service,
	});
	const ffmpeg = getState().binPath.ffmpeg;
	const ffmpegResult = await execa(
		ffmpeg,
		[
			'-i',
			mediafile,
			'-af',
			'silencedetect=n=-55dB:d=0.1',
			'-vf',
			'blackdetect=d=0:pix_th=.01',
			'-f',
			'null',
			'-',
		],
		{ encoding: 'utf8' }
	);
	const blackDetect = ffmpegParseBlackdetect(ffmpegResult.stderr);
	const silenceDetect = ffmpegParseSilencedetect(ffmpegResult.stderr);
	const duration = ffmpegParseDuration(ffmpegResult.stderr);

	const trimResult = calculateTrimParameters(
		duration,
		silenceDetect,
		blackDetect
	);
	logger.info(
		`Detected start: ${trimResult.start}, total media duration: ${trimResult.duration
		} ${!trimResult.isTrimmable ? '(unchanged)' : ''} for file ${basename(
			mediafile
		)}`,
		{ service }
	);
	return trimResult;
}

async function detectFFmpegAacEncoder(mediafile: string) {
	const ffmpeg = getState().binPath.ffmpeg;
	const aacExtractResult = await execa(
		ffmpeg,
		[
			'-t',
			'0',
			'-i',
			mediafile,
			'-hide_banner',
			'-vn',
			'-f',
			'rawvideo',
			'-c',
			'copy',
			'-map',
			'0:a',
			'-',
		],
		{ encoding: 'utf8' }
	);
	return aacExtractResult.stdout?.includes('Lavc');
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
				'-y',
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

const activeEncodingProcesses = new Array<ResultPromise>();

export async function encodeMedia(
	encodeOptions: FFmpegEncodingOptions,
	onProgress?: (progressInfo: FFmpegProgress) => void
) {
	const ffmpegCapabilities = await getFFmpegCapabilities();
	const encoderMap = getEncoderMap(ffmpegCapabilities);

	if (encoderMap.aac === 'aac' && encodeOptions.audioCodec === 'aac')
		logger.warn(
			'libfdk_aac is not available, using aac for audio encoding. This will result in an often noticeable worse quality',
			{ service }
		);

	encodeOptions.videoCRF =
		encodeOptions.videoCRF ||
		crfStartValueMap[encoderMap[encodeOptions.videoCodec]];

	const ffmpegParams = [
		'-y',

		encodeOptions.trimStartSeconds && '-ss',
		encodeOptions.trimStartSeconds,

		encodeOptions.trimDurationSeconds && '-t',
		encodeOptions.trimDurationSeconds,

		'-i',
		encodeOptions.sourceFile,

		'-movflags',
		'faststart',

		'-preset',
		'slow',

		// Let ffmpeg decide the audio codec, when set to 'auto'. Null means no audio
		encodeOptions.audioCodec && encodeOptions.audioCodec !== 'auto' && '-c:a',
		encodeOptions.audioCodec &&
		encodeOptions.audioCodec !== 'auto' &&
		(encoderMap[encodeOptions.audioCodec] || encodeOptions.audioCodec),

		encodeOptions.audioCodec && encodeOptions.audioCodec !== 'copy' && '-af',
		encodeOptions.audioCodec && encodeOptions.audioCodec !== 'copy' && 'aformat=channel_layouts=7.1|5.1|stereo',

		encodeOptions.audioCodec === null && '-an',
		...(encodeOptions.audioBitrate
			? ['-b:a', encodeOptions.audioBitrate]
			: audioVbrParamsMap[encoderMap[encodeOptions.audioCodec]] || []),

		// Let ffmpeg decide the video codec, when set to 'auto'. Null means no video
		encodeOptions.videoCodec === null && '-vn',
		encodeOptions.videoCodec && encodeOptions.videoCodec !== 'auto' && '-c:v',
		encodeOptions.videoCodec &&
		encodeOptions.videoCodec !== 'auto' &&
		(encoderMap[encodeOptions.videoCodec] || encodeOptions.videoCodec),
		...((encodeOptions.videoCodec &&
			videoEncoderParamMap[encoderMap[encodeOptions.videoCodec]]) ||
			[]),

		encodeOptions.videoCRF && '-crf',
		encodeOptions.videoCRF,

		encodeOptions.videoColorSpace && '-pix_fmt',
		encodeOptions.videoColorSpace,

		encodeOptions.videoFilter && '-vf',
		encodeOptions.videoFilter,

		encodeOptions.destFile,
	].filter(param => Boolean(param));

	logger.info(
		`Start encoding of ${encodeOptions.sourceFile} with parameters 'ffmpeg ${ffmpegParams.join(' ')}'`,
		{ service }
	);

	const ffmpegProcess = execa(getState().binPath.ffmpeg, ffmpegParams, {
		encoding: 'utf8',
	});
	const processIndex = activeEncodingProcesses.push(ffmpegProcess);
	ffmpegProcess.stderr.on('data', data => {
		// Progress updates
		const progressInfo = ffmpegParseProgressLine(data?.toString());
		if (progressInfo.timeSeconds) {
			onProgress &&
				onProgress({
					...progressInfo,
				});
		}
	});
	try {
		await ffmpegProcess;
	} catch (e) {
		if (e.isForcefullyTerminated === true) {
			throw new ErrorKM('MEDIA_ENCODING_ABORTED');
		} else {
			throw e;
		}
	}
	activeEncodingProcesses.splice(processIndex, 1);

	logger.info(
		`Finished encoding of '${encodeOptions.sourceFile}' to '${encodeOptions.destFile}'`,
		{ service }
	);
	return {
		destFile: encodeOptions.destFile,
		videoCRF: Number(encodeOptions.videoCRF),
	};
}

export function abortAllMediaEncodingProcesses() {
	for (const encodingProcess of activeEncodingProcesses) {
		encodingProcess.kill();
		logger.info(`Killed encoding process with pid ${encodingProcess.pid}`, {
			service,
		});
	}
}

function calculateTrimParameters(
	mediaDuration: number,
	silencedetect: FFmpegSilencedetectLine[],
	blackdetect?: FFmpegBlackdetectLine[]
) {
	const videoStart =
		blackdetect?.find(bd => bd.black_start < 0.01)?.black_end || 0;
	const audioStart =
		silencedetect.find(sd => sd.silence_start < 0.01)?.silence_end || 0;

	const videoEnd =
		blackdetect?.find(bd => bd.black_end + 0.1 >= mediaDuration)?.black_start ||
		mediaDuration;
	const audioEnd =
		silencedetect.find(sd => sd.silence_end + 0.1 >= mediaDuration)
			?.silence_start || mediaDuration;

	const mediaStart = Math.min(videoStart, audioStart);
	const mediaEnd = Math.max(videoEnd, audioEnd);
	const trimmedMediaDuration = mediaEnd - mediaStart;

	return {
		start: mediaStart,
		duration: trimmedMediaDuration,
		isTrimmable: mediaStart > 0 || trimmedMediaDuration < mediaDuration,
	};
}

export async function embedCoverImage(mediaFilePath: string, coverFilePath: string, destFolder: string) {
	const currentFileExtension = extname(mediaFilePath).toLowerCase();
	let codec = 'copy';
	let newFileExtension = currentFileExtension;
	// Change container since .aac cover embedding is not supported by ffmpeg
	if (newFileExtension === '.aac')
		newFileExtension = '.m4a';
	if (newFileExtension === '.wav') { // same for .wav
		newFileExtension = '.flac';
		codec = 'flac';
	}

	const outputFile = join(destFolder, randomUUID() + newFileExtension);

	const rawEncoderExtensions = ['.flac', '.opus'];
	if (rawEncoderExtensions.some(e => newFileExtension.toLowerCase().endsWith(e))) {
		// For opus, flac
		// Extract existing metadata, append the new cover and add metadata back to the audio file
		const picture = await readFile(coverFilePath);
		const ffmetadataFilePath = outputFile + '.FFMETADATA';
		await execa('ffmpeg', [
			'-i',
			mediaFilePath,
			'-y',
			'-f',
			'ffmetadata',
			ffmetadataFilePath
		]);
		const metadata = encodeCoverImage(picture);
		await appendFile(ffmetadataFilePath, `\nMETADATA_BLOCK_PICTURE=${metadata}\n`, 'utf-8');
		await execa('ffmpeg', [
			'-i',
			mediaFilePath,
			'-i',
			ffmetadataFilePath,
			'-y',
			'-c',
			codec,
			'-map_metadata',
			'1',
			outputFile,
		]);
		await unlink(ffmetadataFilePath);
	} else {
		// For id3v2 (mp3, m4a)
		await execa('ffmpeg', [
			'-i',
			mediaFilePath,
			'-i',
			coverFilePath,
			'-y',
			'-c',
			'copy',
			'-map',
			'0:a',
			'-map',
			'1:v',
			'-id3v2_version',
			'3',
			'-disposition:v',
			'attached_pic',
			'-metadata:s:v',
			'title="Album cover"',
			'-metadata:s:v',
			'comment="Cover (front)"',
			outputFile,
		]);
	}

	return outputFile;
}
