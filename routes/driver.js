import {Router} from "express"
const router = Router()
import Driver from "../controller/driver/driverController.js"

router.route("/driver_vehicles").post((req,res,next)=>{
    const U = new Driver()
    return U.vehicle(req,res,next)
})
router.route("/driver_licenses").post((req,res,next)=>{
    const U = new Driver()
    return U.driver_licenses(req,res,next)
})
router.route("/vehicle_ownerships").post((req,res,next)=>{
    const U = new Driver()
    return U.ownership(req,res,next)
})
router.route("/vehicle_insurances").post((req,res,next)=>{
    const U = new Driver()
    return U.insurance(req,res,next)
})

export default router
