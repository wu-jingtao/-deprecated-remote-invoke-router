import { MessageType, RemoteInvoke } from "remote-invoke";
import { BaseSocket } from "binary-ws/bin/BaseSocket/classes/BaseSocket";
import EventSpace from "eventspace";
import { BroadcastOpenMessage, InvokeFailedMessage, BroadcastCloseMessage, BroadcastOpenFinishMessage } from "remote-invoke/bin/classes/MessageData";

import { RemoteInvokeRouter } from "./RemoteInvokeRouter";
import { ErrorType } from './ErrorType';

/**
 * 与路由器连接上的模块      
 */
export class ConnectedModule {

    //#region 属性

    private readonly _router: RemoteInvokeRouter;   //路由器
    private readonly _socket: BaseSocket;           //所连接的接口

    private readonly _broadcastOpenTimer: Map<number, NodeJS.Timer> = new Map();    //保存关于当前接口的broadcast_open_finish的响应超时计时器。key:_broadcastOpenCloseIndex
    private _broadcastOpenIndex: number = 0;        //发送broadcast_open所需的messageID

    /**
     * 该模块可调用其他模块的白名单列表。      
     * [其他模块的名称,命名空间]    
     */
    private readonly _invokableWhiteList = new EventSpace();

    /**
     * 该模块可以接收的广播白名单     
     * [其他模块的名称,path] -> (addOrDelete) => { 根据addOrDelete判断是向broadcastExchangeCenter中删除还是添加监听器 }    
     */
    private readonly _receivableWhiteList = new EventSpace();

    /**
     * 该模块在广播交换中心中所在的层
     */
    private readonly _broadcastExchangeLayer: EventSpace<any>;

    /**
     * 连接对应的模块名称    
     */
    readonly moduleName: string;

    private _superUser: boolean = false;
    /**
     * 该模块是否作为超级用户，可调用或接收任何模块的方法与广播
     */
    get superUser() {
        return this._superUser;
    }
    set superUser(v: boolean) {
        if (this._superUser = v) {
            this._receivableWhiteList.triggerDescendants(true);
        } else {
            this._receivableWhiteList.children.forEach(module_layer => {
                module_layer.children.forEach(namespace_layer => {
                    namespace_layer.triggerDescendants(namespace_layer.data);
                });
            });
        }
    }

    //#endregion

    constructor(router: RemoteInvokeRouter, socket: BaseSocket, moduleName: string) {
        this._router = router;
        this._socket = socket;
        this.moduleName = moduleName;
        this._broadcastExchangeLayer = this._router.broadcastExchangeCenter.get([this.moduleName]);

        this._socket.once("close", () => {
            this._broadcastOpenTimer.forEach(value => clearInterval(value));   //清除所有计时器
            this._receivableWhiteList.triggerDescendants(false);    //取消所有广播监听器
            this._receivableWhiteList.children.clear();
            this._broadcastExchangeLayer.watchOff('descendantsAddListener');
            this._broadcastExchangeLayer.watchOff('descendantsRemoveListener');
        });

        this._socket.on("message", (title, data) => {
            try {
                const header = JSON.parse(title);
                this._router._emitReceivedMessage(header, data, this);

                switch (header[0]) {
                    case MessageType.invoke_request: {
                        if (header[1] === this.moduleName) {
                            const receiver = this._router.connectedModules.get(header[2]);
                            if (receiver) {
                                if (header[3].length <= RemoteInvoke.pathMaxLength) {
                                    if (this._superUser || this._invokableWhiteList.get([receiver.moduleName, header[3].split('/')[0]]).data) {    //判断是否有权访问目标模块的方法
                                        receiver._sendData([title, data]);
                                    } else {
                                        const msg = new InvokeFailedMessage();
                                        msg.sender = header[2];
                                        msg.receiver = header[1];
                                        msg.requestMessageID = header[4];
                                        msg.error = `router：没有权限调用模块"${header[2]}"的"${header[3]}"`;
                                        this._sendData(msg.pack());
                                    }
                                } else {
                                    this._router._emitExchangeError(ErrorType.exceedPathMaxLength, this);
                                }
                            } else {
                                const msg = new InvokeFailedMessage();
                                msg.sender = header[2];
                                msg.receiver = header[1];
                                msg.requestMessageID = header[4];
                                msg.error = `router：无法连接到模块"${header[2]}"`;
                                this._sendData(msg.pack());
                            }
                        } else {
                            this._router._emitExchangeError(ErrorType.senderNameNotCorrect, this);
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
                        if (header[1] === this.moduleName) {
                            const receiver = this._router.connectedModules.get(header[2]);
                            if (receiver) {
                                if (this._superUser ||
                                    receiver._superUser ||
                                    this._invokableWhiteList.get([receiver.moduleName]).forEachDescendants(layer => layer.data as any) ||
                                    receiver._invokableWhiteList.get([this.moduleName]).forEachDescendants(layer => layer.data as any)) {
                                    receiver._sendData([title, data]);
                                }
                            }
                        } else {
                            this._router._emitExchangeError(ErrorType.senderNameNotCorrect, this);
                        }

                        break;
                    }
                    case MessageType.broadcast: {
                        if (header[1] === this.moduleName) {
                            if (header[3].length <= RemoteInvoke.pathMaxLength) {
                                const layer = this._broadcastExchangeLayer.get(header[3].split('.'));
                                if (layer.hasAncestors()) {    //是否有人注册该广播
                                    layer.triggerAncestors([title, data, new Set()]);
                                } else {    //没有人注册过就通知以后不要再发了
                                    const msg = new BroadcastCloseMessage();
                                    msg.broadcastSender = header[1];
                                    msg.includeAncestor = true;
                                    msg.path = header[3];
                                    this._sendData(msg.pack());
                                }
                            } else {
                                this._router._emitExchangeError(ErrorType.exceedPathMaxLength, this);
                            }
                        } else {
                            this._router._emitExchangeError(ErrorType.senderNameNotCorrect, this);
                        }

                        break;
                    }
                    case MessageType.broadcast_open: {
                        const body = JSON.parse(data.toString());
                        if (body[2].length <= RemoteInvoke.pathMaxLength) {
                            const path = [body[1], ...body[2].split('.')];
                            const wl_layer = this._receivableWhiteList.get(path);

                            if (!wl_layer.has()) {   //确保不在白名单中重复注册
                                const listener = wl_layer.on((addOrDelete: boolean) => {
                                    if (addOrDelete)
                                        this._router.broadcastExchangeCenter.get(path).on(this._sendBroadcastData);
                                    else
                                        this._router.broadcastExchangeCenter.get(path).off(this._sendBroadcastData);
                                });

                                if (this._superUser || this._receivableWhiteList.get(path.slice(0, 2)).data) //如果该路径包含在白名单中，就立即去注册
                                    listener(true);
                            }

                            const msg = new BroadcastOpenFinishMessage();  //通知模块注册成功
                            msg.messageID = body[0];
                            this._sendData(msg.pack());
                        } else {
                            this._router._emitExchangeError(ErrorType.exceedPathMaxLength, this);
                        }

                        break;
                    }
                    case MessageType.broadcast_open_finish: {
                        const msgID = Number.parseInt(data.toString());
                        const timer = this._broadcastOpenTimer.get(msgID);
                        clearInterval(timer as any);
                        this._broadcastOpenTimer.delete(msgID);

                        break;
                    }
                    case MessageType.broadcast_close: {
                        const body = JSON.parse(data.toString());
                        if (body[1].length <= RemoteInvoke.pathMaxLength) {
                            const path = [body[0], ...body[1].split('.')];
                            const wl_layer = this._receivableWhiteList.get(path);

                            if (body[2]) {  //是否连同父级一起清理
                                wl_layer.triggerAncestors(false);
                                wl_layer.offAncestors();
                            } else {
                                wl_layer.trigger(false);
                                wl_layer.off();
                            }
                        } else {
                            this._router._emitExchangeError(ErrorType.exceedPathMaxLength, this);
                        }

                        break;
                    }
                    default: {
                        this._router._emitExchangeError(ErrorType.messageTypeError, this);
                        break;
                    }
                }
            } catch {
                this._router._emitExchangeError(ErrorType.messageFormatError, this);
            }
        });

        const send_bom = (layer: EventSpace<any>) => {  //向模块发送打开广播请求
            const msg = new BroadcastOpenMessage();
            msg.broadcastSender = this.moduleName;
            msg.messageID = this._broadcastOpenIndex++;
            msg.path = layer.fullName.slice(1).join('.');
            const result = msg.pack();

            let fallNumber = 0; //记录请求打开失败多少次了

            const send = () => {
                this._sendData(result);
                if (fallNumber++ >= 3) this.close();
            };

            this._broadcastOpenTimer.set(msg.messageID, setInterval(send, RemoteInvoke.timeout));

            send();
        };

        this._broadcastExchangeLayer.watch('descendantsAddListener', (listener, layer) => {
            if (layer.listenerCount === 1)   //说明需要打开新的广播path
                send_bom(layer);
        });

        this._broadcastExchangeLayer.watch('descendantsRemoveListener', (listener, layer) => {
            if (layer.listenerCount === 0) { //说明需要关闭某个广播path
                const msg = new BroadcastCloseMessage();
                msg.broadcastSender = this.moduleName;
                msg.path = layer.fullName.slice(1).join('.');
                this._sendData(msg.pack());
            }
        });

        this._broadcastExchangeLayer.forEachDescendants(layer => {  //检查有哪些广播已被注册了
            if (layer.listenerCount > 0)
                send_bom(layer);
        });
    }

    /**
     * 向该接口发送数据
     * @param data 消息数据，第一个是消息头部，第二个是消息body
     */
    private _sendData(data: [string, Buffer]) {
        this._socket.send(data[0], data[1]).catch(() => { });
        this._router._emitSentMessage(data[0], data[1], this);
    }

    /**
     * 专门用于发送广播。主要是用于避免重复发送
     */
    private _sendBroadcastData = (data: [string, Buffer, Set<ConnectedModule>]) => {
        if (!data[2].has(this)) {   //判断是否已经向该模块转发过了
            data[2].add(this);
            this._sendData(data as any);
        }
    }

    /**
     * 断开连接
     */
    close() {
        this._socket.close();
    }

    //#region 增减白名单

    /**
     * 添加可调用白名单
     */
    addInvokableWhiteList(moduleName: string, namespace: string) {
        if (moduleName === this.moduleName)
            throw new Error(`模块：${moduleName}。自己不可以调用自己的方法`);

        this._invokableWhiteList.get([moduleName, namespace]).data = true;
    }

    /**
     * 删除可调用白名单
     */
    removeInvokableWhiteList(moduleName: string, namespace: string) {
        this._invokableWhiteList.get([moduleName, namespace]).data = undefined;
    }

    /**
     * 添加可接收广播白名单
     */
    addReceivableWhiteList(moduleName: string, namespace: string) {
        if (moduleName === this.moduleName)
            throw new Error(`模块：${moduleName}。自己不可以监听自己的广播`);

        const layer = this._receivableWhiteList.get([moduleName, namespace]);
        layer.data = true;
        if (!this._superUser) layer.triggerDescendants(true); //通知可以去broadcastExchangeCenter中注册监听器了
    }

    /**
     * 删除某项可接收广播白名单
     */
    removeReceivableWhiteList(moduleName: string, namespace: string) {
        const layer = this._receivableWhiteList.get([moduleName, namespace]);
        layer.data = undefined;
        if (!this._superUser) layer.triggerDescendants(false); //通知去broadcastExchangeCenter中删除监听器
    }

    //#endregion
}