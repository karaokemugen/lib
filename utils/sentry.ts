import * as SentryElectron from '@sentry/electron';
import * as SentryNode from '@sentry/node';
import { getState } from '../../utils/state';
import { sentryDSN } from '../../utils/constants';
import Transport from 'winston-transport';

let Sentry: typeof SentryElectron | typeof SentryNode;

export function initSentry(electron: any) {
	Sentry = electron
		? SentryElectron
		: SentryNode
	Sentry.init({
		dsn: process.env.SENTRY_DSN || sentryDSN,
		environment: process.env.SENTRY_ENVIRONMENT || 'release',
		enableJavaScript: false
	});
}

/** Not used for now
export function setScope(state: State) {
    Sentry.configureScope((scope: SentryNode.Scope | SentryElectron.Scope) => {
        scope.setTag('state', JSON.stringify(state));
    });
}
*/

export function addErrorInfo(category: string, step: string) {
    Sentry.addBreadcrumb({
       category: category,
       message: step
    });
}

export function sentryError(error: Error) {
	if (!getState().isTest) {
		addErrorInfo('state', JSON.stringify(getState(), null, 2));
		Sentry.captureException(error);
	}
}

export class SentryTransport extends Transport {
	constructor(opts: any) {
		super(opts);
	}

	log(info: any, callback: any) {
		if (info.level === 'debug') addErrorInfo('debug', `${info.message}`);
		callback();
	}
}