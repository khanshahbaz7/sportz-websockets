import { WebSocket, WebSocketServer } from "ws";
import { wsArcjet } from "../arcjet.js";

const matchSubscribers = new Map();

function subscribe(matchId, socket){
    if(!matchSubscribers.has(matchId)){
        matchSubscribers.set(matchId, new Set())
    }

    matchSubscribers.get(matchId).add(socket);
}

function unsubscribe(matchId, socket){
    const subscribers = matchSubscribers.get(matchId);

    if(!subscribers) return;

    subscribers.delete(socket);

    if(subscribers.size === 0){
        matchSubscribers.delete(matchId);
    }
}

function cleanupSubscriptions(socket){
    for(const matchId of socket.subscriptions){
        unsubscribe(matchId, socket);
    }
}

function sendJSON(socket, payload){
    if(socket.readyState !== WebSocket.OPEN) return;

    socket.send(JSON.stringify(payload));
}

function broadcastToAll(wss, payload){
    for(const client of wss.clients){
        if(client.readyState !== WebSocket.OPEN) continue;

        client.send(JSON.stringify(payload));
    }
}

function broadcastToMatch(matchId, payload){
    const subscribers = matchSubscribers.get(matchId);
    if(!subscribers || subscribers.size === 0) return;

    const message = JSON.stringify(payload);

    for(const client of subscribers){
        if(client.readyState === WebSocket.OPEN){
            client.send(message);
        }
    }
}

function handleMessage(socket, data){
    let message;

    try {
        message = JSON.parse(data.toString());
    } catch {
        sendJSON(socket, {type: 'error', message : 'Invalid JSON'})
        return;
    }

    if(message?.type === "subscribe" && Number.isInteger(message.matchId)){
        subscribe(message.matchId, socket);
        socket.subscriptions.add(message.matchId);
        sendJSON(socket, {type: 'subscribed', matchId: message.matchId});
        return;
    }

    if(message?.type === "unsubscribe" && Number.isInteger(message.matchId)){
        unsubscribe(message.matchId, socket);
        socket.subscriptions.delete(message.matchId);
        sendJSON(socket, {type: 'unsubscribed', matchId: message.matchId});
    }
}

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

        socket.subscriptions = new Set(); 

        sendJSON(socket, {type : 'welcome'});

        socket.on('message', (data) => {
            handleMessage(socket, data);
        });

        socket.on('error', ()  => {
            socket.terminate();
        })

        socket.on('close', () => {
            cleanupSubscriptions(socket);
        })

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
        broadcastToAll(wss, {type : 'match_created', data : match})
    }

    function broadcastCommentary(matchId, comment){
        broadcastToMatch(matchId, {type : 'commentary', data : comment});
    }

    function broadcastMatchUpdate(matchId, payload = {}){
        broadcastToMatch(matchId, {
            type : 'match_updated',
            data : payload.data ?? payload,
            changes : payload.changes ?? [],
            source : payload.source ?? null,
        });
    }

    return {broadcastMatchCreated, broadcastCommentary, broadcastMatchUpdate};
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

