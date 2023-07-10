import { resolve } from 'path';

import { getRepos } from '../../services/repo.js';
import { getState } from '../../utils/state.js';

export function determineRepo(file: string): string {
	const repos = getRepos();
	for (const repo of repos) {
		if (file.includes(resolve(getState().dataPath, repo.BaseDir))) {
			return repo.Name;
		}
	}
	throw `Unknown repository for file ${file}`;
}
