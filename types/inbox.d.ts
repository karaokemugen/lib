import { DBKaraTag } from './database/kara.js';
import { KaraMetaFile, MetaFile, TagMetaFile } from './downloads.js';

export interface DBInbox {
	inid: string;
	name: string;
	kid: string;
	edited_kid: string;
	fix?: boolean;
	username_downloaded?: string;
	downloaded_at?: Date;
	created_at: Date;
	gitlab_issue?: string;
	contact: string;
}

export interface SingleDBInbox extends DBInbox {
	mediafile: string;
	subfile: string;
	karafile: string;
	tags: DBKaraTag[];
}

export interface Inbox {
	inid: string;
	name: string;
	kid: string;
	edited_kid: string;
	username_downloaded?: string;
	downloaded_at?: Date;
	created_at: Date;
	kara: KaraMetaFile;
	lyrics: MetaFile;
	extra_tags: TagMetaFile[];
	mediafile: string;
	gitlab_issue?: string;
	contact: string;
	available_locally?: boolean;
}
