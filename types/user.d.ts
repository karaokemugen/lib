import { DBUser } from './database/user';

export type Role = 'user' | 'guest' | 'admin' | 'maintainer' | 'contributor' | 'donator' | 'operator';

export interface Token {
	username: string,
	roles: Role[]
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