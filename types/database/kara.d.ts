import type { ASSLine } from '../ass.js';
import type { KaraFromDisplayType, LyricsInfo } from '../kara.js';
import type { TagTypeNum } from '../tag.js';
import type { DownloadedStatus } from './download.js';

export interface DBKaraFamily {
	kid: string;
	parent_kid: string;
}

export interface DBKaraTag {
	i18n: Record<string, string>;
	name: string;
	type_in_kara: TagTypeNum;
	description?: Record<string, string>;
	short?: string;
	aliases?: string[];
	tid: string;
	karafile_tag?: string;
	repository: string;
	priority: number;
}

export interface DBYear {
	year: number;
	karacount: number;
}

export interface lastplayed_ago {
	days: number;
	months: number;
	years: number;
	seconds: number;
	minutes: number;
	hours: number;
}

export interface DBMedia {
	mediasize: number;
	mediafile: string;
	kid: string;
	repository?: string;
	titles: any;
	titles_default_language: string;
}

export interface DBKaraKID {
	kid: string;
}

export interface DBKaraBase extends DBKaraKID {
	duration: number;
	mediafile: string;
	mediasize: number;
	repository: string;
	download_status: DownloadedStatus;
	karafile: string;
	lyrics_infos: LyricsInfo[];
	hardsubbed_mediafile?: string;
	songname?: string;
}

export interface KaraOldData {
	old_karafile: string;
	old_mediafile: string;
	old_lyrics_infos: LyricsInfo[];
	old_modified_at: Date;
	old_parents: string[];
	old_repository: string;
	old_download_status: DownloadedStatus
	karafile: string;
	mediafile: string;
	subfile: string;
	modified_at: Date;
	parents: string[];
	repository: string;
	download_status: string;
}

export interface DBKara extends DBKaraBase {
	titles: {[key: string]: string};
	titles_aliases?: string[];
	titles_default_language?: string;
	anilist_ids: number[];
	kitsu_ids: number[];
	myanimelist_ids: number[];
	tid: string[];
	count: number;
	ignore_hooks: boolean;
	tagfiles: string[];
	loudnorm?: string;
	played: number;
	requested: number;
	favorited: number;
	my_public_plc_id?: number[];
	public_plc_id?: number[];
	flag_dejavu?: boolean;
	flag_upvoted?: boolean;
	lastplayed_at?: Date;
	lastrequested_at?: Date;
	lastplayed_ago?: lastplayed_ago;
	flag_favorites: boolean;
	tag_names: string;
	lyrics?: ASSLine[];
	songorder: number;
	series: DBKaraTag[];
	franchises: DBKaraTag[];
	singergroups: DBKaraTag[];
	singers: DBKaraTag[];
	songtypes: DBKaraTag[];
	creators: DBKaraTag[];
	songwriters: DBKaraTag[];
	year: number;
	langs: DBKaraTag[];
	authors: DBKaraTag[];
	misc: DBKaraTag[];
	groups: DBKaraTag[];
	origins: DBKaraTag[];
	platforms: DBKaraTag[];
	families: DBKaraTag[];
	genres: DBKaraTag[];
	versions: DBKaraTag[];
	warnings: DBKaraTag[];
	collections: DBKaraTag[];
	created_at: Date;
	modified_at: Date;
	isKaraModified?: boolean;
	comment: string;
	parents: string[];
	children: string[];
	siblings: string[];
	playlists: string[];
	subchecksum?: string;
	balanceUID?: string;
	username?: string; // Used by favorites,
	hardsub_in_progress?: boolean;
	from_display_type?: KaraFromDisplayType;
}

export interface KaraListData {
	i18n: any;
	data: any;
	avatars: any;
}
