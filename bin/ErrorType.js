"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 转发过程中可能发生的错误
 */
var ErrorType;
(function (ErrorType) {
    /**
     * 某模块重复连接
     */
    ErrorType[ErrorType["duplicateConnection"] = 0] = "duplicateConnection";
    /**
     * 消息中发送者的名称与实际模块名称不匹配
     */
    ErrorType[ErrorType["senderNameNotCorrect"] = 1] = "senderNameNotCorrect";
    /**
     * 发送者发出的消息path超过了规定的长度
     */
    ErrorType[ErrorType["exceedPathMaxLength"] = 2] = "exceedPathMaxLength";
    /**
     * 模块发来的消息格式有问题
     */
    ErrorType[ErrorType["messageFormatError"] = 3] = "messageFormatError";
    /**
     * 收到未知类型的消息
     */
    ErrorType[ErrorType["messageTypeError"] = 4] = "messageTypeError";
})(ErrorType = exports.ErrorType || (exports.ErrorType = {}));

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkVycm9yVHlwZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBOztHQUVHO0FBQ0gsSUFBWSxTQTBCWDtBQTFCRCxXQUFZLFNBQVM7SUFFakI7O09BRUc7SUFDSCx1RUFBbUIsQ0FBQTtJQUVuQjs7T0FFRztJQUNILHlFQUFvQixDQUFBO0lBRXBCOztPQUVHO0lBQ0gsdUVBQW1CLENBQUE7SUFFbkI7O09BRUc7SUFDSCxxRUFBa0IsQ0FBQTtJQUVsQjs7T0FFRztJQUNILGlFQUFnQixDQUFBO0FBQ3BCLENBQUMsRUExQlcsU0FBUyxHQUFULGlCQUFTLEtBQVQsaUJBQVMsUUEwQnBCIiwiZmlsZSI6IkVycm9yVHlwZS5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxyXG4gKiDovazlj5Hov4fnqIvkuK3lj6/og73lj5HnlJ/nmoTplJnor69cclxuICovXHJcbmV4cG9ydCBlbnVtIEVycm9yVHlwZSB7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDmn5DmqKHlnZfph43lpI3ov57mjqVcclxuICAgICAqL1xyXG4gICAgZHVwbGljYXRlQ29ubmVjdGlvbixcclxuXHJcbiAgICAvKipcclxuICAgICAqIOa2iOaBr+S4reWPkemAgeiAheeahOWQjeensOS4juWunumZheaooeWdl+WQjeensOS4jeWMuemFjVxyXG4gICAgICovXHJcbiAgICBzZW5kZXJOYW1lTm90Q29ycmVjdCxcclxuXHJcbiAgICAvKipcclxuICAgICAqIOWPkemAgeiAheWPkeWHuueahOa2iOaBr3BhdGjotoXov4fkuobop4TlrprnmoTplb/luqZcclxuICAgICAqL1xyXG4gICAgZXhjZWVkUGF0aE1heExlbmd0aCxcclxuXHJcbiAgICAvKipcclxuICAgICAqIOaooeWdl+WPkeadpeeahOa2iOaBr+agvOW8j+aciemXrumimFxyXG4gICAgICovXHJcbiAgICBtZXNzYWdlRm9ybWF0RXJyb3IsXHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDmlLbliLDmnKrnn6XnsbvlnovnmoTmtojmga9cclxuICAgICAqL1xyXG4gICAgbWVzc2FnZVR5cGVFcnJvcixcclxufSJdfQ==
