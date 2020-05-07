export interface Settings {
	baseChecksum?: string,
	lastGeneration?: Date,
	instanceID?: string
}

export interface Query {
	sql: string,
	params?: any[][]
}

export interface LangClause {
	main: string
	fallback: string
}

export interface WhereClause {
	sql: string[],
	params: {}
}

export interface DatabaseTask {
	name: string,
	func: any,
	args?: any
}