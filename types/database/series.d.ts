export interface DBSeriesBase {
	name: string,
	sid: string
}

export interface DBSeries extends DBSeriesBase {
	i18n_name: string,
	aliases: string[],
	i18n: any,
	search: string,
	seriefile: string,
	karacount: number,
	repository: string,
	modified_at: Date
}