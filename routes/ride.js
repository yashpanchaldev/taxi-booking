import {Router} from "express"
const router = Router()
import Ride from "../controller/ride/rideController.js"

router.route("/estimate").post((req,res,next)=>{
    const U = new Ride()
    return U.EstimateFare(req,res,next)
})
router.route("/create").post((req,res,next)=>{
    const io = req.app.get("io")
    const U = new Ride(io)
    return U.create(req,res,next)
})

export default router
