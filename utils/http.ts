import got, { Got } from 'got';
//import logger from './logger';
import { headers } from '../../utils/constants';
import logger from './logger';


export let HTTP: Got;

export async function initHTTP() {
	HTTP = got.extend({
		headers: headers,
		hooks: {
			beforeError: [
				error => {
					logger.debug(`[HTTP] URL: ${error.request.requestUrl} - METHOD: ${error.options.method} - BODY: ${JSON.stringify(error.options[Symbol.for('body')])} - HEADERS: ${JSON.stringify(error.options.headers)}`);
					return error;
				}
			]
		},
		mutableDefaults: true
	})
}