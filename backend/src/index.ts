import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import { Server } from 'socket.io';
dotenv.config();
declare global{ 
  namespace Express {
    interface Request {
       url ?:string,
       userId?:number
       roomId?:number
    }
}}
const PORT = process.env.PORT 
const WS_PORT = process.env.WS_PORT 
const CORS_ORIGIN = process.env.CORS_ORIGIN

const app = express();
const server = createServer(app);

const io = new Server(server, {
    cors: {
        origin: CORS_ORIGIN,
        credentials: true,
    }
});

app.use(express.json());
app.use(cookieParser());

app.use(cors({
    origin: CORS_ORIGIN,
    credentials: true,
    allowedHeaders: ["Content-Type"],
}));

import authrouter from './router/authRouter';
import projectRouter from './router/projectRouter';
import kanbanRouter from './router/kanbanRouter';
import pageRouter from './router/pageRouter';

app.use("/api/v1/auth", authrouter);
app.use("/api/v1/projects", projectRouter);
app.use("/api/v1/kanban", kanbanRouter);
app.use("/api/v1/pages", pageRouter);
import { handleSocketConnection } from './websocket/socketHandler';
import { setIO } from './helpers/socket';

setIO(io);
handleSocketConnection(io);

server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});

import { WebSocketServer } from 'ws';
//@ts-ignore
import { setupWSConnection, docs as yWebsocketDocs } from "y-websocket/bin/utils";
import * as Y from "yjs";

const wss = new WebSocketServer({ port: Number(WS_PORT) });

wss.on('connection', async function connection(conn, req) {
    const url = req.url || "";
    const room = parseInt(url.slice(1)) || 1;
    
    const response = await client.pageVersion.findFirst({
        where: { id: room }
    });
    
    if (!response || !response.uniqueString) {
        return;
    }
    
    setupWSConnection(conn, req, {
        docName: response.uniqueString,
        gc: true, 
    });
    
    conn.on('error', console.error);
    conn.send('something');
});

export { io };

import { Queue } from "bullmq";
import IORedis from "ioredis";
import client from './helpers/db';

const connection = new IORedis(process.env.REDIS_URL || "redis://127.0.0.1:6379", {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

const saveQueue = new Queue("saveDocsUpdate", { connection });
const saveAnathore=new Queue("saveDocs", { connection });

setInterval(() => {
    if (yWebsocketDocs && yWebsocketDocs.size > 0) {
        yWebsocketDocs.forEach(async (doc: Y.Doc, docName: string) => {
            const pageVersion = await client.pageVersion.findFirst({
                where: { uniqueString: docName }
            });
            if (pageVersion) {
                // const jsonStateUpdate=Y.encdoe
                let stateUpdate
                if(pageVersion.content){

                    stateUpdate=Y.encodeStateAsUpdate(doc,pageVersion.content);
                }
                else{
                    stateUpdate=Y.encodeStateAsUpdate(doc)
                }
                
                // const  changes=Y.encodeStateAsUpdate()
                if (stateUpdate.length > 2) {
                    await saveQueue.add("saveDocsUpdate", { 
                        key: pageVersion.id, 
                        content: stateUpdate,
                        pageVersionCount:pageVersion.count
                    });
                    console.log(pageVersion.count)
                    console.log("dadfasfdasfeafaef")
                    // console.log(`Added save job for room ${pageVersion.id}, size: ${stateUpdate.length} bytes`);
                }
            }
        });
    }
}, 3000);


setInterval(()=>{
     if (yWebsocketDocs && yWebsocketDocs.size > 0) {
        yWebsocketDocs.forEach(async (doc: Y.Doc, docName: string) => {
            const pageVersion = await client.pageVersion.findFirst({
                where: { uniqueString: docName },
                select:{content:true,id:true}
            });
            console.log("something")
            console.log(pageVersion)
            console.log(pageVersion?.content)
            if(!pageVersion){
                return;
            }
            console.log("something or another")
            if (pageVersion) {
                const stateUpdate = Y.encodeStateAsUpdate(doc);
                if (stateUpdate.length > 2) {
                    await saveAnathore.add("saveDocs", { 
                        content: stateUpdate,
                        pageVersionId:pageVersion.id
                    });
                    console.log("savvvvvvvvv")
                    console.log(`Added save job for room ${pageVersion.id}, size: ${stateUpdate.length} bytes`);
                }
            }
        });
    }
},10000);