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
         * 是否将发生的Exchange错误打印到控制台（用于调试）。需要将emitExchangeError设置为true才生效
         */
        this.printExchangeError = false;
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
                    .location.green.bold.round
                    .text
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
                    .location.cyan.bold.round
                    .text
                    .content.cyan('remote-invoke-router', '发送到', module.moduleName, JSON.stringify(result, undefined, 4));
            }
        });
        this.on("exchangeError", (type, module) => {
            if (this.printExchangeError) {
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

//# sourceMappingURL=data:application/json;charset=utf8;base64,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NUIsTUFBTSxDQUFDLElBQUksQ0FBQztJQUNoQixDQUFDO0lBRUQ7O09BRUc7SUFDSCxvQkFBb0IsQ0FBQyxNQUFhLEVBQUUsSUFBWSxFQUFFLE1BQXVCO1FBQ3JFLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxtQkFBbUIsQ0FBQztZQUN6QixJQUFJLENBQUMsSUFBSSxDQUFDLGlCQUFpQixFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFDM0QsQ0FBQztJQUVEOztPQUVHO0lBQ0gsZ0JBQWdCLENBQUMsTUFBYyxFQUFFLElBQVksRUFBRSxNQUF1QjtRQUNsRSxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDO1lBQ3JCLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLEVBQUUsSUFBSSxFQUFFLE1BQU0sQ0FBQyxDQUFDO0lBQ25FLENBQUM7SUFFRDs7T0FFRztJQUNILGtCQUFrQixDQUFDLElBQWUsRUFBRSxNQUF1QjtRQUN2RCxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUM7WUFDdkIsSUFBSSxDQUFDLElBQUksQ0FBQyxlQUFlLEVBQUUsSUFBSSxFQUFFLE1BQU0sQ0FBQyxDQUFDO0lBQ2pELENBQUM7Q0FHSjtBQWhRRCxnREFnUUMiLCJmaWxlIjoiUmVtb3RlSW52b2tlUm91dGVyLmpzIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgaHR0cCBmcm9tICdodHRwJztcclxuaW1wb3J0ICogYXMgaHR0cHMgZnJvbSAnaHR0cHMnO1xyXG5pbXBvcnQgeyBTZXJ2ZXIsIFNlcnZlclNvY2tldCB9IGZyb20gJ2JpbmFyeS13cyc7XHJcbmltcG9ydCB7IEJhc2VTb2NrZXRDb25maWcgfSBmcm9tICdiaW5hcnktd3MvYmluL0Jhc2VTb2NrZXQvaW50ZXJmYWNlcy9CYXNlU29ja2V0Q29uZmlnJztcclxuaW1wb3J0IHsgTWVzc2FnZVR5cGUgfSBmcm9tICdyZW1vdGUtaW52b2tlJztcclxuaW1wb3J0IEV2ZW50U3BhY2UgZnJvbSAnZXZlbnRzcGFjZSc7XHJcbmltcG9ydCBsb2cgZnJvbSAnbG9nLWZvcm1hdHRlcic7XHJcblxyXG5pbXBvcnQgeyBDb25uZWN0ZWRNb2R1bGUgfSBmcm9tICcuL0Nvbm5lY3RlZE1vZHVsZSc7XHJcbmltcG9ydCB7IEVycm9yVHlwZSB9IGZyb20gJy4vRXJyb3JUeXBlJztcclxuXHJcbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBSZW1vdGVJbnZva2VSb3V0ZXIgZXh0ZW5kcyBTZXJ2ZXIge1xyXG5cclxuICAgIC8vI3JlZ2lvbiDlsZ7mgKfkuI7mnoTpgKBcclxuXHJcbiAgICAvKipcclxuICAgICAqIOS4jui3r+eUseWZqOi/nuaOpeeahOaooeWdlyAgICBcclxuICAgICAqIGtlee+8muaooeWdl+WQjeensFxyXG4gICAgICovXHJcbiAgICByZWFkb25seSBjb25uZWN0ZWRNb2R1bGVzOiBNYXA8c3RyaW5nLCBDb25uZWN0ZWRNb2R1bGU+ID0gbmV3IE1hcCgpO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICog5bm/5pKt5raI5oGv6L2s5Y+R5Lit5b+DXHJcbiAgICAgKi9cclxuICAgIHJlYWRvbmx5IGJyb2FkY2FzdEV4Y2hhbmdlQ2VudGVyID0gbmV3IEV2ZW50U3BhY2UoKTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIOaYr+WQpuinpuWPkXJlY2VpdmVkTWVzc2FnZeS6i+S7tlxyXG4gICAgICovXHJcbiAgICBlbWl0UmVjZWl2ZWRNZXNzYWdlID0gZmFsc2U7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDmmK/lkKbop6blj5FzZW50TWVzc2FnZeS6i+S7tlxyXG4gICAgICovXHJcbiAgICBlbWl0U2VudE1lc3NhZ2UgPSBmYWxzZTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIOaYr+WQpuinpuWPkWV4Y2hhbmdlRXJyb3Lkuovku7ZcclxuICAgICAqL1xyXG4gICAgZW1pdEV4Y2hhbmdlRXJyb3IgPSBmYWxzZTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIOaYr+WQpuaJk+WNsOaUtuWIsOWSjOWPkeWHuueahOa2iOaBr+WktOmDqO+8iOeUqOS6juiwg+ivle+8ieOAgumcgOimgeWwhmVtaXRSZWNlaXZlZE1lc3NhZ2XmiJZlbWl0U2VudE1lc3NhZ2Xorr7nva7kuLp0cnVl5omN55Sf5pWIXHJcbiAgICAgKi9cclxuICAgIHByaW50TWVzc2FnZUhlYWRlciA9IGZhbHNlO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICog5piv5ZCm5bCG5Y+R55Sf55qERXhjaGFuZ2XplJnor6/miZPljbDliLDmjqfliLblj7DvvIjnlKjkuo7osIPor5XvvInjgILpnIDopoHlsIZlbWl0RXhjaGFuZ2VFcnJvcuiuvue9ruS4unRydWXmiY3nlJ/mlYhcclxuICAgICAqL1xyXG4gICAgcHJpbnRFeGNoYW5nZUVycm9yID0gZmFsc2U7XHJcblxyXG4gICAgY29uc3RydWN0b3Ioc2VydmVyOiBodHRwLlNlcnZlciB8IGh0dHBzLlNlcnZlciwgY29uZmlnczogQmFzZVNvY2tldENvbmZpZykge1xyXG4gICAgICAgIHN1cGVyKHNlcnZlciwgY29uZmlncyk7XHJcblxyXG4gICAgICAgIHRoaXMub24oXCJjb25uZWN0aW9uXCIsIGFzeW5jIChzb2NrZXQsIHJlcSkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLm9uQ29ubmVjdGlvbihzb2NrZXQsIHJlcSk7XHJcblxyXG4gICAgICAgICAgICBpZiAocmVzdWx0ID09PSBmYWxzZSlcclxuICAgICAgICAgICAgICAgIHNvY2tldC5jbG9zZSgpO1xyXG4gICAgICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgICAgIGxldCBtb2R1bGUgPSB0aGlzLmNvbm5lY3RlZE1vZHVsZXMuZ2V0KHJlc3VsdCk7XHJcbiAgICAgICAgICAgICAgICBpZiAobW9kdWxlKSB7IC8v5LiN5YWB6K645LiA5Liq5qih5Z2X6YeN5aSN6L+e5o6lXHJcbiAgICAgICAgICAgICAgICAgICAgc29ja2V0LmNsb3NlKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fZW1pdEV4Y2hhbmdlRXJyb3IoRXJyb3JUeXBlLmR1cGxpY2F0ZUNvbm5lY3Rpb24sIG1vZHVsZSk7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIG1vZHVsZSA9IG5ldyBDb25uZWN0ZWRNb2R1bGUodGhpcywgc29ja2V0LCByZXN1bHQpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY29ubmVjdGVkTW9kdWxlcy5zZXQocmVzdWx0LCBtb2R1bGUpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZW1pdCgnbW9kdWxlX2Nvbm5lY3RlZCcsIG1vZHVsZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgc29ja2V0Lm9uY2UoJ2Nsb3NlJywgKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmNvbm5lY3RlZE1vZHVsZXMuZGVsZXRlKHJlc3VsdCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZW1pdCgnbW9kdWxlX2Rpc2Nvbm5lY3RlZCcsIG1vZHVsZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgdGhpcy5vbihcInJlY2VpdmVkTWVzc2FnZVwiLCAoaGVhZGVyLCBib2R5LCBtb2R1bGUpID0+IHtcclxuICAgICAgICAgICAgaWYgKHRoaXMucHJpbnRNZXNzYWdlSGVhZGVyKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogTWVzc2FnZVR5cGVbaGVhZGVyWzBdXSxcclxuICAgICAgICAgICAgICAgICAgICBzZW5kZXI6IGhlYWRlclsxXSxcclxuICAgICAgICAgICAgICAgICAgICByZWNlaXZlcjogaGVhZGVyWzJdLFxyXG4gICAgICAgICAgICAgICAgICAgIHBhdGg6IGhlYWRlclszXVxyXG4gICAgICAgICAgICAgICAgfTtcclxuXHJcbiAgICAgICAgICAgICAgICBsb2dcclxuICAgICAgICAgICAgICAgICAgICAubG9jYXRpb25cclxuICAgICAgICAgICAgICAgICAgICAubG9jYXRpb24uZ3JlZW4uYm9sZC5yb3VuZFxyXG4gICAgICAgICAgICAgICAgICAgIC50ZXh0XHJcbiAgICAgICAgICAgICAgICAgICAgLmNvbnRlbnQuZ3JlZW4oJ3JlbW90ZS1pbnZva2Utcm91dGVyJywgJ+aOpeaUtuWIsCcsIG1vZHVsZS5tb2R1bGVOYW1lLCBKU09OLnN0cmluZ2lmeShyZXN1bHQsIHVuZGVmaW5lZCwgNCkpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHRoaXMub24oXCJzZW50TWVzc2FnZVwiLCAoaGVhZGVyLCBib2R5LCBtb2R1bGUpID0+IHtcclxuICAgICAgICAgICAgaWYgKHRoaXMucHJpbnRNZXNzYWdlSGVhZGVyKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogTWVzc2FnZVR5cGVbaGVhZGVyWzBdXSxcclxuICAgICAgICAgICAgICAgICAgICBzZW5kZXI6IGhlYWRlclsxXSxcclxuICAgICAgICAgICAgICAgICAgICByZWNlaXZlcjogaGVhZGVyWzJdLFxyXG4gICAgICAgICAgICAgICAgICAgIHBhdGg6IGhlYWRlclszXVxyXG4gICAgICAgICAgICAgICAgfTtcclxuXHJcbiAgICAgICAgICAgICAgICBsb2dcclxuICAgICAgICAgICAgICAgICAgICAubG9jYXRpb25cclxuICAgICAgICAgICAgICAgICAgICAubG9jYXRpb24uY3lhbi5ib2xkLnJvdW5kXHJcbiAgICAgICAgICAgICAgICAgICAgLnRleHRcclxuICAgICAgICAgICAgICAgICAgICAuY29udGVudC5jeWFuKCdyZW1vdGUtaW52b2tlLXJvdXRlcicsICflj5HpgIHliLAnLCBtb2R1bGUubW9kdWxlTmFtZSwgSlNPTi5zdHJpbmdpZnkocmVzdWx0LCB1bmRlZmluZWQsIDQpKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB0aGlzLm9uKFwiZXhjaGFuZ2VFcnJvclwiLCAodHlwZSwgbW9kdWxlKSA9PiB7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLnByaW50RXhjaGFuZ2VFcnJvcikge1xyXG4gICAgICAgICAgICAgICAgbGV0IG1lc3NhZ2U7XHJcblxyXG4gICAgICAgICAgICAgICAgc3dpdGNoICh0eXBlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBFcnJvclR5cGUuZHVwbGljYXRlQ29ubmVjdGlvbjpcclxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZSA9IGDmqKHlnZdcIiR7bW9kdWxlLm1vZHVsZU5hbWV9XCLph43lpI3kuI7ot6/nlLHlmajlu7rnq4vov57mjqVgO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICBjYXNlIEVycm9yVHlwZS5zZW5kZXJOYW1lTm90Q29ycmVjdDpcclxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZSA9IGDmqKHlnZdcIiR7bW9kdWxlLm1vZHVsZU5hbWV9XCLlj5Hlh7rnmoTmtojmga/kuK3vvIzlj5HpgIHogIXnmoTlkI3np7DkuI7lrp7pmYXmqKHlnZflkI3np7DkuI3ljLnphY1gO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICBjYXNlIEVycm9yVHlwZS5leGNlZWRQYXRoTWF4TGVuZ3RoOlxyXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlID0gYOaooeWdl1wiJHttb2R1bGUubW9kdWxlTmFtZX1cIuWPkeWHuueahOa2iOaBr+S4re+8jHBhdGjotoXov4fkuobop4TlrprnmoTplb/luqZgO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICBjYXNlIEVycm9yVHlwZS5tZXNzYWdlRm9ybWF0RXJyb3I6XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2UgPSBg5qih5Z2XXCIke21vZHVsZS5tb2R1bGVOYW1lfVwi5Y+R5p2l55qE5raI5oGv5qC85byP5pyJ6Zeu6aKYYDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBFcnJvclR5cGUubWVzc2FnZVR5cGVFcnJvcjpcclxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZSA9IGDmqKHlnZdcIiR7bW9kdWxlLm1vZHVsZU5hbWV9XCLlj5HmnaXkuobmnKrnn6XnsbvlnovnmoTmtojmga9gO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICBsb2cud2FyblxyXG4gICAgICAgICAgICAgICAgICAgIC5sb2NhdGlvbi53aGl0ZVxyXG4gICAgICAgICAgICAgICAgICAgIC5sb2NhdGlvbi5ib2xkXHJcbiAgICAgICAgICAgICAgICAgICAgLmNvbnRlbnQueWVsbG93KCdyZW1vdGUtaW52b2tlLXJvdXRlcicsIG1vZHVsZS5tb2R1bGVOYW1lLCBtZXNzYWdlKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8vI2VuZHJlZ2lvblxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5q+P5b2T5pyJ5LiA5Liq5paw55qE6L+e5o6l6KKr5Yib5bu677yM6K+l5pa55rOV5bCx5Lya6KKr6Kem5Y+R44CC6L+U5ZueZmFsc2XooajnpLrmi5Lnu53ov57mjqXvvIzov5Tlm55zdHJpbmfooajnpLrmjqXlj5fov57mjqXjgILmraTlrZfnrKbkuLLku6Pooajor6XmjqXlj6PmiYDov57mjqXmqKHlnZfnmoTlkI3np7BcclxuICAgICAqIEBwYXJhbSBzb2NrZXQgd2Vic29ja2V0XHJcbiAgICAgKiBAcGFyYW0gcmVxIOWuouaIt+err+WQkei3r+eUseWZqOW7uueri+i/nuaOpeaXtuWPkemAgeeahGdldOivt+axglxyXG4gICAgICovXHJcbiAgICBhYnN0cmFjdCBvbkNvbm5lY3Rpb24oc29ja2V0OiBTZXJ2ZXJTb2NrZXQsIHJlcTogaHR0cC5JbmNvbWluZ01lc3NhZ2UpOiBQcm9taXNlPGZhbHNlIHwgc3RyaW5nPjtcclxuXHJcbiAgICAvLyNyZWdpb24g5aKe5YeP55m95ZCN5Y2VXHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDkuLrmn5Dov57mjqXmt7vliqDlj6/osIPnlKjnmb3lkI3ljZVcclxuICAgICAqIEBwYXJhbSBtb2R1bGVOYW1lIOaooeWdl+WQjeensFxyXG4gICAgICogQHBhcmFtIGludm9rYWJsZU1vZHVsZU5hbWUg5Y+v6LCD55So55qE5qih5Z2X5ZCN56ewXHJcbiAgICAgKiBAcGFyYW0gbmFtZXNwYWNlIOWFgeiuuOWFtuiuv+mXrueahOWRveWQjeepuumXtFxyXG4gICAgICovXHJcbiAgICBhZGRJbnZva2FibGVXaGl0ZUxpc3QobW9kdWxlTmFtZTogc3RyaW5nLCBpbnZva2FibGVNb2R1bGVOYW1lOiBzdHJpbmcsIG5hbWVzcGFjZTogc3RyaW5nKSB7XHJcbiAgICAgICAgY29uc3QgbW9kdWxlID0gdGhpcy5jb25uZWN0ZWRNb2R1bGVzLmdldChtb2R1bGVOYW1lKTtcclxuICAgICAgICBpZiAobW9kdWxlKSBtb2R1bGUuYWRkSW52b2thYmxlV2hpdGVMaXN0KGludm9rYWJsZU1vZHVsZU5hbWUsIG5hbWVzcGFjZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDkuLrmn5Dov57mjqXliKDpmaTlj6/osIPnlKjnmb3lkI3ljZVcclxuICAgICAqIEBwYXJhbSBtb2R1bGVOYW1lIOaooeWdl+WQjeensFxyXG4gICAgICogQHBhcmFtIG5vdEludm9rYWJsZU1vZHVsZU5hbWUg5LiN5YWB6K646LCD55So55qE5qih5Z2X5ZCN56ewXHJcbiAgICAgKiBAcGFyYW0gbmFtZXNwYWNlIOS4jeWFgeiuuOWFtuiuv+mXrueahOWRveWQjeepuumXtFxyXG4gICAgICovXHJcbiAgICByZW1vdmVJbnZva2FibGVXaGl0ZUxpc3QobW9kdWxlTmFtZTogc3RyaW5nLCBub3RJbnZva2FibGVNb2R1bGVOYW1lOiBzdHJpbmcsIG5hbWVzcGFjZTogc3RyaW5nKSB7XHJcbiAgICAgICAgY29uc3QgbW9kdWxlID0gdGhpcy5jb25uZWN0ZWRNb2R1bGVzLmdldChtb2R1bGVOYW1lKTtcclxuICAgICAgICBpZiAobW9kdWxlKSBtb2R1bGUucmVtb3ZlSW52b2thYmxlV2hpdGVMaXN0KG5vdEludm9rYWJsZU1vZHVsZU5hbWUsIG5hbWVzcGFjZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDkuLrmn5Dov57mjqXmt7vliqDlj6/mjqXmlLblub/mkq3nmb3lkI3ljZVcclxuICAgICAqIEBwYXJhbSBtb2R1bGVOYW1lIOaooeWdl+WQjeensFxyXG4gICAgICogQHBhcmFtIHJlY2VpdmFibGVNb2R1bGVOYW1lIOWPr+aOpeaUtuW5v+aSreeahOaooeWdl+WQjVxyXG4gICAgICogQHBhcmFtIG5hbWVzcGFjZSDlj6/mjqXmlLbnmoTlub/mkq3lkb3lkI3nqbrpl7RcclxuICAgICAqL1xyXG4gICAgYWRkUmVjZWl2YWJsZVdoaXRlTGlzdChtb2R1bGVOYW1lOiBzdHJpbmcsIHJlY2VpdmFibGVNb2R1bGVOYW1lOiBzdHJpbmcsIG5hbWVzcGFjZTogc3RyaW5nKSB7XHJcbiAgICAgICAgY29uc3QgbW9kdWxlID0gdGhpcy5jb25uZWN0ZWRNb2R1bGVzLmdldChtb2R1bGVOYW1lKTtcclxuICAgICAgICBpZiAobW9kdWxlKSBtb2R1bGUuYWRkUmVjZWl2YWJsZVdoaXRlTGlzdChyZWNlaXZhYmxlTW9kdWxlTmFtZSwgbmFtZXNwYWNlKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIOS4uuafkOi/nuaOpeWIoOmZpOWPr+aOpeaUtuW5v+aSreeZveWQjeWNlVxyXG4gICAgICogQHBhcmFtIG1vZHVsZU5hbWUg5qih5Z2X5ZCN56ewXHJcbiAgICAgKiBAcGFyYW0gbm90UmVjZWl2YWJsZU1vZHVsZU5hbWUg5LiN5Y+v5o6l5pS25bm/5pKt55qE5qih5Z2X5ZCNXHJcbiAgICAgKiBAcGFyYW0gbmFtZXNwYWNlIOS4jeWPr+aOpeaUtueahOW5v+aSreWRveWQjeepuumXtFxyXG4gICAgICovXHJcbiAgICByZW1vdmVSZWNlaXZhYmxlV2hpdGVMaXN0KG1vZHVsZU5hbWU6IHN0cmluZywgbm90UmVjZWl2YWJsZU1vZHVsZU5hbWU6IHN0cmluZywgbmFtZXNwYWNlOiBzdHJpbmcpIHtcclxuICAgICAgICBjb25zdCBtb2R1bGUgPSB0aGlzLmNvbm5lY3RlZE1vZHVsZXMuZ2V0KG1vZHVsZU5hbWUpO1xyXG4gICAgICAgIGlmIChtb2R1bGUpIG1vZHVsZS5yZW1vdmVSZWNlaXZhYmxlV2hpdGVMaXN0KG5vdFJlY2VpdmFibGVNb2R1bGVOYW1lLCBuYW1lc3BhY2UpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vI2VuZHJlZ2lvblxyXG5cclxuICAgIC8vI3JlZ2lvbiDkuovku7ZcclxuXHJcbiAgICBvbihldmVudDogJ2Vycm9yJywgbGlzdGVuZXI6IChlcnI6IEVycm9yKSA9PiB2b2lkKTogdGhpcztcclxuICAgIG9uKGV2ZW50OiAnbGlzdGVuaW5nJywgbGlzdGVuZXI6ICgpID0+IHZvaWQpOiB0aGlzO1xyXG4gICAgb24oZXZlbnQ6ICdjbG9zZScsIGxpc3RlbmVyOiAoZXJyOiBFcnJvcikgPT4gdm9pZCk6IHRoaXM7XHJcbiAgICBvbihldmVudDogJ2Nvbm5lY3Rpb24nLCBsaXN0ZW5lcjogKHNvY2tldDogU2VydmVyU29ja2V0LCByZXE6IGh0dHAuSW5jb21pbmdNZXNzYWdlKSA9PiB2b2lkKTogdGhpcztcclxuICAgIC8qKlxyXG4gICAgICog5b2T5pyJ5qih5Z2X55yf5q2j5LiO6Lev55Sx5Zmo5bu656uL5LiK6L+e5o6l5ZCO6Kem5Y+RXHJcbiAgICAgKi9cclxuICAgIG9uKGV2ZW50OiAnbW9kdWxlX2Nvbm5lY3RlZCcsIGxpc3RlbmVyOiAobW9kdWxlOiBDb25uZWN0ZWRNb2R1bGUpID0+IHZvaWQpOiB0aGlzO1xyXG4gICAgLyoqXHJcbiAgICAgKiDlvZPmnInmqKHlnZfkuI7ot6/nlLHlmajmlq3lvIDov57mjqXlkI7op6blj5FcclxuICAgICAqL1xyXG4gICAgb24oZXZlbnQ6ICdtb2R1bGVfZGlzY29ubmVjdGVkJywgbGlzdGVuZXI6IChtb2R1bGU6IENvbm5lY3RlZE1vZHVsZSkgPT4gdm9pZCk6IHRoaXM7XHJcbiAgICAvKipcclxuICAgICAqIOW9k+aOpeaUtuWIsOaooeWdl+S8oOadpeeahOa2iOaBr+WQjuinpuWPke+8jOmAmui/h+i/meS4quWPr+S7peWBmuS4gOS6m+a1gemHj+iuoeaVsOaWuemdoueahOW3peS9nFxyXG4gICAgICovXHJcbiAgICBvbihldmVudDogJ3JlY2VpdmVkTWVzc2FnZScsIGxpc3RlbmVyOiAoaGVhZGVyOiBhbnlbXSwgYm9keTogQnVmZmVyLCBtb2R1bGU6IENvbm5lY3RlZE1vZHVsZSkgPT4gdm9pZCk6IHRoaXM7XHJcbiAgICAvKipcclxuICAgICAqIOW9k+WQkeaooeWdl+WPkeWHuua2iOaBr+WQjuinpuWPkVxyXG4gICAgICovXHJcbiAgICBvbihldmVudDogJ3NlbnRNZXNzYWdlJywgbGlzdGVuZXI6IChoZWFkZXI6IGFueVtdLCBib2R5OiBCdWZmZXIsIG1vZHVsZTogQ29ubmVjdGVkTW9kdWxlKSA9PiB2b2lkKTogdGhpcztcclxuICAgIC8qKlxyXG4gICAgICog5b2T5p+Q5Liq5qih5Z2X55qE6KGM5Li65LiN56ym5ZCI6KeE6IyD5pe26Kem5Y+R77yM6YCa6L+H6L+Z5Liq5Y+v5Lul5YGa5LiA5Lqb5qih5Z2X6ZSZ6K+v6K6h5pWwXHJcbiAgICAgKi9cclxuICAgIG9uKGV2ZW50OiAnZXhjaGFuZ2VFcnJvcicsIGxpc3RlbmVyOiAodHlwZTogRXJyb3JUeXBlLCBtb2R1bGU6IENvbm5lY3RlZE1vZHVsZSkgPT4gdm9pZCk6IHRoaXM7XHJcbiAgICBvbihldmVudDogYW55LCBsaXN0ZW5lcjogYW55KSB7XHJcbiAgICAgICAgc3VwZXIub24oZXZlbnQsIGxpc3RlbmVyKTtcclxuICAgICAgICByZXR1cm4gdGhpcztcclxuICAgIH1cclxuXHJcbiAgICBvbmNlKGV2ZW50OiAnZXJyb3InLCBsaXN0ZW5lcjogKGVycjogRXJyb3IpID0+IHZvaWQpOiB0aGlzO1xyXG4gICAgb25jZShldmVudDogJ2xpc3RlbmluZycsIGxpc3RlbmVyOiAoKSA9PiB2b2lkKTogdGhpcztcclxuICAgIG9uY2UoZXZlbnQ6ICdjbG9zZScsIGxpc3RlbmVyOiAoZXJyOiBFcnJvcikgPT4gdm9pZCk6IHRoaXM7XHJcbiAgICBvbmNlKGV2ZW50OiAnY29ubmVjdGlvbicsIGxpc3RlbmVyOiAoc29ja2V0OiBTZXJ2ZXJTb2NrZXQsIHJlcTogaHR0cC5JbmNvbWluZ01lc3NhZ2UpID0+IHZvaWQpOiB0aGlzO1xyXG4gICAgb25jZShldmVudDogJ21vZHVsZV9jb25uZWN0ZWQnLCBsaXN0ZW5lcjogKG1vZHVsZTogQ29ubmVjdGVkTW9kdWxlKSA9PiB2b2lkKTogdGhpcztcclxuICAgIG9uY2UoZXZlbnQ6ICdtb2R1bGVfZGlzY29ubmVjdGVkJywgbGlzdGVuZXI6IChtb2R1bGU6IENvbm5lY3RlZE1vZHVsZSkgPT4gdm9pZCk6IHRoaXM7XHJcbiAgICBvbmNlKGV2ZW50OiAncmVjZWl2ZWRNZXNzYWdlJywgbGlzdGVuZXI6IChoZWFkZXI6IGFueVtdLCBib2R5OiBCdWZmZXIsIG1vZHVsZTogQ29ubmVjdGVkTW9kdWxlKSA9PiB2b2lkKTogdGhpcztcclxuICAgIG9uY2UoZXZlbnQ6ICdzZW50TWVzc2FnZScsIGxpc3RlbmVyOiAoaGVhZGVyOiBhbnlbXSwgYm9keTogQnVmZmVyLCBtb2R1bGU6IENvbm5lY3RlZE1vZHVsZSkgPT4gdm9pZCk6IHRoaXM7XHJcbiAgICBvbmNlKGV2ZW50OiAnZXhjaGFuZ2VFcnJvcicsIGxpc3RlbmVyOiAodHlwZTogRXJyb3JUeXBlLCBtb2R1bGU6IENvbm5lY3RlZE1vZHVsZSkgPT4gdm9pZCk6IHRoaXM7XHJcbiAgICBvbmNlKGV2ZW50OiBhbnksIGxpc3RlbmVyOiBhbnkpIHtcclxuICAgICAgICBzdXBlci5vbmNlKGV2ZW50LCBsaXN0ZW5lcik7XHJcbiAgICAgICAgcmV0dXJuIHRoaXM7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDop6blj5FyZWNlaXZlZE1lc3NhZ2Xkuovku7ZcclxuICAgICAqL1xyXG4gICAgX2VtaXRSZWNlaXZlZE1lc3NhZ2UoaGVhZGVyOiBhbnlbXSwgYm9keTogQnVmZmVyLCBtb2R1bGU6IENvbm5lY3RlZE1vZHVsZSkge1xyXG4gICAgICAgIGlmICh0aGlzLmVtaXRSZWNlaXZlZE1lc3NhZ2UpXHJcbiAgICAgICAgICAgIHRoaXMuZW1pdCgncmVjZWl2ZWRNZXNzYWdlJywgaGVhZGVyLCBib2R5LCBtb2R1bGUpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICog6Kem5Y+Rc2VudE1lc3NhZ2Xkuovku7ZcclxuICAgICAqL1xyXG4gICAgX2VtaXRTZW50TWVzc2FnZShoZWFkZXI6IHN0cmluZywgYm9keTogQnVmZmVyLCBtb2R1bGU6IENvbm5lY3RlZE1vZHVsZSkge1xyXG4gICAgICAgIGlmICh0aGlzLmVtaXRTZW50TWVzc2FnZSlcclxuICAgICAgICAgICAgdGhpcy5lbWl0KCdzZW50TWVzc2FnZScsIEpTT04ucGFyc2UoaGVhZGVyKSwgYm9keSwgbW9kdWxlKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIOinpuWPkWV4Y2hhbmdlRXJyb3Lkuovku7ZcclxuICAgICAqL1xyXG4gICAgX2VtaXRFeGNoYW5nZUVycm9yKHR5cGU6IEVycm9yVHlwZSwgbW9kdWxlOiBDb25uZWN0ZWRNb2R1bGUpIHtcclxuICAgICAgICBpZiAodGhpcy5lbWl0RXhjaGFuZ2VFcnJvcilcclxuICAgICAgICAgICAgdGhpcy5lbWl0KCdleGNoYW5nZUVycm9yJywgdHlwZSwgbW9kdWxlKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyNlbmRyZWdpb25cclxufSJdfQ==
