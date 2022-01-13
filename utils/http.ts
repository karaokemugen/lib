import HttpAgent, { HttpsAgent } from 'agentkeepalive';
import axios from 'axios';

import { userAgent } from '../../utils/constants';
import { getState } from '../../utils/state';

const HTTP = axios.create({
	headers: {
		'user-agent': `${userAgent}/${getState().version.number}`,
	},
	httpAgent: new HttpAgent(),
	httpsAgent: new HttpsAgent(),
	responseType: 'json',
});

export default HTTP;
