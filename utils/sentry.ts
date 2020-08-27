import * as SentryNode from '@sentry/node';

import { getPublicConfig } from '../../utils/config';
import { sentryDSN } from '../../utils/constants';
import { getState } from '../../utils/state';
import { getConfig } from './config';

type Severity = 'Fatal' | 'Warning' | 'Error';

// Common class for Sentry
export default class SentryLogger {
	Sentry: typeof SentryNode;
	SentryInitialized = false;

	constructor(sentry_sdk) {
		this.Sentry = sentry_sdk;
	}

	init() {
		if (process.env.CI_SERVER) {
			console.log('CI detected - Sentry disabled');
			console.log('Have a nice day, sentries won\'t fire at you~');
			return;
		}
		if (!process.env.SENTRY_DSN && !sentryDSN) {
			//No DSN provided, return.
			return;
		}
		this.Sentry.init({
			dsn: process.env.SENTRY_DSN || sentryDSN,
			environment: process.env.SENTRY_ENVIRONMENT || 'release',
			release: getState().version.number,
			beforeSend: (event, _hint) => {
				// Testing for precise falseness. If errortracking is undefined or if getconfig doesn't return anything, errors are not sent.
				if (getConfig()?.Online?.ErrorTracking !== true || !this.SentryInitialized) return null;
				else return event;
			}
		});
		this.SentryInitialized = true;
	}

	setScope(tag: string, data: string) {
		// Testing for precise falseness. If errortracking is undefined or if getconfig doesn't return anything, errors are not sent.
		if (getConfig()?.Online?.ErrorTracking !== true || !this.SentryInitialized) return;
		this.Sentry.configureScope((scope) => {
			scope.setTag(tag, data);
		});
	}

	setUser(username?: string, email?: string) {
		// Testing for precise falseness. If errortracking is undefined or if getconfig doesn't return anything, errors are not sent.
		if (getConfig()?.Online?.ErrorTracking !== true || !this.SentryInitialized) return;
		this.Sentry.configureScope((scope) => {
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

	addErrorInfo(category: string, message: string, data?: any) {
		// Testing for precise falseness. If errortracking is undefined or if getconfig doesn't return anything, errors are not sent.
		if (getConfig()?.Online?.ErrorTracking !== true || !this.SentryInitialized) return;
		if (getState()?.version?.sha) this.setScope('commit', getState().version.sha);
		this.Sentry.addBreadcrumb({
			category: category,
			message: message,
			data: data
		});
	}

	protected reportErr(error: Error, level?: SentryNode.Severity) {
		this.Sentry.configureScope((scope) => {
			scope.setLevel(level);
		});
		const state = getState();
		delete state.osHost;
		delete state.electron;
		this.Sentry.setExtra('state', JSON.stringify(state, null, 2));
		this.Sentry.setExtra('config', JSON.stringify(getPublicConfig(false), null, 2));
		return this.Sentry.captureException(error);
	}

	error(error: Error, level?: Severity) {
		// Testing for precise falseness. If errortracking is undefined or if getconfig doesn't return anything, errors are not sent.
		if (getConfig()?.Online?.ErrorTracking !== true || !this.SentryInitialized) return;
		let SLevel: SentryNode.Severity;
		if (!getState().isTest || !process.env.SENTRY_TEST || !process.env.CI_SERVER) {
			if (!level) level = 'Error';
			SLevel = SentryNode.Severity[level];
			return this.reportErr(error, SLevel);
		}
	}
}

