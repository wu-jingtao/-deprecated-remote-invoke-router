import { BaseSocket } from "binary-ws/bin/BaseSocket/classes/BaseSocket";
import { EventSpace } from "eventspace/bin/classes/EventSpace";
import { MessageType } from 'remote-invoke';
import { BroadcastOpenMessage, BroadcastCloseMessage, BroadcastOpenFinishMessage } from "remote-invoke/bin/classes/MessageData";
import log from 'log-formatter';

import { RemoteInvokeRouter } from "./RemoteInvokeRouter";

/**
 * 与路由器建立上连接的接口
 */
export class ConnectedSocket {




    /**
     * 有哪些模块要接收该模块的广播
     * [其他模块的名称,path字符串]
     * 
     * 触发时会传递一个Set对象，注册的监听器需要根据自己模块的_receivableBroadcastWhiteList来判断是否要把自己模块的名字添加到Set中
     */
    private readonly _broadcastReceiverList = new EventSpace();

    /**
     * 路由器明确告知模块不要再发送的广播列表。
     * [path字符串]
     */
    private readonly _forbiddenBroadcastList = new EventSpace();



    constructor(router: RemoteInvokeRouter, socket: BaseSocket, moduleName: string) {
     

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


}