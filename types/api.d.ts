import { IncomingHttpHeaders } from 'http';

import { JWTTokenWithRoles, OldJWTToken, User } from './user';

export interface APIData<T = any> {
	body: T;
	authorization?: string;
	onlineAuthorization?: string;
	token?: JWTTokenWithRoles | OldJWTToken;
	user?: User;
	langs?: string;
}

export interface APIDataProxied<T = any> extends APIData<T> {
	headers: IncomingHttpHeaders;
}
