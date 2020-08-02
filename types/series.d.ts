import { DBList } from './database/database';
import { DBSeries } from './database/series';

export interface Series {
	name: string,
	aliases?: string[],
	i18n?: any,
	sid?: string,
	seriefile?: string,
	serie_id?: number,
	i18n_name?: string,
	repository?: string,
	modified_at?: string,
	error?: boolean
}

export interface SeriesFile {
	header: SeriesFileHeader,
	series: Series
}

interface SeriesFileHeader {
	version: number,
	description: string
}

export interface SeriesList extends DBList {
	content: DBSeries[]
}
