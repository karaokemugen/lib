import { v4 as uuidV4} from 'uuid';

import { TaskItem } from '../types/taskItem';
import {emitWS} from './ws';

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
		this._updateList();
	}

	incr = () => {
		this.item.value = +this.item.value + 1;
		tasks.set(this.item.uuid, this.item);
		this._updatePercentage();
		this._updateList();
	}

	update = (task: TaskItem) => {
		this.item.text = task.text !== undefined
			? task.text
			: this.item.text;
		this.item.subtext = task.subtext !== undefined
			? task.subtext
			: this.item.subtext;
		this.item.value = task.value !== undefined
			? task.value
			: this.item.value;
		this.item.total = task.total !== undefined
			? task.total
			: this.item.total;
		if (this.item.value || this.item.total) this._updatePercentage();
		tasks.set(this.item.uuid, this.item);
		this._updateList();
	}

	end = () => {
		tasks.delete(this.item.uuid);
		this._updateList();
	}

	_updateList = () => {
		emitWS('tasksUpdated', Object.fromEntries(tasks));
	}

	_updatePercentage = () => {
		this.item.percentage = Math.floor((this.item.value / this.item.total) * 100);
	}
}
