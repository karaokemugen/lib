import * as SentryNode from '@sentry/node';
import { SeverityLevel } from '@sentry/types';

import { getPublicConfig } from '../../utils/config.js';
import { getState } from '../../utils/state.js';
import { getConfig } from './config.js';

// Common class for Sentry
export default class SentryLogger {
	Sentry: typeof SentryNode;

	SentryInitialized = false;

	constructor(sentry_sdk) {
		this.Sentry = sentry_sdk;
	}

	init() {
		if (process.env.CI_SERVER || process.env.SENTRY_TEST) {
			console.log('CI detected/SENTRY_TEST present - Sentry disabled');
			console.log("Have a nice day, sentries won't fire at you~");
			return;
		}
		if (!process.env.SENTRY_DSN) {
			// No DSN provided, return.
			return;
		}
		this.Sentry.init({
			dsn: process.env.SENTRY_DSN,
			environment: process.env.SENTRY_ENVIRONMENT || 'release',
			release: getState().version.number,
			dist: getState().version.sha,
			beforeSend: (event, _hint) => {
				// Testing for precise falseness. If errortracking is undefined or if getconfig doesn't return anything, errors are not sent.
				if (
					getConfig()?.Online?.ErrorTracking !== true ||
					!this.SentryInitialized
				)
					return null;
				return event;
			},
		});
		this.SentryInitialized = true;
	}

	setScope(tag: string, data: string) {
		// Testing for precise falseness. If errortracking is undefined or if getconfig doesn't return anything, errors are not sent.
		if (getConfig()?.Online?.ErrorTracking !== true || !this.SentryInitialized)
			return;
		this.Sentry.configureScope(scope => {
			scope.setTag(tag, data);
		});
	}

	setUser(username?: string) {
		// Testing for precise falseness. If errortracking is undefined or if getconfig doesn't return anything, errors are not sent.
		if (getConfig()?.Online?.ErrorTracking !== true || !this.SentryInitialized)
			return;
		this.Sentry.configureScope(scope => {
			scope.setUser({
				username,
			});
		});
	}

	addErrorInfo(category: string, message: string, data?: any) {
		// Testing for precise falseness. If errortracking is undefined or if getconfig doesn't return anything, errors are not sent.
		if (getConfig()?.Online?.ErrorTracking !== true || !this.SentryInitialized)
			return;
		if (getState()?.version?.sha)
			this.setScope('commit', getState().version.sha);
		this.Sentry.addBreadcrumb({
			category,
			message,
			data,
		});
	}

	protected reportErr(error: Error, level?: SeverityLevel) {
		this.Sentry.getCurrentScope().setLevel(level);
		const state = getState();
		delete state.osHost;
		delete state.electron;
		this.Sentry.setExtra('state', JSON.stringify(state, null, 2));
		this.Sentry.setExtra(
			'config',
			JSON.stringify(getPublicConfig(false, false), null, 2)
		);
		return this.Sentry.captureException(error);
	}

	error(error: any, level?: SeverityLevel) {
		// Testing for precise falseness. If errortracking is undefined or if getconfig doesn't return anything, errors are not sent.
		if (getConfig()?.Online?.ErrorTracking !== true || !this.SentryInitialized || !error.sentry)
			return;
		if (
			!getState().isTest ||
			!process.env.SENTRY_TEST ||
			!process.env.CI_SERVER
		) {
			if (!level) level = 'error';
			return this.reportErr(error, level);
		}
	}
}
