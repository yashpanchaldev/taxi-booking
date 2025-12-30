import { Base } from "../../service/base.js";

export default class RideController extends Base{
    constructor(){
        super()
    }

   async EstimateFare(req, res,next) {
    try {
      const { distance_km } = req.body;

      if (!distance_km || distance_km <= 0) {
        this.s = 0;
        this.m = "Valid distance_km is required";
        return this.send_res(res);
      }

      const cabs = await this.select(
        `SELECT 
           ct.id AS cab_type_id,
           ct.code,
           ct.name,
           ct.icon_url,
           ct.seating_capacity,
           calculateFareByCab(?, ct.id) AS estimated_fare
         FROM cab_types ct
         JOIN cab_fare_rules fr ON fr.cab_type_id = ct.id
         WHERE ct.is_active = 1
           AND fr.is_active = 1
         ORDER BY estimated_fare ASC`,
        [distance_km]
      );
      this.s = 1;
      this.r = cabs;
      return this.send_res(res);

    } catch (error) {
      this.s = 0;
      this.err = error.message;
      return this.send_res(res);
    }
  }

  async create(req, res,next) {
    try {
      const userId = req._id;
      const {
        cab_type_id,
        estimated_fare,
        distance_km,
        pickup_lat,
        pickup_lng,
        pickup_address,
        drop_lat,
        drop_lng,
        drop_address,
        payment_method
      } = req.body;

      // 1️⃣ Active ride check
      const activeRide = await this.selectOne(
        `SELECT id FROM rides
         WHERE user_id = ?
         AND status IN ('REQUESTED','DRIVER_ASSIGNED','ONGOING')`,
        [userId]
      );

      if (activeRide) {
        this.s = 0;
        this.m = "Active ride already exists";
        return this.send_res(res);
      }

      // 3️⃣ Find nearby drivers (≤ 3km)
const drivers = await this.select(
  `
  SELECT 
  u.id AS driver_id,
  u.socket_id,
  calculate_distance(?, ?, u.last_lat, u.last_lng) AS distance_km
FROM users u
JOIN driver_vehicles dv ON dv.driver_id = u.id
LEFT JOIN rides r
  ON r.driver_id = u.id
 AND r.status IN ('DRIVER_ASSIGNED','ONGOING')
WHERE u.role = 'DRIVER'
  AND u.is_live = 1
  AND u.socket_id IS NOT NULL
  AND TRIM(u.socket_id) != ''
  AND dv.cab_type_id = ?
  AND r.id IS NULL
HAVING distance_km <= 3
ORDER BY distance_km ASC
LIMIT 10

  `,
  [
    pickup_lat,
    pickup_lng,
    cab_type_id
  ]
);
for (const d of drivers) {

  // // 1️⃣ Store request
  // await this.insert(
  //   `INSERT INTO ride_requests (ride_id, driver_id)
  //    VALUES (?, ?)`,
  //   [rideId, d.driver_id]
  // );

  // 2️⃣ Send real-time request
  if (this.io) {
    this.io.to(`driver_${d.driver_id}`).emit("NEW_RIDE_REQUEST", {
      // ride_id: rideId,
      pickup: {
        lat: pickup_lat,
        lng: pickup_lng,
        address: pickup_address
      },
      drop: {
        lat: drop_lat,
        lng: drop_lng,
        address: drop_address
      },
      estimated_fare,
      distance_km
    });
  }
}

     


      this.s = 1;
      this.m = "Ride created & request sent to drivers";
      this.r = {
        drivers
      };

      return this.send_res(res);

    } catch (error) {
      this.s = 0;
      this.err = error.message;
      return this.send_res(res);
    }
  }
}