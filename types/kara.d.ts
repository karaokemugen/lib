import { DBList } from './database/database.js';
import { DownloadedStatus } from './database/download.js';
import { DBKara, DBYear } from './database/kara.js';
import { DBPLC } from './database/playlist.js';

export type CompareParam = 'missing' | 'updated';
export type OrderParam =
	| 'sessionPlayed'
	| 'sessionRequested'
	| 'recent'
	| 'requested'
	| 'requestedRecently'
	| 'requestedLocal'
	| 'played'
	| 'playedRecently'
	| 'history'
	| 'favorited'
	| 'karacount';

export interface EditedKara {
	kara: KaraFileV4;
	modifiedLyrics?: boolean;
	modifiedMedia?: boolean;
}

export interface MediaInfo {
	size?: number;
	filename: string;
	fileExtension?: string;
	error: boolean;
	gain: number;
	loudnorm: string;
	duration: number;

	overallBitrate?: number;
	videoCodec?: string;
	videoColorspace?: string;
	audioCodec?: string;
	videoResolution?: { height: number; width: number; formatted: string };
}

export interface KaraList<T = DBKara | DBPLC> extends DBList {
	i18n?: Record<string, Record<string, string>>;
	avatars?: Record<string, string>;
	content: T[];
	infos: {
		count: number;
		from: number;
		to: number;
		totalMediaSize?: number;
	};
}

export interface YearList extends DBList {
	content: DBYear[];
}

export interface KaraTag {
	name?: string;
	tid?: string;
}

export interface Kara {
	titles: any;
	titles_aliases?: string[];
	titles_default_language?: string;
	year: number;
	songorder?: number;
	tags: {
		[TagType: string]: string[];
	};
	repository?: string;
	created_at: string;
	modified_at: string;
	kid: string;
	comment?: string;
	parents?: string[];
	ignoreHooks: boolean;
}

interface KaraMeta {
	karaFile: string;
	error: boolean;
	isKaraModified: boolean;
	downloadStatus: DownloadedStatus;
}

export interface KaraFileV4 {
	header: {
		version: 4;
		description: 'Karaoke Mugen Karaoke Data File';
	};
	medias: MediaFile[];
	data: Kara;
	meta: Partial<KaraMeta>;
}

export interface ErrorKara {
	meta: KaraMeta & { error: true };
}

export interface MediaFile {
	version: string;
	filename: string;
	audiogain: number;
	loudnorm: string;
	duration: number;
	filesize: number;
	default: boolean;
	lyrics?: LyricsFile[];
}

export interface LyricsFile {
	filename: string;
	default: boolean;
	version: string;
}

export interface NewKara {
	data: Kara;
	file: string;
}

export interface BaseParams {
	filter?: string;
	lang?: string;
	from?: number;
	size?: number;
}

export interface KaraParams extends BaseParams {
	q?: string;
	qType?: 'AND' | 'OR';
	username?: string;
	random?: number;
	blacklist?: boolean;
	order?: OrderParam;
	favorites?: string;
	noOnline?: boolean;
	parentsOnly?: boolean;
	userFavorites?: string;
	userAnimeList?: string;
	ignoreCollections?: boolean;
	safeOnly?: boolean;
	forceCollections?: string[];
}
