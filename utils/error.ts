export class ErrorKM extends Error {
    code: number;
    
    sentry: boolean;

    extra: Record<string, any>;
    
    constructor(message: string, code = 500, sentry = true, extra?: Record<string, any>) {
        super(message);
        this.code = code;
        this.sentry = sentry;
        this.extra = extra;
    }
}
