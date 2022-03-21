import { promises as fs } from 'fs';
import { cloneDeep } from 'lodash';
import { basename, resolve } from 'path';
import { coerce as semverCoerce, satisfies as semverSatisfies } from 'semver';

import { getRepo } from '../../services/repo';
import { DBTag } from '../types/database/tag';
import { Tag, TagFile } from '../types/tag';
import { resolvedPathRepos } from '../utils/config';
import { getTagTypeName, tagTypes, uuidRegexp } from '../utils/constants';
import { resolveFileInDirs, sanitizeFile } from '../utils/files';
import logger from '../utils/logger';
import { sortJSON } from '../utils/objectHelpers';
import { check, initValidators, testJSON } from '../utils/validators';

const service = 'TagFile';

const header = {
	description: 'Karaoke Mugen Tag File',
	version: 1,
};

const tagConstraintsV1 = {
	name: { presence: { allowEmpty: false } },
	repository: { presence: { allowEmpty: false } },
	aliases: { arrayValidator: true },
	tid: { presence: true, format: uuidRegexp },
	i18n: { i18nValidator: true },
	types: { arrayValidator: true },
};

export async function getDataFromTagFile(file: string): Promise<Tag> {
	const tagFileData = await fs.readFile(file, 'utf-8');
	if (!testJSON(tagFileData)) throw `Syntax error in file ${file}`;
	const tagData = JSON.parse(tagFileData);
	if (
		!semverSatisfies(
			semverCoerce(`${tagData.header.version}`),
			`${header.version}`
		)
	)
		throw `Tag file version is incorrect (version found: ${tagData.header.version}, expected version: ${header.version})`;
	const validationErrors = tagDataValidationErrors(tagData.tag);
	if (validationErrors) {
		throw `Tag data is not valid for ${file} : ${JSON.stringify(
			validationErrors
		)}`;
	}
	tagData.tag.tagfile = basename(file);
	// Let's validate tag type data
	const originalTypes = [].concat(tagData.tag.types);

	// Tag types in tagfiles are strings while we're expecting numbers, so we're converting them.
	// If you find a time machine, go smack Axel on the head for deciding this was a good idea.
	if (isNaN(tagData.tag.types[0])) {
		tagData.tag.types.forEach(
			(t: string, i: number) => (tagData.tag.types[i] = tagTypes[t])
		);
	}

	if (tagData.tag.types.some((t: string) => t === undefined)) {
		logger.warn(
			`Tag file ${
				tagData.tag.tagfile
			} has an unknown tag type : ${originalTypes.join(', ')}`,
			{ service }
		);
	}
	tagData.tag.types = tagData.tag.types.filter((t: any) => t !== undefined);
	if (tagData.tag.types.length === 0)
		logger.warn(`Tag ${file} has no types!`, { service });
	if (!tagData.tag.repository) tagData.tag.repository = 'kara.moe';
	const repo = getRepo(tagData.tag.repository);
	if (!repo)
		throw `Tag ${file} has an unknown repository (${tagData.tag.repository})`;
	try {
		await resolveFileInDirs(
			tagData.tag.tagfile,
			resolvedPathRepos('Tags', tagData.tag.repository)
		);
	} catch (err) {
		throw `Tag ${file} is not in the right repository directory (not found in its repo directory). Check that its repository is correct.`;
	}
	return tagData.tag;
}

export function tagDataValidationErrors(tagData: Tag) {
	initValidators();
	return check(tagData, tagConstraintsV1);
}

export async function writeTagFile(tag: Tag | DBTag, destDir: string) {
	const tagFile = resolve(
		destDir,
		`${sanitizeFile(tag.name)}.${tag.tid.substring(0, 8)}.tag.json`
	);
	const tagData = formatTagFile(tag as Tag);
	await fs.writeFile(tagFile, JSON.stringify(tagData, null, 2), {
		encoding: 'utf8',
	});
}

export function formatTagFile(tag: Tag): TagFile {
	const tagData = {
		header,
		tag: cloneDeep(tag),
	};
	// Remove useless data
	if (tag.aliases?.length === 0 || tag.aliases === null)
		delete tagData.tag.aliases;
	if (tagData.tag.noLiveDownload === false) delete tagData.tag.noLiveDownload;
	delete tagData.tag.tagfile;
	delete tagData.tag.count;
	delete tagData.tag.karacount;
	delete tagData.tag.karaType;
	if (tagData.tag.priority === 10) delete tagData.tag.priority;
	// Change tag types to strings
	// See comment above about getting them into numbers
	tag.types.forEach((t: number, i: number) => {
		tagData.tag.types[i] = getTagTypeName(t);
	});
	if (tag.short === null) delete tagData.tag.short;
	if (tag.karafile_tag === null) delete tagData.tag.karafile_tag;
	const tagSorted = sortJSON(tagData.tag);
	tagData.tag = tagSorted;
	return tagData;
}

export async function removeTagFile(name: string, repository: string) {
	try {
		const filenames = await resolveFileInDirs(
			name,
			resolvedPathRepos('Tags', repository)
		);
		for (const filename of filenames) {
			await fs.unlink(filename);
		}
	} catch (err) {
		throw `Could not remove tag file ${name} : ${err}`;
	}
}
