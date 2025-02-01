import { Criteria } from '../playlist.js';
import { DownloadedStatus } from './download.js';
import { DBKara, DBKaraBase } from './kara.js';

export interface PLCInsert {
	kid: string;
	username?: string;
	nickname: string;
	plaid: string;
	added_at: Date;
	criterias?: Criteria[];
	pos?: number;
	flag_visible?: boolean;
	flag_refused?: boolean;
	flag_accepted?: boolean;
	flag_free?: boolean;
}

export interface DBPLCBase extends DBKaraBase {
	nickname: string;
	flag_playing: boolean;
	pos: number;
	flag_free: boolean;
	flag_accepted: boolean;
	flag_refused: boolean;
	flag_visible: boolean;
	username?: string;
	user_type: number;
	plcid: number;
	plaid: string;
	count: number;
	criterias?: Criteria[];
	login: string;
	added_at: Date;
}

export interface DBPLCTime {
	plcid: number;
	playing_at: Date;
	played_at: Date;
}

export interface DBPLC extends DBPLCBase, DBKara, DBPLCTime {
	flag_whitelisted: boolean;
	flag_blacklisted: boolean;
	upvotes: number;
	flag_upvoted: boolean;
	flag_visible: boolean;
	download_status: DownloadedStatus;
	balanceUID?: string;
}

export interface Contributors {
	nickname: string;
	username: string;
	avatar_file: string;
}

export interface DBPLBase {
	plaid?: string;
	name: string;
	description?: string;
	slug?: string;
	karacount?: number;
	duration?: number;
	created_at?: Date;
	modified_at?: Date;
	flag_visible: boolean;
	flag_visible_online?: boolean;
	username?: string;
	nickname?: string;
	contributors?: Contributors[];
}
