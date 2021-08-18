import { DBPL } from './database/playlist';
import { KaraParams } from './kara';

export interface PLParams {
	public?: boolean,
	username?: string,
	plaid?: string,
	slug?: string,
	containsKID?: string,
	contributors?: boolean
}

export interface PLCParams extends KaraParams {
	plaid: string,
	orderByLikes?: boolean,
}

export interface PLCEditParams {
	flag_free?: boolean,
	flag_visible?: boolean,
	flag_accepted?: boolean,
	flag_refused?: boolean,
	flag_playing?: boolean,
	pos?: number
}

export interface PLC {
	plaid: string,
	plcid?: number,
	username?: string,
	nickname?: string,
	kid?: string,
	created_at?: Date,
	pos?: number,
	flag_playing?: boolean,
	flag_visible?: boolean,
	flag_free?: boolean,
	flag_refused?: boolean,
	flag_accepted?: boolean,
	duration?: number,
	uniqueSerieSinger?: string,
	title?: string,
	type?: string,
	mediasize?: number,
	mediafile?: string,
	repository?: string,
	comment?: string
}

export interface PlaylistExport {
	Header?: {
		version: number,
		description: string
	},
	PlaylistInformation?: DBPL,
	PlaylistContents?: PlaylistExportKara[]
	PlaylistCriterias?: Criteria[]
}

interface PlaylistExportKara {
	kid: string,
	username: string,
	nickname: string,
	created_at: Date,
	flag_free: boolean,
	flag_visible: boolean,
	flag_accepted?: boolean,
	flag_refused?: boolean,
	flag_playing?: boolean,
	plaid?: string,
	pos: number
}

export interface Criteria {
	type: number,
	value: any,
	plaid: string,
	value_i18n?: string
}

export interface ComputedCriteria {
	kid: string,
	comment: string
}