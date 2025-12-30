import { Base } from "../../service/base.js";

export default class DriverController extends Base {
  constructor() {
    super();
  }
  async vehicle(req, res) {
    try {
      const fields = [
        "registration_number",
        "cab_type_id",
        "brand",
        "model",
        "color"
      ];

      if (this.varify_req(req, fields)) {
        this.s = 0;
        return this.send_res(res);
      }

      const driverId = req._id;

      const user = await this.selectOne(
        "SELECT role FROM users WHERE id = ?",
        [driverId]
      );

      if (!user || user.role !== "DRIVER") {
        this.s = 0;
        this.m = "You are not a driver";
        return this.send_res(res);
      }

      const exists = await this.selectOne(
        "SELECT id FROM driver_vehicles WHERE driver_id = ?",
        [driverId]
      );

      if (exists) {
        await this.update(
          `UPDATE driver_vehicles SET
         registration_number=?,
         cab_type_id=?,
         brand=?,
         model=?,
         color=?
         WHERE driver_id=?`,
          [
            req.body.registration_number,
            req.body.cab_type_id,
            req.body.brand,
            req.body.model,
            req.body.color,
            driverId
          ]
        );
        this.m = "Vehicle details updated";
      } else {
        await this.insert(
          `INSERT INTO driver_vehicles
         (driver_id, registration_number, cab_type_id, brand, model, color)
         VALUES (?, ?, ?, ?, ?, ?)`,
          [
            driverId,
            req.body.registration_number,
            req.body.cab_type_id,
            req.body.brand,
            req.body.model,
            req.body.color
          ]
        );
        this.m = "Vehicle details added";
      }

      this.s = 1;
      return this.send_res(res);

    } catch (e) {
      this.s = 0;
      this.err = e.message;
      return this.send_res(res);
    }
  }

  async driver_licenses(req, res) {
    try {
      if (
        this.varify_req(
          req,
          ["license_number", "city", "expiry_date"],
          ["front_image", "back_image"]
        )
      ) {
        this.s = 0;
        this.m = "Required fields missing";
        return this.send_res(res);
      }

      const driverId = req._id;

      const user = await this.selectOne(
        "SELECT role FROM users WHERE id = ?",
        [driverId]
      );

      if (!user || user.role !== "DRIVER") {
        this.s = 0;
        this.m = "You are not a driver";
        return this.send_res(res);
      }

      const front_image_url = await this.uploadSingleFileToCloudinary(
        req.files.front_image,
        "driver/license"
      );

      const back_image_url = await this.uploadSingleFileToCloudinary(
        req.files.back_image,
        "driver/license"
      );

      const exists = await this.selectOne(
        "SELECT id FROM driver_licenses WHERE driver_id = ?",
        [driverId]
      );

      if (exists) {
        await this.update(
          `UPDATE driver_licenses SET
         license_number = ?,
         city = ?,
         expiry_date = ?,
         front_image_url = ?,
         back_image_url = ?,
         verification_status = 'PENDING'
         WHERE driver_id = ?`,
          [
            req.body.license_number,
            req.body.city,
            req.body.expiry_date,
            front_image_url,
            back_image_url,
            driverId
          ]
        );

        this.m = "License updated successfully";
      } else {
        await this.insert(
          `INSERT INTO driver_licenses
         (driver_id, license_number, city, expiry_date, front_image_url, back_image_url)
         VALUES (?, ?, ?, ?, ?, ?)`,
          [
            driverId,
            req.body.license_number,
            req.body.city,
            req.body.expiry_date,
            front_image_url,
            back_image_url
          ]
        );

        this.m = "License added successfully";
      }

      this.s = 1;
      return this.send_res(res);

    } catch (error) {
      this.s = 0;
      this.err = error.message;
      return this.send_res(res);
    }
  }

  async ownership(req, res) {
    try {
      if (this.varify_req(req, ["ownership_license_number", "expiry_date"])) {
        this.s = 0;
        this.m = "Required fields missing";
        return this.send_res(res);
      }

      const driverId = req._id;

      const user = await this.selectOne(
        "SELECT role FROM users WHERE id = ?",
        [driverId]
      );

      if (!user || user.role !== "DRIVER") {
        this.s = 0;
        this.m = "You are not a driver";
        return this.send_res(res);
      }

      let image_url = null;
      if (req.files && req.files.image) {
        image_url = await this.uploadSingleFileToCloudinary(
          req.files.image,
          "driver/ownership"
        );
      }

      const exists = await this.selectOne(
        "SELECT id FROM vehicle_ownerships WHERE driver_id = ?",
        [driverId]
      );

      if (exists) {
        await this.update(
          `UPDATE vehicle_ownerships SET
         ownership_license_number = ?,
         expiry_date = ?,
         image_url = ?,
         verification_status = 'PENDING'
         WHERE driver_id = ?`,
          [
            req.body.ownership_license_number,
            req.body.expiry_date,
            image_url,
            driverId
          ]
        );

        this.m = "Ownership updated successfully";
      } else {
        await this.insert(
          `INSERT INTO vehicle_ownerships
         (driver_id, ownership_license_number, expiry_date, image_url)
         VALUES (?, ?, ?, ?)`,
          [
            driverId,
            req.body.ownership_license_number,
            req.body.expiry_date,
            image_url
          ]
        );

        this.m = "Ownership added successfully";
      }

      this.s = 1;
      return this.send_res(res);

    } catch (error) {
      this.s = 0;
      this.err = error.message;
      return this.send_res(res);
    }
  }

  async insurance(req, res) {
    try {
      if (
        this.varify_req(
          req,
          ["policy_number", "expiry_date"],
          ["image"]
        )
      ) {
        this.s = 0;
        this.m = "Required fields missing";
        return this.send_res(res);
      }

      const driverId = req._id;

      const user = await this.selectOne(
        "SELECT role FROM users WHERE id = ?",
        [driverId]
      );

      if (!user || user.role !== "DRIVER") {
        this.s = 0;
        this.m = "You are not a driver";
        return this.send_res(res);
      }

      const insurance_image_url = await this.uploadSingleFileToCloudinary(
        req.files.image,
        "driver/insurance"
      );

      const exists = await this.selectOne(
        "SELECT id FROM vehicle_insurances WHERE driver_id = ?",
        [driverId]
      );

      if (exists) {
        await this.update(
          `UPDATE vehicle_insurances SET
         policy_number = ?,
         expiry_date = ?,
         insurance_image_url = ?,
         verification_status = 'PENDING'
         WHERE driver_id = ?`,
          [
            req.body.policy_number,
            req.body.expiry_date,
            insurance_image_url,
            driverId
          ]
        );

        this.m = "Insurance updated successfully";
      } else {
        await this.insert(
          `INSERT INTO vehicle_insurances
         (driver_id, policy_number, expiry_date, insurance_image_url)
         VALUES (?, ?, ?, ?)`,
          [
            driverId,
            req.body.policy_number,
            req.body.expiry_date,
            insurance_image_url
          ]
        );

        this.m = "Insurance added successfully";
      }

      this.s = 1;
      return this.send_res(res);

    } catch (error) {
      this.s = 0;
      this.err = error.message;
      return this.send_res(res);
    }
  }




}
