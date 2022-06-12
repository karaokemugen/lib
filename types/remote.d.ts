export interface RemoteSettings {
	InstanceID: string;
	version: string;
	token: string;
}

export type RemoteResponse = RemoteSuccess | RemoteFailure;

export interface RemoteSuccess {
	host: string;
	code: string;
	token: string;
}

export interface RemoteFailure {
	err: true;
	reason: string;
}

export interface RemoteAccessToken {
	code: string;
	token: string;
	last_use: Date;
	last_ip: string;
	permanent: boolean
}
