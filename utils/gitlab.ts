import { editRepo, getRepo } from '../../services/repo';
import { RepositoryMaintainerSettings } from '../types/repo';
import HTTP from './http';
import logger from './logger';

const service = 'Gitlab';

/** Close an issue */
export async function closeIssue(issue: number, repoName: string) {
	let repo = getRepo(repoName);
	const params = {
		state_event: 'close',
	};
	if (!repo.MaintainerMode) throw 'Maintainer mode is not enabled for this repository';
	const url = new URL(repo.Git.URL);
	if (!repo.Git.ProjectID) {
		// Editing the repo should trigger
		await editRepo(repo.Name, repo);
		repo = getRepo(repoName) as RepositoryMaintainerSettings;
	}
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
