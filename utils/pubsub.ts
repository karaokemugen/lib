/** Event bus, using pub/sub methods. */

import { EventEmitter } from 'events';

const eventEmitter = new EventEmitter();

export function emit(typeEvent: string, ...data: any) {
	return eventEmitter.emit(typeEvent, data);
}

export function on(typeEvent: string, listenerFunc: any) {
	return eventEmitter.on(typeEvent, listenerFunc);
}
export function once(typeEvent: string, listenerFunc: any) {
	return eventEmitter.once(typeEvent, listenerFunc);
}
