import { execa } from 'execa';
import { basename, extname, resolve } from 'path';

import { getState } from '../../utils/state.js';
import { MediaInfo } from '../types/kara.js';
import { resolvedPath } from './config.js';
import { timeToSeconds } from './date.js';
import { fileRequired, replaceExt } from './files.js';
import logger from './logger.js';

const service = 'FFmpeg';

export async function createHardsub(
	mediaPath: string,
	assPath: string,
	outputFile: string
) {
	if (extname(mediaPath) === '.mp3') {
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
			'aac',
			'-b:a',
			'192k',
			'-c:v',
			'libx264',
			'-vf',
			`loop=loop=-1:size=1,ass=${assPath}`,
			'-preset',
			'slow',
			'-movflags',
			'+faststart',
			'-shortest',
			outputFile,
		]);
	} else {
		await execa(
			getState().binPath.ffmpeg,
			[
				'-y',
				'-nostdin',
				'-i',
				mediaPath,
				'-c:a',
				'aac',
				'-b:a',
				'192k',
				'-c:v',
				'libx264',
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
		logger.debug(`Analyzing ${mediafile}`, { service });
		const ffmpeg = getState().binPath.ffmpeg;
		// We need a second ffmpeg for loudnorm since you can't have two audio filters at once
		const [result, loudnormStr] = await Promise.all([
			execa(
				ffmpeg,
				['-i', mediafile, '-vn', '-af', 'replaygain', '-f', 'null', '-'],
				{ encoding: 'utf8' }
			),
			computeLoudnorm ? computeMediaLoudnorm(mediafile) : null,
		]);
		const outputArray = result.stderr.split(' ');
		const indexTrackGain = outputArray.indexOf('track_gain');
		const indexDuration = outputArray.indexOf('Duration:');

		let audiogain = '0';
		let duration = '0';
		let error = false;
		if (indexTrackGain > -1) {
			const gain = parseFloat(outputArray[indexTrackGain + 2]);
			audiogain = gain.toString();
		} else {
			error = true;
		}

		if (indexDuration > -1) {
			duration = outputArray[indexDuration + 1].replace(',', '');
			duration = timeToSeconds(duration).toString();
		} else {
			error = true;
		}

		const indexVideo = outputArray.indexOf('Video:');
		let videoCodec = '';
		let videoHeight = 0;
		let videoWidth = 0;
		let videoColorspace = '';
		if (indexVideo > -1) {
			// Example lines for reference:
			// Stream #0:0[0x1](und):  Video: h264 (avc1 / 0x31637661),        yuv420p10le(tv, bt709, progressive),   1920x1080 [SAR 1:1 DAR 16:9],       3844 kb/s, 23.98 fps, 23.98 tbr, 24k tbn (default)
			// Stream #0:0(eng):       Video: vp9,                             yuv420p(tv, bt709),                    1920x1080, SAR 1:1 DAR 16:9,             24 fps, 24 tbr, 1k tbn (default)
			// Stream #0:0[0x1](und):  Video: h264 (avc1 / 0x31637661),        yuv420p(progressive),                  1920x1080 [SAR 1:1 DAR 16:9],       6003 kb/s, 25 fps, 25 tbr, 90k tbn (default)
			// Stream #0:0[0x1](und):  Video: h264 (avc1 / 0x31637661),        yuv420p(tv, bt709, progressive),       1920x1080 [SAR 1:1 DAR 16:9],       3992 kb/s, 24 fps, 24 tbr, 12288 tbn (default)
			// Stream #0:0[0x1](und):  Video: h264 (avc1 / 0x31637661),        yuv420p(tv, bt709, progressive),       1920x1080,                          4332 kb/s, 23.98 fps, 23.98 tbr, 24k tbn (default)
			// Stream #0:0(eng):       Video: h264 (High) (avc1 / 0x31637661), yuv420p,                 1920x1080 [SAR 1:1 DAR 16:9],       5687 kb/s, 23.98 fps, 23.98 tbr, 24k tbn, 47.95 tbc (default)
			// Audio only with embedded pictures:
			// Stream #0:1:         Video: png,                    rgba(pc),                                        1920x1080 [SAR 5669:5669 DAR 16:9], 90k tbr, 90k tbn, 90k tbc (attached pic)
			// Stream #0:1:            Video: mjpeg (Progressive),      yuvj444p(pc, bt470bg/unknown/unknown), 1920x1080 [SAR 1:1 DAR 16:9],       90k tbr, 90k tbn, 90k tbc (attached pic)
			try {
				videoCodec = outputArray[indexVideo + 1].replace(',', ''); // h264 (avc1 / 0x31637661)
				const referenceIndexes = {
					videoFpsIndex: outputArray.findIndex(a => a.replace(',', '') === 'fps'),
					attachedPicEndLineIndex: outputArray.findIndex((a, index) => index >= indexVideo && a === '(attached'),
					sarIndex: outputArray.findIndex((a, index) => index >= indexVideo && a === '[SAR')
				};
				const searchBeforeIndexSameLine = referenceIndexes.videoFpsIndex >= 0 && referenceIndexes.videoFpsIndex ||
					// Fallback to properties nearby if no fps defined
					referenceIndexes.attachedPicEndLineIndex >= 0 && referenceIndexes.attachedPicEndLineIndex ||
					referenceIndexes.sarIndex >= 0 && referenceIndexes.sarIndex; 
				let resIndex: number;
				// Resolution is the first piece behind videoFpsIndex that contains "x"
				for (let i = searchBeforeIndexSameLine - 1; i > indexVideo; i -= 1) { // Make sure to only search in the same "Video" line and not everywhere by checking other indexes
					if (outputArray[i].includes('x')) {
						try {
							// Check if the format is a resolution
							// If numbers can't be parsed, it's not a resolution, silently continue
							const resArray = outputArray[i].replace(',', '').split('x').map(a => Number(a));
							videoWidth = resArray[0];
							videoHeight = resArray[1];
							resIndex = i;
							break;
						} catch (e) { 
							// Ignore if it's not a resolution
						}
					}
				}
			
				// Colorspace is the first piece behind resIndex, detect two formats of it:
				// yuv420p,
				// yuv420p(tv, bt709, progressive),
				if (resIndex > 1 && outputArray[resIndex - 1].includes(',') && !outputArray[resIndex - 1].includes(')')) {
					videoColorspace = outputArray[resIndex - 1].replace(',', '');
				} else {
					// The first piece behind resIndex that contains "("
					for (let i = resIndex - 1; i > indexVideo; i -= 1) {
						if (outputArray[i].includes('(')) {
							videoColorspace = outputArray[i].split('(')[0];
							break;
						}
					}
			}
			} catch (e) {
				logger.warn(`Error on parsing technical media info on ${mediafile}`, {
					service,
					error: e,
				});
			}
		}

		const indexAudio = outputArray.indexOf('Audio:');
		let audioCodec = '';
		if (indexAudio > -1) {
			audioCodec = outputArray[indexAudio + 1].replace(',', '');
		}

		return {
			duration: +duration,
			gain: +audiogain,
			loudnorm: loudnormStr,
			error,
			filename: mediafile,

			videoCodec,
			audioCodec,
			videoResolution: videoHeight && videoWidth && {
				height: videoHeight,
				width: videoWidth,
				formatted: `${videoWidth}x${videoHeight}`,
			},
			videoColorspace,
		};
	} catch (err) {
		logger.warn(`Video ${mediafile} probe error`, {
			service,
			obj: err,
		});
		return {
			duration: 0,
			gain: 0,
			loudnorm: '',
			error: true,
			filename: mediafile,
		};
	}
}

async function computeMediaLoudnorm(mediafile: string) {
	const ffmpeg = getState().binPath.ffmpeg;
	const loudnormResult = await execa(
		ffmpeg,
		[
			'-i',
			mediafile,
			'-vn',
			'-af',
			'loudnorm=print_format=json',
			'-f',
			'null',
			'-',
		],
		{ encoding: 'utf8' }
	);
	const outputArrayLoudnorm = loudnormResult.stderr.split('\n');
	const indexLoudnorm = outputArrayLoudnorm.findIndex(s =>
		s.startsWith('[Parsed_loudnorm'));
	const loudnormArr = outputArrayLoudnorm.splice(indexLoudnorm + 1);
	const loudnorm = JSON.parse(loudnormArr.join('\n'));
	const loudnormStr = `${loudnorm.input_i},${loudnorm.input_tp},${loudnorm.input_lra},${loudnorm.input_thresh},${loudnorm.target_offset}`;
	return loudnormStr;
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
