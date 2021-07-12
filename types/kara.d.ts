import { DBList } from './database/database';
import { DownloadedStatus } from './database/download';
import { DBKara, DBYear } from './database/kara';
import { Token } from './user';

export type CompareParam = 'missing' | 'updated';
export type OrderParam = 'sessionPlayed' |
	'sessionRequested' |
	'recent' |
	'requested' |
	'requestedLocal' |
	'played' |
	'history' |
	'favorited' |
	'karacount';

export interface MediaInfo {
	size?: number,
	filename: string,
	error: boolean,
	gain: number,
	loudnorm: string,
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
		totalMediaSize?: number
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
	mediafile?: string,
	mediafile_orig?: string,
	mediasize?: number,
	duration?: number,
	gain?: number,
	loudnorm?: string,
	subfile?: string,
	subfile_orig?: string,
	subchecksum?: string,
	karafile?: string,
	title?: string,
	year?: number,
	songorder?: number,
	created_at?: Date,
	modified_at?: Date,
	series?: KaraTag[],
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
	versions?: KaraTag[],
	error?: boolean,
	isKaraModified?: boolean,
	version?: number,
	repository?: string,
	noNewVideo?: boolean,
	noNewSub?: boolean,
	newTags?: boolean,
	comment?: string,
	download_status?: DownloadedStatus
}


export interface KaraFileV4 {
	header: {
		version: number,
		description: string,
	},
	medias: MediaFile[],
	data: {
		title: string,
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
			versions?: string[],
			genres?: string[],
			songtypes: string[],
			singers?: string[],
			series?: string[]
		},
		repository: string,
		created_at: string,
		modified_at: string,
		kid: string,
		comment: string
	}
}

export interface MediaFile {
	version: string,
	filename: string,
	audiogain: number,
	loudnorm: string,
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
	lang?: string,
	from?: number,
	size?: number,
	q?: string,
	username?: string,
	random?: number,
	token?: Token,
	blacklist?: boolean,
	order?: OrderParam,
	favorites?: string,
	noOnline?: boolean,
}

export interface IDQueryResult {
	new: boolean,
	id: string
}
