import { KaraMetaFile, TagMetaFile } from './downloads.js';
import { LyricsInfo } from './kara.js';

export interface DBInbox {
	inid: string;
	name: string;
	kid: string;
	edited_kid: string;
	flag_fix?: boolean;
	contact?: string;
	username_downloaded?: string;
	downloaded_at?: Date;
	created_at: Date;
	gitlab_issue?: string;
	username?: string;
	karafile?: string;
	mediafile?: string;
	lyrics_infos?:  LyricsInfo[];
	tags?: DBKaraTag[];
	status?: InboxActions;
	reject_reason?: string;
	history?: InboxHistory[];
	modified_at?: Date;
}

export type InboxActions = 'sent' | 'in_review' | 'changes_requested' | 'accepted' | 'rejected';

export interface InboxHistory {
	action: InboxActions;
	datetime: Date;
	details: string;
}
export interface Inbox extends DBInbox {
	kara: KaraMetaFile;
	extra_tags: TagMetaFile[];
	available_locally?: boolean;
	lyrics: {
		data: string
		file: string
	}
}
