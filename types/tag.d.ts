import { DBList } from './database/database';
import { DBTag } from './database/tag';
import { BaseParams } from './kara';

export interface TagParams extends BaseParams {
	type?: number;
	stripEmpty?: boolean;
	problematic?: boolean;
	order?: 'karacount' | 'az';
	duplicates?: boolean;
	tid?: string;
}

export interface TagAndType {
	tid: string;
	type: number;
}

export interface Tag {
	types: any[];
	name: string;
	tid: string;
	aliases?: string[];
	short?: string;
	problematic?: boolean;
	priority?: number;
	noLiveDownload?: boolean;
	i18n?: Record<string, string>;
	tagfile?: string;
	karacount?: Record<string, number>;
	karaType?: number;
	error?: boolean;
	repository?: string;
	count?: number;
	karafile_tag?: string;
}

export interface TagFile {
	header: {
		description: string;
		version: number;
	};
	tag: Tag;
}

export interface TagList extends DBList {
	content: DBTag[];
}

export interface ImportTag {
	tid?: string;
	name?: string;
}
