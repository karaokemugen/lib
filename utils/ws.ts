import { EventEmitter } from 'events';
import { IncomingHttpHeaders, Server } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import Transport from 'winston-transport';

import { isShutdownInProgress } from '../../components/engine.js';
import { APIData } from '../types/api.js';
import { ExtractBodyType, ExtractResponseType, WSCmdDefinition } from '../types/frontend.js';
import { OldJWTToken } from '../types/user.js';

let ws: SocketIOApp;

export function emitWS(type: string, data?: any, room?: 'logs' | 'admin') {
	if (isShutdownInProgress()) return;
	if (ws) ws.message(type, data, room);
}

export function initWS(server: Server) {
	ws = new SocketIOApp(server);
	return ws;
}

export function getWS() {
	return ws;
}

interface SocketController<D = any, T = OldJWTToken, R = any> {
	(socket: Socket, data: APIData<D, T>): Promise<R>;
}

export class SocketIOApp<T = OldJWTToken> extends EventEmitter {
	ws: SocketServer;

	routes: Record<string, SocketController<any, T, any>[]>;

	constructor(server: Server) {
		super();
		this.ws = new SocketServer(server, {
			maxHttpBufferSize: 1e10,
			perMessageDeflate: {
				threshold: 32768,
			},
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
				if (i === middlewares.length - 1) {
					// Last function, ack with his result
					try {
						return { err: false, data: await fn(socket, data) };
					} catch (err) {
						return { err: true, data: err };
					}
				} else {
					// If not, just call it
					try {
						await fn(socket, data);
					} catch (err) {
						// Middlewares can throw errors, in which cases we must stop code execution and send error back to user
						return { err: true, data: err };
					}
				}
				i += 1;
			}
		} else {
			return {
				err: true,
				data: { code: 404, message: { code: 'UNKNOWN_COMMAND' } },
			};
		}
	}

	private connectionHandler(socket: Socket) {
		socket.on('disconnect', reason => {
			this.emit('disconnect', socket, reason);
		});
		this.emit('connect', socket);
		socket.onAny(async (event: string, data: any, ack: (data: any) => void) => {
			if (ack) ack(await this.routeRequest(event, data, socket));
		});
	}

	async emulate(
		cmd: string,
		payload: APIData<any, T>,
		headers: IncomingHttpHeaders
	) {
		const socket = {
			handshake: {
				headers,
			},
		} as unknown as Socket;
		return this.routeRequest(cmd, payload, socket);
	}

	route<U extends WSCmdDefinition<object, any>>(name: U, ...handlers: SocketController<ExtractBodyType<U>, T, ExtractResponseType<U>>[]) {
		this.routes[name.value] = handlers;
	}

	message(type: string, data: any, room?: string) {
		if (!room) {
			this.ws.sockets.emit(type, data);
		} else {
			this.ws.to(room).emit(type, data);
		}
		this.emit('broadcast', { type, data, room });
	}
}

export class WSTransport extends Transport {
	constructor(opts: any) {
		super(opts);
		this.websocket = ws.ws;
	}

	websocket: SocketServer;

	log(info: any, callback: any) {
		if (this.websocket) this.websocket.to('logs').emit('log', info);
		callback();
	}
}