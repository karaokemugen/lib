import { DBUser } from './database/user';

export type Role = 'user' | 'guest' | 'admin';

export interface Token {
	username: string,
	role: Role,
	token?: string,
	onlineToken?: string,
	onlineAvailable?: boolean
}

export interface User extends DBUser {
	old_login?: string,
	onlineToken?: string,
	securityCode?: number,
}
