import cloneDeep from 'lodash.clonedeep';
import { basename,resolve } from 'path';
import {coerce as semverCoerce, satisfies as semverSatisfies} from 'semver';

import { editKara } from '../../services/kara_creation';
import { DBTag } from '../types/database/tag';
import { KaraList } from '../types/kara';
import { Tag, TagFile } from '../types/tag';
import { resolvedPathRepos } from '../utils/config';
import {getTagTypeName,tagTypes, uuidRegexp} from '../utils/constants';
import { asyncReadFile, asyncUnlink,asyncWriteFile, resolveFileInDirs, sanitizeFile } from '../utils/files';
import logger from '../utils/logger';
import { sortJSON } from '../utils/object_helpers';
import { check,initValidators, testJSON } from '../utils/validators';

const header = {
	description: 'Karaoke Mugen Tag File',
	version: 1
};

const tagConstraintsV1 = {
	name: {presence: {allowEmpty: false}},
	aliases: {arrayValidator: true},
	tid: {presence: true, format: uuidRegexp},
	i18n: {i18nValidator: true},
	types: {arrayValidator: true}
};

export async function getDataFromTagFile(file: string): Promise<Tag> {
	const tagFileData = await asyncReadFile(file, 'utf-8');
	if (!testJSON(tagFileData)) throw `Syntax error in file ${file}`;
	const tagData = JSON.parse(tagFileData);
	if (!semverSatisfies(semverCoerce(''+tagData.header.version), ''+header.version)) throw `Tag file version is incorrect (version found: ${tagData.header.version}, expected version: ${header.version})`;
	const validationErrors = tagDataValidationErrors(tagData.tag);
	if (validationErrors) {
		throw `Tag data is not valid for ${file} : ${JSON.stringify(validationErrors)}`;
	}
	tagData.tag.tagfile = basename(file);
	// Let's validate tag type data
	const originalTypes = [].concat(tagData.tag.types);
	// In preparation of #497 so 4.x versions will be able to read those.
	// Remove this code once work on the issue has officially started.
	// Tag types in tagfiles are strings while we're expecting numbers, so we're converting them.
	if (isNaN(tagData.tag.types[0])) {
		tagData.tag.types.forEach((t: string, i: number) => tagData.tag.types[i] = tagTypes[t]);
	}

	if (tagData.tag.types.some((t: string) => t === undefined)) {
		logger.warn(`Tag file ${tagData.tag.tagfile} has an unknown tag type : ${originalTypes.join(', ')}`, {service: 'Tag'});
	}
	tagData.tag.types = tagData.tag.types.filter((t: any) => t !== undefined);
	if (tagData.tag.types.length === 0) logger.warn(`Tag ${file} has no types!`, {service: 'Tag'});
	if (!tagData.tag.repository) tagData.tag.repository = 'kara.moe';
	if (!tagData.tag.modified_at) tagData.tag.modified_at = '1982-04-06';
	return tagData.tag;
}

export function tagDataValidationErrors(tagData: Tag) {
	initValidators();
	return check(tagData, tagConstraintsV1);
}

export async function writeTagFile(tag: Tag, destDir: string) {
	const tagFile = resolve(destDir, `${sanitizeFile(tag.name)}.${tag.tid.substring(0, 8)}.tag.json`);
	const tagData = formatTagFile(tag);
	await asyncWriteFile(tagFile, JSON.stringify(tagData, null, 2), {encoding: 'utf8'});
}

export function formatTagFile(tag: Tag): TagFile {
	const tagData = {
		header: header,
		tag: cloneDeep(tag)
	};
	//postgreSQL doesn't like camelCase
	tagData.tag.noLiveDownload = tagData.tag.nolivedownload;
	delete tagData.tag.nolivedownload;
	//Remove useless data
	if ((tag.aliases?.length === 0) || tag.aliases === null) delete tagData.tag.aliases;
	if (tagData.tag.problematic === false) delete tagData.tag.problematic;
	if (tagData.tag.noLiveDownload === false) delete tagData.tag.noLiveDownload;
	delete tagData.tag.tagfile;
	delete tagData.tag.karacount;
	delete tagData.tag.karaType;
	if (tagData.tag.priority === 0) delete tagData.tag.priority;
	//Change tag types to strings
	tag.types.forEach((t: number, i: number) => {
		tagData.tag.types[i] = getTagTypeName(t);
	});
	if (tag.short === null) delete tagData.tag.short;
	const tagSorted = sortJSON(tagData.tag);
	tagData.tag = tagSorted;
	return tagData;
}

export async function removeTagFile(name: string, repository: string) {
	try {
		const filenames = await resolveFileInDirs(name, resolvedPathRepos('Tags', repository));
		for (const filename of filenames) {
			await asyncUnlink(filename);
		}
	} catch(err) {
		throw `Could not remove tag file ${name} : ${err}`;
	}
}

export async function removeTagInKaras(tid: string, karas: KaraList) {
	logger.info(`Removing tag ${tid} in kara files`, {service: 'Kara'});
	const karasWithTag = karas.content.filter((k: any) => {
		if (k.tid?.some((t: string) => t.startsWith(tid))) return true;
		return false;
	});
	if (karasWithTag.length > 0) logger.info(`Removing in ${karasWithTag.length} files`, {service: 'Kara'});
	for (const karaWithTag of karasWithTag) {
		logger.info(`Removing in ${karaWithTag.karafile}...`, {service: 'Kara'});
		for (const type of Object.keys(tagTypes)) {
			if (karaWithTag[type]) karaWithTag[type] = karaWithTag[type].filter((t: DBTag) => t.tid !== tid);
		}
		karaWithTag.modified_at = new Date();
		await editKara(karaWithTag, false);
	}
}
