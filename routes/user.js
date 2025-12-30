import {Router} from "express"
const router = Router()
import User from "../controller/user/userController.js"

router.route("/update-profile").put((req,res,next)=>{
    const U = new User()
    return U.updateProfile(req,res,next)
})
router.route("/driverGoLive").post((req,res,next)=>{
    const U = new User()
    return U.driverGoLive(req,res,next)
})
export default router
