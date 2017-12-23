import * as http from 'http';
import * as https from 'https';
import { Server, ServerSocket } from 'binary-ws';
import { BaseSocketConfig } from 'binary-ws/bin/BaseSocket/interfaces/BaseSocketConfig';

import { ConnectedModule } from './ConnectedModule';

export abstract class RemoteInvokeRouter extends Server {

    /**
     * 与路由器连接的模块    
     * key 接口连接的模块名称
     */
    readonly connectedModules: Map<string, ConnectedModule> = new Map();

    /**
     * 消息path的最大长度
     */
    readonly pathMaxLength = 256;

    /**
     * 响应超时，默认3分钟
     */
    readonly timeout = 3 * 60 * 1000;

    /**
     * 是否打印收到和发出的消息头部（用于调试）
     */
    printMessageHeader = false;

    /**
     * 是否将发生的错误打印到控制台（用于调试）
     */
    printError = false;




    
    constructor(server: http.Server | https.Server, configs: BaseSocketConfig) {
        super(server, configs);

        this.on("connection", (socket, req) => {
            const result = this.onConnection(socket, req);

            if (result === false)
                socket.close();
            else {
                let module = this.connectedModules.get(result);
                if (module) { //不允许一个模块重复连接
                    module.addErrorNumber();
                    socket.close();
                } else {
                    module = new ConnectedModule(this, socket, result);
                    this.connectedModules.set(result, module);
                    module.once('close', () => { this.connectedModules.delete(result) });
                }
            }
        });
    }

    /**
     * 每当有一个新的连接被创建，该方法就会被触发。返回false表示拒绝连接，返回string表示接受连接。此字符串代表该接口所连接模块的名称
     * @param socket websocket
     * @param req 客户端向路由器建立连接时发送的get请求
     */
    abstract onConnection(socket: ServerSocket, req: http.IncomingMessage): false | string;

    /**
     * 为某连接添加可调用白名单
     * @param moduleName 模块名称
     * @param invokableModuleName 可调用的模块名称
     * @param namespace 允许其访问的命名空间
     */
    addInvokableWhiteList(moduleName: string, invokableModuleName: string, namespace: string) {
        const module = this.connectedSockets.get(moduleName);
        if (module) module.addInvokableWhiteList(invokableModuleName, namespace);
    }

    /**
     * 为某连接删除可调用白名单
     * @param moduleName 模块名称
     * @param notInvokableModuleName 不允许调用的模块名称
     * @param namespace 不允许其访问的命名空间
     */
    removeInvokableWhiteList(moduleName: string, notInvokableModuleName: string, namespace: string) {
        const module = this.connectedSockets.get(moduleName);
        if (module) module.removeInvokableWhiteList(notInvokableModuleName, namespace);
    }

    /**
     * 为某连接添加可接收广播白名单
     * @param moduleName 模块名称
     * @param receivableModuleName 可接收广播的模块名
     * @param namespace 可接收的广播命名空间
     */
    addReceivableWhiteList(moduleName: string, receivableModuleName: string, namespace: string) {
        const module = this.connectedSockets.get(moduleName);
        if (module) module.addReceivableBroadcastWhiteList(receivableModuleName, namespace);
    }

    /**
     * 为某连接删除可接收广播白名单
     * @param moduleName 模块名称
     * @param notReceivableModuleName 不可接收广播的模块名
     * @param namespace 不可接收的广播命名空间
     */
    removeReceivableWhiteList(moduleName: string, notReceivableModuleName: string, namespace: string) {
        const module = this.connectedSockets.get(moduleName);
        if (module) module.removeReceivableBroadcastWhiteList(notReceivableModuleName, namespace);
    }
}