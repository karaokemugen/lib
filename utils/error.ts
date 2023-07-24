export class ErrorKM extends Error {
    code: number;
    
    sentry: boolean;

    constructor(message: string, code = 500, sentry = true) {
        super(message);
        this.code = code;
        this.sentry = sentry;
    }
}
