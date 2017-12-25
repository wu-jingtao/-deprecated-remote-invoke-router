"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const binary_ws_1 = require("binary-ws");
const remote_invoke_1 = require("remote-invoke");
const eventspace_1 = require("eventspace");
const log_formatter_1 = require("log-formatter");
const ConnectedModule_1 = require("./ConnectedModule");
const ErrorType_1 = require("./ErrorType");
class RemoteInvokeRouter extends binary_ws_1.Server {
    constructor(server, configs) {
        super(server, configs);
        //#region 属性与构造
        /**
         * 与路由器连接的模块
         * key：模块名称
         */
        this.connectedModules = new Map();
        /**
         * 广播消息转发中心
         */
        this.broadcastExchangeCenter = new eventspace_1.default();
        /**
         * 是否触发receivedMessage事件
         */
        this.emitReceivedMessage = false;
        /**
         * 是否触发sentMessage事件
         */
        this.emitSentMessage = false;
        /**
         * 是否触发exchangeError事件
         */
        this.emitExchangeError = false;
        /**
         * 是否打印收到和发出的消息头部（用于调试）。需要将emitReceivedMessage或emitSentMessage设置为true才生效
         */
        this.printMessageHeader = false;
        /**
         * 是否将发生的错误打印到控制台（用于调试）。需要将emitExchangeError设置为true才生效
         */
        this.printError = false;
        this.on("connection", async (socket, req) => {
            const result = await this.onConnection(socket, req);
            if (result === false)
                socket.close();
            else {
                let module = this.connectedModules.get(result);
                if (module) {
                    socket.close();
                    this._emitExchangeError(ErrorType_1.ErrorType.duplicateConnection, module);
                }
                else {
                    module = new ConnectedModule_1.ConnectedModule(this, socket, result);
                    this.connectedModules.set(result, module);
                    this.emit('module_connected', module);
                    socket.once('close', () => {
                        this.connectedModules.delete(result);
                        this.emit('module_disconnected', module);
                    });
                }
            }
        });
        this.on("receivedMessage", (header, body, module) => {
            if (this.printMessageHeader) {
                const result = {
                    type: remote_invoke_1.MessageType[header[0]],
                    sender: header[1],
                    receiver: header[2],
                    path: header[3]
                };
                log_formatter_1.default
                    .location
                    .text.green.bold.round
                    .location.bold
                    .content.green('remote-invoke-router', '接收到', module.moduleName, JSON.stringify(result, undefined, 4));
            }
        });
        this.on("sentMessage", (header, body, module) => {
            if (this.printMessageHeader) {
                const result = {
                    type: remote_invoke_1.MessageType[header[0]],
                    sender: header[1],
                    receiver: header[2],
                    path: header[3]
                };
                log_formatter_1.default
                    .location
                    .text.cyan.bold.round
                    .location.bold
                    .content.cyan('remote-invoke-router', '发送到', module.moduleName, JSON.stringify(result, undefined, 4));
            }
        });
        this.on("exchangeError", (type, module) => {
            if (this.printError) {
                let message;
                switch (type) {
                    case ErrorType_1.ErrorType.duplicateConnection:
                        message = `模块"${module.moduleName}"重复与路由器建立连接`;
                        break;
                    case ErrorType_1.ErrorType.senderNameNotCorrect:
                        message = `模块"${module.moduleName}"发出的消息中，发送者的名称与实际模块名称不匹配`;
                        break;
                    case ErrorType_1.ErrorType.exceedPathMaxLength:
                        message = `模块"${module.moduleName}"发出的消息中，path超过了规定的长度`;
                        break;
                    case ErrorType_1.ErrorType.messageFormatError:
                        message = `模块"${module.moduleName}"发来的消息格式有问题`;
                        break;
                    case ErrorType_1.ErrorType.messageTypeError:
                        message = `模块"${module.moduleName}"发来了未知类型的消息`;
                        break;
                }
                log_formatter_1.default.warn
                    .location.white
                    .location.bold
                    .content.yellow('remote-invoke-router', module.moduleName, message);
            }
        });
    }
    //#region 增减白名单
    /**
     * 为某连接添加可调用白名单
     * @param moduleName 模块名称
     * @param invokableModuleName 可调用的模块名称
     * @param namespace 允许其访问的命名空间
     */
    addInvokableWhiteList(moduleName, invokableModuleName, namespace) {
        const module = this.connectedModules.get(moduleName);
        if (module)
            module.addInvokableWhiteList(invokableModuleName, namespace);
    }
    /**
     * 为某连接删除可调用白名单
     * @param moduleName 模块名称
     * @param notInvokableModuleName 不允许调用的模块名称
     * @param namespace 不允许其访问的命名空间
     */
    removeInvokableWhiteList(moduleName, notInvokableModuleName, namespace) {
        const module = this.connectedModules.get(moduleName);
        if (module)
            module.removeInvokableWhiteList(notInvokableModuleName, namespace);
    }
    /**
     * 为某连接添加可接收广播白名单
     * @param moduleName 模块名称
     * @param receivableModuleName 可接收广播的模块名
     * @param namespace 可接收的广播命名空间
     */
    addReceivableWhiteList(moduleName, receivableModuleName, namespace) {
        const module = this.connectedModules.get(moduleName);
        if (module)
            module.addReceivableWhiteList(receivableModuleName, namespace);
    }
    /**
     * 为某连接删除可接收广播白名单
     * @param moduleName 模块名称
     * @param notReceivableModuleName 不可接收广播的模块名
     * @param namespace 不可接收的广播命名空间
     */
    removeReceivableWhiteList(moduleName, notReceivableModuleName, namespace) {
        const module = this.connectedModules.get(moduleName);
        if (module)
            module.removeReceivableWhiteList(notReceivableModuleName, namespace);
    }
    on(event, listener) {
        super.on(event, listener);
        return this;
    }
    once(event, listener) {
        super.once(event, listener);
        return this;
    }
    /**
     * 触发receivedMessage事件
     */
    _emitReceivedMessage(header, body, module) {
        if (this.emitReceivedMessage)
            this.emit('receivedMessage', header, body, module);
    }
    /**
     * 触发sentMessage事件
     */
    _emitSentMessage(header, body, module) {
        if (this.emitSentMessage)
            this.emit('sentMessage', JSON.parse(header), body, module);
    }
    /**
     * 触发exchangeError事件
     */
    _emitExchangeError(type, module) {
        if (this.emitExchangeError)
            this.emit('exchangeError', type, module);
    }
}
exports.RemoteInvokeRouter = RemoteInvokeRouter;

//# sourceMappingURL=data:application/json;charset=utf8;base64,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USxDQUFDLENBQUM7UUFDNUIsTUFBTSxDQUFDLElBQUksQ0FBQztJQUNoQixDQUFDO0lBRUQ7O09BRUc7SUFDSCxvQkFBb0IsQ0FBQyxNQUFhLEVBQUUsSUFBWSxFQUFFLE1BQXVCO1FBQ3JFLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxtQkFBbUIsQ0FBQztZQUN6QixJQUFJLENBQUMsSUFBSSxDQUFDLGlCQUFpQixFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFDM0QsQ0FBQztJQUVEOztPQUVHO0lBQ0gsZ0JBQWdCLENBQUMsTUFBYyxFQUFFLElBQVksRUFBRSxNQUF1QjtRQUNsRSxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDO1lBQ3JCLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLEVBQUUsSUFBSSxFQUFFLE1BQU0sQ0FBQyxDQUFDO0lBQ25FLENBQUM7SUFFRDs7T0FFRztJQUNILGtCQUFrQixDQUFDLElBQWUsRUFBRSxNQUF1QjtRQUN2RCxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUM7WUFDdkIsSUFBSSxDQUFDLElBQUksQ0FBQyxlQUFlLEVBQUUsSUFBSSxFQUFFLE1BQU0sQ0FBQyxDQUFDO0lBQ2pELENBQUM7Q0FHSjtBQWhRRCxnREFnUUMiLCJmaWxlIjoiUmVtb3RlSW52b2tlUm91dGVyLmpzIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgaHR0cCBmcm9tICdodHRwJztcclxuaW1wb3J0ICogYXMgaHR0cHMgZnJvbSAnaHR0cHMnO1xyXG5pbXBvcnQgeyBTZXJ2ZXIsIFNlcnZlclNvY2tldCB9IGZyb20gJ2JpbmFyeS13cyc7XHJcbmltcG9ydCB7IEJhc2VTb2NrZXRDb25maWcgfSBmcm9tICdiaW5hcnktd3MvYmluL0Jhc2VTb2NrZXQvaW50ZXJmYWNlcy9CYXNlU29ja2V0Q29uZmlnJztcclxuaW1wb3J0IHsgTWVzc2FnZVR5cGUgfSBmcm9tICdyZW1vdGUtaW52b2tlJztcclxuaW1wb3J0IEV2ZW50U3BhY2UgZnJvbSAnZXZlbnRzcGFjZSc7XHJcbmltcG9ydCBsb2cgZnJvbSAnbG9nLWZvcm1hdHRlcic7XHJcblxyXG5pbXBvcnQgeyBDb25uZWN0ZWRNb2R1bGUgfSBmcm9tICcuL0Nvbm5lY3RlZE1vZHVsZSc7XHJcbmltcG9ydCB7IEVycm9yVHlwZSB9IGZyb20gJy4vRXJyb3JUeXBlJztcclxuXHJcbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBSZW1vdGVJbnZva2VSb3V0ZXIgZXh0ZW5kcyBTZXJ2ZXIge1xyXG5cclxuICAgIC8vI3JlZ2lvbiDlsZ7mgKfkuI7mnoTpgKBcclxuXHJcbiAgICAvKipcclxuICAgICAqIOS4jui3r+eUseWZqOi/nuaOpeeahOaooeWdlyAgICBcclxuICAgICAqIGtlee+8muaooeWdl+WQjeensFxyXG4gICAgICovXHJcbiAgICByZWFkb25seSBjb25uZWN0ZWRNb2R1bGVzOiBNYXA8c3RyaW5nLCBDb25uZWN0ZWRNb2R1bGU+ID0gbmV3IE1hcCgpO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICog5bm/5pKt5raI5oGv6L2s5Y+R5Lit5b+DXHJcbiAgICAgKi9cclxuICAgIHJlYWRvbmx5IGJyb2FkY2FzdEV4Y2hhbmdlQ2VudGVyID0gbmV3IEV2ZW50U3BhY2UoKTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIOaYr+WQpuinpuWPkXJlY2VpdmVkTWVzc2FnZeS6i+S7tlxyXG4gICAgICovXHJcbiAgICBlbWl0UmVjZWl2ZWRNZXNzYWdlID0gZmFsc2U7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDmmK/lkKbop6blj5FzZW50TWVzc2FnZeS6i+S7tlxyXG4gICAgICovXHJcbiAgICBlbWl0U2VudE1lc3NhZ2UgPSBmYWxzZTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIOaYr+WQpuinpuWPkWV4Y2hhbmdlRXJyb3Lkuovku7ZcclxuICAgICAqL1xyXG4gICAgZW1pdEV4Y2hhbmdlRXJyb3IgPSBmYWxzZTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIOaYr+WQpuaJk+WNsOaUtuWIsOWSjOWPkeWHuueahOa2iOaBr+WktOmDqO+8iOeUqOS6juiwg+ivle+8ieOAgumcgOimgeWwhmVtaXRSZWNlaXZlZE1lc3NhZ2XmiJZlbWl0U2VudE1lc3NhZ2Xorr7nva7kuLp0cnVl5omN55Sf5pWIXHJcbiAgICAgKi9cclxuICAgIHByaW50TWVzc2FnZUhlYWRlciA9IGZhbHNlO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICog5piv5ZCm5bCG5Y+R55Sf55qE6ZSZ6K+v5omT5Y2w5Yiw5o6n5Yi25Y+w77yI55So5LqO6LCD6K+V77yJ44CC6ZyA6KaB5bCGZW1pdEV4Y2hhbmdlRXJyb3Lorr7nva7kuLp0cnVl5omN55Sf5pWIXHJcbiAgICAgKi9cclxuICAgIHByaW50RXJyb3IgPSBmYWxzZTtcclxuXHJcbiAgICBjb25zdHJ1Y3RvcihzZXJ2ZXI6IGh0dHAuU2VydmVyIHwgaHR0cHMuU2VydmVyLCBjb25maWdzOiBCYXNlU29ja2V0Q29uZmlnKSB7XHJcbiAgICAgICAgc3VwZXIoc2VydmVyLCBjb25maWdzKTtcclxuXHJcbiAgICAgICAgdGhpcy5vbihcImNvbm5lY3Rpb25cIiwgYXN5bmMgKHNvY2tldCwgcmVxKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMub25Db25uZWN0aW9uKHNvY2tldCwgcmVxKTtcclxuXHJcbiAgICAgICAgICAgIGlmIChyZXN1bHQgPT09IGZhbHNlKVxyXG4gICAgICAgICAgICAgICAgc29ja2V0LmNsb3NlKCk7XHJcbiAgICAgICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgbGV0IG1vZHVsZSA9IHRoaXMuY29ubmVjdGVkTW9kdWxlcy5nZXQocmVzdWx0KTtcclxuICAgICAgICAgICAgICAgIGlmIChtb2R1bGUpIHsgLy/kuI3lhYHorrjkuIDkuKrmqKHlnZfph43lpI3ov57mjqVcclxuICAgICAgICAgICAgICAgICAgICBzb2NrZXQuY2xvc2UoKTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLl9lbWl0RXhjaGFuZ2VFcnJvcihFcnJvclR5cGUuZHVwbGljYXRlQ29ubmVjdGlvbiwgbW9kdWxlKTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbW9kdWxlID0gbmV3IENvbm5lY3RlZE1vZHVsZSh0aGlzLCBzb2NrZXQsIHJlc3VsdCk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jb25uZWN0ZWRNb2R1bGVzLnNldChyZXN1bHQsIG1vZHVsZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5lbWl0KCdtb2R1bGVfY29ubmVjdGVkJywgbW9kdWxlKTtcclxuICAgICAgICAgICAgICAgICAgICBzb2NrZXQub25jZSgnY2xvc2UnLCAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuY29ubmVjdGVkTW9kdWxlcy5kZWxldGUocmVzdWx0KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5lbWl0KCdtb2R1bGVfZGlzY29ubmVjdGVkJywgbW9kdWxlKTtcclxuICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB0aGlzLm9uKFwicmVjZWl2ZWRNZXNzYWdlXCIsIChoZWFkZXIsIGJvZHksIG1vZHVsZSkgPT4ge1xyXG4gICAgICAgICAgICBpZiAodGhpcy5wcmludE1lc3NhZ2VIZWFkZXIpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IHtcclxuICAgICAgICAgICAgICAgICAgICB0eXBlOiBNZXNzYWdlVHlwZVtoZWFkZXJbMF1dLFxyXG4gICAgICAgICAgICAgICAgICAgIHNlbmRlcjogaGVhZGVyWzFdLFxyXG4gICAgICAgICAgICAgICAgICAgIHJlY2VpdmVyOiBoZWFkZXJbMl0sXHJcbiAgICAgICAgICAgICAgICAgICAgcGF0aDogaGVhZGVyWzNdXHJcbiAgICAgICAgICAgICAgICB9O1xyXG5cclxuICAgICAgICAgICAgICAgIGxvZ1xyXG4gICAgICAgICAgICAgICAgICAgIC5sb2NhdGlvblxyXG4gICAgICAgICAgICAgICAgICAgIC50ZXh0LmdyZWVuLmJvbGQucm91bmRcclxuICAgICAgICAgICAgICAgICAgICAubG9jYXRpb24uYm9sZFxyXG4gICAgICAgICAgICAgICAgICAgIC5jb250ZW50LmdyZWVuKCdyZW1vdGUtaW52b2tlLXJvdXRlcicsICfmjqXmlLbliLAnLCBtb2R1bGUubW9kdWxlTmFtZSwgSlNPTi5zdHJpbmdpZnkocmVzdWx0LCB1bmRlZmluZWQsIDQpKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB0aGlzLm9uKFwic2VudE1lc3NhZ2VcIiwgKGhlYWRlciwgYm9keSwgbW9kdWxlKSA9PiB7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLnByaW50TWVzc2FnZUhlYWRlcikge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0ge1xyXG4gICAgICAgICAgICAgICAgICAgIHR5cGU6IE1lc3NhZ2VUeXBlW2hlYWRlclswXV0sXHJcbiAgICAgICAgICAgICAgICAgICAgc2VuZGVyOiBoZWFkZXJbMV0sXHJcbiAgICAgICAgICAgICAgICAgICAgcmVjZWl2ZXI6IGhlYWRlclsyXSxcclxuICAgICAgICAgICAgICAgICAgICBwYXRoOiBoZWFkZXJbM11cclxuICAgICAgICAgICAgICAgIH07XHJcblxyXG4gICAgICAgICAgICAgICAgbG9nXHJcbiAgICAgICAgICAgICAgICAgICAgLmxvY2F0aW9uXHJcbiAgICAgICAgICAgICAgICAgICAgLnRleHQuY3lhbi5ib2xkLnJvdW5kXHJcbiAgICAgICAgICAgICAgICAgICAgLmxvY2F0aW9uLmJvbGRcclxuICAgICAgICAgICAgICAgICAgICAuY29udGVudC5jeWFuKCdyZW1vdGUtaW52b2tlLXJvdXRlcicsICflj5HpgIHliLAnLCBtb2R1bGUubW9kdWxlTmFtZSwgSlNPTi5zdHJpbmdpZnkocmVzdWx0LCB1bmRlZmluZWQsIDQpKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB0aGlzLm9uKFwiZXhjaGFuZ2VFcnJvclwiLCAodHlwZSwgbW9kdWxlKSA9PiB7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLnByaW50RXJyb3IpIHtcclxuICAgICAgICAgICAgICAgIGxldCBtZXNzYWdlO1xyXG5cclxuICAgICAgICAgICAgICAgIHN3aXRjaCAodHlwZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgRXJyb3JUeXBlLmR1cGxpY2F0ZUNvbm5lY3Rpb246XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2UgPSBg5qih5Z2XXCIke21vZHVsZS5tb2R1bGVOYW1lfVwi6YeN5aSN5LiO6Lev55Sx5Zmo5bu656uL6L+e5o6lYDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBFcnJvclR5cGUuc2VuZGVyTmFtZU5vdENvcnJlY3Q6XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2UgPSBg5qih5Z2XXCIke21vZHVsZS5tb2R1bGVOYW1lfVwi5Y+R5Ye655qE5raI5oGv5Lit77yM5Y+R6YCB6ICF55qE5ZCN56ew5LiO5a6e6ZmF5qih5Z2X5ZCN56ew5LiN5Yy56YWNYDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBFcnJvclR5cGUuZXhjZWVkUGF0aE1heExlbmd0aDpcclxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZSA9IGDmqKHlnZdcIiR7bW9kdWxlLm1vZHVsZU5hbWV9XCLlj5Hlh7rnmoTmtojmga/kuK3vvIxwYXRo6LaF6L+H5LqG6KeE5a6a55qE6ZW/5bqmYDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBFcnJvclR5cGUubWVzc2FnZUZvcm1hdEVycm9yOlxyXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlID0gYOaooeWdl1wiJHttb2R1bGUubW9kdWxlTmFtZX1cIuWPkeadpeeahOa2iOaBr+agvOW8j+aciemXrumimGA7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgRXJyb3JUeXBlLm1lc3NhZ2VUeXBlRXJyb3I6XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2UgPSBg5qih5Z2XXCIke21vZHVsZS5tb2R1bGVOYW1lfVwi5Y+R5p2l5LqG5pyq55+l57G75Z6L55qE5raI5oGvYDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgbG9nLndhcm5cclxuICAgICAgICAgICAgICAgICAgICAubG9jYXRpb24ud2hpdGVcclxuICAgICAgICAgICAgICAgICAgICAubG9jYXRpb24uYm9sZFxyXG4gICAgICAgICAgICAgICAgICAgIC5jb250ZW50LnllbGxvdygncmVtb3RlLWludm9rZS1yb3V0ZXInLCBtb2R1bGUubW9kdWxlTmFtZSwgbWVzc2FnZSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICAvLyNlbmRyZWdpb25cclxuXHJcbiAgICAvKipcclxuICAgICAqIOavj+W9k+acieS4gOS4quaWsOeahOi/nuaOpeiiq+WIm+W7uu+8jOivpeaWueazleWwseS8muiiq+inpuWPkeOAgui/lOWbnmZhbHNl6KGo56S65ouS57ud6L+e5o6l77yM6L+U5Zuec3RyaW5n6KGo56S65o6l5Y+X6L+e5o6l44CC5q2k5a2X56ym5Liy5Luj6KGo6K+l5o6l5Y+j5omA6L+e5o6l5qih5Z2X55qE5ZCN56ewXHJcbiAgICAgKiBAcGFyYW0gc29ja2V0IHdlYnNvY2tldFxyXG4gICAgICogQHBhcmFtIHJlcSDlrqLmiLfnq6/lkJHot6/nlLHlmajlu7rnq4vov57mjqXml7blj5HpgIHnmoRnZXTor7fmsYJcclxuICAgICAqL1xyXG4gICAgYWJzdHJhY3Qgb25Db25uZWN0aW9uKHNvY2tldDogU2VydmVyU29ja2V0LCByZXE6IGh0dHAuSW5jb21pbmdNZXNzYWdlKTogUHJvbWlzZTxmYWxzZSB8IHN0cmluZz47XHJcblxyXG4gICAgLy8jcmVnaW9uIOWinuWHj+eZveWQjeWNlVxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5Li65p+Q6L+e5o6l5re75Yqg5Y+v6LCD55So55m95ZCN5Y2VXHJcbiAgICAgKiBAcGFyYW0gbW9kdWxlTmFtZSDmqKHlnZflkI3np7BcclxuICAgICAqIEBwYXJhbSBpbnZva2FibGVNb2R1bGVOYW1lIOWPr+iwg+eUqOeahOaooeWdl+WQjeensFxyXG4gICAgICogQHBhcmFtIG5hbWVzcGFjZSDlhYHorrjlhbborr/pl67nmoTlkb3lkI3nqbrpl7RcclxuICAgICAqL1xyXG4gICAgYWRkSW52b2thYmxlV2hpdGVMaXN0KG1vZHVsZU5hbWU6IHN0cmluZywgaW52b2thYmxlTW9kdWxlTmFtZTogc3RyaW5nLCBuYW1lc3BhY2U6IHN0cmluZykge1xyXG4gICAgICAgIGNvbnN0IG1vZHVsZSA9IHRoaXMuY29ubmVjdGVkTW9kdWxlcy5nZXQobW9kdWxlTmFtZSk7XHJcbiAgICAgICAgaWYgKG1vZHVsZSkgbW9kdWxlLmFkZEludm9rYWJsZVdoaXRlTGlzdChpbnZva2FibGVNb2R1bGVOYW1lLCBuYW1lc3BhY2UpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5Li65p+Q6L+e5o6l5Yig6Zmk5Y+v6LCD55So55m95ZCN5Y2VXHJcbiAgICAgKiBAcGFyYW0gbW9kdWxlTmFtZSDmqKHlnZflkI3np7BcclxuICAgICAqIEBwYXJhbSBub3RJbnZva2FibGVNb2R1bGVOYW1lIOS4jeWFgeiuuOiwg+eUqOeahOaooeWdl+WQjeensFxyXG4gICAgICogQHBhcmFtIG5hbWVzcGFjZSDkuI3lhYHorrjlhbborr/pl67nmoTlkb3lkI3nqbrpl7RcclxuICAgICAqL1xyXG4gICAgcmVtb3ZlSW52b2thYmxlV2hpdGVMaXN0KG1vZHVsZU5hbWU6IHN0cmluZywgbm90SW52b2thYmxlTW9kdWxlTmFtZTogc3RyaW5nLCBuYW1lc3BhY2U6IHN0cmluZykge1xyXG4gICAgICAgIGNvbnN0IG1vZHVsZSA9IHRoaXMuY29ubmVjdGVkTW9kdWxlcy5nZXQobW9kdWxlTmFtZSk7XHJcbiAgICAgICAgaWYgKG1vZHVsZSkgbW9kdWxlLnJlbW92ZUludm9rYWJsZVdoaXRlTGlzdChub3RJbnZva2FibGVNb2R1bGVOYW1lLCBuYW1lc3BhY2UpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5Li65p+Q6L+e5o6l5re75Yqg5Y+v5o6l5pS25bm/5pKt55m95ZCN5Y2VXHJcbiAgICAgKiBAcGFyYW0gbW9kdWxlTmFtZSDmqKHlnZflkI3np7BcclxuICAgICAqIEBwYXJhbSByZWNlaXZhYmxlTW9kdWxlTmFtZSDlj6/mjqXmlLblub/mkq3nmoTmqKHlnZflkI1cclxuICAgICAqIEBwYXJhbSBuYW1lc3BhY2Ug5Y+v5o6l5pS255qE5bm/5pKt5ZG95ZCN56m66Ze0XHJcbiAgICAgKi9cclxuICAgIGFkZFJlY2VpdmFibGVXaGl0ZUxpc3QobW9kdWxlTmFtZTogc3RyaW5nLCByZWNlaXZhYmxlTW9kdWxlTmFtZTogc3RyaW5nLCBuYW1lc3BhY2U6IHN0cmluZykge1xyXG4gICAgICAgIGNvbnN0IG1vZHVsZSA9IHRoaXMuY29ubmVjdGVkTW9kdWxlcy5nZXQobW9kdWxlTmFtZSk7XHJcbiAgICAgICAgaWYgKG1vZHVsZSkgbW9kdWxlLmFkZFJlY2VpdmFibGVXaGl0ZUxpc3QocmVjZWl2YWJsZU1vZHVsZU5hbWUsIG5hbWVzcGFjZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDkuLrmn5Dov57mjqXliKDpmaTlj6/mjqXmlLblub/mkq3nmb3lkI3ljZVcclxuICAgICAqIEBwYXJhbSBtb2R1bGVOYW1lIOaooeWdl+WQjeensFxyXG4gICAgICogQHBhcmFtIG5vdFJlY2VpdmFibGVNb2R1bGVOYW1lIOS4jeWPr+aOpeaUtuW5v+aSreeahOaooeWdl+WQjVxyXG4gICAgICogQHBhcmFtIG5hbWVzcGFjZSDkuI3lj6/mjqXmlLbnmoTlub/mkq3lkb3lkI3nqbrpl7RcclxuICAgICAqL1xyXG4gICAgcmVtb3ZlUmVjZWl2YWJsZVdoaXRlTGlzdChtb2R1bGVOYW1lOiBzdHJpbmcsIG5vdFJlY2VpdmFibGVNb2R1bGVOYW1lOiBzdHJpbmcsIG5hbWVzcGFjZTogc3RyaW5nKSB7XHJcbiAgICAgICAgY29uc3QgbW9kdWxlID0gdGhpcy5jb25uZWN0ZWRNb2R1bGVzLmdldChtb2R1bGVOYW1lKTtcclxuICAgICAgICBpZiAobW9kdWxlKSBtb2R1bGUucmVtb3ZlUmVjZWl2YWJsZVdoaXRlTGlzdChub3RSZWNlaXZhYmxlTW9kdWxlTmFtZSwgbmFtZXNwYWNlKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyNlbmRyZWdpb25cclxuXHJcbiAgICAvLyNyZWdpb24g5LqL5Lu2XHJcblxyXG4gICAgb24oZXZlbnQ6ICdlcnJvcicsIGxpc3RlbmVyOiAoZXJyOiBFcnJvcikgPT4gdm9pZCk6IHRoaXM7XHJcbiAgICBvbihldmVudDogJ2xpc3RlbmluZycsIGxpc3RlbmVyOiAoKSA9PiB2b2lkKTogdGhpcztcclxuICAgIG9uKGV2ZW50OiAnY2xvc2UnLCBsaXN0ZW5lcjogKGVycjogRXJyb3IpID0+IHZvaWQpOiB0aGlzO1xyXG4gICAgb24oZXZlbnQ6ICdjb25uZWN0aW9uJywgbGlzdGVuZXI6IChzb2NrZXQ6IFNlcnZlclNvY2tldCwgcmVxOiBodHRwLkluY29taW5nTWVzc2FnZSkgPT4gdm9pZCk6IHRoaXM7XHJcbiAgICAvKipcclxuICAgICAqIOW9k+acieaooeWdl+ecn+ato+S4jui3r+eUseWZqOW7uueri+S4iui/nuaOpeWQjuinpuWPkVxyXG4gICAgICovXHJcbiAgICBvbihldmVudDogJ21vZHVsZV9jb25uZWN0ZWQnLCBsaXN0ZW5lcjogKG1vZHVsZTogQ29ubmVjdGVkTW9kdWxlKSA9PiB2b2lkKTogdGhpcztcclxuICAgIC8qKlxyXG4gICAgICog5b2T5pyJ5qih5Z2X5LiO6Lev55Sx5Zmo5pat5byA6L+e5o6l5ZCO6Kem5Y+RXHJcbiAgICAgKi9cclxuICAgIG9uKGV2ZW50OiAnbW9kdWxlX2Rpc2Nvbm5lY3RlZCcsIGxpc3RlbmVyOiAobW9kdWxlOiBDb25uZWN0ZWRNb2R1bGUpID0+IHZvaWQpOiB0aGlzO1xyXG4gICAgLyoqXHJcbiAgICAgKiDlvZPmjqXmlLbliLDmqKHlnZfkvKDmnaXnmoTmtojmga/lkI7op6blj5HvvIzpgJrov4fov5nkuKrlj6/ku6XlgZrkuIDkupvmtYHph4/orqHmlbDmlrnpnaLnmoTlt6XkvZxcclxuICAgICAqL1xyXG4gICAgb24oZXZlbnQ6ICdyZWNlaXZlZE1lc3NhZ2UnLCBsaXN0ZW5lcjogKGhlYWRlcjogYW55W10sIGJvZHk6IEJ1ZmZlciwgbW9kdWxlOiBDb25uZWN0ZWRNb2R1bGUpID0+IHZvaWQpOiB0aGlzO1xyXG4gICAgLyoqXHJcbiAgICAgKiDlvZPlkJHmqKHlnZflj5Hlh7rmtojmga/lkI7op6blj5FcclxuICAgICAqL1xyXG4gICAgb24oZXZlbnQ6ICdzZW50TWVzc2FnZScsIGxpc3RlbmVyOiAoaGVhZGVyOiBhbnlbXSwgYm9keTogQnVmZmVyLCBtb2R1bGU6IENvbm5lY3RlZE1vZHVsZSkgPT4gdm9pZCk6IHRoaXM7XHJcbiAgICAvKipcclxuICAgICAqIOW9k+afkOS4quaooeWdl+eahOihjOS4uuS4jeespuWQiOinhOiMg+aXtuinpuWPke+8jOmAmui/h+i/meS4quWPr+S7peWBmuS4gOS6m+aooeWdl+mUmeivr+iuoeaVsFxyXG4gICAgICovXHJcbiAgICBvbihldmVudDogJ2V4Y2hhbmdlRXJyb3InLCBsaXN0ZW5lcjogKHR5cGU6IEVycm9yVHlwZSwgbW9kdWxlOiBDb25uZWN0ZWRNb2R1bGUpID0+IHZvaWQpOiB0aGlzO1xyXG4gICAgb24oZXZlbnQ6IGFueSwgbGlzdGVuZXI6IGFueSkge1xyXG4gICAgICAgIHN1cGVyLm9uKGV2ZW50LCBsaXN0ZW5lcik7XHJcbiAgICAgICAgcmV0dXJuIHRoaXM7XHJcbiAgICB9XHJcblxyXG4gICAgb25jZShldmVudDogJ2Vycm9yJywgbGlzdGVuZXI6IChlcnI6IEVycm9yKSA9PiB2b2lkKTogdGhpcztcclxuICAgIG9uY2UoZXZlbnQ6ICdsaXN0ZW5pbmcnLCBsaXN0ZW5lcjogKCkgPT4gdm9pZCk6IHRoaXM7XHJcbiAgICBvbmNlKGV2ZW50OiAnY2xvc2UnLCBsaXN0ZW5lcjogKGVycjogRXJyb3IpID0+IHZvaWQpOiB0aGlzO1xyXG4gICAgb25jZShldmVudDogJ2Nvbm5lY3Rpb24nLCBsaXN0ZW5lcjogKHNvY2tldDogU2VydmVyU29ja2V0LCByZXE6IGh0dHAuSW5jb21pbmdNZXNzYWdlKSA9PiB2b2lkKTogdGhpcztcclxuICAgIG9uY2UoZXZlbnQ6ICdtb2R1bGVfY29ubmVjdGVkJywgbGlzdGVuZXI6IChtb2R1bGU6IENvbm5lY3RlZE1vZHVsZSkgPT4gdm9pZCk6IHRoaXM7XHJcbiAgICBvbmNlKGV2ZW50OiAnbW9kdWxlX2Rpc2Nvbm5lY3RlZCcsIGxpc3RlbmVyOiAobW9kdWxlOiBDb25uZWN0ZWRNb2R1bGUpID0+IHZvaWQpOiB0aGlzO1xyXG4gICAgb25jZShldmVudDogJ3JlY2VpdmVkTWVzc2FnZScsIGxpc3RlbmVyOiAoaGVhZGVyOiBhbnlbXSwgYm9keTogQnVmZmVyLCBtb2R1bGU6IENvbm5lY3RlZE1vZHVsZSkgPT4gdm9pZCk6IHRoaXM7XHJcbiAgICBvbmNlKGV2ZW50OiAnc2VudE1lc3NhZ2UnLCBsaXN0ZW5lcjogKGhlYWRlcjogYW55W10sIGJvZHk6IEJ1ZmZlciwgbW9kdWxlOiBDb25uZWN0ZWRNb2R1bGUpID0+IHZvaWQpOiB0aGlzO1xyXG4gICAgb25jZShldmVudDogJ2V4Y2hhbmdlRXJyb3InLCBsaXN0ZW5lcjogKHR5cGU6IEVycm9yVHlwZSwgbW9kdWxlOiBDb25uZWN0ZWRNb2R1bGUpID0+IHZvaWQpOiB0aGlzO1xyXG4gICAgb25jZShldmVudDogYW55LCBsaXN0ZW5lcjogYW55KSB7XHJcbiAgICAgICAgc3VwZXIub25jZShldmVudCwgbGlzdGVuZXIpO1xyXG4gICAgICAgIHJldHVybiB0aGlzO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICog6Kem5Y+RcmVjZWl2ZWRNZXNzYWdl5LqL5Lu2XHJcbiAgICAgKi9cclxuICAgIF9lbWl0UmVjZWl2ZWRNZXNzYWdlKGhlYWRlcjogYW55W10sIGJvZHk6IEJ1ZmZlciwgbW9kdWxlOiBDb25uZWN0ZWRNb2R1bGUpIHtcclxuICAgICAgICBpZiAodGhpcy5lbWl0UmVjZWl2ZWRNZXNzYWdlKVxyXG4gICAgICAgICAgICB0aGlzLmVtaXQoJ3JlY2VpdmVkTWVzc2FnZScsIGhlYWRlciwgYm9keSwgbW9kdWxlKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIOinpuWPkXNlbnRNZXNzYWdl5LqL5Lu2XHJcbiAgICAgKi9cclxuICAgIF9lbWl0U2VudE1lc3NhZ2UoaGVhZGVyOiBzdHJpbmcsIGJvZHk6IEJ1ZmZlciwgbW9kdWxlOiBDb25uZWN0ZWRNb2R1bGUpIHtcclxuICAgICAgICBpZiAodGhpcy5lbWl0U2VudE1lc3NhZ2UpXHJcbiAgICAgICAgICAgIHRoaXMuZW1pdCgnc2VudE1lc3NhZ2UnLCBKU09OLnBhcnNlKGhlYWRlciksIGJvZHksIG1vZHVsZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDop6blj5FleGNoYW5nZUVycm9y5LqL5Lu2XHJcbiAgICAgKi9cclxuICAgIF9lbWl0RXhjaGFuZ2VFcnJvcih0eXBlOiBFcnJvclR5cGUsIG1vZHVsZTogQ29ubmVjdGVkTW9kdWxlKSB7XHJcbiAgICAgICAgaWYgKHRoaXMuZW1pdEV4Y2hhbmdlRXJyb3IpXHJcbiAgICAgICAgICAgIHRoaXMuZW1pdCgnZXhjaGFuZ2VFcnJvcicsIHR5cGUsIG1vZHVsZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8jZW5kcmVnaW9uXHJcbn0iXX0=
