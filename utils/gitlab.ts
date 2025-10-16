import { getRepo } from '../../services/repo.js';
import HTTP from './http.js';
import logger from './logger.js';

const service = 'Gitlab';

/** Assign someone to an issue. No username means unassignement */
export async function assignIssue(issue: number, repoName: string, username?: string) {
	const repo = getRepo(repoName);
	const url = new URL(repo.Git.URL);
	let userID: number;
	if (username) {
		userID = await getUserID(repoName, username);
	}
	// 0 is for unassigning all users
	const params = {
		assignee_id: userID || 0,
	};
	await HTTP.put(`${url.protocol}//${url.hostname}/api/v4/projects/${repo.Git.ProjectID}/issues/${+issue}`, params, {
		headers: {
			'PRIVATE-TOKEN': repo.Git.Password,
			'Content-Type': 'application/json',
		},
		timeout: 25000,
	});
}

/** Get user ID from username */
async function getUserID(repoName: string, username: string) {
	try {
		const repo = getRepo(repoName);
		const url = new URL(repo.Git.URL);
		const res = await HTTP.get(`${url.protocol}//${url.hostname}/api/v4/users`, {
			params: {
				username,
			},
			headers: {
				'PRIVATE-TOKEN': repo.Git.Password,
				'Content-Type': 'application/json',
			},
			timeout: 25000,
		});
		return res.data[0].id;
	} catch (err) {
		logger.error('Unable to get assign user to an issue', { service, obj: err });
		throw err;
	}
}

/** Post a note to an issue */
export async function postNoteToIssue(issue: number, repoName: string, note: string) {
const repo = getRepo(repoName);
	const params = {
		body: note
	};
	const url = new URL(repo.Git.URL);
	const issueURL = `${url.protocol}//${url.hostname}/api/v4/projects/${repo.Git.ProjectID}/issues/${issue}/notes`;
	logger.debug(`Posting comment to issue ${issueURL} : ${note}`, { service });
	await HTTP.post(issueURL, params, {
		headers: {
			'PRIVATE-TOKEN': repo.Git.Password,
			'Content-Type': 'application/json',
		},
		timeout: 25000,
	});
}

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
