import { APIMessageType } from '../types/frontend.js';
import logger from '../utils/logger.js';

export function APIMessage(code: string, data?: any): APIMessageType {
	return { code, data };
}

export function errMessage(code: string, message?: any) {
	if (typeof message === 'object')
		logger.error(`${code}`, { service: 'API', obj: message });
	else logger.error(`${code} : ${message?.toString()}`, { service: 'API' });
}
