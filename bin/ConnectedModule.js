"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const remote_invoke_1 = require("remote-invoke");
const eventspace_1 = require("eventspace");
const MessageData_1 = require("remote-invoke/bin/classes/MessageData");
const ErrorType_1 = require("./ErrorType");
/**
 * 与路由器连接上的模块
 */
class ConnectedModule {
    //#endregion
    constructor(router, socket, moduleName) {
        this._broadcastOpenTimer = new Map(); //保存关于当前接口的broadcast_open_finish的响应超时计时器。key:_broadcastOpenCloseIndex
        this._broadcastOpenIndex = 0; //发送broadcast_open所需的messageID
        /**
         * 该模块可调用其他模块的白名单列表。
         * [其他模块的名称,命名空间]
         */
        this._invokableWhiteList = new eventspace_1.default();
        /**
         * 该模块可以接收的广播白名单
         * [其他模块的名称,path] -> (addOrDelete) => { 根据addOrDelete判断是向broadcastExchangeCenter中删除还是添加监听器 }
         */
        this._receivableWhiteList = new eventspace_1.default();
        /**
         * 专门用于发送广播。主要是用于避免重复发送
         */
        this._sendBroadcastData = (data) => {
            if (!data[2].has(this)) {
                data[2].add(this);
                this._sendData(data);
            }
        };
        this._router = router;
        this._socket = socket;
        this.moduleName = moduleName;
        this._broadcastExchangeLayer = this._router.broadcastExchangeCenter.get([this.moduleName]);
        this._socket.once("close", () => {
            this._broadcastOpenTimer.forEach(value => clearInterval(value)); //清除所有计时器
            this._receivableWhiteList.triggerDescendants(false); //取消所有广播监听器
            this._receivableWhiteList.children.clear();
            this._broadcastExchangeLayer.watchOff('descendantsAddListener');
            this._broadcastExchangeLayer.watchOff('descendantsRemoveListener');
        });
        this._socket.on("message", (title, data) => {
            try {
                const header = JSON.parse(title);
                this._router._emitReceivedMessage(header, data, this);
                switch (header[0]) {
                    case remote_invoke_1.MessageType.invoke_request: {
                        if (header[1] === this.moduleName) {
                            const receiver = this._router.connectedModules.get(header[2]);
                            if (receiver) {
                                if (header[3].length <= remote_invoke_1.RemoteInvoke.pathMaxLength) {
                                    if (this._invokableWhiteList.get([receiver.moduleName, header[3].split('/')[0]]).data) {
                                        receiver._sendData([title, data]);
                                    }
                                    else {
                                        const msg = new MessageData_1.InvokeFailedMessage();
                                        msg.sender = header[2];
                                        msg.receiver = header[1];
                                        msg.requestMessageID = header[4];
                                        msg.error = `router：没有权限调用模块"${header[2]}"的"${header[3]}"`;
                                        this._sendData(msg.pack());
                                    }
                                }
                                else {
                                    this._router._emitExchangeError(ErrorType_1.ErrorType.exceedPathMaxLength, this);
                                }
                            }
                            else {
                                const msg = new MessageData_1.InvokeFailedMessage();
                                msg.sender = header[2];
                                msg.receiver = header[1];
                                msg.requestMessageID = header[4];
                                msg.error = `router：无法连接到模块"${header[2]}"`;
                                this._sendData(msg.pack());
                            }
                        }
                        else {
                            this._router._emitExchangeError(ErrorType_1.ErrorType.senderNameNotCorrect, this);
                        }
                        break;
                    }
                    case remote_invoke_1.MessageType.invoke_response:
                    case remote_invoke_1.MessageType.invoke_finish:
                    case remote_invoke_1.MessageType.invoke_failed:
                    case remote_invoke_1.MessageType.invoke_file_request:
                    case remote_invoke_1.MessageType.invoke_file_response:
                    case remote_invoke_1.MessageType.invoke_file_failed:
                    case remote_invoke_1.MessageType.invoke_file_finish: {
                        if (header[1] === this.moduleName) {
                            const receiver = this._router.connectedModules.get(header[2]);
                            if (receiver) {
                                if (this._invokableWhiteList.get([receiver.moduleName]).forEachDescendants(layer => layer.data)
                                    || receiver._invokableWhiteList.get([this.moduleName]).forEachDescendants(layer => layer.data)) {
                                    receiver._sendData([title, data]);
                                }
                            }
                        }
                        else {
                            this._router._emitExchangeError(ErrorType_1.ErrorType.senderNameNotCorrect, this);
                        }
                        break;
                    }
                    case remote_invoke_1.MessageType.broadcast: {
                        if (header[1] === this.moduleName) {
                            if (header[3].length <= remote_invoke_1.RemoteInvoke.pathMaxLength) {
                                const layer = this._broadcastExchangeLayer.get(header[3].split('.'));
                                if (layer.hasAncestors()) {
                                    layer.triggerAncestors([title, data, new Set()]);
                                }
                                else {
                                    const msg = new MessageData_1.BroadcastCloseMessage();
                                    msg.broadcastSender = header[1];
                                    msg.includeAncestor = true;
                                    msg.path = header[3];
                                    this._sendData(msg.pack());
                                }
                            }
                            else {
                                this._router._emitExchangeError(ErrorType_1.ErrorType.exceedPathMaxLength, this);
                            }
                        }
                        else {
                            this._router._emitExchangeError(ErrorType_1.ErrorType.senderNameNotCorrect, this);
                        }
                        break;
                    }
                    case remote_invoke_1.MessageType.broadcast_open: {
                        const body = JSON.parse(data.toString());
                        if (body[2].length <= remote_invoke_1.RemoteInvoke.pathMaxLength) {
                            const path = [body[1], ...body[2].split('.')];
                            const wl_layer = this._receivableWhiteList.get(path);
                            if (!wl_layer.has()) {
                                const listener = wl_layer.on((addOrDelete) => {
                                    if (addOrDelete)
                                        this._router.broadcastExchangeCenter.get(path).on(this._sendBroadcastData);
                                    else
                                        this._router.broadcastExchangeCenter.get(path).off(this._sendBroadcastData);
                                });
                                if (this._receivableWhiteList.get(path.slice(0, 2)).data)
                                    listener(true);
                            }
                            const msg = new MessageData_1.BroadcastOpenFinishMessage(); //通知模块注册成功
                            msg.messageID = body[0];
                            this._sendData(msg.pack());
                        }
                        else {
                            this._router._emitExchangeError(ErrorType_1.ErrorType.exceedPathMaxLength, this);
                        }
                        break;
                    }
                    case remote_invoke_1.MessageType.broadcast_open_finish: {
                        const msgID = Number.parseInt(data.toString());
                        const timer = this._broadcastOpenTimer.get(msgID);
                        clearInterval(timer);
                        this._broadcastOpenTimer.delete(msgID);
                        break;
                    }
                    case remote_invoke_1.MessageType.broadcast_close: {
                        const body = JSON.parse(data.toString());
                        if (body[1].length <= remote_invoke_1.RemoteInvoke.pathMaxLength) {
                            const path = [body[0], ...body[1].split('.')];
                            const wl_layer = this._receivableWhiteList.get(path);
                            if (body[2]) {
                                wl_layer.triggerAncestors(false);
                                wl_layer.offAncestors();
                            }
                            else {
                                wl_layer.trigger(false);
                                wl_layer.off();
                            }
                        }
                        else {
                            this._router._emitExchangeError(ErrorType_1.ErrorType.exceedPathMaxLength, this);
                        }
                        break;
                    }
                    default: {
                        this._router._emitExchangeError(ErrorType_1.ErrorType.messageTypeError, this);
                        break;
                    }
                }
            }
            catch (_a) {
                this._router._emitExchangeError(ErrorType_1.ErrorType.messageFormatError, this);
            }
        });
        const send_bom = (layer) => {
            const msg = new MessageData_1.BroadcastOpenMessage();
            msg.broadcastSender = this.moduleName;
            msg.messageID = this._broadcastOpenIndex++;
            msg.path = layer.fullName.slice(1).join('.');
            const result = msg.pack();
            let fallNumber = 0; //记录请求打开失败多少次了
            const send = () => {
                this._sendData(result);
                if (fallNumber++ >= 3)
                    this.close();
            };
            this._broadcastOpenTimer.set(msg.messageID, setInterval(send, remote_invoke_1.RemoteInvoke.timeout));
            send();
        };
        this._broadcastExchangeLayer.watch('descendantsAddListener', (listener, layer) => {
            if (layer.listenerCount === 1)
                send_bom(layer);
        });
        this._broadcastExchangeLayer.watch('descendantsRemoveListener', (listener, layer) => {
            if (layer.listenerCount === 0) {
                const msg = new MessageData_1.BroadcastCloseMessage();
                msg.broadcastSender = this.moduleName;
                msg.path = layer.fullName.slice(1).join('.');
                this._sendData(msg.pack());
            }
        });
        this._broadcastExchangeLayer.forEachDescendants(layer => {
            if (layer.listenerCount > 0)
                send_bom(layer);
        });
    }
    /**
     * 向该接口发送数据
     * @param data 消息数据，第一个是消息头部，第二个是消息body
     */
    _sendData(data) {
        this._socket.send(data[0], data[1]).catch(() => { });
        this._router._emitSentMessage(data[0], data[1], this);
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
    addInvokableWhiteList(moduleName, namespace) {
        if (moduleName === this.moduleName)
            throw new Error(`模块：${moduleName}。自己不可以调用自己的方法`);
        this._invokableWhiteList.get([moduleName, namespace]).data = true;
    }
    /**
     * 删除可调用白名单
     */
    removeInvokableWhiteList(moduleName, namespace) {
        this._invokableWhiteList.get([moduleName, namespace]).data = undefined;
    }
    /**
     * 添加可接收广播白名单
     */
    addReceivableWhiteList(moduleName, namespace) {
        if (moduleName === this.moduleName)
            throw new Error(`模块：${moduleName}。自己不可以监听自己的广播`);
        const layer = this._receivableWhiteList.get([moduleName, namespace]);
        layer.data = true;
        layer.triggerDescendants(true); //通知可以去broadcastExchangeCenter中注册监听器了
    }
    /**
     * 删除某项可接收广播白名单
     */
    removeReceivableWhiteList(moduleName, namespace) {
        const layer = this._receivableWhiteList.get([moduleName, namespace]);
        layer.data = undefined;
        layer.triggerDescendants(false); //通知去broadcastExchangeCenter中删除监听器
    }
}
exports.ConnectedModule = ConnectedModule;

//# sourceMappingURL=data:application/json;charset=utf8;base64,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RDs7T0FFRztJQUNILHNCQUFzQixDQUFDLFVBQWtCLEVBQUUsU0FBaUI7UUFDeEQsRUFBRSxDQUFDLENBQUMsVUFBVSxLQUFLLElBQUksQ0FBQyxVQUFVLENBQUM7WUFDL0IsTUFBTSxJQUFJLEtBQUssQ0FBQyxNQUFNLFVBQVUsZUFBZSxDQUFDLENBQUM7UUFFckQsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixDQUFDLEdBQUcsQ0FBQyxDQUFDLFVBQVUsRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDO1FBQ3JFLEtBQUssQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDO1FBQ2xCLEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLHFDQUFxQztJQUN6RSxDQUFDO0lBRUQ7O09BRUc7SUFDSCx5QkFBeUIsQ0FBQyxVQUFrQixFQUFFLFNBQWlCO1FBQzNELE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxHQUFHLENBQUMsQ0FBQyxVQUFVLEVBQUUsU0FBUyxDQUFDLENBQUMsQ0FBQztRQUNyRSxLQUFLLENBQUMsSUFBSSxHQUFHLFNBQVMsQ0FBQztRQUN2QixLQUFLLENBQUMsa0JBQWtCLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxrQ0FBa0M7SUFDdkUsQ0FBQztDQUdKO0FBM1NELDBDQTJTQyIsImZpbGUiOiJDb25uZWN0ZWRNb2R1bGUuanMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBNZXNzYWdlVHlwZSwgUmVtb3RlSW52b2tlIH0gZnJvbSBcInJlbW90ZS1pbnZva2VcIjtcclxuaW1wb3J0IHsgQmFzZVNvY2tldCB9IGZyb20gXCJiaW5hcnktd3MvYmluL0Jhc2VTb2NrZXQvY2xhc3Nlcy9CYXNlU29ja2V0XCI7XHJcbmltcG9ydCBFdmVudFNwYWNlIGZyb20gXCJldmVudHNwYWNlXCI7XHJcbmltcG9ydCB7IEJyb2FkY2FzdE9wZW5NZXNzYWdlLCBJbnZva2VGYWlsZWRNZXNzYWdlLCBCcm9hZGNhc3RDbG9zZU1lc3NhZ2UsIEJyb2FkY2FzdE9wZW5GaW5pc2hNZXNzYWdlIH0gZnJvbSBcInJlbW90ZS1pbnZva2UvYmluL2NsYXNzZXMvTWVzc2FnZURhdGFcIjtcclxuXHJcbmltcG9ydCB7IFJlbW90ZUludm9rZVJvdXRlciB9IGZyb20gXCIuL1JlbW90ZUludm9rZVJvdXRlclwiO1xyXG5pbXBvcnQgeyBFcnJvclR5cGUgfSBmcm9tICcuL0Vycm9yVHlwZSc7XHJcblxyXG4vKipcclxuICog5LiO6Lev55Sx5Zmo6L+e5o6l5LiK55qE5qih5Z2XICAgICAgXHJcbiAqL1xyXG5leHBvcnQgY2xhc3MgQ29ubmVjdGVkTW9kdWxlIHtcclxuXHJcbiAgICAvLyNyZWdpb24g5bGe5oCnXHJcblxyXG4gICAgcHJpdmF0ZSByZWFkb25seSBfcm91dGVyOiBSZW1vdGVJbnZva2VSb3V0ZXI7ICAgLy/ot6/nlLHlmahcclxuICAgIHByaXZhdGUgcmVhZG9ubHkgX3NvY2tldDogQmFzZVNvY2tldDsgICAgICAgICAgIC8v5omA6L+e5o6l55qE5o6l5Y+jXHJcblxyXG4gICAgcHJpdmF0ZSByZWFkb25seSBfYnJvYWRjYXN0T3BlblRpbWVyOiBNYXA8bnVtYmVyLCBOb2RlSlMuVGltZXI+ID0gbmV3IE1hcCgpOyAgICAvL+S/neWtmOWFs+S6juW9k+WJjeaOpeWPo+eahGJyb2FkY2FzdF9vcGVuX2ZpbmlzaOeahOWTjeW6lOi2heaXtuiuoeaXtuWZqOOAgmtleTpfYnJvYWRjYXN0T3BlbkNsb3NlSW5kZXhcclxuICAgIHByaXZhdGUgX2Jyb2FkY2FzdE9wZW5JbmRleDogbnVtYmVyID0gMDsgICAgICAgIC8v5Y+R6YCBYnJvYWRjYXN0X29wZW7miYDpnIDnmoRtZXNzYWdlSURcclxuXHJcbiAgICAvKipcclxuICAgICAqIOivpeaooeWdl+WPr+iwg+eUqOWFtuS7luaooeWdl+eahOeZveWQjeWNleWIl+ihqOOAgiAgICAgIFxyXG4gICAgICogW+WFtuS7luaooeWdl+eahOWQjeensCzlkb3lkI3nqbrpl7RdICAgIFxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IF9pbnZva2FibGVXaGl0ZUxpc3QgPSBuZXcgRXZlbnRTcGFjZSgpO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICog6K+l5qih5Z2X5Y+v5Lul5o6l5pS255qE5bm/5pKt55m95ZCN5Y2VICAgICBcclxuICAgICAqIFvlhbbku5bmqKHlnZfnmoTlkI3np7AscGF0aF0gLT4gKGFkZE9yRGVsZXRlKSA9PiB7IOagueaNrmFkZE9yRGVsZXRl5Yik5pat5piv5ZCRYnJvYWRjYXN0RXhjaGFuZ2VDZW50ZXLkuK3liKDpmaTov5jmmK/mt7vliqDnm5HlkKzlmaggfSAgICBcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBfcmVjZWl2YWJsZVdoaXRlTGlzdCA9IG5ldyBFdmVudFNwYWNlKCk7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDor6XmqKHlnZflnKjlub/mkq3kuqTmjaLkuK3lv4PkuK3miYDlnKjnmoTlsYJcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBfYnJvYWRjYXN0RXhjaGFuZ2VMYXllcjogRXZlbnRTcGFjZTxhbnk+O1xyXG5cclxuICAgIC8qKlxyXG4gICAgICog6L+e5o6l5a+55bqU55qE5qih5Z2X5ZCN56ewICAgIFxyXG4gICAgICovXHJcbiAgICByZWFkb25seSBtb2R1bGVOYW1lOiBzdHJpbmc7XHJcblxyXG4gICAgLy8jZW5kcmVnaW9uXHJcblxyXG4gICAgY29uc3RydWN0b3Iocm91dGVyOiBSZW1vdGVJbnZva2VSb3V0ZXIsIHNvY2tldDogQmFzZVNvY2tldCwgbW9kdWxlTmFtZTogc3RyaW5nKSB7XHJcbiAgICAgICAgdGhpcy5fcm91dGVyID0gcm91dGVyO1xyXG4gICAgICAgIHRoaXMuX3NvY2tldCA9IHNvY2tldDtcclxuICAgICAgICB0aGlzLm1vZHVsZU5hbWUgPSBtb2R1bGVOYW1lO1xyXG4gICAgICAgIHRoaXMuX2Jyb2FkY2FzdEV4Y2hhbmdlTGF5ZXIgPSB0aGlzLl9yb3V0ZXIuYnJvYWRjYXN0RXhjaGFuZ2VDZW50ZXIuZ2V0KFt0aGlzLm1vZHVsZU5hbWVdKTtcclxuXHJcbiAgICAgICAgdGhpcy5fc29ja2V0Lm9uY2UoXCJjbG9zZVwiLCAoKSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMuX2Jyb2FkY2FzdE9wZW5UaW1lci5mb3JFYWNoKHZhbHVlID0+IGNsZWFySW50ZXJ2YWwodmFsdWUpKTsgICAvL+a4hemZpOaJgOacieiuoeaXtuWZqFxyXG4gICAgICAgICAgICB0aGlzLl9yZWNlaXZhYmxlV2hpdGVMaXN0LnRyaWdnZXJEZXNjZW5kYW50cyhmYWxzZSk7ICAgIC8v5Y+W5raI5omA5pyJ5bm/5pKt55uR5ZCs5ZmoXHJcbiAgICAgICAgICAgIHRoaXMuX3JlY2VpdmFibGVXaGl0ZUxpc3QuY2hpbGRyZW4uY2xlYXIoKTtcclxuICAgICAgICAgICAgdGhpcy5fYnJvYWRjYXN0RXhjaGFuZ2VMYXllci53YXRjaE9mZignZGVzY2VuZGFudHNBZGRMaXN0ZW5lcicpO1xyXG4gICAgICAgICAgICB0aGlzLl9icm9hZGNhc3RFeGNoYW5nZUxheWVyLndhdGNoT2ZmKCdkZXNjZW5kYW50c1JlbW92ZUxpc3RlbmVyJyk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHRoaXMuX3NvY2tldC5vbihcIm1lc3NhZ2VcIiwgKHRpdGxlLCBkYXRhKSA9PiB7XHJcbiAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBoZWFkZXIgPSBKU09OLnBhcnNlKHRpdGxlKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuX3JvdXRlci5fZW1pdFJlY2VpdmVkTWVzc2FnZShoZWFkZXIsIGRhdGEsIHRoaXMpO1xyXG5cclxuICAgICAgICAgICAgICAgIHN3aXRjaCAoaGVhZGVyWzBdKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBNZXNzYWdlVHlwZS5pbnZva2VfcmVxdWVzdDoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoaGVhZGVyWzFdID09PSB0aGlzLm1vZHVsZU5hbWUpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlY2VpdmVyID0gdGhpcy5fcm91dGVyLmNvbm5lY3RlZE1vZHVsZXMuZ2V0KGhlYWRlclsyXSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAocmVjZWl2ZXIpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoaGVhZGVyWzNdLmxlbmd0aCA8PSBSZW1vdGVJbnZva2UucGF0aE1heExlbmd0aCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5faW52b2thYmxlV2hpdGVMaXN0LmdldChbcmVjZWl2ZXIubW9kdWxlTmFtZSwgaGVhZGVyWzNdLnNwbGl0KCcvJylbMF1dKS5kYXRhKSB7ICAgIC8v5Yik5pat5piv5ZCm5pyJ5p2D6K6/6Zeu55uu5qCH5qih5Z2X55qE5pa55rOVXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZWNlaXZlci5fc2VuZERhdGEoW3RpdGxlLCBkYXRhXSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtc2cgPSBuZXcgSW52b2tlRmFpbGVkTWVzc2FnZSgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbXNnLnNlbmRlciA9IGhlYWRlclsyXTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1zZy5yZWNlaXZlciA9IGhlYWRlclsxXTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1zZy5yZXF1ZXN0TWVzc2FnZUlEID0gaGVhZGVyWzRdO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbXNnLmVycm9yID0gYHJvdXRlcu+8muayoeacieadg+mZkOiwg+eUqOaooeWdl1wiJHtoZWFkZXJbMl19XCLnmoRcIiR7aGVhZGVyWzNdfVwiYDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3NlbmREYXRhKG1zZy5wYWNrKCkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fcm91dGVyLl9lbWl0RXhjaGFuZ2VFcnJvcihFcnJvclR5cGUuZXhjZWVkUGF0aE1heExlbmd0aCwgdGhpcyk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtc2cgPSBuZXcgSW52b2tlRmFpbGVkTWVzc2FnZSgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1zZy5zZW5kZXIgPSBoZWFkZXJbMl07XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbXNnLnJlY2VpdmVyID0gaGVhZGVyWzFdO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1zZy5yZXF1ZXN0TWVzc2FnZUlEID0gaGVhZGVyWzRdO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1zZy5lcnJvciA9IGByb3V0ZXLvvJrml6Dms5Xov57mjqXliLDmqKHlnZdcIiR7aGVhZGVyWzJdfVwiYDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9zZW5kRGF0YShtc2cucGFjaygpKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3JvdXRlci5fZW1pdEV4Y2hhbmdlRXJyb3IoRXJyb3JUeXBlLnNlbmRlck5hbWVOb3RDb3JyZWN0LCB0aGlzKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuaW52b2tlX3Jlc3BvbnNlOlxyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuaW52b2tlX2ZpbmlzaDpcclxuICAgICAgICAgICAgICAgICAgICBjYXNlIE1lc3NhZ2VUeXBlLmludm9rZV9mYWlsZWQ6XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBNZXNzYWdlVHlwZS5pbnZva2VfZmlsZV9yZXF1ZXN0OlxyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuaW52b2tlX2ZpbGVfcmVzcG9uc2U6XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBNZXNzYWdlVHlwZS5pbnZva2VfZmlsZV9mYWlsZWQ6XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBNZXNzYWdlVHlwZS5pbnZva2VfZmlsZV9maW5pc2g6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGhlYWRlclsxXSA9PT0gdGhpcy5tb2R1bGVOYW1lKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCByZWNlaXZlciA9IHRoaXMuX3JvdXRlci5jb25uZWN0ZWRNb2R1bGVzLmdldChoZWFkZXJbMl0pO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJlY2VpdmVyKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuX2ludm9rYWJsZVdoaXRlTGlzdC5nZXQoW3JlY2VpdmVyLm1vZHVsZU5hbWVdKS5mb3JFYWNoRGVzY2VuZGFudHMobGF5ZXIgPT4gbGF5ZXIuZGF0YSBhcyBhbnkpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHx8IHJlY2VpdmVyLl9pbnZva2FibGVXaGl0ZUxpc3QuZ2V0KFt0aGlzLm1vZHVsZU5hbWVdKS5mb3JFYWNoRGVzY2VuZGFudHMobGF5ZXIgPT4gbGF5ZXIuZGF0YSBhcyBhbnkpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlY2VpdmVyLl9zZW5kRGF0YShbdGl0bGUsIGRhdGFdKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9yb3V0ZXIuX2VtaXRFeGNoYW5nZUVycm9yKEVycm9yVHlwZS5zZW5kZXJOYW1lTm90Q29ycmVjdCwgdGhpcyk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBjYXNlIE1lc3NhZ2VUeXBlLmJyb2FkY2FzdDoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoaGVhZGVyWzFdID09PSB0aGlzLm1vZHVsZU5hbWUpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChoZWFkZXJbM10ubGVuZ3RoIDw9IFJlbW90ZUludm9rZS5wYXRoTWF4TGVuZ3RoKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbGF5ZXIgPSB0aGlzLl9icm9hZGNhc3RFeGNoYW5nZUxheWVyLmdldChoZWFkZXJbM10uc3BsaXQoJy4nKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGxheWVyLmhhc0FuY2VzdG9ycygpKSB7ICAgIC8v5piv5ZCm5pyJ5Lq65rOo5YaM6K+l5bm/5pKtXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxheWVyLnRyaWdnZXJBbmNlc3RvcnMoW3RpdGxlLCBkYXRhLCBuZXcgU2V0KCldKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2UgeyAgICAvL+ayoeacieS6uuazqOWGjOi/h+WwsemAmuefpeS7peWQjuS4jeimgeWGjeWPkeS6hlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtc2cgPSBuZXcgQnJvYWRjYXN0Q2xvc2VNZXNzYWdlKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1zZy5icm9hZGNhc3RTZW5kZXIgPSBoZWFkZXJbMV07XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1zZy5pbmNsdWRlQW5jZXN0b3IgPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtc2cucGF0aCA9IGhlYWRlclszXTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fc2VuZERhdGEobXNnLnBhY2soKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9yb3V0ZXIuX2VtaXRFeGNoYW5nZUVycm9yKEVycm9yVHlwZS5leGNlZWRQYXRoTWF4TGVuZ3RoLCB0aGlzKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3JvdXRlci5fZW1pdEV4Y2hhbmdlRXJyb3IoRXJyb3JUeXBlLnNlbmRlck5hbWVOb3RDb3JyZWN0LCB0aGlzKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuYnJvYWRjYXN0X29wZW46IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UoZGF0YS50b1N0cmluZygpKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGJvZHlbMl0ubGVuZ3RoIDw9IFJlbW90ZUludm9rZS5wYXRoTWF4TGVuZ3RoKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBwYXRoID0gW2JvZHlbMV0sIC4uLmJvZHlbMl0uc3BsaXQoJy4nKV07XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB3bF9sYXllciA9IHRoaXMuX3JlY2VpdmFibGVXaGl0ZUxpc3QuZ2V0KHBhdGgpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghd2xfbGF5ZXIuaGFzKCkpIHsgICAvL+ehruS/neS4jeWcqOeZveWQjeWNleS4remHjeWkjeazqOWGjFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGxpc3RlbmVyID0gd2xfbGF5ZXIub24oKGFkZE9yRGVsZXRlOiBib29sZWFuKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChhZGRPckRlbGV0ZSlcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3JvdXRlci5icm9hZGNhc3RFeGNoYW5nZUNlbnRlci5nZXQocGF0aCkub24odGhpcy5fc2VuZEJyb2FkY2FzdERhdGEpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9yb3V0ZXIuYnJvYWRjYXN0RXhjaGFuZ2VDZW50ZXIuZ2V0KHBhdGgpLm9mZih0aGlzLl9zZW5kQnJvYWRjYXN0RGF0YSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLl9yZWNlaXZhYmxlV2hpdGVMaXN0LmdldChwYXRoLnNsaWNlKDAsIDIpKS5kYXRhKSAvL+WmguaenOivpei3r+W+hOWMheWQq+WcqOeZveWQjeWNleS4re+8jOWwseeri+WNs+WOu+azqOWGjFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBsaXN0ZW5lcih0cnVlKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtc2cgPSBuZXcgQnJvYWRjYXN0T3BlbkZpbmlzaE1lc3NhZ2UoKTsgIC8v6YCa55+l5qih5Z2X5rOo5YaM5oiQ5YqfXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtc2cubWVzc2FnZUlEID0gYm9keVswXTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3NlbmREYXRhKG1zZy5wYWNrKCkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fcm91dGVyLl9lbWl0RXhjaGFuZ2VFcnJvcihFcnJvclR5cGUuZXhjZWVkUGF0aE1heExlbmd0aCwgdGhpcyk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBjYXNlIE1lc3NhZ2VUeXBlLmJyb2FkY2FzdF9vcGVuX2ZpbmlzaDoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtc2dJRCA9IE51bWJlci5wYXJzZUludChkYXRhLnRvU3RyaW5nKCkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB0aW1lciA9IHRoaXMuX2Jyb2FkY2FzdE9wZW5UaW1lci5nZXQobXNnSUQpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjbGVhckludGVydmFsKHRpbWVyIGFzIGFueSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX2Jyb2FkY2FzdE9wZW5UaW1lci5kZWxldGUobXNnSUQpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuYnJvYWRjYXN0X2Nsb3NlOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKGRhdGEudG9TdHJpbmcoKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChib2R5WzFdLmxlbmd0aCA8PSBSZW1vdGVJbnZva2UucGF0aE1heExlbmd0aCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcGF0aCA9IFtib2R5WzBdLCAuLi5ib2R5WzFdLnNwbGl0KCcuJyldO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgd2xfbGF5ZXIgPSB0aGlzLl9yZWNlaXZhYmxlV2hpdGVMaXN0LmdldChwYXRoKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoYm9keVsyXSkgeyAgLy/mmK/lkKbov57lkIzniLbnuqfkuIDotbfmuIXnkIZcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB3bF9sYXllci50cmlnZ2VyQW5jZXN0b3JzKGZhbHNlKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB3bF9sYXllci5vZmZBbmNlc3RvcnMoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgd2xfbGF5ZXIudHJpZ2dlcihmYWxzZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgd2xfbGF5ZXIub2ZmKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9yb3V0ZXIuX2VtaXRFeGNoYW5nZUVycm9yKEVycm9yVHlwZS5leGNlZWRQYXRoTWF4TGVuZ3RoLCB0aGlzKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGRlZmF1bHQ6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fcm91dGVyLl9lbWl0RXhjaGFuZ2VFcnJvcihFcnJvclR5cGUubWVzc2FnZVR5cGVFcnJvciwgdGhpcyk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSBjYXRjaCB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLl9yb3V0ZXIuX2VtaXRFeGNoYW5nZUVycm9yKEVycm9yVHlwZS5tZXNzYWdlRm9ybWF0RXJyb3IsIHRoaXMpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGNvbnN0IHNlbmRfYm9tID0gKGxheWVyOiBFdmVudFNwYWNlPGFueT4pID0+IHsgIC8v5ZCR5qih5Z2X5Y+R6YCB5omT5byA5bm/5pKt6K+35rGCXHJcbiAgICAgICAgICAgIGNvbnN0IG1zZyA9IG5ldyBCcm9hZGNhc3RPcGVuTWVzc2FnZSgpO1xyXG4gICAgICAgICAgICBtc2cuYnJvYWRjYXN0U2VuZGVyID0gdGhpcy5tb2R1bGVOYW1lO1xyXG4gICAgICAgICAgICBtc2cubWVzc2FnZUlEID0gdGhpcy5fYnJvYWRjYXN0T3BlbkluZGV4Kys7XHJcbiAgICAgICAgICAgIG1zZy5wYXRoID0gbGF5ZXIuZnVsbE5hbWUuc2xpY2UoMSkuam9pbignLicpO1xyXG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBtc2cucGFjaygpO1xyXG5cclxuICAgICAgICAgICAgbGV0IGZhbGxOdW1iZXIgPSAwOyAvL+iusOW9leivt+axguaJk+W8gOWksei0peWkmuWwkeasoeS6hlxyXG5cclxuICAgICAgICAgICAgY29uc3Qgc2VuZCA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgIHRoaXMuX3NlbmREYXRhKHJlc3VsdCk7XHJcbiAgICAgICAgICAgICAgICBpZiAoZmFsbE51bWJlcisrID49IDMpIHRoaXMuY2xvc2UoKTtcclxuICAgICAgICAgICAgfTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuX2Jyb2FkY2FzdE9wZW5UaW1lci5zZXQobXNnLm1lc3NhZ2VJRCwgc2V0SW50ZXJ2YWwoc2VuZCwgUmVtb3RlSW52b2tlLnRpbWVvdXQpKTtcclxuXHJcbiAgICAgICAgICAgIHNlbmQoKTtcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICB0aGlzLl9icm9hZGNhc3RFeGNoYW5nZUxheWVyLndhdGNoKCdkZXNjZW5kYW50c0FkZExpc3RlbmVyJywgKGxpc3RlbmVyLCBsYXllcikgPT4ge1xyXG4gICAgICAgICAgICBpZiAobGF5ZXIubGlzdGVuZXJDb3VudCA9PT0gMSkgICAvL+ivtOaYjumcgOimgeaJk+W8gOaWsOeahOW5v+aSrXBhdGhcclxuICAgICAgICAgICAgICAgIHNlbmRfYm9tKGxheWVyKTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgdGhpcy5fYnJvYWRjYXN0RXhjaGFuZ2VMYXllci53YXRjaCgnZGVzY2VuZGFudHNSZW1vdmVMaXN0ZW5lcicsIChsaXN0ZW5lciwgbGF5ZXIpID0+IHtcclxuICAgICAgICAgICAgaWYgKGxheWVyLmxpc3RlbmVyQ291bnQgPT09IDApIHsgLy/or7TmmI7pnIDopoHlhbPpl63mn5DkuKrlub/mkq1wYXRoXHJcbiAgICAgICAgICAgICAgICBjb25zdCBtc2cgPSBuZXcgQnJvYWRjYXN0Q2xvc2VNZXNzYWdlKCk7XHJcbiAgICAgICAgICAgICAgICBtc2cuYnJvYWRjYXN0U2VuZGVyID0gdGhpcy5tb2R1bGVOYW1lO1xyXG4gICAgICAgICAgICAgICAgbXNnLnBhdGggPSBsYXllci5mdWxsTmFtZS5zbGljZSgxKS5qb2luKCcuJyk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLl9zZW5kRGF0YShtc2cucGFjaygpKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB0aGlzLl9icm9hZGNhc3RFeGNoYW5nZUxheWVyLmZvckVhY2hEZXNjZW5kYW50cyhsYXllciA9PiB7ICAvL+ajgOafpeacieWTquS6m+W5v+aSreW3suiiq+azqOWGjOS6hlxyXG4gICAgICAgICAgICBpZiAobGF5ZXIubGlzdGVuZXJDb3VudCA+IDApXHJcbiAgICAgICAgICAgICAgICBzZW5kX2JvbShsYXllcik7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDlkJHor6XmjqXlj6Plj5HpgIHmlbDmja5cclxuICAgICAqIEBwYXJhbSBkYXRhIOa2iOaBr+aVsOaNru+8jOesrOS4gOS4quaYr+a2iOaBr+WktOmDqO+8jOesrOS6jOS4quaYr+a2iOaBr2JvZHlcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBfc2VuZERhdGEoZGF0YTogW3N0cmluZywgQnVmZmVyXSkge1xyXG4gICAgICAgIHRoaXMuX3NvY2tldC5zZW5kKGRhdGFbMF0sIGRhdGFbMV0pLmNhdGNoKCgpID0+IHsgfSk7XHJcbiAgICAgICAgdGhpcy5fcm91dGVyLl9lbWl0U2VudE1lc3NhZ2UoZGF0YVswXSwgZGF0YVsxXSwgdGhpcyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDkuJPpl6jnlKjkuo7lj5HpgIHlub/mkq3jgILkuLvopoHmmK/nlKjkuo7pgb/lhY3ph43lpI3lj5HpgIFcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBfc2VuZEJyb2FkY2FzdERhdGEgPSAoZGF0YTogW3N0cmluZywgQnVmZmVyLCBTZXQ8Q29ubmVjdGVkTW9kdWxlPl0pID0+IHtcclxuICAgICAgICBpZiAoIWRhdGFbMl0uaGFzKHRoaXMpKSB7ICAgLy/liKTmlq3mmK/lkKblt7Lnu4/lkJHor6XmqKHlnZfovazlj5Hov4fkuoZcclxuICAgICAgICAgICAgZGF0YVsyXS5hZGQodGhpcyk7XHJcbiAgICAgICAgICAgIHRoaXMuX3NlbmREYXRhKGRhdGEgYXMgYW55KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDmlq3lvIDov57mjqVcclxuICAgICAqL1xyXG4gICAgY2xvc2UoKSB7XHJcbiAgICAgICAgdGhpcy5fc29ja2V0LmNsb3NlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8jcmVnaW9uIOWinuWHj+eZveWQjeWNlVxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5re75Yqg5Y+v6LCD55So55m95ZCN5Y2VXHJcbiAgICAgKi9cclxuICAgIGFkZEludm9rYWJsZVdoaXRlTGlzdChtb2R1bGVOYW1lOiBzdHJpbmcsIG5hbWVzcGFjZTogc3RyaW5nKSB7XHJcbiAgICAgICAgaWYgKG1vZHVsZU5hbWUgPT09IHRoaXMubW9kdWxlTmFtZSlcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGDmqKHlnZfvvJoke21vZHVsZU5hbWV944CC6Ieq5bex5LiN5Y+v5Lul6LCD55So6Ieq5bex55qE5pa55rOVYCk7XHJcblxyXG4gICAgICAgIHRoaXMuX2ludm9rYWJsZVdoaXRlTGlzdC5nZXQoW21vZHVsZU5hbWUsIG5hbWVzcGFjZV0pLmRhdGEgPSB0cnVlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5Yig6Zmk5Y+v6LCD55So55m95ZCN5Y2VXHJcbiAgICAgKi9cclxuICAgIHJlbW92ZUludm9rYWJsZVdoaXRlTGlzdChtb2R1bGVOYW1lOiBzdHJpbmcsIG5hbWVzcGFjZTogc3RyaW5nKSB7XHJcbiAgICAgICAgdGhpcy5faW52b2thYmxlV2hpdGVMaXN0LmdldChbbW9kdWxlTmFtZSwgbmFtZXNwYWNlXSkuZGF0YSA9IHVuZGVmaW5lZDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIOa3u+WKoOWPr+aOpeaUtuW5v+aSreeZveWQjeWNlVxyXG4gICAgICovXHJcbiAgICBhZGRSZWNlaXZhYmxlV2hpdGVMaXN0KG1vZHVsZU5hbWU6IHN0cmluZywgbmFtZXNwYWNlOiBzdHJpbmcpIHtcclxuICAgICAgICBpZiAobW9kdWxlTmFtZSA9PT0gdGhpcy5tb2R1bGVOYW1lKVxyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYOaooeWdl++8miR7bW9kdWxlTmFtZX3jgILoh6rlt7HkuI3lj6/ku6Xnm5HlkKzoh6rlt7HnmoTlub/mkq1gKTtcclxuXHJcbiAgICAgICAgY29uc3QgbGF5ZXIgPSB0aGlzLl9yZWNlaXZhYmxlV2hpdGVMaXN0LmdldChbbW9kdWxlTmFtZSwgbmFtZXNwYWNlXSk7XHJcbiAgICAgICAgbGF5ZXIuZGF0YSA9IHRydWU7XHJcbiAgICAgICAgbGF5ZXIudHJpZ2dlckRlc2NlbmRhbnRzKHRydWUpOyAvL+mAmuefpeWPr+S7peWOu2Jyb2FkY2FzdEV4Y2hhbmdlQ2VudGVy5Lit5rOo5YaM55uR5ZCs5Zmo5LqGXHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDliKDpmaTmn5Dpobnlj6/mjqXmlLblub/mkq3nmb3lkI3ljZVcclxuICAgICAqL1xyXG4gICAgcmVtb3ZlUmVjZWl2YWJsZVdoaXRlTGlzdChtb2R1bGVOYW1lOiBzdHJpbmcsIG5hbWVzcGFjZTogc3RyaW5nKSB7XHJcbiAgICAgICAgY29uc3QgbGF5ZXIgPSB0aGlzLl9yZWNlaXZhYmxlV2hpdGVMaXN0LmdldChbbW9kdWxlTmFtZSwgbmFtZXNwYWNlXSk7XHJcbiAgICAgICAgbGF5ZXIuZGF0YSA9IHVuZGVmaW5lZDtcclxuICAgICAgICBsYXllci50cmlnZ2VyRGVzY2VuZGFudHMoZmFsc2UpOyAvL+mAmuefpeWOu2Jyb2FkY2FzdEV4Y2hhbmdlQ2VudGVy5Lit5Yig6Zmk55uR5ZCs5ZmoXHJcbiAgICB9XHJcblxyXG4gICAgLy8jZW5kcmVnaW9uXHJcbn0iXX0=
