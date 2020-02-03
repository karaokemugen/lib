export interface DownloadBundle {
	kara: MetaFile,
	lyrics: MetaFile,
	series: MetaFile[],
	tags: MetaFile[]
}

export interface MetaFile {
	file: string,
	data: any
}