import { Dictionary } from 'lodash';
import isEqual from 'lodash.isequal';
import transform from 'lodash.transform';

/** Function to extract differences between objects. First argument is the new object, second is the defaults. */

export function sortJSON(obj: any): any {
	const objOrdered = {};
	Object.keys(obj).sort().forEach(key => {
		objOrdered[key] = obj[key];
	});
	return objOrdered;
}

export function difference(object: any, base: any): any {
	function changes(object: Dictionary<any>, base: Dictionary<any>) {
		return transform(object, (result, value, key) => {
			if (Array.isArray(value)) {
				if (!isEqual(value, base[key]))	result[key] = value;
			} else if (!isEqual(value, base[key])) {
				result[key] = (typeof value === 'object' && typeof base[key] === 'object')
					? changes(value, base[key])
					: value;
			}
		});
	}
	return changes(object, base);
}

/** Function to clear empty objects inside of an object. */
export function clearEmpties(o: any) {
	for (const k in o) {
		if (!o[k] || typeof o[k] !== 'object') {
			continue; // If null or not an object, skip to the next iteration
		}
		// The property is an object
		clearEmpties(o[k]); // <-- Make a recursive call on the nested object
		if (Object.keys(o[k]).length === 0) {
			delete o[k]; // The object had no properties, so delete that property
		}
	}
}

// Compact arrays with null entries; delete keys from objects with null value
export function removeNulls(obj: any){
	const isArray = obj instanceof Array;
	for (const k in obj){
		if (obj[k] === null && isArray) {
			obj.splice(k, 1);
		} else if (typeof obj[k] === 'object') removeNulls(obj[k]);
	}
}