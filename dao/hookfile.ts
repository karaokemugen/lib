import { promises as fs } from 'fs';
import { load as yamlLoad } from 'js-yaml';
import parallel from 'p-map';
import { coerce as semverCoerce, satisfies as semverSatisfies } from 'semver';

import { getState } from '../../utils/state';
import { Hook, HookFile } from '../types/hook';
import logger from '../utils/logger';
import { check, initValidators, isUUID } from '../utils/validators';

const header = {
	description: 'Karaoke Mugen Hook File',
	version: 1,
};

const hookConstraintsV1 = {
	name: { presence: { allowEmpty: false } },
	repository: { presence: { allowEmpty: false } },
};

export function hookDataValidationErrors(hook: Hook) {
	initValidators();
	return check(hook, hookConstraintsV1);
}

export async function getDataFromHookFile(file: string): Promise<Hook> {
	const hookFileData = await fs.readFile(file, 'utf-8');
	const hookData = yamlLoad(hookFileData) as HookFile;
	if (
		!semverSatisfies(
			semverCoerce(`${hookData.header.version}`),
			`${header.version}`
		)
	)
		throw `Hook file version is incorrect (version found: ${hookData.header.version}, expected version: ${header.version})`;

	const validationErrors = hookDataValidationErrors(hookData.hook);
	if (validationErrors) {
		throw `Hook data is not valid for ${file} : ${JSON.stringify(
			validationErrors
		)}`;
	}

	if (Array.isArray(hookData.hook.conditions.tagPresence)) {
		if (hookData.hook.conditions.tagPresence.some(tid => !isUUID(tid)))
			throw 'tagPresence condition is invalid (not all UUIDs)';
	}
	if (hookData.hook.conditions.tagNumber) {
		for (const num of Object.values(hookData.hook.conditions.tagNumber)) {
			if (isNaN(num as number))
				throw 'One of the values in the tagNumber conditions is not a number';
		}
	}
	if (!hookData.hook.repository) hookData.hook.repository = 'kara.moe';
	return hookData.hook;
}

export async function readAllHooks(hookFiles: string[]): Promise<Hook[]> {
	if (hookFiles.length === 0) return [];
	const mapper = async (hookFile: string) => {
		return processHookFile(hookFile);
	};
	const hooks = await parallel(hookFiles, mapper, {
		stopOnError: false,
		concurrency: 32,
	});
	if (hooks.some((hook: Hook) => hook.error) && getState().opt.strict)
		throw 'One of the hooks is invalid';
	logger.debug(`Processed ${hooks.length} hooks`, { service: 'Hooks' });
	return hooks.filter((hook: Hook) => !hook.error);
}

async function processHookFile(hookFile: string): Promise<Hook> {
	try {
		return await getDataFromHookFile(hookFile);
	} catch (err) {
		logger.warn(`Hook file ${hookFile} is invalid/incomplete`, {
			service: 'Hook',
			obj: err,
		});
		return {
			error: true,
			name: hookFile,
			repository: '',
			conditions: {},
			actions: { addTag: [] },
		};
	}
}
