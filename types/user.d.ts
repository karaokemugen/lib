import { DBUser } from './database/user.js';

/** Still needed for KM App until roles overhaul is done */
export type Role =
	| 'user'
	| 'guest'
	| 'admin'
	| 'maintainer'
	| 'contributor'
	| 'donator'
	| 'operator';

// @deprecated - For KMApp compatibility
interface RoleProp {
	role: Role;
}

interface RolesProp {
	roles: Roles;
}

interface JWTToken {
	username: string;
	passwordLastModifiedAt: string;
	iat: string;
}

export type JWTTokenWithRoles = JWTToken & RolesProp;
// @deprecated - For KMApp compatibility
export type OldJWTToken = JWTToken & RoleProp;

interface TokenResponse {
	username: string;
	token: string;
	onlineToken?: string;
	onlineAvailable?: boolean;
}

export type TokenResponseWithRoles = TokenResponse & RolesProp;
// @deprecated - For KMApp compatibility
export type OldTokenResponse = TokenResponse & RoleProp;

export interface User extends DBUser {
	old_login?: string;
	onlineToken?: string;
	securityCode?: number;
}

export interface UserParams {
	full?: boolean;
	singleUser?: string;
	singleNickname?: string;
	guestOnly?: boolean;
	randomGuest?: boolean;
}

export interface Roles {
	admin?: boolean;
	contributor?: boolean;
	maintainer?: boolean;
	donator?: boolean;
	user?: boolean;
	guest?: boolean;
}
