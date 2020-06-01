import * as SentryElectron from '@sentry/electron';
import * as SentryNode from '@sentry/node';
import {State} from "../../types/state";
import logger from 'winston';
import { getState } from '../../utils/state';
import { sentryDSN } from '../../utils/constants';

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

export function setScope(state: State) {
    Sentry.configureScope((scope: SentryNode.Scope | SentryElectron.Scope) => {
        scope.setTag('state', JSON.stringify(state));
    });
}

export function addStep(step: string, category: string) {
    Sentry.addBreadcrumb({
       category: category,
       message: step
    });
}

export function sentryError(error: Error) {
	if (!getState().isTest) Sentry.captureException(error);
}

export function testErr() {
    let eventId = Sentry.captureException(new Error('Erreur : Ça marche ! Attends mais du coup... hein ?'));
    logger.info(`Sentry test error: ${eventId}`);
}