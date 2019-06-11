export interface Settings {
	baseChecksum?: string,
	lastGeneration?: Date
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