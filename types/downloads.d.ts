import { KaraFileV4 } from './kara';
import { TagFile } from './tag';

// Old <5.1 download bundle. Remove when 5.0 and down gets out of the way
export interface DownloadBundleServer extends DownloadBundle {
	header: {
		description: string;
	};
	kara: KaraMetaFile;
	lyrics: MetaFile;
	tags: TagMetaFile[];
}

export interface DownloadBundle {
	name?: string;
	uuid?: string;
	size?: number;
	mediaFile?: string;
}

interface MetaFile {
	file: string;
	data: any;
}

interface KaraMetaFile extends MetaFile {
	data: KaraFileV4;
}

interface TagMetaFile extends MetaFile {
	data: TagFile;
}
