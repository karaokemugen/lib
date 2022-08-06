import { tagTypes } from '../utils/constants';
import { DBList } from './database/database';
import { DBTag } from './database/tag';
import { BaseParams } from './kara';

export interface TagParams extends BaseParams {
	type?: TagTypeNum;
	stripEmpty?: boolean;
	order?: 'karacount' | 'az';
	duplicates?: boolean;
	tid?: string;
	includeStaging?: boolean;
	collections?: string[];
}

export interface TagAndType {
	tid: string;
	type: TagTypeNum;
}

export type TagType = keyof typeof tagTypes;

export type TagTypeNum = typeof tagTypes[TagType];

export interface Tag {
	types: TagType[];
	name: string;
	tid: string;
	aliases?: string[];
	short?: string;
	priority?: number;
	noLiveDownload?: boolean;
	i18n?: Record<string, string>;
	description?: Record<string, string>;
	tagfile?: string;
	karacount?: Record<string, number>;
	karaType?: number;
	error?: boolean;
	repository?: string;
	count?: number;
	karafile_tag?: string;
	external_database_ids?: {
		myanimelist?: number;
		anilist?: number;
		kitsu?: number;
	};
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
