require("dotenv").config();
import express, { NextFunction, Response, Request } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import {ErrorMiddleware} from "./middleware/error";
import userRouter from "./routes/user.route";

export const app = express();

// body parser
app.use(express.json({ limit: "50mb" }));

//cookie parser
app.use(cookieParser());

//cors
app.use(cors({ origin: process.env.ORIGIN }));

// routes
app.use('/api/v1', userRouter)

// testing api
app.get("/api", (req: Request, res: Response, next: NextFunction) => {
  res.status(200).json({
    success: true,
    message: "Welcome to the API",
  });
});

// unknown route error
app.all("*", (req: Request, res: Response, next: NextFunction) => {
  const error = new Error(`Route ${req.originalUrl} not found`) as any;
  res.status(404);
  next(error);
});

app.use(ErrorMiddleware);
