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

export async function loadConfigFiles(appPath: string, file: string, defaults: Config) {
	if (file) configFile = file;
	configDefaults = cloneDeep(defaults);
	const overrideConfigFile = resolve(appPath, configFile);
	const databaseConfigFile = resolve(appPath, 'database.json');
	config = merge(config, defaults);
	if (await asyncExists(overrideConfigFile)) await loadConfig(overrideConfigFile);
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
			loadPath: resolve(__dirname, '../../locales/{{lng}}.json')
		}
	});
	setState( {EngineDefaultLocale: detectedLocale });
}

export function setConfig(configPart: any) {
	config = merge(config, configPart);
	if (configReady) updateConfig(config);
	return getConfig();
}

export function resolvedPathKaras() {
	return config.System.Path.Karas.map(path => resolve(getState().appPath, path));
}

export function resolvedPathIntros() {
	return config.System.Path.Intros.map(path => resolve(getState().appPath, path));
}

export function resolvedPathSeries() {
	return config.System.Path.Series.map(path => resolve(getState().appPath, path));
}

export function resolvedPathTags() {
	return config.System.Path.Tags.map(path => resolve(getState().appPath, path));
}

export function resolvedPathJingles() {
	return config.System.Path.Jingles.map(path => resolve(getState().appPath, path));
}

export function resolvedPathBackgrounds() {
	return config.System.Path.Backgrounds.map(path => resolve(getState().appPath, path));
}

export function resolvedPathSubs() {
	return config.System.Path.Lyrics.map(path => resolve(getState().appPath, path));
}

export function resolvedPathMedias() {
	return config.System.Path.Medias.map(path => resolve(getState().appPath, path));
}

export function resolvedPathImport() {
	return resolve(getState().appPath, config.System.Path.Import);
}

export function resolvedPathTemp() {
	return resolve(getState().appPath, config.System.Path.Temp);
}

export function resolvedPathPreviews() {
	return resolve(getState().appPath, config.System.Path.Previews);
}

export function resolvedPathAvatars() {
	return resolve(getState().appPath, config.System.Path.Avatars);
}

export async function updateConfig(newConfig: Config) {
	const filteredConfig: Config = difference(newConfig, configDefaults);
	clearEmpties(filteredConfig);
	delete filteredConfig.Database;
	logger.debug('[Config] Settings being saved : '+JSON.stringify(filteredConfig));
	await asyncWriteFile(resolve(getState().appPath, configFile), safeDump(filteredConfig), 'utf-8');
}

