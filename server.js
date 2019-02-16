/**
 * Server using websockets and express supporting broadcase and echo
 * through use of subprotocols.
 */
"use strict";

const port = process.env.DBWEBB_PORT || 1338;

let users =[];

const express = require("express");
const cors = require('cors');

const http = require("http");
//const url = require("url");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({
    server: server,
    clientTracking: true, // keep track on connected clients,
    handleProtocols: handleProtocols // Manage what subprotocol to use.
});

const mongo = require("mongodb").MongoClient;

app.use(cors());

// Answer on all http requests
app.use(async (req, res) => {
    let log = await findInCollection();

    console.log(log);
    res.json(log);

});


/**
 * Select subprotocol to use for connection.
 *
 * @param {Array} protocols              Subprotocols to choose from, sent
 *                                        by client request.
 * @param {http.IncomingMessage} request The client HTTP GET request.
 *
 * @return {void}
 */
function handleProtocols(protocols /*, request */) {
    console.log(`Incoming protocol requests '${protocols}'.`);
    for (var i=0; i < protocols.length; i++) {
        if (protocols[i] === "text") {
            return "text";
        } else if (protocols[i] === "json") {
            return "json";
        }
    }
    return false;
}



/**
 * Broadcast data to everyone except one self (ws).
 *
 * @param {WebSocket} ws   The current websocket.
 * @param {string}    data The data to send.
 *
 * @return {void}
 */
function broadcastExcept(ws, data) {
    let clients = 0;

    wss.clients.forEach((client) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
            clients++;
            if (ws.protocol === "json") {
                let msg = {
                    timestamp: Date(),
                    nick: ws.nick,
                    data: data
                };

                client.send(JSON.stringify(msg));
            } else {
                client.send(data);
            }
        }
    });
    console.log(`Broadcasted data to ${clients} (${wss.clients.size}) clients.`);
}

async function saveToDb(timestamp, nickname, message) {
    const client  = await mongo.connect("mongodb://holmersson.se:27017/chat");
    const db = await client.db();
    const col = await db.collection("log");

    // await col.deleteMany();
    await col.insertOne(
        {
            "timestamp": timestamp,
            "nickname": nickname,
            "message": message
        }
    );

    await client.close();

    console.log("Message saved in database");
}

async function findInCollection() {
    const client  = await mongo.connect("mongodb://holmersson.se:27017/chat");
    const db = await client.db();
    const col = await db.collection("log");
    const res = await col.find().toArray();

    await client.close();

    return res;
}


// Setup for websocket requests.
// Docs: https://github.com/websockets/ws/blob/master/doc/ws.md
wss.on("connection", (ws, req) => {
    ws.nick = req.url.substring(1);
    console.log("Connection received. Adding client.");

    broadcastExcept(ws, `Joined chat.`);
    //console.log(ws);

    ws.on("message", (message) => {
        console.log("Received: %s", message);
        broadcastExcept(ws, message);
        saveToDb(Date(), ws.nick, message);
    });

    ws.on("error", (error) => {
        console.log(`Server error: ${error}`);
    });

    ws.on("close", (code, reason) => {
        console.log(`Closing connection: ${code} ${reason}`);
        broadcastExcept(ws, `Client disconnected (${wss.clients.size}).`);
    });
});



// Startup server
server.listen(port, () => {
    console.log(`Server is listening on ${port}`);
});
