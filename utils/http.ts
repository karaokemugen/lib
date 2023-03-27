import HttpAgent, { HttpsAgent } from 'agentkeepalive';
import axios from 'axios';

import { userAgent } from '../../utils/constants.js';
import { getState } from '../../utils/state.js';

const HTTP = axios.create({
	headers: {
		'user-agent': `${userAgent}/${getState().version.number}`,
	},
	httpAgent: new HttpAgent(),
	httpsAgent: new HttpsAgent(),
	responseType: 'json',
});

export default HTTP;

export function fixedEncodeURIComponent(str: string): string {
	return encodeURIComponent(str).replace(/[!'()*#]/g, c => {
		return `%${c.charCodeAt(0).toString(16)}`;
	});
}
