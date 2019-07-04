import {uuidRegexp} from '../utils/constants';
import { Tag, TagFile } from '../types/tag';
import { resolveFileInDirs, asyncReadFile, sanitizeFile, asyncWriteFile } from '../utils/files';
import { resolvedPathTags } from '../utils/config';
import { testJSON, initValidators, check } from '../utils/validators';
import { resolve, basename } from 'path';

const header = {
	version: 1,
	description: 'Karaoke Mugen Tag File'
}

const tagConstraintsV1 = {
	name: {presence: {allowEmpty: false}},
	aliases: {seriesAliasesValidator: true},
	tid: {presence: true, format: uuidRegexp},
	i18n: {seriesi18nValidator: true},
	types: {tagTypeValidator: true}
};

export async function readTagFile(tagFile: string) {
	let file: string;
	try {
		file = await resolveFileInDirs(tagFile, resolvedPathTags());
	} catch(err) {
		throw `No series file found (${tagFile})`;
	}
	return await getDataFromTagFile(file);
}

export async function getDataFromTagFile(file: string): Promise<Tag> {
	const tagFileData = await asyncReadFile(file, 'utf-8');
	if (!testJSON(tagFileData)) throw `Syntax error in file ${file}`;
	const tagData = JSON.parse(tagFileData);
	if (header.version > +tagData.header.version) throw `Tag file is too old (version found: ${tagData.header.version}, expected version: ${header.version})`;
	const validationErrors = tagDataValidationErrors(tagData.tag);
	if (validationErrors) {
		throw `Series data is not valid: ${JSON.stringify(validationErrors)}`;
	}
	tagData.tag.tagfile = basename(file);
	return tagData.tag;
}

export function tagDataValidationErrors(tagData: Tag): {} {
	initValidators();
	return check(tagData, tagConstraintsV1);
}

export async function writeTagFile(tag: Tag, destDir: string) {
	const tagFile = resolve(destDir, `${sanitizeFile(tag.name)}$.${tag.tid.substring(0, 7)}.tag.json`);
	const tagData = formatTagFile(tag);
	await asyncWriteFile(tagFile, JSON.stringify(tagData, null, 2), {encoding: 'utf8'});
}

export function formatTagFile(tag: Tag): TagFile {
	const tagData = {
		header: header,
		tag: tag
	};
	//Remove useless data
	if ((tag.aliases && tag.aliases.length === 0) || tag.aliases === null) delete tagData.tag.aliases;
	delete tagData.tag.tagfile;
	return tagData;
}
