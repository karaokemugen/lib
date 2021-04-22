import {DBKara} from './kara';

export interface DBPLCBase extends DBKara {
	nickname: string,
	flag_playing: boolean,
	pos: number,
	flag_free: boolean,
	flag_accepted: boolean,
	flag_refused: boolean,
	flag_visible: boolean,
	username: string,
	user_type: number,
	plcid: number,
	plaid: number,
	count: number
}

export interface DBPL {
	plaid?: number,
	name: string,
	slug?: string,
	karacount?: number,
	duration?: number,
	time_left?: number,
	created_at?: Date,
	modified_at?: Date,
	flag_visible: boolean,
	flag_visible_online?: boolean,
	flag_current?: boolean,
	flag_public?: boolean,
	plcontent_id_playing?: number,
	username: string,
	contributors?: string[]
}

export interface DBPLCAfterInsert {
	plc_id: number,
	kid: string,
	pos: number,
	username: string
}
