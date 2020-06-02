import * as SentryElectron from '@sentry/electron';
import * as SentryNode from '@sentry/node';
import { getState } from '../../utils/state';
import { sentryDSN } from '../../utils/constants';
import Transport from 'winston-transport';
import {version} from "../../version";

let Sentry: typeof SentryElectron | typeof SentryNode;

export function setSentryUser(username?: string, email?: string) {
	Sentry.configureScope((scope: SentryNode.Scope | SentryElectron.Scope) => {
		scope.setUser({
			username: username,
			email: email
		});
	});
}

export function initSentry(electron: any) {
	Sentry = electron
		? SentryElectron
		: SentryNode
	if (process.env.CI_SERVER) {
		console.log('CI detected - Sentry disabled');
		console.log('Have a nice day, sentries won\'t fire at you~');
		return;
	}
	Sentry.init({
		dsn: process.env.SENTRY_DSN || sentryDSN,
		environment: process.env.SENTRY_ENVIRONMENT || 'release',
		enableJavaScript: false,
		release: version.number
	});
}

export function setScope(tag: string, data: string) {
    Sentry.configureScope((scope: SentryNode.Scope | SentryElectron.Scope) => {
        scope.setTag(tag, data);
    });
}

export function addErrorInfo(category: string, message: string) {
	setScope('commit', getState().version.sha);
    Sentry.addBreadcrumb({
       category: category,
       message: message
    });
}

type Severity = 'Fatal' | 'Warning' | 'Error';

export function sentryError(error: Error, level?: Severity) {
    let SLevel: SentryElectron.Severity;
    if (!getState().isTest || !process.env.CI_SERVER) {
		if (!level) level = 'Error';
		SLevel = SentryElectron.Severity[level];
        Sentry.configureScope((scope: SentryNode.Scope | SentryElectron.Scope) => {
            scope.setLevel(SLevel);
        });
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