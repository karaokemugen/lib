import { basename, dirname, join } from 'path';

import { FfmpegEncodingOptions } from '../types/ffmpeg.js';
import { MediaInfo, MediaInfoValidationResult } from '../types/kara.js';
import { RepositoryManifestV2 } from '../types/repo.js';
import { replaceExt } from './files.js';

/*
export const exampleRepoManifest: Partial<RepositoryManifestV2> = {
	rules: {
		videoFile: {
			containers: { allowed: ['mp4'], default: 'mp4', mandatory: true },
			codecs: {
				video: { allowed: ['h264'], default: 'h264', mandatory: true },
				audio: { allowed: ['aac'], default: 'aac', mandatory: true },
			},
			colorSpace: { allowed: ['yuv420p'], default: 'yuv420p', mandatory: true },
			bitrate: { max: 810_000, mandatory: true }, // 8'100 kb/s
			resolution: { max: { height: 1080, width: 1920, mandatory: true } },
		},
		audioFile: {
			containers: { allowed: ['mp3'], default: 'mp3', mandatory: true },
			bitrate: {
				max: 53_000, // 530 kb/s
			},
			codecs: {
				allowed: ['mp3'],
				mandatory: true,
				default: 'mp3',
			},
		},
	},
};
*/

function isMediaFileTooBig(
	bitrate: number,
	fileType: 'audio' | 'video',
	{ rules }: Pick<RepositoryManifestV2, 'rules'>
) {
	// Estimate if file size is too big.
	// Can't be calculated precisely since we only have an overall bitrate and no individual video/audio sizes at the current time
	if (
		fileType === 'video' &&
		rules?.videoFile?.bitrate?.max
	) {
		return (
			bitrate &&
			bitrate / 100 >
				rules.videoFile.bitrate.max + (rules.audioFile?.bitrate?.max || 0)
		);
	}
	if (
		fileType === 'audio' &&
		rules?.audioFile?.bitrate?.max
	) {
		return bitrate && bitrate / 100 > rules.audioFile.bitrate.max;
	}
}

export function computeMediaEncodingOptions(
	mediaInfo: MediaInfo,
	{ rules }: Pick<RepositoryManifestV2, 'rules'>,
	sourceFilePath?: string,
	options?: {
		outputFolder?: string;
		videoCRF: number;
		trim?: boolean;
		tune: 'film' | 'animation'; 
	}
) {
	const mismatchingMediaInfo: MediaInfoValidationResult[] = [];

	// Initialize minimal encoding options. Determine the actual changes after that
	const encodeOptions: FfmpegEncodingOptions = {
		destFile: (options?.outputFolder || sourceFilePath) && join(
			options?.outputFolder || dirname(sourceFilePath),
			replaceExt(basename(sourceFilePath), '.encoded.ext')
		),
		sourceFile: sourceFilePath,
		audioCodec: 'copy',
		videoCodec: 'copy',
		videoCRF: options?.videoCRF,
		videoTune: options?.tune,
	};
	let newFileExtension = mediaInfo.fileExtension;
	let encodeVideo = false;
	let encodeAudio = false;

	// Check container and determine file extension
	const containerRules =
		mediaInfo.mediaType === 'video'
			? rules?.videoFile?.containers
			: rules?.audioFile?.containers;
	if (
		containerRules?.allowed?.length >= 1 &&
		!containerRules.allowed.includes(mediaInfo.fileExtension.toLowerCase())
	) {
		newFileExtension = containerRules.default || containerRules.allowed[0];
		mismatchingMediaInfo.push({
			name: 'fileExtension',
			mandatory: containerRules?.mandatory === true,
			suggestedValue: newFileExtension
		});
	}

	encodeOptions.destFile = encodeOptions.destFile && replaceExt(
		encodeOptions.destFile,
		`.${newFileExtension}`
	);

	const videoRules = rules?.videoFile;
	const audioRules = rules?.audioFile;

	// Specific checks for conditions
	if (
		isMediaFileTooBig(mediaInfo.overallBitrate, mediaInfo.mediaType, { rules })
	) {
		// encodeAudio = true; // Don't reencode audio if codec is correct for now, since we don't know the audio stream size and it won't make a big difference anyways on videos
		encodeVideo = true;
		const mandatory =
			videoRules?.bitrate?.mandatory === true ||
			audioRules?.bitrate?.mandatory === true;
		const estimatedMaxBitrate = mediaInfo.mediaType === 'video' ? (rules?.videoFile?.bitrate?.max || 0) + (rules?.audioFile?.bitrate?.max || 0) : rules?.audioFile?.bitrate.max;
		mismatchingMediaInfo.push({ name: 'overallBitrate', mandatory, suggestedValue: estimatedMaxBitrate * 100});
		mismatchingMediaInfo.push({ name: 'size', mandatory, suggestedValue: estimatedMaxBitrate * mediaInfo.duration * 100});
	}

	// Video resolution
	if (
		mediaInfo.mediaType === 'video' &&
		videoRules?.resolution?.max?.height &&
		videoRules?.resolution?.max?.width
	) {
		let resFilter: string;
		if (mediaInfo.videoResolution?.height > videoRules.resolution.max.height)
			resFilter = `-1:${videoRules.resolution.max.height}`;
		else if (mediaInfo.videoResolution?.width > videoRules.resolution.max.width)
			resFilter = `${videoRules.resolution.max.width}:-1`;
		if (resFilter) encodeOptions.videoFilter = `scale=${resFilter}`;

		if (encodeOptions.videoFilter) {
			mismatchingMediaInfo.push({
				name: 'videoResolution',
				mandatory: videoRules?.resolution?.max?.mandatory === true,
				suggestedValue: resFilter
			});
			encodeVideo = true;
		}
	}
	
	if (
		mediaInfo.mediaType === 'video' &&
		videoRules?.resolution?.min?.height &&
		videoRules?.resolution?.min?.width && 
		(mediaInfo.videoResolution?.height < videoRules.resolution.min.height ||
			mediaInfo.videoResolution?.width < videoRules.resolution.min.width)
	) {
		mismatchingMediaInfo.push({
			name: 'videoResolution',
			mandatory: videoRules.resolution.min.mandatory,
			suggestedValue: `${videoRules?.resolution?.min?.width}x${videoRules?.resolution?.min?.height}`
		});
		// Nothing we can do
	}

	// Colorspace
	if (
		mediaInfo.mediaType === 'video' &&
		videoRules?.colorSpace?.allowed?.length >= 1 &&
		!videoRules.colorSpace.allowed.includes(mediaInfo.videoColorspace)
	) {
		encodeOptions.videoColorSpace =
			videoRules?.colorSpace?.default || videoRules?.colorSpace?.allowed[0];
		encodeVideo = true;
		mismatchingMediaInfo.push({
			name: 'videoColorspace',
			mandatory: videoRules?.colorSpace?.mandatory === true,
			suggestedValue: encodeOptions.videoColorSpace
		});
	}

	// Audiocodec
	const audioCodecRules =
		mediaInfo.mediaType === 'video'
			? videoRules?.codecs?.audio
			: audioRules?.codecs;
	const defaultAudioCodec = 
		audioCodecRules.default ||
		audioCodecRules.allowed[0] ||
		mediaInfo.audioCodec; // Fallback to current codec, if nothing else is defined

	const audioCodecIsInvalid = (audioCodecRules?.allowed?.length >= 1 &&
		!audioCodecRules.allowed.includes(mediaInfo.audioCodec));
	if (audioCodecIsInvalid) {
		encodeAudio = true;
		mismatchingMediaInfo.push({
			name: 'audioCodec',
			mandatory: audioRules?.codecs?.mandatory === true,
			suggestedValue: defaultAudioCodec
		});
	}
	if (// FIXME split for audioFile and videoFile as in audioRules?.codecs?.video and audioRules?.codecs?.audio
		encodeAudio 
	) {
		encodeOptions.audioCodec = defaultAudioCodec;
		if (mediaInfo.mediaType === 'video') encodeOptions.videoCodec = null; // Don't encode video on audio-only media
	}

	// Check cover art
	if (audioRules?.coverArt && mediaInfo.mediaType === 'audio' && !mediaInfo.hasCoverArt)
		mismatchingMediaInfo.push({
			name: 'hasCoverArt',
			mandatory: audioRules?.coverArt?.mandatory === true,
			suggestedValue: ''
		});

	// Audio min bitrare
	if (audioRules?.bitrate?.min && mediaInfo.mediaType === 'audio' && mediaInfo.overallBitrate < audioRules.bitrate.min) {
		mismatchingMediaInfo.push({ name: 'overallBitrate', mandatory: false, suggestedValue: audioRules.bitrate.min});
		// Nothing we can do
	}

	// Videocodec
	const defaultVideoCodec = 
		videoRules?.codecs?.video?.default ||
		videoRules?.codecs?.video?.allowed[0] || // Fallback to first allowed codec
		mediaInfo.videoCodec; // Fallback to current codec, if nothing else is defined

	const videoCodecIsInvalid = (mediaInfo.mediaType === 'video' &&
		videoRules?.codecs?.video?.allowed?.length >= 1 &&
		!videoRules.codecs.video.allowed.includes(mediaInfo.videoCodec));

		if (videoCodecIsInvalid) {
			encodeVideo = true;
			mismatchingMediaInfo.push({
				name: 'videoCodec',
				mandatory: videoRules?.codecs?.video?.mandatory === true,
				suggestedValue: defaultVideoCodec
			});
		}
	if (encodeVideo) {
		encodeOptions.videoCodec = defaultVideoCodec;
	}

	return { ...encodeOptions, mismatchingMediaInfo };
}

export function validateMediaInfoByRules(
	mediaInfo: MediaInfo,
	rules: Pick<RepositoryManifestV2, 'rules'>
) {
	const encodingOptions = computeMediaEncodingOptions(mediaInfo, rules);
	return encodingOptions.mismatchingMediaInfo;
}
