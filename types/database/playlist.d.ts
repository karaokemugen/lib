import { Criteria } from '../playlist';
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
	plaid: string,
	count: number,
	criterias?: Criteria[]	
}

export type SmartPlaylistType = 'UNION' | 'INTERSECT'

export interface DBPL {
	plaid?: string,
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
	flag_whitelist?: boolean,
	flag_blacklist?: boolean,
	flag_smart?: boolean,
	plcontent_id_playing?: number,
	username?: string,
	contributors?: string[],
	type_smart?: SmartPlaylistType
}

export interface DBPLCAfterInsert {
	plc_id: number,
	kid: string,
	pos: number,
	username: string
}
