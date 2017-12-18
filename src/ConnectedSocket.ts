import { BaseSocket } from "binary-ws/bin/BaseSocket/classes/BaseSocket";
import { EventSpace } from "eventspace/bin/classes/EventSpace";
import { MessageType } from 'remote-invoke';
import { BroadcastOpenMessage, BroadcastCloseMessage, BroadcastOpenFinishMessage, BroadcastCloseFinishMessage } from "remote-invoke/bin/classes/MessageData";
import log from 'log-formatter';

import { RemoteInvokeRouter } from "./RemoteInvokeRouter";

/**
 * 与路由器建立上连接的接口
 */
export class ConnectedSocket {

    /**
     * errorNumber 错误清零计时器
     */
    private _errorTimer: NodeJS.Timer;

    /**
     * 在转发该接口消息的过程中发生了多少次错误。
     */
    private _errorNumber: number = 0;

    /**
     * 路由器
     */
    private readonly _router: RemoteInvokeRouter;

    /**
     * 所连接的接口
     */
    private readonly _socket: BaseSocket;

    /**
     * 连接对应的模块名称    
     */
    private readonly _moduleName: string;

    /**
     * 该模块可调用其他模块的白名单列表。      
     * [其他模块的名称,命名空间]    
     */
    private readonly _invokableWhiteList = new EventSpace();

    /**
     * 该模块可以接收的广播白名单     
     * [其他模块的名称,命名空间]    
     */
    private readonly _receivableBroadcastWhiteList = new EventSpace();

    /**
     * 该模块现在正在接收的广播列表
     * [其他模块的名称,path字符串]
     */
    private readonly _broadcastReceivingList = new EventSpace();

    /**
     * 该模块想要接收但现在还没有权限接收的广播列表
     * [其他模块的名称,path字符串]
     */
    private readonly _broadcastNotReceivingList = new EventSpace();

    /**
     * 保存关于当前接口的broadcast_open_finish与broadcast_close_finish响应超时计时器
     * key:_broadcastOpenCloseIndex
     */
    private readonly _broadcastOpenCloseTimer: Map<number, NodeJS.Timer> = new Map();

    /**
     * 发送broadcast_open和broadcast_close所需的messageID
     */
    private _broadcastOpenCloseIndex: number = 0;

    constructor(router: RemoteInvokeRouter, socket: BaseSocket, moduleName: string) {
        this._router = router;
        this._socket = socket;
        this._moduleName = moduleName;

        socket.once('close', () => {
            this._router.connectedSockets.delete(this._moduleName);

            clearTimeout(this._errorTimer);

            this._broadcastOpenCloseTimer.forEach(value => clearInterval(value));   //清除所有计时器
        });

        socket.on("message", (title, data) => {
            try {
                const header = JSON.parse(title);
                this._printMessage(false, header);

                switch (header[0]) {
                    case MessageType.invoke_request: {
                        if (header[1] === this._moduleName) {   //验证发送者的名称是否正确
                            const receiver = this._router.connectedSockets.get(header[2]);
                            if (receiver) { //验证被调用模块是否存在
                                if (header[3].length <= 256) {  //检查path长度
                                    if (this._invokableWhiteList.has([receiver._moduleName, header[3].split('/')[0]])) {    //判断是否有权访问目标模块的方法
                                        receiver._sendData(title, data);
                                        return;
                                    }
                                }
                            }
                        }

                        break;
                    }
                    case MessageType.invoke_response:
                    case MessageType.invoke_finish:
                    case MessageType.invoke_failed:
                    case MessageType.invoke_file_request:
                    case MessageType.invoke_file_response:
                    case MessageType.invoke_file_failed:
                    case MessageType.invoke_file_finish: {
                        if (header[1] === this._moduleName) {
                            const receiver = this._router.connectedSockets.get(header[2]);
                            if (receiver) {
                                if (this._invokableWhiteList.has([receiver._moduleName]) || receiver._invokableWhiteList.has([this._moduleName])) {
                                    receiver._sendData(title, data);
                                    return;
                                }
                            }
                        }
                        
                        break;
                    }
                    case MessageType.broadcast: {
                        if (header[1] === this._moduleName) {
                            if (header[3].length <= 256) {
                                const en = [this._moduleName, ...header[3].split('.')];
                                let receiverNumber = 0;   //记录有多少模块监听了该广播

                                this._router.connectedSockets.forEach(socket => {
                                    if (socket._broadcastReceivingList.hasAncestors(en)) {
                                        receiverNumber++;
                                        socket._sendData(title, data);
                                    }
                                });

                                if (receiverNumber > 0)
                                    return;
                                else
                                    this._sendBroadcastCloseMessage(header[3]);
                            }
                        }

                        break;
                    }
                    case MessageType.broadcast_open: {
                        const body = JSON.parse(data.toString());
                        const en = [body[1], ...body[2].split('.')];

                        if (this._receivableBroadcastWhiteList.hasAncestors(en)) //判断有没有权限操作该广播
                            this._broadcastReceivingList.receive(en, true as any);
                        else    //如果没有就暂时存放到
                            this._broadcastNotReceivingList.cancel(en);

                        const msg = new BroadcastOpenFinishMessage();
                        msg.messageID = body[0];
                        const result = msg.pack();
                        this._sendData(result[0], result[1]);

                        return;
                    }
                    case MessageType.broadcast_open_finish: {
                        const timer = this._broadcastOpenCloseTimer.get(Number.parseInt(data.toString()));
                        if (timer) {
                            clearInterval(timer);
                            return;
                        }
                    }
                    case MessageType.broadcast_close: {
                        const body = JSON.parse(data.toString());
                        const en = [body[1], ...body[2].split('.')];

                        if (this._receivableBroadcastWhiteList.hasAncestors(en)) //判断有没有权限操作该广播
                            this._broadcastReceivingList.cancel(en);
                        else
                            this._broadcastNotReceivingList.receive(en, true as any);

                        const msg = new BroadcastCloseFinishMessage();
                        msg.messageID = body[0];
                        const result = msg.pack();
                        this._sendData(result[0], result[1]);

                        return;
                    }
                    case MessageType.broadcast_close_finish: {
                        const timer = this._broadcastOpenCloseTimer.get(Number.parseInt(data.toString()));
                        if (timer) {
                            clearInterval(timer);
                            return;
                        }
                    }
                }

                //上面的switch分支中，如果执行成功就直接return了，剩下的都是错误情况
                this.addErrorNumber();
            } catch {
                this.addErrorNumber();
            }
        });
    }

    /**
     * 向该接口发送数据
     */
    private _sendData(header: string, data: Buffer) {
        this._socket.send(header, data).catch(() => { });
        this._printMessage(true, header);
    }

    /**
     * 打印收到或发送的消息header
     * @param sendOrReceive 如果是发送则为true，如果是接收则为false
     * @param msg 要打印的内容
     */
    private _printMessage(sendOrReceive: boolean, header: any[] | string) {
        if (this._router.printMessageHeader) {
            if (!Array.isArray(header)) header = JSON.parse(header);

            const result = {
                type: MessageType[header[0]],
                sender: header[1],
                receiver: header[2],
                path: header[3]
            };

            if (sendOrReceive)
                log
                    .location
                    .location.bold
                    .text.cyan.bold.round
                    .content.cyan('remote-invoke-router', this._moduleName, '发送', JSON.stringify(result, undefined, 4));
            else
                log
                    .location
                    .location.bold
                    .text.green.bold.round
                    .content.green('remote-invoke-router', this._moduleName, '收到', JSON.stringify(result, undefined, 4));
        }
    }

    private _sendBroadcastOpenMessage(path: string) {
        const msg = new BroadcastOpenMessage();
        msg.broadcastSender = this._moduleName;
        msg.messageID = this._broadcastOpenCloseIndex++;
        msg.path = path;
        const result = msg.pack();

        let fallNumber = 0; //记录请求打开失败多少次了

        this._broadcastOpenCloseTimer.set(msg.messageID, setInterval(() => {
            this._sendData(result[0], result[1]);
            if (fallNumber++ > 3) this.close();
        }, 3 * 60 * 1000));
    }

    private _sendBroadcastCloseMessage(path: string) {
        const msg = new BroadcastCloseMessage();
        msg.broadcastSender = this._moduleName;
        msg.messageID = this._broadcastOpenCloseIndex++;
        msg.path = path;
        const result = msg.pack();

        let fallNumber = 0; //记录请求关闭失败多少次了

        this._broadcastOpenCloseTimer.set(msg.messageID, setInterval(() => {
            this._sendData(result[0], result[1]);
            if (fallNumber++ > 3) this.close();
        }, 3 * 60 * 1000));
    }

    /**
     * 错误计数器 + 1
     */
    addErrorNumber() {
        this._errorNumber++;

        if (this._errorNumber === 1)
            this._errorTimer = setTimeout(() => { this._errorNumber = 0 }, 10 * 60 * 1000);
        else if (this._errorNumber > 50)
            this.close();
    }

    /**
     * 断开连接
     */
    close() {
        this._socket.close();
    }

    /**
     * 为该模块添加可调用白名单
     */
    addInvokableWhiteList(moduleName: string, namespace: string) {
        if (moduleName === this._moduleName)
            throw new Error(`模块：${moduleName} 自己不可以调用自己`);

        this._invokableWhiteList.receive([moduleName, namespace], true as any);
    }

    /**
     * 删除某项可调用白名单
     */
    removeInvokableWhiteList(moduleName: string, namespace: string) {
        this._invokableWhiteList.cancel([moduleName, namespace]);
    }

    /**
     * 添加可接收广播白名单
     */
    addReceivableBroadcastWhiteList(moduleName: string, namespace: string) {
        if (moduleName === this._moduleName)
            throw new Error(`模块：${moduleName} 自己不可以监听自己的广播`);

        const en = [moduleName, namespace];
        this._receivableBroadcastWhiteList.receive(en, true as any);

        if (this._broadcastNotReceivingList.hasDescendants(en)) {   //判断之前是否申请注册过
            const src = this._broadcastNotReceivingList._eventLevel.getChildLevel(en, true);
            const dest = this._broadcastReceivingList._eventLevel.getChildLevel(en, true);

            (dest.receivers as any) = src.receivers;    //将之前注册过但不可接收的广播移动到可接收列表中
            (dest.children as any) = src.children;

            (src.receivers as any) = new Set();
            (src.children as any) = new Map();
        }
    }

    /**
     * 删除某项可接收广播白名单
     */
    removeReceivableBroadcastWhiteList(moduleName: string, namespace: string) {
        const en = [moduleName, namespace];
        this._receivableBroadcastWhiteList.cancel(en);

        if (this._broadcastReceivingList.hasDescendants(en)) {
            const src = this._broadcastReceivingList._eventLevel.getChildLevel(en, true);
            const dest = this._broadcastNotReceivingList._eventLevel.getChildLevel(en, true);

            (dest.receivers as any) = src.receivers;
            (dest.children as any) = src.children;

            (src.receivers as any) = new Set();
            (src.children as any) = new Map();
        }
    }
}