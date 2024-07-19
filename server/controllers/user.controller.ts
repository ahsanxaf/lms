import userModel, { IUser } from "../models/user.model";
import { Request, Response, NextFunction } from "express";
import ErrorHandler from "../utils/ErrorHandler";
import { CatchAsyncError } from "../middleware/catchAsyncErrors";
import jwt, { JwtPayload, Secret } from "jsonwebtoken";
require("dotenv").config();
import ejs from "ejs";
import path from "path";
import sendMail from "../utils/sendMail";
import {
  accessTokenOptions,
  refreshTokenOptions,
  sendToken,
} from "../utils/jwt";
import { redis } from "../utils/redis";
import { IRequest } from "../types/custom";
import { getUserById } from "../services/user.service";
import cloudinary from 'cloudinary'

interface IRegistrationBody {
  name: string;
  email: string;
  password: string;
  avatar?: string;
}

// register user
export const registerUser = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, email, password } = req.body;

      const isEmailExists = await userModel.findOne({ email });
      if (isEmailExists) {
        return next(new ErrorHandler("Email already exists", 400));
      }

      const user: IRegistrationBody = {
        name,
        email,
        password,
      };

      const activationToken = createActivationToken(user);
      const activationCode = activationToken.activationCode;

      const data = { user: { name: user.name }, activationCode };

      // create html using ejs
      const html = await ejs.renderFile(
        path.join(__dirname, "../mails/activation-email.ejs"),
        data
      );

      try {
        await sendMail({
          email: user.email,
          subject: "Account Activation",
          template: "activation-email.ejs",
          data,
        });
        res.status(201).json({
          success: true,
          message: "Please check your email to activate your account",
          activationToken: activationToken.token,
        });
      } catch (error: any) {
        return next(new ErrorHandler(error.message, 400));
      }
    } catch (error: any) {
      return next(new ErrorHandler(error.message, 400));
    }
  }
);

interface IActivationToken {
  token: string;
  activationCode: string;
}

// create activation token function
export const createActivationToken = (user: any): IActivationToken => {
  const activationCode = Math.floor(1000 + Math.random() * 9000).toString();

  const token = jwt.sign(
    { user, activationCode },
    process.env.ACTIVATION_TOKEN_SECRET as Secret,
    { expiresIn: "5m" }
  );

  return { token, activationCode };
};

interface IActivationRequest {
  activation_token: string;
  activation_code: string;
}

//activate user
export const activateUser = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { activation_token, activation_code } =
        req.body as IActivationRequest;
      const newUser: { user: IUser; activationCode: string } = jwt.verify(
        activation_token,
        process.env.ACTIVATION_TOKEN_SECRET as Secret
      ) as { user: IUser; activationCode: string };

      if (newUser.activationCode !== activation_code) {
        return next(new ErrorHandler("Invalid activation code", 400));
      }

      const { name, email, password } = newUser.user;

      const existsUser = await userModel.findOne({ email });
      if (existsUser) {
        return next(new ErrorHandler("User already exists", 400));
      }

      const user = await userModel.create({
        name,
        email,
        password,
      });

      res.status(201).json({
        success: true,
      });
    } catch (error: any) {
      return next(new ErrorHandler(error.message, 400));
    }
  }
);

interface ILoginRequest {
  email: string;
  password: string;
}

//SIGN IN USER
export const loginUser = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body as ILoginRequest;
      if (!email || !password) {
        return next(new ErrorHandler("Please provide email and password", 400));
      }
      const user = await userModel.findOne({ email }).select("+password");

      if (!user) {
        return next(new ErrorHandler("Invalid email or password", 401));
      }

      const isPasswordMatch = await user.comparePassword(password);
      if (!isPasswordMatch) {
        return next(new ErrorHandler("Invalid email or password", 401));
      }

      sendToken(user, 200, res);
    } catch (error: any) {
      return next(new ErrorHandler(error.message, 400));
    }
  }
);

// logout user
export const logoutUser = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.cookie("access_token", null, { maxAge: 1 });
      res.cookie("refresh_token", null, { maxAge: 1 });
      const userId = req.user?._id || "";
      console.log("userId: ", req.user?._id);
      redis.del(userId as string);
      res.status(200).json({
        success: true,
        message: "Logged out successfully",
      });
    } catch (error: any) {
      return next(new ErrorHandler(error.message, 400));
    }
  }
);

// update access token
export const updateAccessToken = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const refresh_token = req.cookies.refresh_token as string;
      const decoded = jwt.verify(
        refresh_token,
        process.env.REFRESH_TOKEN as string
      ) as JwtPayload;
      if (!decoded) {
        return next(new ErrorHandler("Could not refresh token", 400));
      }
      const session = await redis.get(decoded.id as string);
      if (!session) {
        return next(new ErrorHandler("Could not refresh token", 400));
      }
      const user = JSON.parse(session);
      const accessToken = jwt.sign(
        { id: user._id },
        process.env.ACCESS_TOKEN as string,
        { expiresIn: "5m" }
      );
      const refreshToken = jwt.sign(
        { id: user._id },
        process.env.REFRESH_TOKEN as string,
        { expiresIn: "3d" }
      );
      req.user = user;
      res.cookie("access_token", accessToken, accessTokenOptions);
      res.cookie("refresh_token", refreshToken, refreshTokenOptions);
      res.status(200).json({
        status: "success",
        accessToken,
      });
    } catch (error: any) {
      return next(new ErrorHandler(error.message, 400));
    }
  }
);

// get user info
export const getUserInfo = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?._id;
      getUserById(<string>userId, res);
    } catch (error: any) {
      return next(new ErrorHandler(error.message, 400));
    }
  }
);

interface ISocialAuthBody {
  email: string;
  name: string;
  avatar: string;
}

// social auth
export const socialAuth = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, name, avatar } = req.body as ISocialAuthBody;
      const user = await userModel.findOne({ email });
      if (!user) {
        const newUser = await userModel.create({ email, name, avatar });
        sendToken(newUser, 200, res);
      } else {
        sendToken(user, 200, res);
      }
    } catch (error: any) {
      return next(new ErrorHandler(error.message, 400));
    }
  }
);

interface IUpdateUserInfo {
  name?: string;
  email?: string;
}

//update user info
export const updateUserInfo = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, email } = req.body as IUpdateUserInfo;
      const userId = req.user?._id;
      const user = await userModel.findById(userId);
      if (email && user) {
        const isEmailExists = await userModel.findOne({ email });
        if (isEmailExists) {
          return next(new ErrorHandler("Email already exists", 400));
        }
        user.email = email;
      }
      if (name && user) {
        user.name = name;
      }
      await user?.save();
      await redis.set(<string>userId, JSON.stringify(user));

      res.status(201).json({
        success: true,
        user,
      });
    } catch (error: any) {
      return next(new ErrorHandler(error.message, 400));
    }
  }
);

interface IUpdatePassword{
  oldPassword: string;
  newPassword: string;
}
//update user password
export const updatePassword = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {

      const {oldPassword, newPassword} = req.body as IUpdatePassword;
      if(!oldPassword || !newPassword){
        return next(new ErrorHandler("Please provide old and new password", 400));
      }
      const user = await userModel.findById(req.user?._id).select("+password");
      if(user?.password === undefined){
        return next(new ErrorHandler("Password is not set", 400));
      }
      const isPasswordMatch = await user?.comparePassword(oldPassword);
      if(!isPasswordMatch){
        return next(new ErrorHandler("Old password is incorrect", 400));
      }

      user.password = newPassword;
      await user?.save();
      await redis.set(<string>user?._id, JSON.stringify(user));
      res.status(201).json({
        success: true,
        user
      })

    } catch (error: any) {
      return next(new ErrorHandler(error.message, 400));
    }
  });

  interface IUpdateProfilePicture{
    avatar: string;
  }

  //update profile picture
  export const updateProfilePicture = CatchAsyncError(
    async (req: Request, res: Response, next: NextFunction) => {
      try {

        const {avatar} = req.body;
        const userId = req.user?._id;
        const user = await userModel.findById(userId);
        if(avatar && user){
          if(user?.avatar?.public_id){
            await cloudinary.v2.uploader.destroy(user?.avatar?.public_id);
          }else{
            const myCloud = await cloudinary.v2.uploader.upload(avatar,{
              folder: 'avatars',
              width: 150,
            });
  
            user.avatar = {
              public_id: myCloud.public_id,
              url: myCloud.secure_url
            }
          }
        }

      } catch (error: any) {
        return next(new ErrorHandler(error.message, 400));
      }
    });