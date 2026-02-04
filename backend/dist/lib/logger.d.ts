import pino from "pino";
export declare const logger: pino.Logger<never, boolean>;
export declare function createLogger(context: string): pino.Logger<never, boolean>;
export declare const httpLoggerConfig: {
    logger: pino.Logger<never, boolean>;
    genReqId: (req: {
        id?: string;
        headers: {
            "x-request-id"?: string;
        };
    }) => string;
    serializers: {
        req: (req: {
            id: string;
            method: string;
            url: string;
            headers: Record<string, string>;
            remoteAddress: string;
        }) => {
            id: string;
            method: string;
            url: string;
            userAgent: string;
            remoteAddress: string;
        };
        res: (res: {
            statusCode: number;
        }) => {
            statusCode: number;
        };
    };
    customSuccessMessage: (req: {
        method: string;
        url: string;
    }, res: {
        statusCode: number;
    }) => string;
    customErrorMessage: (req: {
        method: string;
        url: string;
    }, res: {
        statusCode: number;
    }) => string;
    autoLogging: {
        ignore: (req: {
            url?: string;
        }) => boolean;
    };
};
export default logger;
//# sourceMappingURL=logger.d.ts.map