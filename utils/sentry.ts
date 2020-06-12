import * as SentryNode from '@sentry/node';

import { getState } from '../../utils/state';
import { version } from '../../version';
import { getConfig } from './config';
import { sentryDSN } from '../../utils/constants';

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
			release: version.number
		});
		this.SentryInitialized = true;
	}

	setScope(tag: string, data: string) {
		// Testing for precise falseness. If errortracking is undefined or if getconfig doesn't return anything, errors are sent.
		if (getConfig()?.Online?.ErrorTracking === false || !this.SentryInitialized) return;
		this.Sentry.configureScope((scope) => {
			scope.setTag(tag, data);
		});
	}

	setUser(username?: string, email?: string) {
		// Testing for precise falseness. If errortracking is undefined or if getconfig doesn't return anything, errors are sent.
		if (getConfig()?.Online?.ErrorTracking === false || !this.SentryInitialized) return;
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

	addErrorInfo(category: string, message: string) {
		// Testing for precise falseness. If errortracking is undefined or if getconfig doesn't return anything, errors are sent.
		if (getConfig()?.Online?.ErrorTracking === false || !this.SentryInitialized) return;
		if (getState()?.version?.sha) this.setScope('commit', getState().version.sha);
		this.Sentry.addBreadcrumb({
			category: category,
			message: message
		});
	}

	protected reportErr(error: Error, level?: SentryNode.Severity) {
		this.Sentry.configureScope((scope) => {
			scope.setLevel(level);
		});
		this.addErrorInfo('state', JSON.stringify(getState(), null, 2));
		return this.Sentry.captureException(error);
	}

	error(error: Error, level?: Severity) {
		// Testing for precise falseness. If errortracking is undefined or if getconfig doesn't return anything, errors are sent.
		if (getConfig()?.Online?.ErrorTracking === false || !this.SentryInitialized) return;
		let SLevel: SentryNode.Severity;
		if (!getState().isTest || !process.env.CI_SERVER) {
			if (!level) level = 'Error';
			SLevel = SentryNode.Severity[level];
			return this.reportErr(error, SLevel);
		}
	}
}

