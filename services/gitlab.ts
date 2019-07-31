import got from 'got';
import { getConfig } from '../utils/config';

/** Posts a new issue to gitlab and return its URL */
export async function gitlabPostNewIssue(title: string, desc: string, labels: string[]): Promise<string> {
	const conf = getConfig();
	if (!labels) labels = [];
	const params = new URLSearchParams([
		['id', `${conf.Gitlab.ProjectID}`],
		['title', title],
		['description', desc],
		['labels', labels.join(',')]
	]);
	const res = await got.post(`${conf.Gitlab.Host}/api/v4/projects/${conf.Gitlab.ProjectID}/issues?${params.toString()}`, {
		headers: {
			'PRIVATE-TOKEN': conf.Gitlab.Token
		}
	});
	return JSON.parse(res.body).web_url;
}