import got from 'got';
import { getConfig } from '../utils/config';

export async function gitlabPostNewIssue(title: string, desc: string): Promise<string> {
	const conf = getConfig();
	let labels: string[] = [];
	if (conf.Gitlab.IssueTemplate && conf.Gitlab.IssueTemplate.Suggestion && conf.Gitlab.IssueTemplate.Suggestion.Labels && conf.Gitlab.IssueTemplate.Suggestion.Labels.length > 0) labels = conf.Gitlab.IssueTemplate.Suggestion.Labels;
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