import { KaraMetaFile, MetaFile, TagMetaFile } from './downloads';

export interface Inbox {
	inid: string,
	name: string,
	username_downloaded?: string,
	downloaded_at?: Date,
	created_at: Date,
	kara: KaraMetaFile,
	lyrics: MetaFile,
	extra_tags: TagMetaFile[]
	mediafile: string,
	gitlab_issue: string,
	fix: boolean
}