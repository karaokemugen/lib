import validate from 'validate.js';
import {has as hasLang} from 'langs';
import {uuidRegexp, bools, tagTypes} from './constants';
import {lyricsConstraints, mediaConstraints} from '../dao/karafile';
import { ImportTag } from '../types/tag';

// Constraints

export const PLCImportConstraints = {
	kid: {presence: true, uuidArrayValidator: true},
	created_at: {presence: {allowEmpty: false}},
	flag_playing: {inclusion: bools},
	pos: {numericality: {onlyInteger: true, greaterThanOrEqualTo: 0}},
	nickname: {presence: {allowEmpty: false}},
	username: {presence: {allowEmpty: false}}
}

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
	if (!value) return `Value is null or undefined`;
	if (value.tid && !new RegExp(uuidRegexp).test(value.tid))  return `${value.tid} is not a UUID`;
	if (value.name && typeof value.name !== 'string') return `${value.name} is not a string`;
	return null;
}

function i18nValidator(value: object) {
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

function arrayValidator(value: string) {
	if (Array.isArray(value)) return null;
	if (value === null || value === undefined) return null;
	return `'${value}' is not an array`
}

function uuidArrayValidator(value: string) {
	if(!value) return ` '${value}' is invalid (empty)`;
	value = value.toString();
	if (value.includes(',')) {
		const array = value.split(',');
		if (array.some(e => !e)) return `'${value} contains an undefined`;
		if (array.every(e => new RegExp(uuidRegexp).test(e))) return null;
		return ` '${value}' is invalid (not an array of UUIDs)`;
	}
	if (new RegExp(uuidRegexp).test(value)) return null;

	return ` '${value}' is invalid (not a UUID)`;
}

function PLCsValidator(value: any[]) {
	if(!value) return ` '${value}' is invalid (empty)`;
	for (const v of value) {
		if(!v) return ` '${value}' contains an invalid item (empty)`;
		const errors = check(v, PLCImportConstraints)
		if (errors) return errors;
	}
	return null;
}

function songItemValidator(value: any) {
	if (!value) return ` '${value} is not present`;
	if (!Array.isArray(value)) return ` '${value}' is invalid (not an array)`;
	const uuid = new RegExp(uuidRegexp);
	for (const item of value) {
		if (!uuid.test(item.kid)) return ` '${value} is invalid (not a valid KID)`;
		// Need more tests
	}
	return null;
}

function favoritesValidator(value: any) {
	if (!value) return ` '${value} is not present`;
	if (!Array.isArray(value)) return ` '${value}' is invalid (not an array)`;
	const uuid = new RegExp(uuidRegexp);
	for (const item of value) {
		if (!uuid.test(item.kid)) return ` '${value} is invalid (not a valid KID)`;
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
	uuidArrayValidator,
	boolUndefinedValidator,
	karaMediasValidator,
	karaLyricsValidator,
	PLCsValidator,
	songItemValidator,
	favoritesValidator,
	tagTypeValidator,
	tagValidator
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

