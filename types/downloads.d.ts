import { KaraFileV4 } from './kara';
import { TagFile } from './tag';

export interface ShinDownloadBundle {
	karas: KaraMetaFile[],
	lyrics: MetaFile[],
	tags: TagMetaFile[]
}

export interface DownloadBundle {
	header: {
		description: string
	}
	kara: KaraMetaFile,
	lyrics: MetaFile,
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