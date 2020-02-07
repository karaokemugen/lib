import { Token } from "./user";
import { DBKara, DBYear } from "./database/kara";
import { DBList } from "./database/database";
import { Tag } from "./tag";

export type CompareParam = 'missing' | 'updated';
export type ModeParam = 'search' | 'kid' | 'sessionPlayed' | 'sessionRequested' | 'recent' | 'requested' | 'played' | 'favorited';

export interface MediaInfo {
	size?: number,
	filename: string,
	error: boolean,
	gain: number,
	duration: number
}


export interface KaraList extends DBList {
	i18n?: any
	avatars?: any
	content: DBKara[],
	infos: {
		count: number,
		from: number,
		to: number
	}
}

export interface YearList extends DBList {
	content: DBYear[]
}

export interface KaraTag {
	name?: string,
	tid?: string
}

export interface Kara {
	kid?: string,
	langs_i18n?: string[],
	mediafile?: string,
	mediafile_orig?: string,
	mediasize?: number,
	mediaduration?: number,
	mediagain?: number,
	subfile?: string,
	subfile_orig?: string,
	subchecksum?: string,
	karafile?: string,
	title?: string,
	year?: number,
	order?: any,
	created_at?: Date,
	modified_at?: Date,
	series?: string[],
	singers?: KaraTag[],
	misc?: KaraTag[],
	groups?: KaraTag[],
	songwriters?: KaraTag[],
	creators?: KaraTag[],
	authors?: KaraTag[],
	langs?: KaraTag[],
	songtypes?: KaraTag[],
	families?: KaraTag[],
	genres?: KaraTag[],
	platforms?: KaraTag[],
	origins?: KaraTag[],
	seasons?: KaraTag[],
	error?: boolean,
	isKaraModified?: boolean,
	version?: number,
	repository?: string,
	noNewVideo?: boolean,
	noNewSub?: boolean,
	sids?: string[],
	newSeries?: boolean,
	newTags?: boolean,
	comment?: string,
}


export interface KaraFileV4 {
	header: {
		version: number,
		description: string,
	},
	medias: MediaFile[],
	data: {
		title: string,
		sids: string[],
		year: number,
		songorder?: number,
		tags: {
			misc?: string[],
			songwriters?: string[],
			creators?: string[],
			authors?: string[],
			langs: string[],
			origins?: string[],
			groups?: string[],
			families?: string[],
			platforms?: string[],
			genres?: string[],
			songtypes: string[],
			singers?: string[],
			seasons?: string[]
		},
		repository: string,
		created_at: string,
		modified_at: string,
		kid: string
	}
}

export interface MediaFile {
	version: string,
	filename: string,
	audiogain: number,
	duration: number,
	filesize: number,
	default: boolean,
	lyrics: LyricsFile[]
}

export interface LyricsFile {
	filename: string,
	default: boolean,
	version: string,
	subchecksum: string
}

export interface NewKara {
	data: Kara,
	file: string
}

export interface KaraParams {
	filter?: string,
	q?: string,
	lang?: string,
	from?: number,
	size?: number,
	mode?: ModeParam,
	modeValue?: string,
	username?: string,
	admin?: boolean,
	random?: number,
	token?: Token
}

export interface IDQueryResult {
	new: boolean,
	id: string
}
