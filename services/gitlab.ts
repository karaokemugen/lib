import got from 'got';
import { getConfig } from '../utils/config';
import logger from '../utils/logger';
import {findUserByName} from '../../services/user';

/** Posts a new issue to gitlab and return its URL */
export async function gitlabPostNewIssue(gitlabHost: string, projectID: number, title: string, desc: string, labels: string[]): Promise<string> {
	const conf = getConfig();
	if (!labels) labels = [];
	const params = new URLSearchParams([
		['id', `${projectID}`],
		['title', title],
		['description', desc],
		['labels', labels.join(',')]
	]);
	const res = await got.post(`${gitlabHost}/api/v4/projects/${projectID}/issues?${params.toString()}`, {
		headers: {
			'PRIVATE-TOKEN': conf.Gitlab.Token
		}
	});
	return JSON.parse(res.body).web_url;
}

export async function postSuggestionToKaraBase(title: string, serie:string, type:string, link:string, username: string): Promise<string> {
	const conf = getConfig();
	const confTemplate = conf.Gitlab.IssueTemplate;
	let titleIssue = confTemplate && confTemplate.Suggestion && confTemplate.Suggestion.Title
		? confTemplate.Suggestion.Title
		: '[suggestion] $serie - $title';
	titleIssue = titleIssue.replace('$title', title);
	titleIssue = titleIssue.replace('$serie', serie);
	let desc = confTemplate && confTemplate.Suggestion && confTemplate.Suggestion.Description
		? confTemplate.Suggestion.Description
		: 'From $username : it would be nice if someone could time this!';
	const user = await findUserByName(username);
	desc = desc.replace('$username', user ? user.nickname : username);
	desc = desc.replace('$title', title);
	desc = desc.replace('$serie', serie);
	desc = desc.replace('$type', type);
	desc = desc.replace('$link', link);
	try {
		return await gitlabPostNewIssue(conf.Gitlab.Host, conf.Gitlab.ProjectID || conf.Gitlab.BaseProjectID, titleIssue, desc, confTemplate.Suggestion.Labels);
	} catch(err) {
		logger.error(`[KaraSuggestion] Call to Gitlab API failed : ${err}`);
	}
}
