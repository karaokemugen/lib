import { ASSLine } from '../ass';
import { DownloadedStatus } from './download';

export interface DBKaraTag {
	i18n: any;
	name: string;
	slug: string;
	tagtype: number;
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
	titles_default_language?: string;
}

export interface DBKara extends DBKaraBase {
	titles: any;
	titles_aliases?: string[];
	tid: string[];
	subfile: string;
	karafile: string;
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
	download_status?: DownloadedStatus;
	songorder: number;
	series: DBKaraTag[];
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
}

export interface KaraListData {
	i18n: any;
	data: any;
	avatars: any;
}
