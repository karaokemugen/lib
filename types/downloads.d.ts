import { KaraFileV4 } from './kara.js';
import { TagFile } from './tag.js';

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
