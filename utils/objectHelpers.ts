/* eslint-disable @typescript-eslint/no-shadow */
import { Dictionary, isEqual, transform } from 'lodash';

import { RecursivePartial } from '../types/index.js';

export function sortJSON(obj: any): any {
	const objOrdered = {};
	Object.keys(obj)
		.sort()
		.forEach(key => {
			objOrdered[key] = obj[key];
		});
	return objOrdered;
}

/** Function to extract differences between objects. First argument is the new object, second is the defaults. */
export function difference<
	OObject = Dictionary<any>,
	BObject = Dictionary<any>
>(object: OObject, base: BObject): RecursivePartial<OObject & BObject> {
	function changes(
		object: Dictionary<any>,
		base: Dictionary<any>
	): RecursivePartial<OObject & BObject> {
		return transform(object, (result, value, key) => {
			if (Array.isArray(value)) {
				if (!isEqual(value, base[key])) result[key] = value;
			} else if (!isEqual(value, base[key])) {
				result[key] =
					typeof value === 'object' && typeof base[key] === 'object'
						? changes(value, base[key])
						: value;
			}
		});
	}
	return changes(object, base);
}

/** Function to clear empty objects inside of an object. */
export function clearEmpties(o: any) {
	// eslint-disable-next-line guard-for-in
	for (const k in o) {
		if (o[k] === undefined || o[k] === null || o[k] === '') {
			delete o[k];
		}
		if (typeof o[k] !== 'object') {
			continue; // If null or not an object, skip to the next iteration
		}
		if (o[k] instanceof Array) {
			o[k] = removeNulls(o[k]);
		}
		// The property is an object
		clearEmpties(o[k]); // <-- Make a recursive call on the nested object
		if (Object.keys(o[k]).length === 0) {
			delete o[k]; // The object had no properties, so delete that property
		}
	}
}

export function removeControlCharsInObject(obj: any) {
	const json = JSON.stringify(obj)
		.replaceAll('\\t', '')
		.replaceAll('\\n', '')
		.replaceAll('\\r', '');
	return JSON.parse(json);
}

// Compact arrays with null entries; delete keys from objects with null value
export function removeNulls<NObject>(obj: NObject): NObject {
	let obj2: any;
	if (obj instanceof Array) {
		obj2 = obj.filter(el => el !== null);
	} else {
		obj2 = obj;
	}
	for (const k in obj2) {
		if (typeof obj2[k] === 'object') {
			obj2[k] = removeNulls(obj2[k]);
		}
	}
	return obj2;
}

/** Converts a string to a regexp. What wouldn't we do without stackoverflow. */
export function regexFromString(string: string): RegExp {
	const match = /^\/(.*)\/([a-z]*)$/.exec(string);
	if (!match) return null; // invalid regexp string
	return new RegExp(match[1], match[2] || 'g');
}

/** Compares objects and removes any false items to compare better */
export function isLooselyEqual(objA: any, objB: any) {
	for (const key of Object.keys(objA)) {
		if (objA[key] === false) delete objA[key];
	}
	for (const key of Object.keys(objB)) {
		if (objB[key] === false) delete objB[key];
	}
	return isEqual(objA, objB);
}
