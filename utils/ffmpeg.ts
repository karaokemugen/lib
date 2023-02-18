import { execa } from 'execa';
import { basename, extname, resolve } from 'path';

import { getState } from '../../utils/state';
import { MediaInfo } from '../types/kara';
import { resolvedPath } from './config';
import { timeToSeconds } from './date';
import { fileRequired, replaceExt } from './files';
import logger from './logger';

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

export async function getMediaInfo(mediafile: string): Promise<MediaInfo> {
	try {
		logger.debug(`Analyzing ${mediafile}`, { service });
		// We need a second ffmpeg for loudnorm since you can't have two audio filters at once
		const ffmpeg = getState().binPath.ffmpeg;
		const [result, resultLoudnorm] = await Promise.all([
			execa(
				ffmpeg,
				['-i', mediafile, '-vn', '-af', 'replaygain', '-f', 'null', '-'],
				{ encoding: 'utf8' }
			),
			execa(
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
			),
		]);
		const outputArray = result.stderr.split(' ');
		const outputArrayLoudnorm = resultLoudnorm.stderr.split('\n');
		const indexTrackGain = outputArray.indexOf('track_gain');
		const indexDuration = outputArray.indexOf('Duration:');
		const indexLoudnorm = outputArrayLoudnorm.findIndex(s =>
			s.startsWith('[Parsed_loudnorm')
		);
		const loudnormArr = outputArrayLoudnorm.splice(indexLoudnorm + 1);
		const loudnorm = JSON.parse(loudnormArr.join('\n'));
		const loudnormStr = `${loudnorm.input_i},${loudnorm.input_tp},${loudnorm.input_lra},${loudnorm.input_thresh},${loudnorm.target_offset}`;
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

		return {
			duration: +duration,
			gain: +audiogain,
			loudnorm: loudnormStr,
			error,
			filename: mediafile,
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
