import { Server } from 'http';
import { Server as SocketServer,Socket } from 'socket.io';
import Transport from 'winston-transport';

import { APIData } from '../types/api';

let ws: SocketIOApp;

export function emitWS(type: string, data?: any) {
	if (ws) ws.emit(type, data);
}

export function initWS(server: Server) {
	ws = new SocketIOApp(server);
	return ws;
}

interface SocketController {
	(socket: Socket, data: APIData): Promise<any>
}

interface SocketEventReceiver {
	(socket: Socket): any
}

export class SocketIOApp {
	ws: SocketServer
	routes: Record<string, SocketController[]>
	disconnectHandlers: SocketController[]
	connectHandlers: SocketEventReceiver[]

	constructor(server: Server) {
		this.ws = new SocketServer(server);
		this.routes = {};
		this.disconnectHandlers = [];
		this.connectHandlers = [];
		this.ws.use((socket, next) => {
			this.connectionHandler(socket);
			next();
		});
	}

	private connectionHandler(socket: Socket) {
		this.disconnectHandlers.forEach(fn => {
			socket.on('disconnect', fn);
		});
		this.connectHandlers.forEach(fn => {
			fn(socket);
		});
		socket.onAny(async (event: string, data: any, ack: (data: any) => void) => {
			if (Array.isArray(this.routes[event])) {
				const middlewares = this.routes[event];
				// Dispatch through middlewares
				let i = 0;
				for (const fn of middlewares) {
					if (i === (middlewares.length - 1)) {
						// Last function, ack with his result
						try {
							ack({err: false, data: await fn(socket, data)});
						} catch (err) {
							ack({err: true, data: err});
						}
						break;
					} else {
						// If not, just call it
						try {
							await fn(socket, data);
						} catch (err) {
							// Middlewares can throw errors, in which cases we must stop code execution and send error back to user
							ack({err: true, data: err});
							break;
						}
					}
					i++;
				}
			}
		});
	}

	route(name: string, ...handlers: SocketController[]) {
		this.routes[name] = handlers;
	}

	emit(type: string, data: any) {
		this.ws.sockets.emit(type, data);
	}

	onDisconnect(fn: SocketController) {
		this.disconnectHandlers.push(fn);
	}

	onConnect(fn: SocketEventReceiver) {
		this.connectHandlers.push(fn);
	}
}

export class WSTransport extends Transport {
	constructor(opts: any) {
		super(opts);
		this.nsp = ws.ws.of(`/${opts.namespace}`);
	}

	// nsp: Namespace // Namespace is no longer exported https://github.com/socketio/socket.io/issues/3677
	nsp: any

	log(info: any, callback: any) {
		if (this.nsp) this.nsp.emit('log', info);
		callback();
	}
}

/* Code to emit websockets in rooms. It could be used to instanciate KM Frontends.

export function emitWSRoom(room: string, type: string, data: any) {
	getWS().sockets.in(room).emit(type, data);
}

getWS().sockets.on('connection', function(socket: any) {
	socket.on('room', (room: string) => {
		socket.join(room);
	});
});

*/
