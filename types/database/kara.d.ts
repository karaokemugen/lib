import { ASSLine } from '../ass';
import { TagTypeNum } from '../tag';
import { DownloadedStatus } from './download';

export interface DBKaraTag {
	i18n: any;
	name: string;
	slug: string;
	tagtype: TagTypeNum;
	description?: Record<string, string>;
	short?: string;
	aliases?: string[];
	tid: string;
	karafile_tag?: string;
	repository: string;
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
}
export interface DBKaraBase {
	kid: string;
	duration: number;
	mediafile: string;
	mediasize: number;
	repository: string;
	download_status: DownloadedStatus;
	karafile: string;
	subfile: string;
	hardsubbed_mediafile?: string;
}

export interface KaraOldData {
	old_karafile: string;
	old_mediafile: string;
	old_subfile: string;
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
	titles: any;
	titles_aliases?: string[];
	titles_default_language?: string;
	tid: string[];
	count: number;
	ignoreHooks: boolean;
	tagfiles: string[];
	gain?: number;
	loudnorm?: string;
	played: number;
	requested: number;
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
	libraries: DBKaraTag[];
	created_at: Date;
	modified_at: Date;
	isKaraModified?: boolean;
	comment: string;
	parents: string[];
	children: string[];
	subchecksum?: string;
	balanceUID?: string;
	username?: string; // Used by favorites
}

export interface KaraListData {
	i18n: any;
	data: any;
	avatars: any;
}
