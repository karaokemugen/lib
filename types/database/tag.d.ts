export interface DBTag {
	types: number[],
	name: string,
	tid: string,
	aliases: string[],
	short: string,
	i18n: object,
	tagfile: string,
	karacount: object,
	repository: string,
	modified_at: Date,
	count: number
}