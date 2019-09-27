import execa from 'execa';
import logger from './logger';
import {asyncRequired} from './files';
import {timeToSeconds} from './date';
import { MediaInfo } from '../types/kara';
import {getState} from '../../utils/state';
import { getConfig } from './config';
import { resolve } from 'path';

export async function extractSubtitles(videofile: string, extractfile: string) {
	await execa(getState().binPath.ffmpeg, ['-y', '-i', videofile, extractfile], {encoding: 'utf8'});

	// Verify if the subfile exists. If it doesn't, it means ffmpeg didn't extract anything
	return await asyncRequired(extractfile);
}

export async function webOptimize(source: string, destination: string) {
	try {
		return await execa(getState().binPath.ffmpeg, ['-y', '-i', source, '-movflags', 'faststart', '-acodec' , 'copy', '-vcodec', 'copy', destination], {encoding: 'utf8'});
	} catch(err) {
		logger.error(`[ffmpeg] Video ${source} could not be faststarted : ${err.code} (${err.message}`);
		logger.error(`[ffmpeg] STDOUT: ${err.stdout}`);
		logger.error(`[ffmpeg] STDERR: ${err.stderr}`);
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
			let gain = parseFloat(outputArray[indexTrackGain + 2]);
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
		logger.warn(`[ffmpeg] Video '${mediafile}' probe error : '${JSON.stringify(err)}'`);
		return { duration: 0, gain: 0, error: true, filename: mediafile };
	}
}

export async function createThumbnail(mediafile: string, percent: number, mediaduration: number, mediasize: number, uuid: string) {
	try {
		const thumbnailWidth = 600;
		const time = Math.floor(mediaduration * (percent / 100));
		const previewfile = resolve(getState().appPath, getConfig().System.Path.Previews, `${uuid}.${mediasize}.${percent}.jpg`);
		await execa(getState().binPath.ffmpeg, ['-ss', `${time}`, '-i', mediafile,  '-vframes', '1', '-filter:v', 'scale=\'min('+thumbnailWidth+',iw):-1\'', previewfile ], { encoding : 'utf8' });
	} catch(err) {
		logger.warn(`[ffmpeg] Unable to create preview for ${mediafile} : ${err.code}`);
	}
}
