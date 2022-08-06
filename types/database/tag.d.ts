import { TagTypeNum } from "../tag";

export interface DBTag extends DBTagMini {
	karacount: Record<string, number>;
	count: number;
}

export interface DBTagMini {
	types: TagTypeNum[];
	name: string;
	tid: string;
	aliases: string[];
	short: string;
	i18n: Record<string, string>;
	description?: Record<string, string>;
	tagfile: string;
	repository: string;
	noLiveDownload: boolean;
	priority?: number;
	karafile_tag?: string;
	external_database_ids?: {
		myanimelist?: number;
		anilist?: number;
		kitsu?: number;
	};
}
