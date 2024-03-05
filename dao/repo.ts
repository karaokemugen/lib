import fs from 'fs/promises';
import { YAMLException, load as yamlLoad } from 'js-yaml';
import { resolve } from 'path';

import { getState } from '../../utils/state.js';
import { Repository, RepositoryBasic, RepositoryManifestV2 } from '../types/repo.js';
import { getConfig } from '../utils/config.js';
import logger from '../utils/logger.js';

const service = 'RepoDAO';

const repoManifests: Map<string, RepositoryManifestV2> = new Map();

export function selectRepos(publicView: false): Repository[];
export function selectRepos(publicView: true): RepositoryBasic[];
export function selectRepos(publicView: boolean): Repository[] | RepositoryBasic[];
export function selectRepos(): Repository[];
export function selectRepos(publicView = false): Repository[] | RepositoryBasic[] {
	const repos = getConfig().System.Repositories;
	if (publicView) {
		return repos.map<RepositoryBasic>(r => {
			return {
				Name: r.Name,
				Online: r.Online,
				Enabled: r.Enabled,
			};
		});
	}
	return repos;
}

export async function readRepoManifest(repoName: string) {
	const repo = selectRepos().filter(e => e.Name === repoName)[0];
	const manifestFile = resolve(getState().dataPath, repo.BaseDir, 'repo.yml');
	let manifest: RepositoryManifestV2;
	try {
		const repoyml = await fs.readFile(manifestFile, 'utf-8');
		manifest = yamlLoad(repoyml) as RepositoryManifestV2;
	} catch (err) {
		if (err instanceof YAMLException) 
			logger.warn(`Invalid repo manifest yaml for ${repoName}`, { service });
		else
			logger.warn(`No manifest found for ${repoName}`, { service });
		
		manifest = {
			name: repoName,
			description: null,
		};
	}
	repoManifests.set(repoName, manifest);
}

export function selectRepositoryManifest(repoName: string) {
	return repoManifests.get(repoName);
}
