import { KaraFileV4 } from './kara';
import { TagFile } from './tag';

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
