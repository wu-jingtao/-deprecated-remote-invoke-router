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
                                if (this._receivableWhiteList.get([path[0], path[1]]).data)
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

//# sourceMappingURL=data:application/json;charset=utf8;base64,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O0lBQzNFLENBQUM7SUFFRDs7T0FFRztJQUNILHNCQUFzQixDQUFDLFVBQWtCLEVBQUUsU0FBaUI7UUFDeEQsRUFBRSxDQUFDLENBQUMsVUFBVSxLQUFLLElBQUksQ0FBQyxVQUFVLENBQUM7WUFDL0IsTUFBTSxJQUFJLEtBQUssQ0FBQyxNQUFNLFVBQVUsZUFBZSxDQUFDLENBQUM7UUFFckQsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixDQUFDLEdBQUcsQ0FBQyxDQUFDLFVBQVUsRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDO1FBQ3JFLEtBQUssQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDO1FBQ2xCLEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLHFDQUFxQztJQUN6RSxDQUFDO0lBRUQ7O09BRUc7SUFDSCx5QkFBeUIsQ0FBQyxVQUFrQixFQUFFLFNBQWlCO1FBQzNELE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxHQUFHLENBQUMsQ0FBQyxVQUFVLEVBQUUsU0FBUyxDQUFDLENBQUMsQ0FBQztRQUNyRSxLQUFLLENBQUMsSUFBSSxHQUFHLFNBQVMsQ0FBQztRQUN2QixLQUFLLENBQUMsa0JBQWtCLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxrQ0FBa0M7SUFDdkUsQ0FBQztDQUdKO0FBM1NELDBDQTJTQyIsImZpbGUiOiJDb25uZWN0ZWRNb2R1bGUuanMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBNZXNzYWdlVHlwZSwgUmVtb3RlSW52b2tlIH0gZnJvbSBcInJlbW90ZS1pbnZva2VcIjtcclxuaW1wb3J0IHsgQmFzZVNvY2tldCB9IGZyb20gXCJiaW5hcnktd3MvYmluL0Jhc2VTb2NrZXQvY2xhc3Nlcy9CYXNlU29ja2V0XCI7XHJcbmltcG9ydCBFdmVudFNwYWNlIGZyb20gXCJldmVudHNwYWNlXCI7XHJcbmltcG9ydCB7IEJyb2FkY2FzdE9wZW5NZXNzYWdlLCBJbnZva2VGYWlsZWRNZXNzYWdlLCBCcm9hZGNhc3RDbG9zZU1lc3NhZ2UsIEJyb2FkY2FzdE9wZW5GaW5pc2hNZXNzYWdlIH0gZnJvbSBcInJlbW90ZS1pbnZva2UvYmluL2NsYXNzZXMvTWVzc2FnZURhdGFcIjtcclxuXHJcbmltcG9ydCB7IFJlbW90ZUludm9rZVJvdXRlciB9IGZyb20gXCIuL1JlbW90ZUludm9rZVJvdXRlclwiO1xyXG5pbXBvcnQgeyBFcnJvclR5cGUgfSBmcm9tICcuL0Vycm9yVHlwZSc7XHJcblxyXG4vKipcclxuICog5LiO6Lev55Sx5Zmo6L+e5o6l5LiK55qE5qih5Z2XICAgICAgXHJcbiAqL1xyXG5leHBvcnQgY2xhc3MgQ29ubmVjdGVkTW9kdWxlIHtcclxuXHJcbiAgICAvLyNyZWdpb24g5bGe5oCnXHJcblxyXG4gICAgcHJpdmF0ZSByZWFkb25seSBfcm91dGVyOiBSZW1vdGVJbnZva2VSb3V0ZXI7ICAgLy/ot6/nlLHlmahcclxuICAgIHByaXZhdGUgcmVhZG9ubHkgX3NvY2tldDogQmFzZVNvY2tldDsgICAgICAgICAgIC8v5omA6L+e5o6l55qE5o6l5Y+jXHJcblxyXG4gICAgcHJpdmF0ZSByZWFkb25seSBfYnJvYWRjYXN0T3BlblRpbWVyOiBNYXA8bnVtYmVyLCBOb2RlSlMuVGltZXI+ID0gbmV3IE1hcCgpOyAgICAvL+S/neWtmOWFs+S6juW9k+WJjeaOpeWPo+eahGJyb2FkY2FzdF9vcGVuX2ZpbmlzaOeahOWTjeW6lOi2heaXtuiuoeaXtuWZqOOAgmtleTpfYnJvYWRjYXN0T3BlbkNsb3NlSW5kZXhcclxuICAgIHByaXZhdGUgX2Jyb2FkY2FzdE9wZW5JbmRleDogbnVtYmVyID0gMDsgICAgICAgIC8v5Y+R6YCBYnJvYWRjYXN0X29wZW7miYDpnIDnmoRtZXNzYWdlSURcclxuXHJcbiAgICAvKipcclxuICAgICAqIOivpeaooeWdl+WPr+iwg+eUqOWFtuS7luaooeWdl+eahOeZveWQjeWNleWIl+ihqOOAgiAgICAgIFxyXG4gICAgICogW+WFtuS7luaooeWdl+eahOWQjeensCzlkb3lkI3nqbrpl7RdICAgIFxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IF9pbnZva2FibGVXaGl0ZUxpc3QgPSBuZXcgRXZlbnRTcGFjZSgpO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICog6K+l5qih5Z2X5Y+v5Lul5o6l5pS255qE5bm/5pKt55m95ZCN5Y2VICAgICBcclxuICAgICAqIFvlhbbku5bmqKHlnZfnmoTlkI3np7AscGF0aF0gLT4gKGFkZE9yRGVsZXRlKSA9PiB7IOagueaNrmFkZE9yRGVsZXRl5Yik5pat5piv5ZCRYnJvYWRjYXN0RXhjaGFuZ2VDZW50ZXLkuK3liKDpmaTov5jmmK/mt7vliqDnm5HlkKzlmaggfSAgICBcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBfcmVjZWl2YWJsZVdoaXRlTGlzdCA9IG5ldyBFdmVudFNwYWNlKCk7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDor6XmqKHlnZflnKjlub/mkq3kuqTmjaLkuK3lv4PkuK3miYDlnKjnmoTlsYJcclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBfYnJvYWRjYXN0RXhjaGFuZ2VMYXllcjogRXZlbnRTcGFjZTxhbnk+O1xyXG5cclxuICAgIC8qKlxyXG4gICAgICog6L+e5o6l5a+55bqU55qE5qih5Z2X5ZCN56ewICAgIFxyXG4gICAgICovXHJcbiAgICByZWFkb25seSBtb2R1bGVOYW1lOiBzdHJpbmc7XHJcblxyXG4gICAgLy8jZW5kcmVnaW9uXHJcblxyXG4gICAgY29uc3RydWN0b3Iocm91dGVyOiBSZW1vdGVJbnZva2VSb3V0ZXIsIHNvY2tldDogQmFzZVNvY2tldCwgbW9kdWxlTmFtZTogc3RyaW5nKSB7XHJcbiAgICAgICAgdGhpcy5fcm91dGVyID0gcm91dGVyO1xyXG4gICAgICAgIHRoaXMuX3NvY2tldCA9IHNvY2tldDtcclxuICAgICAgICB0aGlzLm1vZHVsZU5hbWUgPSBtb2R1bGVOYW1lO1xyXG4gICAgICAgIHRoaXMuX2Jyb2FkY2FzdEV4Y2hhbmdlTGF5ZXIgPSB0aGlzLl9yb3V0ZXIuYnJvYWRjYXN0RXhjaGFuZ2VDZW50ZXIuZ2V0KFt0aGlzLm1vZHVsZU5hbWVdKTtcclxuXHJcbiAgICAgICAgdGhpcy5fc29ja2V0Lm9uY2UoXCJjbG9zZVwiLCAoKSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMuX2Jyb2FkY2FzdE9wZW5UaW1lci5mb3JFYWNoKHZhbHVlID0+IGNsZWFySW50ZXJ2YWwodmFsdWUpKTsgICAvL+a4hemZpOaJgOacieiuoeaXtuWZqFxyXG4gICAgICAgICAgICB0aGlzLl9yZWNlaXZhYmxlV2hpdGVMaXN0LnRyaWdnZXJEZXNjZW5kYW50cyhmYWxzZSk7ICAgIC8v5Y+W5raI5omA5pyJ5bm/5pKt55uR5ZCs5ZmoXHJcbiAgICAgICAgICAgIHRoaXMuX3JlY2VpdmFibGVXaGl0ZUxpc3QuY2hpbGRyZW4uY2xlYXIoKTtcclxuICAgICAgICAgICAgdGhpcy5fYnJvYWRjYXN0RXhjaGFuZ2VMYXllci53YXRjaE9mZignZGVzY2VuZGFudHNBZGRMaXN0ZW5lcicpO1xyXG4gICAgICAgICAgICB0aGlzLl9icm9hZGNhc3RFeGNoYW5nZUxheWVyLndhdGNoT2ZmKCdkZXNjZW5kYW50c1JlbW92ZUxpc3RlbmVyJyk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHRoaXMuX3NvY2tldC5vbihcIm1lc3NhZ2VcIiwgKHRpdGxlLCBkYXRhKSA9PiB7XHJcbiAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBoZWFkZXIgPSBKU09OLnBhcnNlKHRpdGxlKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuX3JvdXRlci5fZW1pdFJlY2VpdmVkTWVzc2FnZShoZWFkZXIsIGRhdGEsIHRoaXMpO1xyXG5cclxuICAgICAgICAgICAgICAgIHN3aXRjaCAoaGVhZGVyWzBdKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBNZXNzYWdlVHlwZS5pbnZva2VfcmVxdWVzdDoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoaGVhZGVyWzFdID09PSB0aGlzLm1vZHVsZU5hbWUpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlY2VpdmVyID0gdGhpcy5fcm91dGVyLmNvbm5lY3RlZE1vZHVsZXMuZ2V0KGhlYWRlclsyXSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAocmVjZWl2ZXIpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoaGVhZGVyWzNdLmxlbmd0aCA8PSBSZW1vdGVJbnZva2UucGF0aE1heExlbmd0aCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5faW52b2thYmxlV2hpdGVMaXN0LmdldChbcmVjZWl2ZXIubW9kdWxlTmFtZSwgaGVhZGVyWzNdLnNwbGl0KCcvJylbMF1dKS5kYXRhKSB7ICAgIC8v5Yik5pat5piv5ZCm5pyJ5p2D6K6/6Zeu55uu5qCH5qih5Z2X55qE5pa55rOVXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZWNlaXZlci5fc2VuZERhdGEoW3RpdGxlLCBkYXRhXSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtc2cgPSBuZXcgSW52b2tlRmFpbGVkTWVzc2FnZSgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbXNnLnNlbmRlciA9IGhlYWRlclsyXTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1zZy5yZWNlaXZlciA9IGhlYWRlclsxXTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1zZy5yZXF1ZXN0TWVzc2FnZUlEID0gaGVhZGVyWzRdO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbXNnLmVycm9yID0gYHJvdXRlcu+8muayoeacieadg+mZkOiwg+eUqOaooeWdl1wiJHtoZWFkZXJbMl19XCLnmoRcIiR7aGVhZGVyWzNdfVwiYDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3NlbmREYXRhKG1zZy5wYWNrKCkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fcm91dGVyLl9lbWl0RXhjaGFuZ2VFcnJvcihFcnJvclR5cGUuZXhjZWVkUGF0aE1heExlbmd0aCwgdGhpcyk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtc2cgPSBuZXcgSW52b2tlRmFpbGVkTWVzc2FnZSgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1zZy5zZW5kZXIgPSBoZWFkZXJbMl07XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbXNnLnJlY2VpdmVyID0gaGVhZGVyWzFdO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1zZy5yZXF1ZXN0TWVzc2FnZUlEID0gaGVhZGVyWzRdO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1zZy5lcnJvciA9IGByb3V0ZXLvvJrml6Dms5Xov57mjqXliLDmqKHlnZdcIiR7aGVhZGVyWzJdfVwiYDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9zZW5kRGF0YShtc2cucGFjaygpKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3JvdXRlci5fZW1pdEV4Y2hhbmdlRXJyb3IoRXJyb3JUeXBlLnNlbmRlck5hbWVOb3RDb3JyZWN0LCB0aGlzKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuaW52b2tlX3Jlc3BvbnNlOlxyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuaW52b2tlX2ZpbmlzaDpcclxuICAgICAgICAgICAgICAgICAgICBjYXNlIE1lc3NhZ2VUeXBlLmludm9rZV9mYWlsZWQ6XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBNZXNzYWdlVHlwZS5pbnZva2VfZmlsZV9yZXF1ZXN0OlxyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuaW52b2tlX2ZpbGVfcmVzcG9uc2U6XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBNZXNzYWdlVHlwZS5pbnZva2VfZmlsZV9mYWlsZWQ6XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBNZXNzYWdlVHlwZS5pbnZva2VfZmlsZV9maW5pc2g6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGhlYWRlclsxXSA9PT0gdGhpcy5tb2R1bGVOYW1lKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCByZWNlaXZlciA9IHRoaXMuX3JvdXRlci5jb25uZWN0ZWRNb2R1bGVzLmdldChoZWFkZXJbMl0pO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJlY2VpdmVyKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuX2ludm9rYWJsZVdoaXRlTGlzdC5nZXQoW3JlY2VpdmVyLm1vZHVsZU5hbWVdKS5mb3JFYWNoRGVzY2VuZGFudHMobGF5ZXIgPT4gbGF5ZXIuZGF0YSBhcyBhbnkpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHx8IHJlY2VpdmVyLl9pbnZva2FibGVXaGl0ZUxpc3QuZ2V0KFt0aGlzLm1vZHVsZU5hbWVdKS5mb3JFYWNoRGVzY2VuZGFudHMobGF5ZXIgPT4gbGF5ZXIuZGF0YSBhcyBhbnkpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlY2VpdmVyLl9zZW5kRGF0YShbdGl0bGUsIGRhdGFdKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9yb3V0ZXIuX2VtaXRFeGNoYW5nZUVycm9yKEVycm9yVHlwZS5zZW5kZXJOYW1lTm90Q29ycmVjdCwgdGhpcyk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBjYXNlIE1lc3NhZ2VUeXBlLmJyb2FkY2FzdDoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoaGVhZGVyWzFdID09PSB0aGlzLm1vZHVsZU5hbWUpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChoZWFkZXJbM10ubGVuZ3RoIDw9IFJlbW90ZUludm9rZS5wYXRoTWF4TGVuZ3RoKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbGF5ZXIgPSB0aGlzLl9icm9hZGNhc3RFeGNoYW5nZUxheWVyLmdldChoZWFkZXJbM10uc3BsaXQoJy4nKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGxheWVyLmhhc0FuY2VzdG9ycygpKSB7ICAgIC8v5piv5ZCm5pyJ5Lq65rOo5YaM6K+l5bm/5pKtXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxheWVyLnRyaWdnZXJBbmNlc3RvcnMoW3RpdGxlLCBkYXRhLCBuZXcgU2V0KCldKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2UgeyAgICAvL+ayoeacieS6uuazqOWGjOi/h+WwsemAmuefpeS7peWQjuS4jeimgeWGjeWPkeS6hlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtc2cgPSBuZXcgQnJvYWRjYXN0Q2xvc2VNZXNzYWdlKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1zZy5icm9hZGNhc3RTZW5kZXIgPSBoZWFkZXJbMV07XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1zZy5pbmNsdWRlQW5jZXN0b3IgPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtc2cucGF0aCA9IGhlYWRlclszXTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fc2VuZERhdGEobXNnLnBhY2soKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9yb3V0ZXIuX2VtaXRFeGNoYW5nZUVycm9yKEVycm9yVHlwZS5leGNlZWRQYXRoTWF4TGVuZ3RoLCB0aGlzKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3JvdXRlci5fZW1pdEV4Y2hhbmdlRXJyb3IoRXJyb3JUeXBlLnNlbmRlck5hbWVOb3RDb3JyZWN0LCB0aGlzKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuYnJvYWRjYXN0X29wZW46IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UoZGF0YS50b1N0cmluZygpKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGJvZHlbMl0ubGVuZ3RoIDw9IFJlbW90ZUludm9rZS5wYXRoTWF4TGVuZ3RoKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBwYXRoID0gW2JvZHlbMV0sIC4uLmJvZHlbMl0uc3BsaXQoJy4nKV07XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB3bF9sYXllciA9IHRoaXMuX3JlY2VpdmFibGVXaGl0ZUxpc3QuZ2V0KHBhdGgpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghd2xfbGF5ZXIuaGFzKCkpIHsgICAvL+ehruS/neS4jeWcqOeZveWQjeWNleS4remHjeWkjeazqOWGjFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGxpc3RlbmVyID0gd2xfbGF5ZXIub24oKGFkZE9yRGVsZXRlOiBib29sZWFuKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChhZGRPckRlbGV0ZSlcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3JvdXRlci5icm9hZGNhc3RFeGNoYW5nZUNlbnRlci5nZXQocGF0aCkub24odGhpcy5fc2VuZEJyb2FkY2FzdERhdGEpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9yb3V0ZXIuYnJvYWRjYXN0RXhjaGFuZ2VDZW50ZXIuZ2V0KHBhdGgpLm9mZih0aGlzLl9zZW5kQnJvYWRjYXN0RGF0YSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLl9yZWNlaXZhYmxlV2hpdGVMaXN0LmdldChbcGF0aFswXSwgcGF0aFsxXV0pLmRhdGEpIC8v5aaC5p6c6K+l6Lev5b6E5YyF5ZCr5Zyo55m95ZCN5Y2V5Lit77yM5bCx56uL5Y2z5Y675rOo5YaMXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxpc3RlbmVyKHRydWUpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG1zZyA9IG5ldyBCcm9hZGNhc3RPcGVuRmluaXNoTWVzc2FnZSgpOyAgLy/pgJrnn6XmqKHlnZfms6jlhozmiJDlip9cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1zZy5tZXNzYWdlSUQgPSBib2R5WzBdO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fc2VuZERhdGEobXNnLnBhY2soKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9yb3V0ZXIuX2VtaXRFeGNoYW5nZUVycm9yKEVycm9yVHlwZS5leGNlZWRQYXRoTWF4TGVuZ3RoLCB0aGlzKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuYnJvYWRjYXN0X29wZW5fZmluaXNoOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG1zZ0lEID0gTnVtYmVyLnBhcnNlSW50KGRhdGEudG9TdHJpbmcoKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHRpbWVyID0gdGhpcy5fYnJvYWRjYXN0T3BlblRpbWVyLmdldChtc2dJRCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNsZWFySW50ZXJ2YWwodGltZXIgYXMgYW55KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fYnJvYWRjYXN0T3BlblRpbWVyLmRlbGV0ZShtc2dJRCk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBNZXNzYWdlVHlwZS5icm9hZGNhc3RfY2xvc2U6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UoZGF0YS50b1N0cmluZygpKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGJvZHlbMV0ubGVuZ3RoIDw9IFJlbW90ZUludm9rZS5wYXRoTWF4TGVuZ3RoKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBwYXRoID0gW2JvZHlbMF0sIC4uLmJvZHlbMV0uc3BsaXQoJy4nKV07XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB3bF9sYXllciA9IHRoaXMuX3JlY2VpdmFibGVXaGl0ZUxpc3QuZ2V0KHBhdGgpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChib2R5WzJdKSB7ICAvL+aYr+WQpui/nuWQjOeItue6p+S4gOi1t+a4heeQhlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHdsX2xheWVyLnRyaWdnZXJBbmNlc3RvcnMoZmFsc2UpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHdsX2xheWVyLm9mZkFuY2VzdG9ycygpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB3bF9sYXllci50cmlnZ2VyKGZhbHNlKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB3bF9sYXllci5vZmYoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3JvdXRlci5fZW1pdEV4Y2hhbmdlRXJyb3IoRXJyb3JUeXBlLmV4Y2VlZFBhdGhNYXhMZW5ndGgsIHRoaXMpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgZGVmYXVsdDoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9yb3V0ZXIuX2VtaXRFeGNoYW5nZUVycm9yKEVycm9yVHlwZS5tZXNzYWdlVHlwZUVycm9yLCB0aGlzKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9IGNhdGNoIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuX3JvdXRlci5fZW1pdEV4Y2hhbmdlRXJyb3IoRXJyb3JUeXBlLm1lc3NhZ2VGb3JtYXRFcnJvciwgdGhpcyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgY29uc3Qgc2VuZF9ib20gPSAobGF5ZXI6IEV2ZW50U3BhY2U8YW55PikgPT4geyAgLy/lkJHmqKHlnZflj5HpgIHmiZPlvIDlub/mkq3or7fmsYJcclxuICAgICAgICAgICAgY29uc3QgbXNnID0gbmV3IEJyb2FkY2FzdE9wZW5NZXNzYWdlKCk7XHJcbiAgICAgICAgICAgIG1zZy5icm9hZGNhc3RTZW5kZXIgPSB0aGlzLm1vZHVsZU5hbWU7XHJcbiAgICAgICAgICAgIG1zZy5tZXNzYWdlSUQgPSB0aGlzLl9icm9hZGNhc3RPcGVuSW5kZXgrKztcclxuICAgICAgICAgICAgbXNnLnBhdGggPSBsYXllci5mdWxsTmFtZS5zbGljZSgxKS5qb2luKCcuJyk7XHJcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IG1zZy5wYWNrKCk7XHJcblxyXG4gICAgICAgICAgICBsZXQgZmFsbE51bWJlciA9IDA7IC8v6K6w5b2V6K+35rGC5omT5byA5aSx6LSl5aSa5bCR5qyh5LqGXHJcblxyXG4gICAgICAgICAgICBjb25zdCBzZW5kID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5fc2VuZERhdGEocmVzdWx0KTtcclxuICAgICAgICAgICAgICAgIGlmIChmYWxsTnVtYmVyKysgPj0gMykgdGhpcy5jbG9zZSgpO1xyXG4gICAgICAgICAgICB9O1xyXG5cclxuICAgICAgICAgICAgdGhpcy5fYnJvYWRjYXN0T3BlblRpbWVyLnNldChtc2cubWVzc2FnZUlELCBzZXRJbnRlcnZhbChzZW5kLCBSZW1vdGVJbnZva2UudGltZW91dCkpO1xyXG5cclxuICAgICAgICAgICAgc2VuZCgpO1xyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIHRoaXMuX2Jyb2FkY2FzdEV4Y2hhbmdlTGF5ZXIud2F0Y2goJ2Rlc2NlbmRhbnRzQWRkTGlzdGVuZXInLCAobGlzdGVuZXIsIGxheWVyKSA9PiB7XHJcbiAgICAgICAgICAgIGlmIChsYXllci5saXN0ZW5lckNvdW50ID09PSAxKSAgIC8v6K+05piO6ZyA6KaB5omT5byA5paw55qE5bm/5pKtcGF0aFxyXG4gICAgICAgICAgICAgICAgc2VuZF9ib20obGF5ZXIpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB0aGlzLl9icm9hZGNhc3RFeGNoYW5nZUxheWVyLndhdGNoKCdkZXNjZW5kYW50c1JlbW92ZUxpc3RlbmVyJywgKGxpc3RlbmVyLCBsYXllcikgPT4ge1xyXG4gICAgICAgICAgICBpZiAobGF5ZXIubGlzdGVuZXJDb3VudCA9PT0gMCkgeyAvL+ivtOaYjumcgOimgeWFs+mXreafkOS4quW5v+aSrXBhdGhcclxuICAgICAgICAgICAgICAgIGNvbnN0IG1zZyA9IG5ldyBCcm9hZGNhc3RDbG9zZU1lc3NhZ2UoKTtcclxuICAgICAgICAgICAgICAgIG1zZy5icm9hZGNhc3RTZW5kZXIgPSB0aGlzLm1vZHVsZU5hbWU7XHJcbiAgICAgICAgICAgICAgICBtc2cucGF0aCA9IGxheWVyLmZ1bGxOYW1lLnNsaWNlKDEpLmpvaW4oJy4nKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuX3NlbmREYXRhKG1zZy5wYWNrKCkpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHRoaXMuX2Jyb2FkY2FzdEV4Y2hhbmdlTGF5ZXIuZm9yRWFjaERlc2NlbmRhbnRzKGxheWVyID0+IHsgIC8v5qOA5p+l5pyJ5ZOq5Lqb5bm/5pKt5bey6KKr5rOo5YaM5LqGXHJcbiAgICAgICAgICAgIGlmIChsYXllci5saXN0ZW5lckNvdW50ID4gMClcclxuICAgICAgICAgICAgICAgIHNlbmRfYm9tKGxheWVyKTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIOWQkeivpeaOpeWPo+WPkemAgeaVsOaNrlxyXG4gICAgICogQHBhcmFtIGRhdGEg5raI5oGv5pWw5o2u77yM56ys5LiA5Liq5piv5raI5oGv5aS06YOo77yM56ys5LqM5Liq5piv5raI5oGvYm9keVxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIF9zZW5kRGF0YShkYXRhOiBbc3RyaW5nLCBCdWZmZXJdKSB7XHJcbiAgICAgICAgdGhpcy5fc29ja2V0LnNlbmQoZGF0YVswXSwgZGF0YVsxXSkuY2F0Y2goKCkgPT4geyB9KTtcclxuICAgICAgICB0aGlzLl9yb3V0ZXIuX2VtaXRTZW50TWVzc2FnZShkYXRhWzBdLCBkYXRhWzFdLCB0aGlzKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIOS4k+mXqOeUqOS6juWPkemAgeW5v+aSreOAguS4u+imgeaYr+eUqOS6jumBv+WFjemHjeWkjeWPkemAgVxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIF9zZW5kQnJvYWRjYXN0RGF0YSA9IChkYXRhOiBbc3RyaW5nLCBCdWZmZXIsIFNldDxDb25uZWN0ZWRNb2R1bGU+XSkgPT4ge1xyXG4gICAgICAgIGlmICghZGF0YVsyXS5oYXModGhpcykpIHsgICAvL+WIpOaWreaYr+WQpuW3sue7j+WQkeivpeaooeWdl+i9rOWPkei/h+S6hlxyXG4gICAgICAgICAgICBkYXRhWzJdLmFkZCh0aGlzKTtcclxuICAgICAgICAgICAgdGhpcy5fc2VuZERhdGEoZGF0YSBhcyBhbnkpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIOaWreW8gOi/nuaOpVxyXG4gICAgICovXHJcbiAgICBjbG9zZSgpIHtcclxuICAgICAgICB0aGlzLl9zb2NrZXQuY2xvc2UoKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyNyZWdpb24g5aKe5YeP55m95ZCN5Y2VXHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDmt7vliqDlj6/osIPnlKjnmb3lkI3ljZVcclxuICAgICAqL1xyXG4gICAgYWRkSW52b2thYmxlV2hpdGVMaXN0KG1vZHVsZU5hbWU6IHN0cmluZywgbmFtZXNwYWNlOiBzdHJpbmcpIHtcclxuICAgICAgICBpZiAobW9kdWxlTmFtZSA9PT0gdGhpcy5tb2R1bGVOYW1lKVxyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYOaooeWdl++8miR7bW9kdWxlTmFtZX3jgILoh6rlt7HkuI3lj6/ku6XosIPnlKjoh6rlt7HnmoTmlrnms5VgKTtcclxuXHJcbiAgICAgICAgdGhpcy5faW52b2thYmxlV2hpdGVMaXN0LmdldChbbW9kdWxlTmFtZSwgbmFtZXNwYWNlXSkuZGF0YSA9IHRydWU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDliKDpmaTlj6/osIPnlKjnmb3lkI3ljZVcclxuICAgICAqL1xyXG4gICAgcmVtb3ZlSW52b2thYmxlV2hpdGVMaXN0KG1vZHVsZU5hbWU6IHN0cmluZywgbmFtZXNwYWNlOiBzdHJpbmcpIHtcclxuICAgICAgICB0aGlzLl9pbnZva2FibGVXaGl0ZUxpc3QuZ2V0KFttb2R1bGVOYW1lLCBuYW1lc3BhY2VdKS5kYXRhID0gdW5kZWZpbmVkO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5re75Yqg5Y+v5o6l5pS25bm/5pKt55m95ZCN5Y2VXHJcbiAgICAgKi9cclxuICAgIGFkZFJlY2VpdmFibGVXaGl0ZUxpc3QobW9kdWxlTmFtZTogc3RyaW5nLCBuYW1lc3BhY2U6IHN0cmluZykge1xyXG4gICAgICAgIGlmIChtb2R1bGVOYW1lID09PSB0aGlzLm1vZHVsZU5hbWUpXHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihg5qih5Z2X77yaJHttb2R1bGVOYW1lfeOAguiHquW3seS4jeWPr+S7peebkeWQrOiHquW3seeahOW5v+aSrWApO1xyXG5cclxuICAgICAgICBjb25zdCBsYXllciA9IHRoaXMuX3JlY2VpdmFibGVXaGl0ZUxpc3QuZ2V0KFttb2R1bGVOYW1lLCBuYW1lc3BhY2VdKTtcclxuICAgICAgICBsYXllci5kYXRhID0gdHJ1ZTtcclxuICAgICAgICBsYXllci50cmlnZ2VyRGVzY2VuZGFudHModHJ1ZSk7IC8v6YCa55+l5Y+v5Lul5Y67YnJvYWRjYXN0RXhjaGFuZ2VDZW50ZXLkuK3ms6jlhoznm5HlkKzlmajkuoZcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIOWIoOmZpOafkOmhueWPr+aOpeaUtuW5v+aSreeZveWQjeWNlVxyXG4gICAgICovXHJcbiAgICByZW1vdmVSZWNlaXZhYmxlV2hpdGVMaXN0KG1vZHVsZU5hbWU6IHN0cmluZywgbmFtZXNwYWNlOiBzdHJpbmcpIHtcclxuICAgICAgICBjb25zdCBsYXllciA9IHRoaXMuX3JlY2VpdmFibGVXaGl0ZUxpc3QuZ2V0KFttb2R1bGVOYW1lLCBuYW1lc3BhY2VdKTtcclxuICAgICAgICBsYXllci5kYXRhID0gdW5kZWZpbmVkO1xyXG4gICAgICAgIGxheWVyLnRyaWdnZXJEZXNjZW5kYW50cyhmYWxzZSk7IC8v6YCa55+l5Y67YnJvYWRjYXN0RXhjaGFuZ2VDZW50ZXLkuK3liKDpmaTnm5HlkKzlmahcclxuICAgIH1cclxuXHJcbiAgICAvLyNlbmRyZWdpb25cclxufSJdfQ==
