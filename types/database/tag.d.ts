export interface DBTag extends DBTagMini {
	karacount: Record<string, string>,
	count: number
}

export interface DBTagMini {
	types: number[],
	name: string,
	tid: string,
	aliases: string[],
	short: string,
	i18n: Record<string, string>,
	tagfile: string,
	repository: string,
	problematic: boolean,
	noLiveDownload: boolean,
	priority?: number,
	modified_at: Date,
	count?: number
}