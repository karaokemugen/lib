import { EventEmitter } from 'events';
import { IncomingHttpHeaders, Server } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import Transport from 'winston-transport';

import { APIData } from '../types/api';

let ws: SocketIOApp;

export function emitWS(type: string, data?: any) {
	if (ws) ws.message(type, data);
}

export function initWS(server: Server) {
	ws = new SocketIOApp(server);
	return ws;
}

export function getWS() {
	return ws;
}

interface SocketController {
	(socket: Socket, data: APIData): Promise<any>
}

export class SocketIOApp extends EventEmitter {
	ws: SocketServer
	routes: Record<string, SocketController[]>

	constructor(server: Server) {
		super();
		this.ws = new SocketServer(server, {
			maxHttpBufferSize: 1e10,
			perMessageDeflate: {
				threshold: 32768
			}
		});
		this.routes = {};
		this.ws.use((socket, next) => {
			this.connectionHandler(socket);
			next();
		});
	}

	protected async routeRequest(command: string, data: any, socket: Socket) {
		if (Array.isArray(this.routes[command])) {
			const middlewares = this.routes[command];
			// Dispatch through middlewares
			let i = 0;
			for (const fn of middlewares) {
				if (i === (middlewares.length - 1)) {
					// Last function, ack with his result
					try {
						return {err: false, data: await fn(socket, data)};
					} catch (err) {
						return {err: true, data: err};
					}
				} else {
					// If not, just call it
					try {
						await fn(socket, data);
					} catch (err) {
						// Middlewares can throw errors, in which cases we must stop code execution and send error back to user
						return {err: true, data: err};
					}
				}
				i++;
			}
		} else {
			return {err: true, data: {code: 404, message: {code: 'UNKNOWN_COMMAND'}}};
		}
	}

	private connectionHandler(socket: Socket) {
		socket.on('disconnect', () => {
			this.emit('disconnect', socket);
		});
		this.emit('connect', socket);
		socket.onAny(async (event: string, data: any, ack: (data: any) => void) => {
			ack(await this.routeRequest(event, data, socket));
		});
	}

	async emulate(cmd: string, payload: APIData, headers: IncomingHttpHeaders) {
		const socket = {
			handshake: {
				headers
			}
		} as unknown as Socket;
		return this.routeRequest(cmd, payload, socket);
	}

	route(name: string, ...handlers: SocketController[]) {
		this.routes[name] = handlers;
	}

	message(type: string, data: any) {
		this.ws.sockets.emit(type, data);
		this.emit('broadcast', {type, data});
	}
}

export class WSTransport extends Transport {
	constructor(opts: any) {
		super(opts);
		this.websocket = ws.ws;
	}

	websocket: SocketServer

	log(info: any, callback: any) {
		if (this.websocket) this.websocket.to('logs').emit('log', info);
		callback();
	}
}
