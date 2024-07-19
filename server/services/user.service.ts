import { Response } from "express"
import userModel from "../models/user.model"
import { redis } from "../utils/redis";


// get user by id
export const getUserById = async(id: string, res: Response) => {
    const userjson = await redis.get(id);
    if (!userjson) {
        return res.status(404).json({ message: "User not found" })
    }
    else{
        const user = JSON.parse(userjson);
        res.status(200).json({ success: true, user })
    }
    
}