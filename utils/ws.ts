import {listen} from 'socket.io';
import { Server } from 'http';

let ws: any;

export function emitWS(type: string, data?: any) {
	//logger.debug( '[WS] Sending message '+type+' : '+JSON.stringify(data));
	if (ws) ws.sockets.emit(type, data);
}

export function initWS(server: Server) {
	ws = listen(server);
}