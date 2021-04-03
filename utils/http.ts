import got from 'got';

import { userAgent } from '../../utils/constants';
import { getState } from '../../utils/state';
import logger from './logger';

const HTTP = got.extend({
	headers: {
		'user-agent': `${userAgent}/${getState().version.number}`
	},
	hooks: {
		beforeError: [
			error => {
				logger.debug(`URL: ${error.request.requestUrl}`, {service: 'HTTP', obj: error});
				return error;
			}
		]
	},
	retry: {
		limit:0,
		methods: ['GET', 'POST']
	},
	mutableDefaults: true
});

export default HTTP;
