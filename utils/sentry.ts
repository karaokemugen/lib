import * as SentryElectron from '@sentry/electron';
import * as SentryNode from '@sentry/node';
import Transport from 'winston-transport';

import { sentryDSN } from '../../utils/constants';
import { getState } from '../../utils/state';
import {version} from '../../version';
import { getConfig } from './config';

let Sentry: typeof SentryElectron | typeof SentryNode;
let SentryInitialized = false;

export function initSentry(electron: any) {
	Sentry = electron
		? SentryElectron
		: SentryNode;
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
	SentryInitialized = true;
}

export function setScope(tag: string, data: string) {
	// Testing for precise falseness. If errortracking is undefined or if getconfig doesn't return anything, errors are sent.
	if (!getConfig()?.Online?.ErrorTracking === false || !SentryInitialized) return;
	Sentry.configureScope((scope: SentryNode.Scope | SentryElectron.Scope) => {
		scope.setTag(tag, data);
	});
}

export function setSentryUser(username?: string, email?: string) {
	// Testing for precise falseness. If errortracking is undefined or if getconfig doesn't return anything, errors are sent.
	if (!getConfig()?.Online?.ErrorTracking === false || !SentryInitialized) return;
	Sentry.configureScope((scope: SentryNode.Scope | SentryElectron.Scope) => {
		if (email) {
			scope.setUser({
				username,
				email
			});
		} else {
			scope.setUser({
				username
			});
		}
	});
}

export function addErrorInfo(category: string, message: string) {
	// Testing for precise falseness. If errortracking is undefined or if getconfig doesn't return anything, errors are sent.
	if (!getConfig()?.Online?.ErrorTracking === false || !SentryInitialized) return;
	setScope('commit', getState().version.sha);
	Sentry.addBreadcrumb({
		category: category,
		message: message
	});
}

type Severity = 'Fatal' | 'Warning' | 'Error';

export function sentryError(error: Error, level?: Severity) {
	// Testing for precise falseness. If errortracking is undefined or if getconfig doesn't return anything, errors are sent.
	if (!getConfig()?.Online?.ErrorTracking === false || !SentryInitialized) return;
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
		// Testing for precise falseness. If errortracking is undefined or if getconfig doesn't return anything, errors are sent.
		if (!getConfig()?.Online?.ErrorTracking === false || !SentryInitialized) {
			callback();
			return;
		}
		if (info.level === 'debug') addErrorInfo('debug', `${info.message}`);
		callback();
	}
}