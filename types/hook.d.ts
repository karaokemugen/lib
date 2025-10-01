import { DBTag } from './database/tag.js';
import { TagAndType, TagTypeNum } from './tag.js';

export interface HookFile {
	header: {
		description: string;
		version: number;
	};
	hook: Hook;
}

export interface Hook {
	name: string;
	repository: string;
	appliesTo?: 'kara' | 'tag' | 'all';
	conditions: HookConditions;
	conditionsType: 'and' | 'or';
	actions: HookActions;
	error?: boolean;
}

interface HookResult {
	addedTags?: DBTag[];
	removedTags?: DBTag[];
	fromDisplayTypeChange?: TagTypeNum;
}

interface HookActions {
	addTag?: TagAndType[];
	removeTag?: TagAndType[];
	addTitleAlias?: any;
	changeFromDisplayType?: TagTypeNum;
}

interface HookConditions {
	tagPresence?: string[];
	tagAbsence?: string[];
	duration?: string;
	year?: string;
	tagNumber?: any;
	tagNumberInverse?: any;
	mediaFileRegexp?: string;
	titlesContain?: any;
}
