import { Base } from "../../service/base.js";

class RideController extends Base {
  constructor(io) {
    super(io); // ✅ pass io to Base
  }
  async EstimateFare(req, res, next) {
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
  async create(req, res) {
    try {
      // ✅ FIX 1: correct userId
      const userId = req._id;

      /* 🔐 Role check */
      const user = await this.selectOne(
        `SELECT role FROM users WHERE id = ?`,
        [userId]
      );

      if (!user || user.role !== 'RIDER') {
        this.s = 0;
        this.m = "Only riders can create rides";
        return this.send_res(res);
      }

      const {
        cab_type_id,
        estimated_fare,
        distance_km,
        pickup_lat,
        pickup_lng,
        pickup_address,
        drop_lat,
        drop_lng,
        drop_address
      } = req.body;

      /* 1️⃣ Active ride check */
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

      // /* 2️⃣ Create ride */
      const rideId = await this.insert(
        `INSERT INTO rides
       (user_id, cab_type_id,
        pickup_lat, pickup_lng, pickup_address,
        drop_lat, drop_lng, drop_address,
        estimated_fare, distance_km)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          cab_type_id,
          pickup_lat,
          pickup_lng,
          pickup_address || null,
          drop_lat,
          drop_lng,
          drop_address || null,
          estimated_fare,
          distance_km
        ]
      );
      /* 3️⃣ Find nearby drivers */
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
        AND dv.cab_type_id = ?
        AND r.id IS NULL
      HAVING distance_km <= 3
      ORDER BY distance_km ASC
      LIMIT 10
      `,
        [pickup_lat, pickup_lng, cab_type_id]
      );

      const rideRoom = `ride_${1}`;

      // 🔥 Join all drivers at once
      this.io
        .to(drivers.map(d => `driver_${d.driver_id}`))
        .socketsJoin(rideRoom);


      // 🔥 Single emit
      this.io.to(rideRoom).emit("NEW_RIDE_REQUEST", {
        ride_id: rideId,
        pickup: { lat: pickup_lat, lng: pickup_lng, address: pickup_address },
        drop: { lat: drop_lat, lng: drop_lng, address: drop_address },
        estimated_fare,
        distance_km
      });



      this.s = 1;
      this.m = "Ride created and sent to nearby drivers";
      this.r = {
        ride_id: rideId,
        drivers_notified: drivers.length
      };

      return this.send_res(res);

    } catch (err) {
      this.s = 0;
      this.err = err.message;
      return this.send_res(res);
    }
  }
  async acceptRide(req, res) {
    try {
      // const driverId = req._id;
      const { ride_id, driverId } = req.body;

      const driver = await this.selectOne(
        `SELECT role FROM users WHERE id = ?`,
        [driverId]
      );

      if (!driver || driver.role !== 'DRIVER') {
        this.s = 0;
        this.m = "Only drivers can accept rides";
        return this.send_res(res);
      }

      const ride = await this.selectOne(
        `SELECT * FROM rides 
       WHERE id = ? AND status = 'REQUESTED'`,
        [ride_id]
      );

      if (!ride) {
        this.s = 0;
        this.m = "Ride not available";
        return this.send_res(res);
      }

      if (ride.driver_id) {
        this.s = 0;
        this.m = "Ride already accepted by another driver";
        return this.send_res(res);
      }

      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const otpHash = await this.generateHash(otp);
      const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 min

      await this.update(
        `UPDATE rides
       SET driver_id = ?, 
           status = 'DRIVER_ASSIGNED',
           otp_token = ?,
           otp_expires = ?
       WHERE id = ? AND driver_id IS NULL`,
        [driverId, otpHash, otpExpires, ride_id]
      );

      await this.update(
        `UPDATE ride_requests
       SET status = 'ACCEPTED', responded_at = NOW()
       WHERE ride_id = ? AND driver_id = ?`,
        [ride_id, driverId]
      );


      if (this.io) {
        this.io.to(`rider_${ride.user_id}`).emit("RIDE_ACCEPTED", {
          ride_id,
          driver_id: driverId,
          otp
        });
      }

      this.s = 1;
      this.m = "Ride accepted successfully";
      this.r = {
        ride_id,
        otpExpires
      };

      return this.send_res(res);

    } catch (err) {
      this.s = 0;
      this.err = err.message;
      return this.send_res(res);
    }
  }
  async liveStatus(req, res) {
    try {
      const userId = req._id;

      // 1️⃣ Get logged-in user role
      const user = await this.selectOne(
        `SELECT id, role FROM users WHERE id = ?`,
        [userId]
      );

      if (!user) {
        this.s = 0;
        this.m = "User not found";
        return this.send_res(res);
      }

      let ride;

      if (user.role === 'RIDER') {
        ride = await this.selectOne(
          `
        SELECT 
          r.id AS ride_id,
          r.status,
          r.estimated_fare,
          r.payment_method,
          r.pickup_address,
          r.drop_address,

          u.id AS driver_id,
          u.name AS driver_name,
          u.phone AS driver_phone

        FROM rides r
        LEFT JOIN users u ON u.id = r.driver_id
        WHERE r.user_id = ?
          AND r.status IN (
            'REQUESTED',
            'DRIVER_ASSIGNED',
            'ARRIVING',
            'ONGOING'
          )
        ORDER BY r.id DESC
        LIMIT 1
        `,
          [userId]
        );

      } else if (user.role === 'DRIVER') {

        // Driver view → include RIDER info
        ride = await this.selectOne(
          `
        SELECT 
          r.id AS ride_id,
          r.status,
          r.estimated_fare,
          r.payment_method,
          r.pickup_address,
          r.drop_address,

          u.id AS rider_id,
          u.name AS rider_name,
          u.phone AS rider_phone

        FROM rides r
        JOIN users u ON u.id = r.user_id
        WHERE r.driver_id = ?
          AND r.status IN (
            'DRIVER_ASSIGNED',
            'ARRIVING',
            'ONGOING'
          )
        ORDER BY r.id DESC
        LIMIT 1
        `,
          [userId]
        );

      } else {
        this.s = 0;
        this.m = "Invalid role";
        return this.send_res(res);
      }

      this.s = 1;
      this.r = ride || null;
      return this.send_res(res);

    } catch (err) {
      this.s = 0;
      this.err = err.message;
      return this.send_res(res);
    }
  }
  async arriving(req, res, next) {
    try {
      const { driverId, ride_id } = req.body

      const driver = await this.selectOne("SELECT role FROM users WHERE id = ?", [driverId])

      if (!driver || driver.role !== 'DRIVER') {
        this.s = 0;
        this.m = "Only driver allowed";
        return this.send_res(res);
      }

      const updated = await this.update(
        `UPDATE rides
       SET status = 'ARRIVING'
       WHERE id = ?
         AND driver_id = ?
         AND status = 'DRIVER_ASSIGNED'`,
        [ride_id, driverId]
      )

      if (!updated) {
        this.s = 0;
        this.m = "Ride not available for arriving";
        return this.send_res(res);
      }

      if (this.io) {
        const ride = await this.selectOne(
          `SELECT user_id FROM rides WHERE id = ?`,
          [ride_id]
        );
        this.io.to(`rider_${ride.user_id}`).emit("DRIVER_ARRIVING", {
          ride_id
        });
      }
      this.s = 1;
      this.m = "Driver marked as arriving";
      return this.send_res(res);


    } catch (error) {

      this.s = 0;
      this.err = err.message;
      return this.send_res(res);
    }
  }
  async startRide(req, res) {
    try {
      console.log("Request Body:", req.body);
      const { ride_id, driverId, otp } = req.body;
      if (typeof otp !== "string") {
        this.s = 0;
        this.m = "OTP must be a string";
        return this.send_res(res);
      }

      // -----------------------------
      // 2️⃣ Fetch Ride
      // -----------------------------
      const ride = await this.selectOne(
        `
      SELECT id, otp_token, otp_expires, user_id
      FROM rides
      WHERE id = ?
        AND driver_id = ?
        AND status = 'ARRIVING'
      `,
        [ride_id, driverId]
      );
      if (!ride) {
        this.s = 0;
        this.m = "Ride not found or not ready to start";
        return this.send_res(res);
      }

      // -----------------------------
      // 3️⃣ OTP Expiry Check
      // -----------------------------
      const now = new Date();
      const otpExpiry = new Date(ride.otp_expires);

      if (now > otpExpiry) {
        this.s = 0;
        this.m = "OTP expired";
        return this.send_res(res);
      }

      // -----------------------------
      // 4️⃣ OTP Validation
      // -----------------------------
      const isValidOtp = await this.compareHash(
        String(otp),
        ride.otp_token
      );

      if (!isValidOtp) {
        this.s = 0;
        this.m = "Invalid OTP";
        return this.send_res(res);
      }

      // -----------------------------
      // 5️⃣ Start Ride
      // -----------------------------
      await this.update(
        `
      UPDATE rides
      SET status = 'ONGOING',
          otp_token = NULL,
          otp_expires = NULL
      WHERE id = ?
      `,
        [ride_id]
      );

      // -----------------------------
      // 6️⃣ Socket Event
      // -----------------------------
      if (this.io) {
        this.io.to(`rider_${ride.user_id}`).emit("RIDE_STARTED", {
          ride_id,
          status: "ONGOING"
        });
      }

      // -----------------------------
      // 7️⃣ Success Response
      // -----------------------------
      this.s = 1;
      this.m = "Ride started successfully";
      this.r = {
        ride_id,
        status: "ONGOING"
      };

      return this.send_res(res);

    } catch (err) {
      console.error("Start Ride Error:", err);

      this.s = 0;
      this.m = "Something went wrong";
      this.err = err.message;
      return this.send_res(res);
    }
  }
  async cancelRide(req, res, next) {
    try {
      const userId = req._id;
      const { rideId, reason_id } = req.body;

      /* 1️⃣ Get user role */
      const user = await this.selectOne(
        `SELECT id, role FROM users WHERE id = ?`,
        [userId]
      );

      if (!user) {
        this.s = 0;
        this.m = "User not found";
        return this.send_res(res);
      }

      /* 2️⃣ Fetch ride based on role */
      let ride;

      if (user.role === "RIDER") {
        ride = await this.selectOne(
          `SELECT * FROM rides 
         WHERE id = ? AND user_id = ?`,
          [rideId, userId]
        );
      } else if (user.role === "DRIVER") {
        ride = await this.selectOne(
          `SELECT * FROM rides 
         WHERE id = ? AND driver_id = ?`,
          [rideId, userId]
        );
      } else {
        this.s = 0;
        this.m = "Invalid role";
        return this.send_res(res);
      }

      if (!ride) {
        this.s = 0;
        this.m = "Ride not found";
        return this.send_res(res);
      }

      /* 3️⃣ Check cancellable state */
      if (!["REQUESTED", "DRIVER_ASSIGNED", "ARRIVING"].includes(ride.status)) {
        this.s = 0;
        this.m = "Ride cannot be cancelled at this stage";
        return this.send_res(res);
      }

      /* 4️⃣ Penalty logic */
      let penaltyAmount = 0;
      let penaltyApplied = 0;
      let refundEligible = 1;
      let refundAmount = ride.estimated_fare;

      if (user.role === "RIDER" && ride.status === "ARRIVING") {
        penaltyAmount = 30;
        penaltyApplied = 1;
        refundEligible = 0;
        refundAmount = 0;
      }

      if (user.role === "DRIVER" && ride.status === "ARRIVING") {
        penaltyAmount = 50;
        penaltyApplied = 1;
      }

      /* 5️⃣ Insert cancellation record */
      await this.insert(
        `INSERT INTO ride_cancellations
       (ride_id, cancelled_by, reason_id,
        ride_status_at_cancel,
        penalty_applied, penalty_amount,
        refund_eligible, refund_amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          rideId,
          user.role,
          reason_id || null,
          ride.status,
          penaltyApplied,
          penaltyAmount,
          refundEligible,
          refundAmount
        ]
      );

      /* 6️⃣ Apply wallet penalty if any */
      if (penaltyApplied) {
        await this.update(
          `UPDATE wallets
         SET balance = balance - ?
         WHERE user_id = ?`,
          [penaltyAmount, userId]
        );
      }

      /* 7️⃣ Update ride */
      await this.update(
        `UPDATE rides
       SET status = 'CANCELLED',
           cancelled_by = ?,
           cancelled_at = NOW()
       WHERE id = ?`,
        [user.role, rideId]
      );

      /* 8️⃣ Notify other party via socket */
      if (this.io) {
        if (user.role === "RIDER" && ride.driver_id) {
          this.io.to(`driver_${ride.driver_id}`).emit("RIDE_CANCELLED", {
            ride_id: rideId,
            cancelled_by: "RIDER"
          });
        }

        if (user.role === "DRIVER") {
          this.io.to(`rider_${ride.user_id}`).emit("RIDE_CANCELLED", {
            ride_id: rideId,
            cancelled_by: "DRIVER"
          });
        }
      }

      /* 9️⃣ Response */
      this.s = 1;
      this.m = "Ride cancelled successfully";
      this.r = {
        ride_id: rideId,
        cancelled_by: user.role,
        penalty_amount: penaltyAmount
      };

      return this.send_res(res);

    } catch (error) {
      this.s = 0;
      this.err = error.message;
      return this.send_res(res);
    }
  }
  async endRide(req, res) {
    try {
      // const driverId = req._id;
      const { ride_id, final_fare, driverId } = req.body;
      /* 1️⃣ Role check */
      const driver = await this.selectOne(
        `SELECT role FROM users WHERE id = ?`,
        [driverId]
      );

      if (!driver || driver.role !== 'DRIVER') {
        this.s = 0;
        this.m = "Only driver can end the ride";
        return this.send_res(res);
      }

      /* 2️⃣ Fetch active ride */
      const ride = await this.selectOne(
        `SELECT id, user_id
       FROM rides
       WHERE id = ?
         AND driver_id = ?
         AND status = 'ONGOING'`,
        [ride_id, driverId]
      );

      if (!ride) {
        this.s = 0;
        this.m = "Ride not found or not active";
        return this.send_res(res);
      }

      /* 3️⃣ End ride */
      await this.update(
        `UPDATE rides
       SET status = 'COMPLETED',
           final_fare = ?
       WHERE id = ?`,
        [final_fare, ride_id]
      );

      /* 4️⃣ Notify rider */
      if (this.io) {
        this.io.to(`rider_${ride.user_id}`).emit("RIDE_COMPLETED", {
          ride_id,
          final_fare
        });
      }

      this.s = 1;
      this.m = "Ride completed successfully";
      this.r = {
        ride_id,
        final_fare,
        status: "COMPLETED"
      };

      return this.send_res(res);

    } catch (err) {
      this.s = 0;
      this.err = err.message;
      return this.send_res(res);
    }
  }
}

export default RideController;
