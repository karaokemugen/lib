import logger from './logger';
import {setState, getState} from '../../utils/state';
import i18n from 'i18next';
import i18nextBackend from 'i18next-node-fs-backend';
import {resolve} from 'path';
import osLocale from 'os-locale';
import {safeDump, safeLoad} from 'js-yaml';
import { on } from './pubsub';
import { difference, clearEmpties } from './object_helpers';
import { asyncRequired, asyncExists, asyncReadFile, asyncWriteFile } from './files';
import uuidV4 from 'uuid/v4';
import merge from 'lodash.merge';
import cloneDeep from 'lodash.clonedeep';
import { Config } from '../../types/config';
import { testJSON, check } from './validators';
import { RepositoryType } from '../types/repo';

let configReady = false;
let config: Config;
let configFile = 'config.yml';
let configConstraints = {};
let configDefaults: Config;

on('configReady', () => {
	configReady = true;
});

export function setConfigFile(file: string) {
	configFile = file;
}

export function setConfigConstraints(constraints: any) {
	configConstraints = constraints;
}

/**
 * We return a copy of the configuration data so the original one can't be modified
 * without passing by this module's functions.
 */
export function getConfig(): Config {
	return {...config};
}

export function configureIDs() {
	if (config.App.JwtSecret === 'Change me') setConfig({App: {JwtSecret: uuidV4() }});
}

export function verifyConfig(conf: Config) {
	const validationErrors = check(conf, configConstraints);
	if (validationErrors) {
		throw `Config is not valid: ${JSON.stringify(validationErrors)}`;
	}
}

export async function loadConfigFiles(dataPath: string, file: string, defaults: Config, appPath: string) {
	if (file) configFile = file;
	configDefaults = cloneDeep(defaults);
	const dataConfigFile = resolve(dataPath, configFile);
	const appConfigFile = resolve(appPath, configFile);
	const databaseConfigFile = resolve(dataPath, 'database.json');
	config = merge(config, defaults);
	if (await asyncExists(appConfigFile)) {
		await loadConfig(appConfigFile);
	} else if (await asyncExists(dataConfigFile)) {
		await loadConfig(dataConfigFile);
	} else if (file) {
		// If a custom file name is provided but we were unable to load it from app or data dirs, we're throwing here :
		throw `File ${file} not found in either app or data folders`;
	}
	if (await asyncExists(databaseConfigFile)) {
		const dbConfig = await loadDBConfig(databaseConfigFile);
		config.Database = merge(config.Database, dbConfig);
	}
}

export async function loadDBConfig(configFile: string) {
	const configData = await asyncReadFile(configFile, 'utf-8');
	if (!testJSON(configData)) {
		logger.error('[Config] Database config file is not valid JSON');
		throw 'Syntax error in database.json';
	}
	return JSON.parse(configData);
}

export async function loadConfig(configFile: string) {
	logger.debug(`[Config] Reading configuration file ${configFile}`);
	await asyncRequired(configFile);
	const content = await asyncReadFile(configFile, 'utf-8');
	const parsedContent = safeLoad(content);
	clearEmpties(parsedContent);
	const newConfig = merge(config, parsedContent);
	verifyConfig(newConfig);
	config = {...newConfig};
}

export async function configureLocale() {
	let detectedLocale = await osLocale();
	detectedLocale = detectedLocale.substring(0, 2);
	await i18n.use(i18nextBackend).init({
		fallbackLng: 'en',
		lng: detectedLocale,
		backend: {
			loadPath: resolve(getState().resourcePath, 'locales/{{lng}}.json')
		}
	});
	setState( {EngineDefaultLocale: detectedLocale });
}

/** Delete old KM paths. Delete this code after 3.4 or later hits */
export function deleteOldPaths() {
	delete config.System.Path.Karas;
	delete config.System.Path.Lyrics;
	delete config.System.Path.Medias;
	delete config.System.Path.Series;
	delete config.System.Path.Tags;
}

export function setConfig(configPart: any) {
	config = merge(config, configPart);
	if (configReady) updateConfig(config);
	return getConfig();
}

export function resolvedPathSponsors() {
	return config.System.Path.Sponsors.map(path => resolve(getState().dataPath, path));
}

export function resolvedPathRepos(type: RepositoryType, repo?: string): string[] {
	const paths = [];
	let repos = cloneDeep(config.System.Repositories);
	if (repo) repos = repos.filter(r => r.Name === repo);
	repos.forEach(repo => repo.Path[type].map(path => paths.push(resolve(getState().dataPath, path))));
	return paths;
}

export function resolvedPathIntros() {
	return config.System.Path.Intros.map(path => resolve(getState().dataPath, path));
}

export function resolvedPathOutros() {
	return config.System.Path.Outros.map(path => resolve(getState().dataPath, path));
}

export function resolvedPathEncores() {
	return config.System.Path.Encores.map(path => resolve(getState().dataPath, path));
}

export function resolvedPathJingles() {
	return config.System.Path.Jingles.map(path => resolve(getState().dataPath, path));
}

export function resolvedPathBackgrounds() {
	return config.System.Path.Backgrounds.map(path => resolve(getState().dataPath, path));
}

export function resolvedPathImport() {
	return resolve(getState().dataPath, config.System.Path.Import);
}

export function resolvedPathTemp() {
	return resolve(getState().dataPath, config.System.Path.Temp);
}

export function resolvedPathPreviews() {
	return resolve(getState().dataPath, config.System.Path.Previews);
}

export function resolvedPathAvatars() {
	return resolve(getState().dataPath, config.System.Path.Avatars);
}

export async function updateConfig(newConfig: Config) {
	const filteredConfig: Config = difference(newConfig, configDefaults);
	clearEmpties(filteredConfig);
	delete filteredConfig.Database;
	await asyncWriteFile(resolve(getState().dataPath, configFile), safeDump(filteredConfig), 'utf-8');
}

