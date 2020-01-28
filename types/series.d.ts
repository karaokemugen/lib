export interface Series {
	name: string,
	aliases?: string[],
	i18n?: any,
	sid?: string,
	seriefile?: string,
	serie_id?: number,
	i18n_name?: string
	repository?: string
}

export interface SeriesFile {
	header: SeriesFileHeader,
	series: Series
}

interface SeriesFileHeader {
	version: number,
	description: string
}
