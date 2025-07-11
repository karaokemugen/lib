import { AudioChannelLayout, supportedFiles } from '../utils/constants.ts';
import { DBList } from './database/database.js';
import { DownloadedStatus } from './database/download.js';
import { DBKara, DBYear } from './database/kara.js';
import { DBPLC } from './database/playlist.js';
import { PositionX, PositionY } from './index.js';
import { TagType } from './tag.js';

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
	| 'user_favorites'
	| 'mediasize'
	| 'karacount';

export interface EditedKara {
	kara: KaraFileV4;
	modifiedLyrics?: boolean;
	modifiedMedia?: boolean;
	useEmbeddedLyrics?: boolean;
}

export type MediaInfoWarning = 'LIBAVCODEC_ENCODER';

export interface MediaInfo {
	size?: number;
	filename: string;
	fileExtension?: string;
	error: boolean;
	loudnorm: string;
	duration: number;

	mediaType?: 'audio' | 'video',
	overallBitrate?: number;

	hasVideoStream?: boolean;
	videoCodec?: string;
	videoColorspace?: string;
	videoAspectRatio?: {
		pixelAspectRatio?: string, // PAR / SAR (on ffmpeg)
		displayAspectRatio?: string // DAR
	};
	videoResolution?: { height: number; width: number; formatted: string };
	videoFramerate?: number;
	videoOffset?: number;

	hasAudioStream?: boolean;
	audioCodec?: string;
	audioSampleRate?: number;
	audioChannelLayout?: AudioChannelLayout;
	audioOffset?: number;
	hasCoverArt?: boolean;
	warnings?: Array<MediaInfoWarning>
}

export interface MediaInfoValidationResult {
	name: keyof MediaInfo;
	mandatory: boolean;
	suggestedValue: string | number;
	resolvableByTranscoding: boolean;
}

export interface KaraList<T = DBKara | DBPLC> extends DBList {
	i18n: Record<string, Record<string, string>>;
	avatars: Record<string, string>;
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

export type KaraFromDisplayType = TagType | null;

export interface Kara {
	titles: { [key: string]: string };
	titles_aliases?: string[];
	titles_default_language?: string;
	year?: number;
	songorder?: number;
	tags: {
		[TagType: string]: string[];
	};
	from_display_type?: KaraFromDisplayType;
	repository?: string;
	created_at: string;
	modified_at: string;
	kid: string;
	comment?: string;
	parents?: string[];
	ignoreHooks: boolean;
	songname?: string;
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
	loudnorm: string;
	duration: number;
	filesize: number;
	default: boolean;
	lyrics: LyricsFile[];
}

export interface LyricsInfo {
	filename: string;
	default: boolean;
	version: string;
	announce_position_x?: PositionX;
	announce_position_y?: PositionY;
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
	direction?: 'desc' | 'asc',
	favorites?: string;
	parentsOnly?: boolean;
	userFavorites?: string;
	userAnimeList?: string;
	ignoreCollections?: boolean;
	safeOnly?: boolean;
	forceCollections?: string[];
	forPlayer?: boolean;
}

export type KarasMap = Map<string, KaraFileV4>;

export type SupportedLyricsFormat = typeof supportedFiles.lyrics[number];
