import { DBUser } from './database/user';

/** Still needed for KM App until roles overhaul is done */
export type Role = 'user' | 'guest' | 'admin' | 'maintainer' | 'contributor' | 'donator' | 'operator';

export interface Token {
	username: string,
	roles: Roles
	token?: string,
	onlineToken?: string,
	onlineAvailable?: boolean
}

export interface User extends DBUser {
	old_login?: string,
	onlineToken?: string,
	securityCode?: number,
}

export interface UserParams {
	full?: boolean,
	singleUser?: string,
	singleNickname?: string,
	guestOnly?: boolean,
	randomGuest?: boolean,
	onlineOnly?: boolean
}

export interface Roles {
	admin?: boolean,
	contributor?: boolean,
	maintainer?: boolean,
	donator?: boolean,
	user?: boolean,
	guest?: boolean,
}