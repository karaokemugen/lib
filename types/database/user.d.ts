import { Roles } from '../user.js';

interface DBUserBase {
	login: string;
	nickname?: string;
	avatar_file?: string;
	type?: number;
	last_login_at?: Date;
	flag_logged_in?: boolean;
}

type AnimeListProvider = 'myanimelist' | 'anilist' | 'kitsu';

export interface DBUser extends DBUserBase {
	password?: string;
	type?: number; // KMApp user type
	roles?: Roles;
	bio?: string;
	url?: string;
	email?: string;
	main_series_lang?: string;
	fallback_series_lang?: string;
	password_last_modified_at?: Date;
	flag_tutorial_done?: boolean;
	flag_public?: boolean;
	flag_displayfavorites?: boolean;
	social_networks?: SocialNetworks;
	banner?: string;
	location?: string;
	flag_sendstats?: boolean;
	language?: string;
	anime_list_to_fetch?: AnimeListProvider;
	anime_list_last_modified_at?: Date;
	anime_list_ids?: number[];
	flag_parentsonly?: boolean;
	favorites_count?: number;
	count?: number;
	flag_temporary?: boolean;
}

export interface SocialNetworks {
	mastodon?: string;
	instagram?: string;
	bluesky?: string;
	discord?: string;
	twitch?: string;
	anilist?: string;
	myanimelist?: string;
	kitsu?: number;
	gitlab?: string;
}
