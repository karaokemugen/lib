import { DBTag } from './database/tag.js';
import { TagAndType } from './tag.js';

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
	conditions: HookConditions;
	actions: HookActions;
	error?: boolean;
}

interface HookResult {
	addedTags?: DBTag[];
	removedTags?: DBTag[];
}

interface HookActions {
	addTag?: TagAndType[];
	removeTag?: TagAndType[];
	addTitleAlias?: any;
}

interface HookConditions {
	tagPresence?: string[];
	duration?: string;
	year?: string;
	tagNumber?: any;
	mediaFileRegexp?: string;
	titlesContain?: any;
}
