import { Token, User } from './user';

export interface APIData {
	body: any
	authorization?: string,
	onlineAuthorization?: string,
	token?: Token
	user?: User
	langs?: string
}