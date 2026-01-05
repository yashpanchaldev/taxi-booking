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
router.route("/accept-ride").post((req,res,next)=>{
    const io = req.app.get("io")
    const U = new Ride(io)
    return U.acceptRide(req,res,next)
})
router.route("/live").get((req,res,next)=>{
    const io = req.app.get("io")
    const U = new Ride(io)
    return U.liveStatus(req,res,next)
})
router.route("/arriving").post((req,res,next)=>{
    const io = req.app.get("io")
    const U = new Ride(io)
    return U.arriving(req,res,next)
})
router.route("/start").post((req,res,next)=>{
    const io = req.app.get("io")
    const U = new Ride(io)
    return U.startRide(req,res,next)
})
router.route("/end").post((req,res,next)=>{
    const io = req.app.get("io")
    const U = new Ride(io)
    return U.endRide(req,res,next)
})
router.route("/cancel").post((req,res,next)=>{
    const io = req.app.get("io")
    const U = new Ride(io)
    return U.cancelRide(req,res,next)
})

export default router
