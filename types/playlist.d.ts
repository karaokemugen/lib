import { DBPL } from '../../types/database/playlist.js';
import { DBPLCBase } from './database/playlist.js';
import { KaraParams } from './kara.js';

export type OrderParam =
	| 'az'
	| 'recent'
	| 'karacount'
	| 'duration'
	| 'favorited'
	| 'username';

export interface PLParams {
	username?: string;
	plaid?: string;
	slug?: string;
	containsKID?: string;
	includeUserAsContributor?: boolean;
	filter?: string;
	order?: OrderParam;
	reverseOrder?: boolean;
	favorites?: string;
}

export interface PLCParams extends KaraParams {
	plaid: string;
	orderByLikes?: boolean;
}

export interface PLCEditParams {
	flag_free?: boolean;
	flag_visible?: boolean;
	flag_accepted?: boolean;
	flag_refused?: boolean;
	flag_playing?: boolean;
	flat_online?: boolean;
	flag_visible_online?: boolean;
	type_smart?: boolean;
	pos?: number;
	criterias?: Criteria[];
}

export interface PlaylistExport {
	Header?: {
		version: number;
		description: string;
	};
	PlaylistInformation?: DBPL;
	PlaylistContents?: DBPLCBase[];
	PlaylistCriterias?: Criteria[];
	Server?: string;
}

export interface Criteria {
	type: number;
	value: any;
	plaid?: string;
	value_i18n?: string;
}

export interface UnaggregatedCriteria {
	kid: string;
	criterias: Criteria[];
	duration?: number;
	created_at?: Date;
}
export interface AggregatedCriteria {
	kid: string;
	criterias: Criteria[];
}
