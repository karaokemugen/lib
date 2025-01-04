import * as SentryNode from '@sentry/node';

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

	setScope(tag: string, data: string) {
		// Testing for precise falseness. If errortracking is undefined or if getconfig doesn't return anything, errors are not sent.
		if (getConfig()?.Online?.ErrorTracking !== true || !this.SentryInitialized)
			return;
		this.Sentry.withScope(scope => {
			scope.setTag(tag, data);
		});
	}

	setUser(username?: string) {
		// Testing for precise falseness. If errortracking is undefined or if getconfig doesn't return anything, errors are not sent.
		if (getConfig()?.Online?.ErrorTracking !== true || !this.SentryInitialized)
			return;
		this.Sentry.withScope(scope => {
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

	protected reportErr(error: Error, level?: SentryNode.SeverityLevel) {
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

	error(error: any, level?: SentryNode.SeverityLevel) {
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
