export interface FfmpegEncodingOptions {
		sourceFile?: string,
		destFile: string,
		audioCodec: 'copy' | 'auto' | string,
		audioBitrate?: string,
		videoCodec: 'copy' | 'auto' | string,
		videoColorSpace?: string,
		videoCRF?: number,
		videoFilter?: string,
		videoTune?: 'animation' | 'film',
		trimStartSeconds?: number,
		trimDurationSeconds?: number
}
