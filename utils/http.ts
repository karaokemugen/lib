import got from 'got';

//import logger from './logger';
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
	mutableDefaults: true
});

export default HTTP;
