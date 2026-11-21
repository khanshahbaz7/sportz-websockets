import { WebSocket, WebSocketServer } from "ws";
import { wsArcjet } from "../arcject.js";

function sendJSON(socket, payload){
    if(socket.readyState !== WebSocket.OPEN) return;

    socket.send(JSON.stringify(payload));
}

function broadcast(wss, payload){
    for(const client of wss.clients){
        if(client.readyState !== WebSocket.OPEN) continue;

        client.send(JSON.stringify(payload));
    }
}

// export function attachWebSocketServer(server){
//     const wss = new WebSocketServer({server, path : '/ws', maxPayload : 1024 * 1024});

//     wss.on('connection', (socket) => {
//         sendJSON(socket, {type : 'welcome'});

//         socket.on('error', console.error);
//     });

//     function broadcastMatchCreated(match){
//         broadcast(wss, {type: 'match', data : match});
//     }

//     return {broadcastMatchCreated}
// }

function rejectUpgrade(socket, statusCode, statusText, message) {
    if (socket.destroyed) return;

    const body = message;
    socket.write(
        `HTTP/1.1 ${statusCode} ${statusText}\r\n` +
        "Connection: close\r\n" +
        "Content-Type: text/plain; charset=utf-8\r\n" +
        `Content-Length: ${Buffer.byteLength(body)}\r\n` +
        "\r\n" +
        body
    );
    socket.destroy();
}

export function attachWebSocketServer(server) {
    // noServer is required because the upgrade handler below is responsible
    // for validating the request before the WebSocket handshake.
    const wss = new WebSocketServer({noServer: true, path : "/ws", maxPayload: 1024 * 1024});

    server.on('upgrade', async (req, socket, head) => {
        if (!wss.shouldHandle(req)) {
            rejectUpgrade(socket, 404, 'Not Found', 'Not Found');
            return;
        }

        if(wsArcjet){
            try {
                const decision = await wsArcjet.protect(req);

                if(decision.isDenied()){
                    if(decision.reason.isRateLimit()){
                        rejectUpgrade(socket, 429, 'Too Many Requests', 'Rate limit exceeded');
                    } else {
                        rejectUpgrade(socket, 403, 'Forbidden', 'Access denied');
                    }
                    return;
                }
            } catch (e) {
                console.error('WS upgrade protection error', e);
                rejectUpgrade(socket, 503, 'Service Unavailable', 'Service unavailable');
                return;
            }
        }

        wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit('connection', ws, req);
        });
    });

    wss.on('connection', (socket) => {
        socket.isAlive = true;
        socket.on('pong', () => {
            socket.isAlive = true;
        });

        sendJSON(socket, {type : 'welcome'});
        socket.on('error', console.error);
    });

    const interval = setInterval(() => {
        wss.clients.forEach((ws) => {
            if(ws.isAlive === false) return ws.terminate();
            ws.isAlive = false;
            ws.ping();
        })
    }, 30000);

    wss.on('close', () => clearInterval(interval));

    function broadcastMatchCreated(match) {
        broadcast(wss, {type : 'match_created', data : match})
    }

    return {broadcastMatchCreated};
}


