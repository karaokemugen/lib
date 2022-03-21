import { promises as fs } from 'fs';
import i18n from 'i18next';
import i18nextBackend from 'i18next-fs-backend';
import { dump as yamlDump, load as yamlLoad } from 'js-yaml';
import { cloneDeep, merge } from 'lodash';
import { osLocale } from 'os-locale';
import { resolve } from 'path';
import { v4 as uuidV4 } from 'uuid';

import { Config } from '../../types/config';
import { getState, setState } from '../../utils/state';
import { RecursivePartial } from '../types';
import { PathType } from '../types/config';
import { RepositoryType } from '../types/repo';
import { fileExists } from './files';
import logger from './logger';
import { clearEmpties, difference } from './objectHelpers';
import { on } from './pubsub';
import { check } from './validators';

const service = 'Config';

let configReady = false;
let config: Config;
let configFile = 'config.yml';
let configConstraints = {};
let configDefaults: Config;

on('configReady', () => {
	configReady = true;
});

export function setConfigConstraints(constraints: any) {
	configConstraints = constraints;
}

/**
 * We return a copy of the configuration data so the original one can't be modified
 * without passing by this module's functions.
 */
export function getConfig(): Config {
	return { ...config };
}

export function configureIDs() {
	if (config.App.JwtSecret === 'Change me')
		setConfig({ App: { JwtSecret: uuidV4() } });
}

export function verifyConfig(conf: Config) {
	const validationErrors = check(conf, configConstraints);
	if (validationErrors) {
		throw new Error(`Config is not valid: ${JSON.stringify(validationErrors)}`);
	}
}

export async function loadConfigFiles(
	dataPath: string,
	file: string,
	defaults: Config,
	appPath: string
) {
	if (file) configFile = file;
	configDefaults = cloneDeep(defaults);
	config = merge(config, defaults);
	const dataConfigFile = resolve(dataPath, configFile);
	const appConfigFile = resolve(appPath, configFile);
	if (await fileExists(appConfigFile)) {
		configFile = appConfigFile;
	} else if (await fileExists(dataConfigFile)) {
		configFile = dataConfigFile;
	} else if (file) {
		// If a custom file name is provided but we were unable to load it from app or data dirs, we're throwing here :
		throw new Error(`File ${file} not found in either app or data folders`);
	} else {
		// No custom file specified, we're going to use dataDir by default
		configFile = dataConfigFile;
	}
	if (await fileExists(configFile)) await loadConfig(configFile);
}

export async function loadConfig(file: string) {
	try {
		logger.debug(`Reading configuration file ${file}`, { service
		});
		const content = await fs.readFile(file, 'utf-8');
		const parsedContent = yamlLoad(content);
		clearEmpties(parsedContent);
		const newConfig = merge(config, parsedContent);
		verifyConfig(newConfig);
		config = newConfig;
	} catch (err) {
		logger.error(`Unable to read config file ${file}`, {
			service,
			obj: err,
		});
		throw err;
	}
}

export async function changeLanguage(lang: string) {
	await i18n.changeLanguage(lang);
}

export async function configureLocale() {
	let detectedLocale = await osLocale();
	detectedLocale = detectedLocale.substring(0, 2);
	await i18n.use(i18nextBackend).init({
		fallbackLng: 'en',
		lng: detectedLocale,
		backend: {
			loadPath: resolve(getState().resourcePath, 'locales/{{lng}}.json'),
		},
	});
	setState({ defaultLocale: detectedLocale });
}

export function setConfig(configPart: RecursivePartial<Config>) {
	config = merge(config, configPart);
	if (configReady) updateConfig(config);
	return getConfig();
}

export function resolvedPathRepos(
	type: RepositoryType,
	repoName?: string
): string[] {
	const paths = [];
	let repos = cloneDeep(config.System.Repositories);
	// If a repo is supplied, we get only that repo. If not only the enabled ones
	repos = repoName
		? repos.filter(r => r.Name === repoName)
		: repos.filter(r => r.Enabled);
	if (type === 'Medias') {
		repos.forEach(repo =>
			repo.Path.Medias.map(path =>
				paths.push(resolve(getState().dataPath, path))));
	} else {
		repos.forEach(repo =>
			paths.push(resolve(getState().dataPath, repo.BaseDir, type.toLowerCase())));
	}
	return paths;
}

export async function updateConfig(newConfig: Config) {
	const filteredConfig: RecursivePartial<Config> = difference(
		newConfig,
		configDefaults
	);
	clearEmpties(filteredConfig);
	await fs.writeFile(configFile, yamlDump(filteredConfig), 'utf-8');
}

export function resolvedPath(type: PathType) {
	const dir = Array.isArray(config.System.Path[type])
		? config.System.Path[type][0]
		: config.System.Path[type];
	return resolve(getState().dataPath, dir);
}
