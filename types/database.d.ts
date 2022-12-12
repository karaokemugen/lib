export interface Settings {
	baseChecksum?: string;
	lastGeneration?: Date;
	instanceID?: string;
	appVersion?: string;
	remoteToken?: string;
	usageTime?: string;
}

export interface Query {
	sql: string;
	params?: any[][];
}

export interface WhereClause {
	sql: string[];
	params: any;
	additionalFrom: string[];
}

export interface DatabaseTask {
	name: string;
	func(...any): Promise<any>;
	args?: any[];
}
