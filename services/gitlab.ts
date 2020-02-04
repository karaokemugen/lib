import got from 'got';
import { getConfig } from '../utils/config';
import logger from '../utils/logger';
import {findUserByName} from '../../services/user';

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

export async function postSuggestionToKaraBase(title: string, serie:string, type:string, link:string, username: string): Promise<string> {
	const conf = getConfig().Gitlab.IssueTemplate;
	let titleIssue = conf && conf.Suggestion && conf.Suggestion.Title
		? conf.Suggestion.Title
		: '[suggestion] $serie - $title';
	titleIssue = titleIssue.replace('$title', title);
	titleIssue = titleIssue.replace('$serie', serie)
	let desc = conf && conf.Suggestion && conf.Suggestion.Description
		? conf.Suggestion.Description
		: 'From $username : it would be nice if someone could time this!';
	desc = desc.replace('$title', title);
	desc = desc.replace('$serie', serie);
	desc = desc.replace('$type', type);
	desc = desc.replace('$link', link);
	try {
		return await gitlabPostNewIssue(titleIssue, desc, conf.Suggestion.Labels);
	} catch(err) {
		logger.error(`[KaraSuggestion] Call to Gitlab API failed : ${err}`);
	}
}