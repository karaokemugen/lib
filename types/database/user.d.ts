interface DBUserBase {
	login?: string,
	nickname?: string,
	avatar_file?: string
	password?: string
}

export interface DBUser extends DBUserBase {
	type?: number,
	bio?: string,
	url?: string,
	email?: string,
	fingerprint?: string,
	last_login_at?: Date,
	flag_online?: boolean
	series_lang_mode?: number,
	main_series_lang?: string,
	fallback_series_lang?: string,
	password_last_modified_at?: Date,
	flag_tutorial_done?: boolean,
}