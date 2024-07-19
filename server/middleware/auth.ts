import jwt, { JwtPayload } from 'jsonwebtoken';
import {Request,Response,NextFunction} from 'express'
import { CatchAsyncError } from './catchAsyncErrors'
import ErrorHandler from '../utils/ErrorHandler';
import { redis } from '../utils/redis';
import { IRequest } from '../types/custom';

export const isAuthenticated = CatchAsyncError(async(req: Request, res: Response, next: NextFunction) => {
    const access_token = req.cookies.access_token;
    //const access_token = req.headers['access-token'] as string;
    //const access_token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY2OTY3YTljOTg0ZDcxMTMxODZiYTE4MiIsImlhdCI6MTcyMTI4NzI5MX0.uvWwZ5E4ij7OzL0D29Kf3O8kerq1apUNm-TsOnSubIQ';
    //console.log('access_token: ', req.cookies)
    if(!access_token){
        return next(new ErrorHandler("Please login to access this resourse", 400));
    }

    const decoded = jwt.verify(access_token, process.env.ACCESS_TOKEN as string) as JwtPayload;
    console.log('decoded: ', decoded)
    if(!decoded){
        return next(new ErrorHandler("Access token is not valid", 400));
    }

    const user = await redis.get(decoded.id)
    if(!user){
        return next(new ErrorHandler("User not found", 400));
    }

    req.user = JSON.parse(user);

    next();
});

// validate user Roles
export const authorizeRoles = (...roles: string[]) => {
    return (req: Request, res:Response, next:NextFunction) => {
        if(!roles.includes(req.user?.role ||  '')){
            return next(new ErrorHandler(`Role ${req.user?.role} is not allowed to access this resource`, 403));
        }

        next();
    }
}