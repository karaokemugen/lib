import fs from 'fs/promises';
import { load as yamlLoad,YAMLException } from 'js-yaml';
import { resolve } from 'path';

import { getTags } from '../../services/tag.js';
import { getState } from '../../utils/state.js';
import { Repository, RepositoryBasic, RepositoryManifestV2 } from '../types/repo.js';
import { getConfig, setConfig } from '../utils/config.js';
import logger from '../utils/logger.js';

const service = 'RepoDAO';

const repoManifests: Map<string, RepositoryManifestV2> = new Map();

export function selectRepos(publicView: false): Repository[];
export function selectRepos(publicView: true): RepositoryBasic[];
export function selectRepos(publicView: boolean): Repository[] | RepositoryBasic[];
export function selectRepos(): Repository[];
export function selectRepos(publicView = false): Repository[] | RepositoryBasic[] {
	const repos = getConfig().System.Repositories;
	// Inject system repository here so it'll always be at the end
	if (!repos.find(r => r.System === true)) repos.push(
		{
			Name: 'System',
			Online: false,
			Enabled: true,
			MaintainerMode: false,
			System: true,
			BaseDir: resolve(getState().resourcePath, 'assets/systemRepo'),
			Path: {
				Medias: [
					resolve(getState().resourcePath, 'assets/systemRepo/medias')
				]
			}
		}
	)
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
		};
	}
	repoManifests.set(repoName, manifest);
	setDefaultCollections(manifest);
}

export async function setDefaultCollections(manifest: RepositoryManifestV2) {
	const conf = getConfig();
	// KM Server doesn't have that.
	if (!conf.Karaoke) return;
	const collections = conf.Karaoke.Collections || {};

	if (!manifest) return;
	if (manifest.defaultCollections) {
		for (const collection of Object.keys(manifest.defaultCollections)) {
			// Do nothing if already set
			if (collections[collection] !== undefined) continue;
			collections[collection] = manifest.defaultCollections[collection];
		}

	} else {
		// If no default collections, make all collections enabled
		const tags = await getTags({type: [16]});
		for (const tag of tags.content) {
			if (tag.repository === manifest.name && collections[tag.tid] === undefined) {
				collections[tag.tid] = true;
			}
		}
	}
	setConfig({ Karaoke: { Collections: collections }});
}

export function selectRepositoryManifest(repoName: string) {
	return repoManifests.get(repoName);
}
