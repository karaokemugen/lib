import { promises as fs } from 'fs';
import { basename, resolve } from 'path';
import { coerce as semverCoerce, satisfies as semverSatisfies } from 'semver';

import { determineRepo } from '../services/repo.js';
import { DBTag } from '../types/database/tag.js';
import { Tag, TagFile, TagTypeNum } from '../types/tag.js';
import { resolvedPathRepos } from '../utils/config.js';
import { externalDatabases, getTagTypeName, tagTypes, uuidRegexp } from '../utils/constants.js';
import { resolveFileInDirs, sanitizeFile } from '../utils/files.js';
import logger from '../utils/logger.js';
import { clearEmpties, sortJSON } from '../utils/objectHelpers.js';
import { check, initValidators } from '../utils/validators.js';

const service = 'TagFile';

const header = {
	description: 'Karaoke Mugen Tag File',
	version: 1,
};

const tagConstraintsV1 = {
	name: { presence: { allowEmpty: false } },
	aliases: { arrayValidator: true },
	tid: { presence: true, format: uuidRegexp },
	i18n: { i18nValidator: true },
	description: { i18nValidator: true },
	types: { arrayValidator: true },
};

export async function getDataFromTagFile(file: string): Promise<Tag> {
	const tagFileData = await fs.readFile(file, 'utf-8');
	let tagData = {} as TagFile;
	try {
		tagData = JSON.parse(tagFileData);
	} catch (err) {
		throw `Tag file ${file} is not valid JSON`;
	}
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
	let types = [];

	for (const type of tagData.tag.types) {
		// Remove this check in KM 9.0
		let unknownType = false;
		if (isNaN(type)) {
			// Type is a string, let's add the corresponding number
			tagTypes[type]
				? types.push(tagTypes[type])
				: unknownType = true;
	 	} else {
			// Type is a number, we push it as a number.
			Object.values(tagTypes).includes(+type as TagTypeNum)
				? !types.includes(+type)
					? types.push(+type)
					: undefined
				: unknownType = true;
		}
		if (unknownType) logger.warn(
			`Tag file ${
				tagData.tag.tagfile
			} has an unknown tag type : ${type}`,
			{ service }
		);
	}

	types = types.filter((t: any) => t !== undefined);

	if (types.length === 0)
		logger.warn(`Tag ${file} has no types!`, { service });

	tagData.tag.types = types;

	tagData.tag.repository = determineRepo(file);
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

export function defineTagFilename(tag: Tag, oldTag?: DBTag): string {
	const newFile = `${sanitizeFile(tag.name)}.${tag.tid.substring(0, 8)}.tag.json`;
	if (oldTag && process.platform === 'win32' && newFile !== oldTag.tagfile && newFile.toLowerCase() === oldTag.tagfile.toLowerCase()) {
		return oldTag.tagfile;
	}
	return newFile;
}

export async function writeTagFile(tag: Tag | DBTag, destDir: string) {
	const tagFile = resolve(
		destDir,
		defineTagFilename(tag)
	);
	const tagData = formatTagFile(tag as DBTag);
	clearEmpties(tagData);
	await fs.writeFile(tagFile, JSON.stringify(tagData, null, 2), {
		encoding: 'utf8',
	});
}

export function formatTagFile(tag: DBTag): TagFile {
	// For now we have to live with numbers and strings in types
	// Remove this in KM 9.0

	let newTypes = []; // GUNDAM
	for (const type of tag.types) {
		newTypes.push(`${type}`);
		newTypes.push(getTagTypeName(type));
	}
	// Remove duplicates
	newTypes = newTypes.filter((x, i) => i === newTypes.indexOf(x));
	// Overwrite our types array for KM <7.1 compatibility
	tag.types = newTypes;

	// Remove useless data
	if (tag.aliases?.length === 0 || tag.aliases === null)
		delete tag.aliases;
	if (tag.noLiveDownload === false) delete tag.noLiveDownload;
	delete tag.tagfile;
	delete tag.count;
	delete tag.karacount;
	if (tag.priority === 10) delete tag.priority;
	if (tag.short === null) delete tag.short;
	if (tag.karafile_tag === null) delete tag.karafile_tag;
	if (tag.external_database_ids == null) {
		delete tag.external_database_ids;
	} else {
		for (const db of externalDatabases) {
			if (tag.external_database_ids[db] === null)
				delete tag.external_database_ids[db];
		}
		if (Object.keys(tag.external_database_ids).length === 0)
			delete tag.external_database_ids;
	}
	const tagSorted = sortJSON(tag);
	// Ask Axel about that.
	// Remove this in KM 9.0 or so.
	if (Array.isArray(tagSorted.types)) {
		tagSorted.types.reverse();
	}
	tag = tagSorted;

	const tagData: TagFile = {
		header,
		tag
	};

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

export function trimTagData(tag: Tag): Tag {
	tag.name = tag.name.trim();
	if (tag.description) for (const lang of Object.keys(tag.description)) {
		tag.description[lang] = tag.description[lang].trim();
	}
	if (tag.i18n) for (const lang of Object.keys(tag.i18n)) {
		tag.i18n[lang] = tag.i18n[lang].trim();
	}
	if (tag.aliases) tag.aliases.forEach((_, i) => {
		tag.aliases[i] = tag.aliases[i].trim();
	});
	if (tag.short) tag.short = tag.short.trim();
	return tag;
}
