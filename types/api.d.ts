import { Token, User } from './user';

export interface APIData<T = any> {
	body: T,
	authorization?: string,
	onlineAuthorization?: string,
	token?: Token
	user?: User
	langs?: string
}
