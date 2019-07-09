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
	types: number[],
	name: string,
	tid: string,
	aliases?: string[],
	short?: string,
	i18n?: object,
	tagfile?: string
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