import { KaraFileV4 } from './kara';
import { TagFile } from './tag';

export interface DownloadBundle {
	kara: KaraMetaFile,
	lyrics: MetaFile,
	series: MetaFile[],
	tags: TagMetaFile[]
}

interface MetaFile {
	file: string,
	data: any
}

interface KaraMetaFile {
	file: string,
	data: KaraFileV4
}

interface TagMetaFile {
	file: string,
	data: TagFile
}