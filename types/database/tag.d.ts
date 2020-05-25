export interface DBTag extends DBTagMini {
	karacount: object,
	count: number
}

export interface DBTagMini {
	types: number[],
	name: string,
	tid: string,
	aliases: string[],
	short: string,
	i18n: object,
	tagfile: string,
	repository: string,
	modified_at: Date,
}