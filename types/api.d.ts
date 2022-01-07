import { IncomingHttpHeaders } from 'http';

import { JWTTokenWithRoles, OldJWTToken, User } from './user';

export interface APIData<D = any, T = OldJWTToken> {
	body: D;
	authorization?: string;
	onlineAuthorization?: string;
	token?: T;
	user?: User;
	langs?: string;
}

export interface APIDataProxied<T = any> extends APIData<T> {
	headers: IncomingHttpHeaders;
}
