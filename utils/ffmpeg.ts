import execa from 'execa';
import { resolve } from 'path';

import {getState} from '../../utils/state';
import { MediaInfo } from '../types/kara';
import { resolvedPath } from './config';
import {timeToSeconds} from './date';
import {fileRequired, replaceExt} from './files';
import logger from './logger';

export async function extractSubtitles(videofile: string, extractfile: string) {
	await execa(getState().binPath.ffmpeg, ['-y', '-i', videofile, extractfile], {encoding: 'utf8'});

	// Verify if the subfile exists. If it doesn't, it means ffmpeg didn't extract anything
	return fileRequired(extractfile);
}

export async function webOptimize(source: string, destination: string) {
	try {
		return await execa(getState().binPath.ffmpeg, ['-y', '-i', source, '-movflags', 'faststart', '-acodec' , 'copy', '-vcodec', 'copy', destination], {encoding: 'utf8'});
	} catch(err) {
		logger.error(`Video ${source} could not be faststarted`, {service: 'ffmpeg', obj: err});
		throw err;
	}
}

export async function getMediaInfo(mediafile: string): Promise<MediaInfo> {
	try {
		logger.debug(`Analyzing ${mediafile}`, {service: 'ffmpeg'});
		// We need a second ffmpeg for loudnorm since you can't have two audio filters at once
		const ffmpeg = getState().binPath.ffmpeg;
		const [result, resultLoudnorm] = await Promise.all([
			execa(ffmpeg, ['-i', mediafile, '-vn', '-af', 'replaygain', '-f','null', '-'], { encoding : 'utf8' }),
			execa(ffmpeg, ['-i', mediafile, '-vn', '-af', 'loudnorm=print_format=json', '-f','null', '-'], { encoding : 'utf8' })
		]);
		const outputArray = result.stderr.split(' ');
		const outputArrayLoudnorm = resultLoudnorm.stderr.split('\n');
		const indexTrackGain = outputArray.indexOf('track_gain');
		const indexDuration = outputArray.indexOf('Duration:');
		const indexLoudnorm = outputArrayLoudnorm.findIndex(s => s.startsWith('[Parsed_loudnorm'));
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
			duration = outputArray[indexDuration + 1].replace(',','');
			duration = timeToSeconds(duration).toString();
		} else {
			error = true;
		}

		return {
			duration: +duration,
			gain: +audiogain,
			loudnorm: loudnormStr,
			error: error,
			filename: mediafile
		};
	} catch(err) {
		logger.warn(`Video ${mediafile} probe error`, {service: 'ffmpeg', obj: err});
		return { duration: 0, gain: 0, loudnorm: '', error: true, filename: mediafile };
	}
}

export async function createThumbnail(mediafile: string, percent: number, mediaduration: number, mediasize: number, uuid: string, thumbnailWidth = 600) {
	try {
		const time = Math.floor(mediaduration * (percent / 100));
		const previewfile = resolve(resolvedPath('Previews'), `${uuid}.${mediasize}.${percent}${thumbnailWidth > 600 ? '.hd':''}.jpg`);
		await execa(getState().binPath.ffmpeg, ['-ss', `${time}`, '-i', mediafile,  '-vframes', '1', '-filter:v', 'scale=\'min('+thumbnailWidth+',iw):-1\'', previewfile ], { encoding : 'utf8' });
	} catch(err) {
		logger.warn(`Unable to create preview for ${mediafile}`, {service: 'ffmpeg', obj: err});
	}
}

export async function extractAlbumArt(mediafile: string, mediasize: number, uuid: string, thumbnailWidth = 600) {
	try {
		const previewFile = resolve(resolvedPath('Previews'), `${uuid}.${mediasize}.25${thumbnailWidth > 600 ? '.hd':''}.jpg`);
		await execa(getState().binPath.ffmpeg, ['-i', mediafile, '-filter:v', 'scale=\'min('+thumbnailWidth+',iw):-1\'', previewFile ], { encoding : 'utf8' });
	} catch(err) {
		logger.warn(`Unable to create preview (album art) for ${mediafile}`, {service: 'ffmpeg', obj: err});
	}
}

export async function getAvatarResolution(avatar: string): Promise<number> {
	try {
		const reso = await execa(getState().binPath.ffmpeg, ['-i', avatar], { encoding: 'utf8' })
			.catch(err => err);
		const res = /, ([0-9]+)x([0-9]+)/.exec(reso.stderr);
		if (res) {
			return parseInt(res[1]);
		} else {
			return 250;
		}
	} catch (err) {
		logger.warn('Cannot compute avatar resolution', {service: 'ffmpeg', obj: err});
		return 250;
	}
}

export async function convertAvatar(avatar: string, replace = false) {
	try {
		logger.debug(`Converting avatar ${avatar}`, {service: 'ffmpeg'});
		const thumbnailWidth = 256;
		const originalFile = resolve(avatar);
		const optimizedFile = replace
			? resolve(replaceExt(avatar, '.jpg'))
			: resolve(`${avatar}.optimized.jpg`);
		await execa(getState().binPath.ffmpeg, ['-i', originalFile, '-y', '-q:v', '8', '-filter:v', 'scale=\'min('+thumbnailWidth+',iw)\':-1', '-frames:v', '1', optimizedFile ], { encoding : 'utf8' });
		return optimizedFile;
	} catch(err) {
		logger.warn(`Unable to create optimized version for ${avatar}`, {service: 'ffmpeg', obj: err});
		throw err;
	}
}
