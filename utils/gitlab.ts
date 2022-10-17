import { getRepo } from '../../services/repo';
import HTTP from './http';
import logger from './logger';

const service = 'Gitlab';

/** Close an issue */
export async function closeIssue(issue: number, repoName: string) {
	const repo = getRepo(repoName);
	const params = {
		state_event: 'close',
	};
	const url = new URL(repo.Git.URL);
	const closeIssueURL = `${url.protocol}//${url.hostname}/api/v4/projects/${repo.Git.ProjectID}/issues/${issue}`;
	logger.debug(`Close Issue URL: ${closeIssueURL}`, { service });
	await HTTP.put(closeIssueURL, params, {
		headers: {
			'PRIVATE-TOKEN': repo.Git.Password,
			'Content-Type': 'application/json',
		},
		timeout: 25000,
	});
}
