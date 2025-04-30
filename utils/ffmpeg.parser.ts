import { timeToSeconds } from './date.js';
import logger from './logger.js';

export function ffmpegParseVideoInfo(ffmpegOutputSpaceSplitted: string[]) {
	const indexVideo = ffmpegOutputSpaceSplitted.indexOf('Video:');
	const hasVideoStream = indexVideo > 0;
	let videoCodec = '';
	let videoHeight = 0;
	let videoWidth = 0;
	let videoColorspace = '';
	let videoFramerate = 0;
	let videoSAR = '';
	let videoDAR = '';
	let videoOffset = 0;
	let isPicture = false;
	if (indexVideo > -1) {
		// Example lines for reference:
		// Stream #0:0[0x1](und):  Video: h264 (avc1 / 0x31637661),        yuv420p10le(tv, bt709, progressive),   1920x1080 [SAR 1:1 DAR 16:9],       3844 kb/s, 23.98 fps, 23.98 tbr, 24k tbn (default)
		// Stream #0:0(eng):       Video: vp9,                             yuv420p(tv, bt709),                    1920x1080, SAR 1:1 DAR 16:9,             24 fps, 24 tbr, 1k tbn (default)
		// Stream #0:0[0x1](und):  Video: h264 (avc1 / 0x31637661),        yuv420p(progressive),                  1920x1080 [SAR 1:1 DAR 16:9],       6003 kb/s, 25 fps, 25 tbr, 90k tbn (default)
		// Stream #0:0[0x1](und):  Video: h264 (avc1 / 0x31637661),        yuv420p(tv, bt709, progressive),       1920x1080 [SAR 1:1 DAR 16:9],       3992 kb/s, 24 fps, 24 tbr, 12288 tbn (default)
		// Stream #0:0[0x1](und):  Video: h264 (avc1 / 0x31637661),    yuv420p(tv, bt709, progressive),       1920x1080,                          4332 kb/s, 23.98 fps, 23.98 tbr, 24k tbn (default)
		// Stream #0:0(eng):    Video: h264 (High) (avc1 / 0x31637661), yuv420p,           1920x1080 [SAR 1:1 DAR 16:9],       5687 kb/s, 23.98 fps, 23.98 tbr, 24k tbn, 47.95 tbc (default)
		// Stream #0:0[0x1](eng):  Video: av1 (Main) (av01 / 0x31307661),  yuv420p(tv, top coded first (swapped)), 854x480, 2446 kb/s, SAR 1:1 DAR 427:240, 29.97 fps, 29.97 tbr, 30k tbn (default)
		// Audio only with embedded pictures:
		// Stream #0:1:    Video: png,            rgba(pc),    1920x1080 [SAR 5669:5669 DAR 16:9], 90k tbr, 90k tbn, 90k tbc (attached pic)
		// Stream #0:1:    Video: mjpeg (Progressive),             yuvj444p(pc, bt470bg/unknown/unknown),  1920x1080 [SAR 1:1 DAR 16:9],       90k tbr, 90k tbn, 90k tbc (attached pic)
		try {
			videoCodec = ffmpegOutputSpaceSplitted[indexVideo + 1].replace(',', ''); // h264 (avc1 / 0x31637661)
			const referenceIndexes = {
				videoFpsIndex: ffmpegOutputSpaceSplitted.findIndex(a => a.replace(',', '') === 'fps'),
				attachedPicEndLineIndex: ffmpegOutputSpaceSplitted.findIndex(
					(a, index) => index >= indexVideo && a === '(attached'
				),
				sarIndex: ffmpegOutputSpaceSplitted.findIndex(
					(a, index) => index >= indexVideo && (a === '[SAR' || a === 'SAR')
				),
				darIndex: ffmpegOutputSpaceSplitted.findIndex((a, index) => index >= indexVideo && a === 'DAR'),
			};
			isPicture =
				referenceIndexes.attachedPicEndLineIndex > 0 &&
				ffmpegOutputSpaceSplitted.some(a => a.trim() === 'pic)');
			const searchBeforeIndexSameLine =
				(referenceIndexes.videoFpsIndex >= 0 && referenceIndexes.videoFpsIndex) ||
				// Fallback to properties nearby if no fps defined
				(referenceIndexes.attachedPicEndLineIndex >= 0 && referenceIndexes.attachedPicEndLineIndex) ||
				(referenceIndexes.sarIndex >= 0 && referenceIndexes.sarIndex) || 0;
			let resIndex: number = 0;
			// Resolution is the first piece behind videoFpsIndex that contains "x"
			for (let i = searchBeforeIndexSameLine - 1; i > indexVideo; i -= 1) {
				// Make sure to only search in the same "Video" line and not everywhere by checking other indexes
				if (ffmpegOutputSpaceSplitted[i].includes('x')) {
					try {
						// Check if the format is a resolution
						// If numbers can't be parsed, it's not a resolution, silently continue
						const resArray = ffmpegOutputSpaceSplitted[i]
							.replace(',', '')
							.split('x')
							.map(a => Number(a));
						videoWidth = resArray[0];
						videoHeight = resArray[1];
						resIndex = i;
						break;
					} catch (e) {
						// Ignore if it's not a resolution
					}
				}
			}

			// SAR / DAR pixel format
			if (referenceIndexes.sarIndex > 0) videoSAR = ffmpegOutputSpaceSplitted[referenceIndexes.sarIndex + 1];
			if (referenceIndexes.darIndex > 0) videoDAR = ffmpegOutputSpaceSplitted[referenceIndexes.darIndex + 1];
			if (videoDAR.endsWith(',')) videoDAR = videoDAR.substring(0, videoDAR.length - 1);
			if (videoDAR.endsWith(']')) videoDAR = videoDAR.substring(0, videoDAR.length - 1);

			// Colorspace is the first piece behind resIndex, detect two formats of it:
			// yuv420p,
			// yuv420p(tv, bt709, progressive),
			if (
				resIndex > 1 &&
				ffmpegOutputSpaceSplitted[resIndex - 1].includes(',') &&
				!ffmpegOutputSpaceSplitted[resIndex - 1].includes(')')
			) {
				videoColorspace = ffmpegOutputSpaceSplitted[resIndex - 1].replace(',', '');
			} else {
				// The first piece behind resIndex that contains "("
				for (let i = resIndex - 1; i > indexVideo; i -= 1) {
					if (ffmpegOutputSpaceSplitted[i].includes('(') && !ffmpegOutputSpaceSplitted[i].includes('))')) {
						videoColorspace = ffmpegOutputSpaceSplitted[i].split('(')[0];
						break;
					}
				}
			}

			if (referenceIndexes.videoFpsIndex > 0) {
				videoFramerate = Number(ffmpegOutputSpaceSplitted[referenceIndexes.videoFpsIndex - 1]);
			}

			videoOffset = findAndParseOffset(ffmpegOutputSpaceSplitted, indexVideo);
		} catch (e) {
			logger.warn('Error on parsing technical video info', {
				service: 'ffmpeg.parser',
				error: e,
			});
		}
	}
	return {
		videoCodec,
		videoColorspace,
		videoHeight,
		videoWidth,
		videoResolution: videoHeight &&
			videoWidth && {
			height: videoHeight,
			width: videoWidth,
			formatted: `${videoWidth}x${videoHeight}`,
		},
		videoFramerate,
		videoAspectRatio: { pixelAspectRatio: videoSAR, displayAspectRatio: videoDAR },
		videoOffset,
		isPicture,
		hasVideoStream,
	};
}

export function ffmpegParseAudioInfo(ffmpegOutputSpaceSplitted: string[]) {
	// Example lines for reference:
	// Stream #0:1[0x2](und): Audio: opus (Opus / 0x7375704F), 48000 Hz, stereo, fltp, 198 kb/s (default)
	const indexAudio = ffmpegOutputSpaceSplitted.indexOf('Audio:');
	const hasAudioStream = indexAudio > 0;
	let audioCodec = '';
	if (indexAudio > -1) {
		audioCodec = ffmpegOutputSpaceSplitted[indexAudio + 1].replace(',', '');
	} else {
		// No audio found in file, like for Ultrastar AVIs.
		return { hasAudioStream };
	}
	const indexAudioHz = ffmpegOutputSpaceSplitted.indexOf('Hz,');
	let audioSampleRate = 0;
	if (indexAudioHz) {
		audioSampleRate = Number(ffmpegOutputSpaceSplitted[indexAudioHz - 1])
	}
	const indexAudioChannelLayout = indexAudioHz + 2;
	let audioChannelLayout = '';
	if (indexAudioChannelLayout) {
		audioChannelLayout = ffmpegOutputSpaceSplitted[indexAudioChannelLayout - 1]?.replace(',', '');
	}

	const audioOffset = findAndParseOffset(ffmpegOutputSpaceSplitted, indexAudio);
	return {
		audioCodec,
		audioSampleRate,
		audioChannelLayout,
		audioOffset,
		hasAudioStream
	};
}

function findAndParseOffset(ffmpegOutputSpaceSplitted: string[], lastIndex: number) {
	let indexOffset = 0;
	for (let i = lastIndex; i > 0 && !indexOffset; i--) {
		if (ffmpegOutputSpaceSplitted[i].startsWith('start:'))
			indexOffset = i + 1;
		else if (ffmpegOutputSpaceSplitted[i]?.toLowerCase() === 'duration:') // Looked to much back, property start doesn't exist
			return null;
	}
	if (indexOffset) {
		try {
			return Number(ffmpegOutputSpaceSplitted[indexOffset]?.replaceAll(',', ''));
		} catch (e) {
			logger.warn(`Could not parse offset "${ffmpegOutputSpaceSplitted[indexOffset]}" to number`, {
				service: 'ffmpeg.parser',
				error: e,
			});
		}
	}
	return null;
}

export function ffmpegParseLoudnorm(ffmpegOutputNewlineSplitted: string[]) {
	const indexLoudnormStart = ffmpegOutputNewlineSplitted.findIndex(s => s.startsWith('[Parsed_loudnorm'));
	if (indexLoudnormStart) {
		const indexLoudnormEnd = ffmpegOutputNewlineSplitted.findIndex(
			(s, index) => index > indexLoudnormStart && s.trim() === '}'
		);
		const loudnormArr = ffmpegOutputNewlineSplitted.slice(indexLoudnormStart + 1, indexLoudnormEnd + 1);
		const loudnorm = JSON.parse(loudnormArr.join('\n'));
		const loudnormStr = `${loudnorm.input_i},${loudnorm.input_tp},${loudnorm.input_lra},${loudnorm.input_thresh},${loudnorm.target_offset}`;
		return loudnormStr;
	}
}

export function ffmpegParseProgressLine(line: string) {
	// frame= 1749 fps= 34 q=25.0 size=   25856kB time=00:01:10.25 bitrate=3015.1kbits/s speed=1.38x
	if (!line) return null;
	const ffmpegProgressLineMap: { [key: string]: string } =
		line
			.replaceAll('  ', ' ')
			.replaceAll('  ', ' ')
			.replaceAll('= ', '=')
			.split(' ')
			.map(arg => arg.split('='))
			.filter(arg => arg.length === 2)
			.map(arg => ({ key: arg[0], value: arg[1] }))
			.reduce((previousValue, currentValue) => {
				previousValue[currentValue.key] = currentValue.value;
				return previousValue;
			}, {});
	return {
		frame: ffmpegProgressLineMap.frame && Number(ffmpegProgressLineMap.frame),
		fps: ffmpegProgressLineMap.fps && Number(ffmpegProgressLineMap.fps),
		q: ffmpegProgressLineMap.q && Number(ffmpegProgressLineMap.q),
		size: ffmpegProgressLineMap.size,
		time: ffmpegProgressLineMap.time,
		timeSeconds:
			ffmpegProgressLineMap.time
				?.split('.')[0]
				?.split(':')
				.reduce((acc, time) => 60 * acc + +time, 0) + Number(`0.${ffmpegProgressLineMap.time?.split('.')[1]}`),
		bitrate: ffmpegProgressLineMap.bitrate,
		speed: ffmpegProgressLineMap.speed,
	};
}

export const ffmpegParseBlackdetect = (output: string) =>
	output
		.split('\n')
		// [blackdetect @ 0x56211e41ae40] black_start:0 black_end:1.08333 black_duration:1.08333
		// [blackdetect @ 0x56211e41ae40] black_start:3.48333 black_end:3.53333 black_duration:0.05
		.filter(line => line.includes('[blackdetect'))
		.map(line =>
			line
				.split(' ')
				.map(arg => arg.split(':'))
				.filter(arg => arg.length === 2))
		.map(bdline => ({
			black_start: Number(bdline.find(a => a[0] === 'black_start')[1]),
			black_end: Number(bdline.find(a => a[0] === 'black_end')[1]),
			black_duration: Number(bdline.find(a => a[0] === 'black_start')[1]),
		}));

export function ffmpegParseSilencedetect(output: string) {
	// [silencedetect @ 0x562e98399440] silence_start: 0
	// [silencedetect @ 0x562e98399440] silence_end: 0.0525417 | silence_duration: 0.0525417
	const silenceDetectDataRaw = output
		.split('\n')
		.filter(line => line.includes('[silencedetect'))
		.map(line =>
			line
				.replaceAll(': ', ':')
				.split(' ')
				.map(arg => arg.split(':'))
				.filter(arg => arg.length === 2))
		.map(bdline => ({
			silence_start: bdline.find(a => a[0] === 'silence_start'),
			silence_end: bdline.find(a => a[0] === 'silence_end'),
			silence_duration: bdline.find(a => a[0] === 'silence_duration'),
		}));
	const silenceDetectData: {
		silence_start: number;
		silence_end: number;
		silence_duration: number;
	}[] = [];
	for (let i = 0; i < silenceDetectDataRaw.length; i += 1) {
		if (silenceDetectDataRaw[i].silence_end && silenceDetectDataRaw[i - 1].silence_start) {
			silenceDetectData.push({
				silence_start: Number(silenceDetectDataRaw[i - 1].silence_start[1]),
				silence_duration: Number(silenceDetectDataRaw[i].silence_duration[1]),
				silence_end: Number(silenceDetectDataRaw[i].silence_end[1]),
			});
		}
	}
	return silenceDetectData;
}

export function ffmpegParseDuration(output: string | string[]) {
	const outputArray = typeof output === 'string' ? output.split(' ') : output;
	const indexDuration = outputArray.indexOf('Duration:');
	if (indexDuration > -1) {
		const duration = outputArray[indexDuration + 1].replace(',', '');
		return timeToSeconds(duration);
	}
	return undefined;
}
