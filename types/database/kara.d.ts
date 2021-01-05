import { ASSLine } from '../ass';

export interface DBKaraTag {
	i18n: any,
	name: string,
	slug: string,
	tagtype: number,
	short?: string,
	aliases?: string[]
	tid: string,
	problematic: boolean
}

export interface DBKaraBase {
	kid: string,
	title: string,
	tid: string[],
	subfile: string,
	mediafile: string,
	karafile: string,
	duration: number,
	count: number,
	repository: string
}

export interface DBYear {
	year: number,
	karacount: number
}

export interface DBKaraExtended extends DBKaraBase {
	songorder: number,
	series: DBKaraTag[],
	singers: DBKaraTag[],
	songtypes: DBKaraTag[],
	creators: DBKaraTag[],
	songwriters: DBKaraTag[],
	year: number
	langs: DBKaraTag[],
	authors: DBKaraTag[],
	misc: DBKaraTag[],
	groups: DBKaraTag[],
	origins: DBKaraTag[],
	platforms: DBKaraTag[],
	families: DBKaraTag[],
	genres: DBKaraTag[],
	versions: DBKaraTag[],
	created_at: Date,
	modified_at: Date,
	isKaraModified?: boolean
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
	mediasize: number,
	mediafile: string
}
export interface DBKara extends DBKaraExtended {
	tagfiles: string[],
	gain?: number,
	mediasize: number,
	subchecksum: string,
	played: number,
	requested: number,
	my_public_plc_id?: number[],
	flag_dejavu?: boolean,
	flag_inplaylist?: boolean,
	flag_upvoted?: boolean,
	lastplayed_at?: Date,
	lastrequested_at?: Date,
	lastplayed_ago?: lastplayed_ago,
	flag_favorites: boolean,
	tag_names: string,
	lyrics?: ASSLine[]
}

export interface KaraListData {
	i18n: any
	data: any
	avatars: any
}
