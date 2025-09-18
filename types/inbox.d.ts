import { DBKaraTag } from './database/kara.js';
import { KaraMetaFile, MetaFile, TagMetaFile } from './downloads.js';
import { LyricsInfo } from './kara.js';

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
	fk_login?: string;
}

export interface SingleDBInbox extends DBInbox {
	mediafile: string;
	lyrics_infos: LyricsInfo[];
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
