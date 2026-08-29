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
		this.Sentry.getCurrentScope().setTag(tag, data);		
	}

	setUser(username?: string) {
		// Testing for precise falseness. If errortracking is undefined or if getconfig doesn't return anything, errors are not sent.
		if (getConfig()?.Online?.ErrorTracking !== true || !this.SentryInitialized)
			return;
		this.Sentry.getCurrentScope().setUser({username});		
	}

	addErrorInfo(category: string, message: string, data?: any) {
		// Testing for precise falseness. If errortracking is undefined or if getconfig doesn't return anything, errors are not sent.
		if (getConfig()?.Online?.ErrorTracking !== true || !this.SentryInitialized)
			return;
		this.Sentry.addBreadcrumb({
			category,
			message,
			data,
		});
	}

	protected reportErr(error: Error, level?: SentryNode.SeverityLevel, extra?: Record<string, any>) {
		const state = getState();
		delete state.osHost;
		delete state.electron;

		const extraData: Record<string, any> = {
			state: JSON.stringify(state, null, 2),
			config: JSON.stringify(getPublicConfig(false, false), null, 2),
		};

		if (extra) {
			for (const [key, value] of Object.entries(extra)) {
				// Yeah, we might sometimes send strings so...
				const str = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
				extraData[key] = str;
			}
		}
		
		return this.Sentry.captureException(error, {
			level,
			extra: extraData,
		});
	}

	error(error: any, level?: SentryNode.SeverityLevel) {
		// Testing for precise falseness. If errortracking is undefined or if getconfig doesn't return anything, errors are not sent.
		if (getConfig()?.Online?.ErrorTracking !== true || !this.SentryInitialized || error.sentry === false)
			return;
		if (
			!getState().isTest ||
			(!process.env.SENTRY_TEST || process.env.SENTRY_TEST === 'false') ||
			!process.env.CI_SERVER
		) {
			if (!level) level = 'error';
			return this.reportErr(error, level, error.extra);
		}
	}
}
