import { ServerSocket } from "binary-ws";
import { IncomingMessage } from "http";

import { RemoteInvokeRouter } from "../src/index";

export class TestRouter extends RemoteInvokeRouter {

    async onConnection(socket: ServerSocket, req: IncomingMessage) {
        return req.headers.name as any;
    }
}