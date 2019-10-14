import {KaraParams} from './kara';
import { DBList } from './database/database';
export interface TagParams extends KaraParams {
	type?: number
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
	karacount?: string,
	karaType?: number,
	error?: boolean
}


export interface TagFile {
	header: {
		description: string,
		version: number
	}
	tag: Tag
}

export interface TagList extends DBList {
	content: Tag[]
}


export interface ImportTag {
	tid?: string,
	name?: string
}
