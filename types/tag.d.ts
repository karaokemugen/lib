import { DBList } from './database/database';
import { DBTag } from './database/tag';
import {KaraParams} from './kara';
export interface TagParams extends KaraParams {
	type?: number,
	order?: string,
	stripEmpty?: boolean
}

export interface TagAndType {
	tid: string,
	type: number
}

export interface Tag {
	types: any[],
	name: string,
	tid: string,
	aliases?: string[],
	short?: string,
	problematic?: boolean,
	noLiveDownload?: boolean,
	nolivedownload?: boolean,
	i18n?: Record<string, string>,
	tagfile?: string,
	karacount?: Record<string, number>,
	karaType?: number,
	error?: boolean,
	repository?: string,
	modified_at?: string,
	count?: number
}


export interface TagFile {
	header: {
		description: string,
		version: number
	}
	tag: Tag
}

export interface TagList extends DBList {
	content: DBTag[]
}


export interface ImportTag {
	tid?: string,
	name?: string
}
