import { MessageType } from "remote-invoke";
import { BaseSocket } from "binary-ws/bin/BaseSocket/classes/BaseSocket";
import log from 'log-formatter';
import { EventSpace } from "eventspace/bin/classes/EventSpace";

import { RemoteInvokeRouter } from "./RemoteInvokeRouter";
import { BroadcastOpenMessage } from "remote-invoke/bin/classes/MessageData";

/**
 * 与路由器连接上的模块      
 * 
 * 功能：
 * 1. 负责接收与发送消息
 * 2. 管理调用与广播白名单
 * 3. 当广播白名单以及连接的模块申请监听的广播发生变化，该类负责在BroadcastExchangeCenter增加以及删除监听器。
 * 4. 当在BroadcastExchangeCenter中其他模块监听关于该模块的广播发生变化时，该类负责通知模块打开或关闭广播。
 * 5. 当类创建时，查看有哪些关于该模块的广播已在BroadcastExchangeCenter中被监听，如果有则通知模块打开。
 * 6. 统计运行过程中发生的错误次数，超过指定次数则关闭接口。
 */
export class ConnectedModule {

    private readonly _router: RemoteInvokeRouter;   //路由器
    private readonly _socket: BaseSocket;           //所连接的接口

    private _errorTimer: NodeJS.Timer;              //errorNumber 错误清零计时器
    private _errorNumber: number = 0;               //在转发该接口消息的过程中发生了多少次错误

    private readonly _broadcastOpenTimer: Map<number, NodeJS.Timer> = new Map();    //保存关于当前接口的broadcast_open_finish的响应超时计时器。key:_broadcastOpenCloseIndex
    private _broadcastOpenIndex: number = 0;        //发送broadcast_open所需的messageID

    private readonly _openedBroadcastPath = new EventSpace();   //明确告知模块不要再发送的广播路径

    /**
     * 连接对应的模块名称    
     */
    readonly moduleName: string;

    /**
     * 该模块可调用其他模块的白名单列表。      
     * [其他模块的名称,命名空间]    
     */
    readonly invokableWhiteList = new EventSpace();

    /**
     * 该模块可以接收的广播白名单     
     * [其他模块的名称,命名空间]    
     */
    readonly receivableBroadcastWhiteList = new EventSpace();

    constructor(router: RemoteInvokeRouter, socket: BaseSocket, moduleName: string) {
        this._router = router;
        this._socket = socket;
        this.moduleName = moduleName;

        this._socket.once("close", () => {
            this.emit('close');

            clearTimeout(this._errorTimer);
            this._broadcastOpenTimer.forEach(value => clearInterval(value));   //清除所有计时器
        });

        this._socket.on("message", (title, data) => {

        });
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
                    .content.cyan('remote-invoke-router', this.moduleName, '发送', JSON.stringify(result, undefined, 4));
            else
                log
                    .location
                    .location.bold
                    .text.green.bold.round
                    .content.green('remote-invoke-router', this.moduleName, '收到', JSON.stringify(result, undefined, 4));
        }
    }

    /**
     * 错误计数器 + 1
     * @param err 传递一个错误用于打印
     */
    addErrorNumber(err?: Error) {
        this._errorNumber++;

        if (this._errorNumber === 1)
            this._errorTimer = setTimeout(() => { this._errorNumber = 0 }, 10 * 60 * 1000);
        else if (this._errorNumber > 50)
            this.close();

        if (this._router.printError && err) {   //打印错误
            log.warn
                .location.white
                .location.bold
                .content.yellow('remote-invoke-router', this.moduleName, err);
        }
    }

    /**
     * 断开连接
     */
    close() {
        this._socket.close();
    }

    /**
     * 向该接口发送数据
     * @param data 消息数据，第一个是消息头部，第二个是消息body
     */
    sendData = (data: [string, Buffer]) => {
        this._socket.send(data[0], data[1]).catch(() => { });
        this._printMessage(true, data[0]);
    }

    /**
     * 通知模块打开某条路径上的广播
     */
    openBroadcastPath(path: string) {
        this._closedBroadcastPath.cancelDescendants(path);  //删除之前明确关闭的

        const msg = new BroadcastOpenMessage();
        msg.broadcastSender = this.moduleName;
        msg.messageID = this._broadcastOpenIndex++;
        msg.path = path;

        const result = msg.pack();

        let fallNumber = 0; //记录请求打开失败多少次了

        this._broadcastOpenTimer.set(msg.messageID, setInterval(() => {
            this.sendData(result);
            if (fallNumber++ >= 3) this.close();
        }, this._router.timeout));
    }

    /**
     * 通知模块关闭某条路径上的广播
     */
    closeBroadcastPath(path: string) {

    }

    /**
     * 为该模块添加可调用白名单
     */
    addInvokableWhiteList(moduleName: string, namespace: string) {
        if (moduleName === this.moduleName)
            throw new Error(`模块：${moduleName}。自己不可以调用自己的方法`);

        const en = [moduleName, namespace];

        if (!this.invokableWhiteList.has(en)) {
            this.invokableWhiteList.receive(en, true as any);
            this.emit('addInvokableWhiteList', en);
        }
    }

    /**
     * 删除某项可调用白名单
     */
    removeInvokableWhiteList(moduleName: string, namespace: string) {
        const en = [moduleName, namespace];

        if (this.invokableWhiteList.has(en)) {
            this.invokableWhiteList.cancel(en);
            this.emit('removeInvokableWhiteList', en);
        }
    }

    /**
     * 添加可接收广播白名单
     */
    addReceivableBroadcastWhiteList(moduleName: string, namespace: string) {
        if (moduleName === this.moduleName)
            throw new Error(`模块：${moduleName}。自己不可以监听自己的广播`);

        const en = [moduleName, namespace];

        if (!this.receivableBroadcastWhiteList.has(en)) {
            this.receivableBroadcastWhiteList.receive(en, true as any);
            this.emit('addReceivableBroadcastWhiteList', en);
        }
    }

    /**
     * 删除某项可接收广播白名单
     */
    removeReceivableBroadcastWhiteList(moduleName: string, namespace: string) {
        const en = [moduleName, namespace];

        if (this.receivableBroadcastWhiteList.has(en)) {
            this.receivableBroadcastWhiteList.cancel(en);
            this.emit('removeReceivableBroadcastWhiteList', en);
        }
    }
}