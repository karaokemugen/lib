import execa from 'execa';
import { resolve } from 'path';

import {getState} from '../../utils/state';
import { MediaInfo } from '../types/kara';
import { resolvedPathPreviews } from './config';
import {timeToSeconds} from './date';
import {asyncRequired} from './files';
import logger from './logger';

export async function extractSubtitles(videofile: string, extractfile: string) {
	await execa(getState().binPath.ffmpeg, ['-y', '-i', videofile, extractfile], {encoding: 'utf8'});

	// Verify if the subfile exists. If it doesn't, it means ffmpeg didn't extract anything
	return asyncRequired(extractfile);
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
		const result = await execa(getState().binPath.ffmpeg, ['-i', mediafile, '-vn', '-af', 'replaygain', '-f','null', '-'], { encoding : 'utf8' });
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
			duration = outputArray[indexDuration + 1].replace(',','');
			duration = timeToSeconds(duration).toString();
		} else {
			error = true;
		}

		return {
			duration: +duration,
			gain: +audiogain,
			error: error,
			filename: mediafile
		};
	} catch(err) {
		logger.warn(`Video ${mediafile} probe error`, {service: 'ffmpeg', obj: err});
		return { duration: 0, gain: 0, error: true, filename: mediafile };
	}
}

export async function createThumbnail(mediafile: string, percent: number, mediaduration: number, mediasize: number, uuid: string) {
	try {
		const thumbnailWidth = 600;
		const time = Math.floor(mediaduration * (percent / 100));
		const previewfile = resolve(resolvedPathPreviews(), `${uuid}.${mediasize}.${percent}.jpg`);
		await execa(getState().binPath.ffmpeg, ['-ss', `${time}`, '-i', mediafile,  '-vframes', '1', '-filter:v', 'scale=\'min('+thumbnailWidth+',iw):-1\'', previewfile ], { encoding : 'utf8' });
	} catch(err) {
		logger.warn(`Unable to create preview for ${mediafile}`, {service: 'ffmpeg', obj: err});
	}
}

export async function extractAlbumArt(mediafile: string, mediasize: number, uuid: string) {
	try {
		const thumbnailWidth = 600;
		const previewFile = resolve(resolvedPathPreviews(), `${uuid}.${mediasize}.25.jpg`);
		await execa(getState().binPath.ffmpeg, ['-i', mediafile, '-filter:v', 'scale=\'min('+thumbnailWidth+',iw):-1\'', previewFile ], { encoding : 'utf8' });
	} catch(err) {
		logger.warn(`Unable to create preview (album art) for ${mediafile}`, {service: 'ffmpeg', obj: err});
	}
}
