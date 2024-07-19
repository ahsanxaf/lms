class ErrorHandler extends Error{
    statusCode: Number;
    constructor(message: any, stausCode: Number){
        super(message);

        this.statusCode = stausCode;

        Error.captureStackTrace(this, this.constructor)
    }
}

export default ErrorHandler;