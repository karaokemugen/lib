import {has as hasLang} from 'langs';
import {coerce as semverCoerce, satisfies as semverSatisfies} from 'semver';
import validate from 'validate.js';

import {lyricsConstraints, mediaConstraints} from '../dao/karafile';
import { ImportTag } from '../types/tag';
import {bools, tagTypes,uuidRegexp} from './constants';

// Constraints

export const PLCImportConstraints = {
	kid: {presence: true, uuidArrayValidator: true},
	created_at: {presence: {allowEmpty: false}},
	flag_playing: {inclusion: bools},
	pos: {numericality: {onlyInteger: true, greaterThanOrEqualTo: 0}},
	nickname: {presence: {allowEmpty: false}},
	username: {presence: {allowEmpty: false}}
};

// Tests

export function testJSON(json: string): boolean {
	try {
		if (typeof json === 'string') {
			JSON.parse(json);
			return true;
		}
		if (typeof json === 'object') {
			// This is probably stupid, but YOU NEVER KNOW.
			JSON.parse(JSON.stringify(json));
			return true;
		}
		return false;
	} catch(err) {
		return false;
	}
}

// Validators

function semverInteger(value: number, options: number) {
	if (!isNumber(value))  return ` '${value}' (value) is invalid (not an integer)`;
	if (!isNumber(options))  return ` '${options}' (options) is invalid (not an integer)`;
	if (!semverSatisfies(semverCoerce(''+value), ''+options)) return ` ${value} does not satisfy semver ${options} (too different)`;
	return null;
}

function integerValidator(value: any) {
	if(isNumber(value)) return null;
	return ` '${value}' is invalid (not an integer)`;
}

function tagTypeValidator(value: any) {
	if (!Array.isArray(value)) value = value.split(',');
	for (const v of value) {
		if (!Object.keys(tagTypes).includes(v)) return `Tag type ${v} invalid`;
	}
	return null;
}

function tagValidator(value: ImportTag) {
	if (!value) return 'Value is null or undefined';
	if (value.tid && !isUUID(value.tid))  return `${value.tid} is not a UUID`;
	if (value.name && typeof value.name !== 'string') return `${value.name} is not a string`;
	return null;
}

function i18nValidator(value: any) {
	if (typeof value !== 'object') return `i18n data (${value}) is not an object`;

	const firstInvalidLang = Object.keys(value).find((lang) => !(lang === 'und' || lang === 'mul' || hasLang('2B', lang)));
	if(firstInvalidLang) return `i18n data invalid : '${firstInvalidLang}' is an invalid ISO639-2B code`;

	return null;
}

function boolUndefinedValidator(value: any) {
	if (value === true ||
		value === false ||
		value === undefined ||
		value === 'true' ||
		value === 'false') return null;
	return `${value} must be strictly boolean`;
}

function isJSON(value: string) {
	if (testJSON(value)) return null;
	return ` '${value}' is invalid JSON`;
}

export function isNumber(value: any) {
	return !isNaN(value);
}

function arrayOneItemValidator(value: any) {
	if (Array.isArray(value) && value.length > 0) return null;
	return `'${value}' is not an array with at least one element`;
}

function arrayValidator(value: any) {
	if (Array.isArray(value)) return null;
	if (value === null || value === undefined) return null;
	return `'${value}' is not an array`;
}



function uuidArrayValidator(value: string) {
	if(!value) return ` '${value}' is invalid (empty)`;
	value = value.toString();
	if (value.includes(',')) {
		const array = value.split(',');
		if (array.some(e => !e)) return `'${value} contains an undefined`;
		if (array.every(e => isUUID(e))) return null;
		return ` '${value}' is invalid (not an array of UUIDs)`;
	}
	if (isUUID(value)) return null;

	return ` '${value}' is invalid (not a UUID)`;
}

function PLCsValidator(value: any[]) {
	if(!value) return ` '${value}' is invalid (empty)`;
	for (const v of value) {
		if(!v) return ` '${value}' contains an invalid item (empty)`;
		const errors = check(v, PLCImportConstraints);
		if (errors) return errors;
	}
	return null;
}

function songItemValidator(value: any) {
	if (!value) return ` '${value} is not present`;
	if (!Array.isArray(value)) return ` '${value}' is invalid (not an array)`;
	for (const item of value) {
		if (!isUUID(item.kid)) return ` '${value} is invalid (not a valid KID)`;
		if (!isUUID(item.seid)) return ` '${value} is invalid (not a valid SEID)`;
		// Need more tests
	}
	return null;
}

function sessionValidator(value: any) {
	if (!value) return ` '${value} is not present`;
	if (!Array.isArray(value)) return ` '${value}' is invalid (not an array)`;
	for (const item of value) {
		if (!isUUID(item.seid)) return ` '${value} is invalid (not a valid SEID)`;
	}
	return null;
}

function favoritesValidator(value: any) {
	if (!value) return ` '${value} is not present`;
	if (!Array.isArray(value)) return ` '${value}' is invalid (not an array)`;
	for (const item of value) {
		if (!isUUID(item.kid)) return ` '${value} is invalid (not a valid KID)`;
	}
	return null;
}

function numbersArrayValidator(value: string) {
	if(!value) return ` '${value}' is invalid (empty)`;
	value = value.toString();
	if (value.includes(',')) {
		const array = value.split(',');
		if (array.every(isNumber)) return null;
		return ` '${value}' is invalid (not an array of numbers)`;
	}
	if (isNumber(value)) return null;

	return ` '${value}' is invalid (not a number)`;
}

function isArray(value: any){
	if(Array.isArray(value)) return null;
	return `'${value}' is invalid (not an array)`;
}

function repositoriesValidator(value: any) {
	if (!Array.isArray(value)) return `'${value}' is invalid (not an array)`;
	for (const repo of value) {
		if (!repo.Name) return `'${repo}' has no Name`;
		if (repo.Enabled !== true && repo.Enabled !== false) return `'${repo}' Enabled setting not valid (${repo.Enabled})`;
		if (repo.Online !== true && repo.Online !== false) return `'${repo}' Online setting not valid (${repo.Online})`;
		if (!repo.Path) return `'${repo}' Path is undefined`;
		if (arrayOneItemValidator(repo.Path.Karas) !== null) return `'${repo}' Path.Karas is not valid`;
		if (arrayOneItemValidator(repo.Path.Lyrics) !== null) return `'${repo}' Path.Lyrics is not valid`;
		if (arrayOneItemValidator(repo.Path.Medias) !== null) return `'${repo}' Path.Medias is not valid`;
		if (arrayOneItemValidator(repo.Path.Tags) !== null) return `'${repo}' Path.Tags is not valid`;
	}
	return null;
}

function karaLyricsValidator(value: any[]) {
	// Lyrics can be totally empty
	if (!value) return null;
	value.forEach((v: any) => {
		const validationErrors = check(v, lyricsConstraints);
		if (validationErrors) {
			return `Karaoke Lyrics data is not valid: ${JSON.stringify(validationErrors)}`;
		}
	});
}

function karaMediasValidator(value: any[]) {
	// We receive a list of media files, we'll validate them
	value.forEach((v: any) => {
		const validationErrors = check(v, mediaConstraints);
		if (validationErrors) {
			return `Karaoke Medias data is not valid: ${JSON.stringify(validationErrors)}`;
		}
	});
}

// Validators list

const validatorsList = {
	numbersArrayValidator,
	integerValidator,
	isJSON,
	isArray,
	i18nValidator,
	arrayValidator,
	arrayOneItemValidator,
	uuidArrayValidator,
	boolUndefinedValidator,
	karaMediasValidator,
	karaLyricsValidator,
	PLCsValidator,
	songItemValidator,
	favoritesValidator,
	tagTypeValidator,
	tagValidator,
	semverInteger,
	sessionValidator,
	repositoriesValidator
};

// Sanitizers

export function unescape(str: string) {
	return str
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, '\'')
		.replace(/&#x3A;/g, ':')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&');
}

// Init

export function initValidators() {
	Object.keys(validatorsList)
		.filter((validatorName) => !validate.validators[validatorName])
		.forEach((validatorName) => validate.validators[validatorName] = validatorsList[validatorName]);
}

export function check(obj: any, constraints: any) {
	initValidators();
	return validate(obj, constraints);
}

export function isUUID(uuid: string) {
	return new RegExp(uuidRegexp).test(uuid);
}