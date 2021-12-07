import i18next from 'i18next';
import { debounce } from 'lodash';
import { v4 as uuidV4 } from 'uuid';

import { emitIPC } from '../../electron/electronLogger';
import { TaskItem } from '../types/taskItem';
import { emitWS } from './ws';

const tasks: Map<string, TaskItem> = new Map();

export default class Task {
	item: TaskItem;

	constructor(task: TaskItem) {
		this.item = task;
		task.total
			? this.item.percentage = 0
			: this.item.percentage = null;
		this.item.uuid = uuidV4();
		tasks.set(this.item.uuid, this.item);
		this.debounceUpdateList();
	}

	incr() {
		this.item.value = +this.item.value + 1;
		tasks.set(this.item.uuid, this.item);
		this.updatePercentage();
		this.debounceUpdateList();
	}

	update(task: TaskItem) {
		this.item.text = task.text !== undefined
			? task.text
			: this.item.text;
		this.item.subtext = task.subtext !== undefined
			? task.subtext
			: this.item.subtext;
		this.item.value = task.value !== undefined
			? task.value
			: this.item.value;
		this.item.data = task.data !== undefined
			? task.data
			: this.item.data;
		this.item.total = task.total !== undefined
			? task.total
			: this.item.total;
		if (this.item.value || this.item.total) this.updatePercentage();
		tasks.set(this.item.uuid, this.item);
		this.debounceUpdateList();
	}

	end() {
		tasks.delete(this.item.uuid);
		this.debounceUpdateList();
	}

	private updateList() {
		this.emit('tasksUpdated', Object.fromEntries(tasks));
	}

	private debounceUpdateList = debounce(this.updateList, 500, { maxWait: 1000, trailing: true });

	private updatePercentage() {
		this.item.percentage = Math.floor((this.item.value / this.item.total) * 100);
	}

	private emit(type: string, data: any) {
		emitWS(type, data);
		for (const key of Object.keys(data)) {
			data[key].subtext = i18next.t(data[key].subtext);
		}
		emitIPC(type, data);
	}
}
