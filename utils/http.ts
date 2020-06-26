import got from 'got';

//import logger from './logger';
import { headers } from '../../utils/constants';
import logger from './logger';

const HTTP = got.extend({
	headers: headers,
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
