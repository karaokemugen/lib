import { resolve } from 'path';

import { getRepos } from '../../services/repo.js';
import { getState } from '../../utils/state.js';
import { readRepoManifest, selectRepositoryManifest } from '../dao/repo.js';

export function determineRepo(file: string): string {
	const repos = getRepos();
	for (const repo of repos) {
		if (file.includes(resolve(getState().dataPath, repo.BaseDir))) {
			return repo.Name;
		}
	}
	throw `Unknown repository for file ${file}`;
}

export async function readAllRepoManifests() {
	for (const repo of getRepos()) {
		await readRepoManifest(repo.Name);
	}
}

export const getRepoManifest = selectRepositoryManifest;
