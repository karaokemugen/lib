export interface FFmpegProgress {
	frame: number,
	fps: number,
	q: number,
	size: string,
	time: string,
	timeSeconds?: number,
	bitrate: string,
	speed: string,
}

export interface FFmpegEncodingOptions {
	sourceFile?: string,
	destFile: string,
	audioCodec: 'copy' | 'auto' | string,
	audioBitrate?: string,
	videoCodec: 'copy' | 'auto' | string,
	videoColorSpace?: string,
	videoPreset?: string,
	videoCRF?: number,
	videoFilter?: string,
	trimStartSeconds?: number,
	trimDurationSeconds?: number
}

export interface FFmpegBlackdetectLine {
	black_start: number,
	black_end: number,
	black_duration: number,
}

export interface FFmpegSilencedetectLine {
	silence_start: number,
	silence_end: number,
	silence_duration: number,
}

export interface FFmpegHardsubOptions {
	container: string,
	videoCodec: 'copy' | 'auto' | string,
	videoColorSpace?: string,
	videoFramerate?: number,
	audioCodec: 'copy' | 'auto' | string,
	audioBitrate?: string,
	additionalFfmpegParameters?: string,
	maxResolution?: {
		width: number,
		height: number,
	}
}