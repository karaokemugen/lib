export interface LogLine {
    service: string,
    obj?: any,
    level: 'debug' | 'error' | 'info' | 'warn',
    message: string,
    timestamp: string
}