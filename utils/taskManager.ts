import {emitWS} from './ws';
import { v4 as uuidV4} from 'uuid';

interface TaskItem {
	uuid?: string,
	text?: string,
	subtext?: string,
	value?: number,
	total?: number,
	percentage?: number,
}

let tasks: Map<string, TaskItem> = new Map();

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
		this.item.text = task.text || this.item.text;
		this.item.subtext = task.subtext || this.item.subtext;
		this.item.value = task.value || this.item.value;
		this.item.total = task.total || this.item.total;
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
