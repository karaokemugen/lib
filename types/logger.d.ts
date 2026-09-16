export interface LogLine {
	service: string;
	obj?: any;
	level: LogLevel;
	message: string;
	timestamp: string;
}

export type LogLevel = 'debug' | 'error' | 'info' | 'warn'