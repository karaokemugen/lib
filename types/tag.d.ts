import {KaraParams} from './kara';
import { DBList } from './database/database';
import { DBTag } from './database/tag';
export interface TagParams extends KaraParams {
	type?: number,
	order?: string
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
	i18n?: object,
	tagfile?: string,
	karacount?: object,
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
