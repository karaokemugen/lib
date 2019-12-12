export interface DBKaraTag {
	i18n: any,
	name: string,
	slug: string,
	tagtype: number,
	short?: string,
	aliases?: string[]
	tid: string
}

export interface DBKaraBase {
	kid: string,
	title: string,
	sid?: string[],
	tid: string[],
	subfile: string,
	mediafile: string,
	karafile: string,
	duration: number,
	count: number
}

export interface DBYear {
	year: number,
	karacount: number
}

export interface DBKaraExtended extends DBKaraBase {
	songorder: number,
	serie: string,
	serie_orig: string,
	serie_altname: string[][],
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

export interface DBKara extends DBKaraExtended {
	seriefiles: string[],
	tagfiles: string[],
	gain?: number,
	mediasize: number,
	played: number,
	requested: number,
	flag_dejavu: boolean,
	lastplayed_at: Date,
	lastrequested_at: Date,
	lastplayed_ago: lastplayed_ago,
	flag_favorites: boolean,
	repo: string,
	tag_names: string,
	lyrics?: string[]
}

export interface KaraListData {
	i18n: any
	data: any
	avatars: any
}