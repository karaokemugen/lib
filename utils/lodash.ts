import { cloneDeep } from "lodash";

// Customizer for lodash mergeWith: Replace arrays with new state instead of merging them wildly
export function mergeWithReplaceArray(_value: unknown, srcValue: unknown) {
	return Array.isArray(srcValue) ? cloneDeep(srcValue) : undefined;
}