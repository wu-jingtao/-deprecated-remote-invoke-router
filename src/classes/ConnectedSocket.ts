import { BaseSocket } from "binary-ws/bin/BaseSocket/classes/BaseSocket";

/**
 * 与路由器建立上连接的接口
 */
export class ConnectedSocket {
    /**
     * errorNumber 错误清零计时器
     */
    private _timer: NodeJS.Timer;

    /**
     * 在转发该接口消息的过程中发生了多少次错误。
     * 默认，在10分钟内如果errorNumber超过了20条则断开连接，过了10分钟没有超过则清0。
     */
    private _errorNumber: number = 0;
    get errorNumber() {
        return this._errorNumber;
    }
    set errorNumber(v) {
        if (v === 1)
            this._timer = setTimeout(() => { this._errorNumber = 0; }, 10 * 60 * 1000);
        else if (v > 20)
            this.socket.close();

        this._errorNumber = v;
    }

    /**
     * 该模块可调用其他模块的白名单列表。      
     * key：其他模块的名称     
     * value：可调用的命名空间列表     
     */
    readonly invokingWhiteList: Map<string, Set<string>> = new Map();

    /**
     * 该模块可以接收的广播白名单
     * key：其他模块的名称     
     * value：可接收的命名空间列表     
     */
    readonly broadcastingWhiteList: Map<string, Set<string>> = new Map();

    constructor(
        /**
         * 所连接的接口
         */
        readonly socket: BaseSocket,

        /**
         * 连接对应的模块名称    
         */
        readonly moduleName: string
    ) {
        socket.once('close', () => clearTimeout(this._timer)); 
    }
}