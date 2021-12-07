import axios from 'axios';
import http from 'http';
import https from 'https';

import { userAgent } from '../../utils/constants';
import { getState } from '../../utils/state';

const HTTP = axios.create({
	headers: {
		'user-agent': `${userAgent}/${getState().version.number}`,
	},
	httpAgent: new http.Agent({ keepAlive: true }),
	httpsAgent: new https.Agent({ keepAlive: true }),
	responseType: 'json',
});

export default HTTP;
