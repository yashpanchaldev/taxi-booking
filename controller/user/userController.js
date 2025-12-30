import { Base } from "../../service/base.js";

export default class UserController extends Base {
  constructor() {
    super();
  }

  async updateProfile(req, res) {
    try {
      const userId =req._id;

      const {
        name,
        email,
        phone,
        gender,
        dob,
        country
      } = req.body;

      // Check if at least one field is provided
      if (this.varify_req(req,["name","email","phone","gender","dob","country"])) {
        this.s = 0;
        this.m = "No fields provided for update";
        return this.send_res(res);
      }

      // If email is being updated, check uniqueness
      if (email) {
        const existingEmail = await this.selectOne(
          "SELECT id FROM users WHERE email = ? AND id != ?",
          [email, userId]
        );

        if (existingEmail) {
          this.s = 0;
          this.m = "Email already in use";
          return this.send_res(res);
        }
      }

      // Build dynamic query
      const fields = [];
      const values = [];

      if (name) {
        fields.push("name = ?");
        values.push(name);
      }
      if (email) {
        fields.push("email = ?");
        values.push(email);
      }
      if (phone) {
        fields.push("phone = ?");
        values.push(phone);
      }
      if (gender) {
        fields.push("gender = ?");
        values.push(gender);
      }
      if (dob) {
        fields.push("dob = ?");
        values.push(dob);
      }
      if (country) {
        fields.push("country = ?");
        values.push(country);
      }

      values.push(userId);

      const updated = await this.update(
        `UPDATE users SET ${fields.join(", ")} WHERE id = ?`,
        values
      );

      if (!updated) {
        this.s = 0;
        this.m = "Failed to update profile";
        return this.send_res(res);
      }

      const updatedUser = await this.selectOne(
        `SELECT id, name, email, phone, gender, dob, country 
         FROM users WHERE id = ?`,
        [userId]
      );

      this.s = 1;
      this.m = "Profile updated successfully";
      this.r = updatedUser;

      return this.send_res(res);

    } catch (error) {
      this.s = 0;
      this.err = error.message;
      return this.send_res(res);
    }
  }
async driverGoLive(req, res) {
  try {
    const driverId = req._id;
    const { is_live, lat, lng } = req.body;


    // Check driver exists
    const driver = await this.selectOne(
      "SELECT id FROM users WHERE id = ?",
      [driverId]
    );

    if (!driver) {
      this.s = 0;
      this.m = "Driver not found";
      return this.send_res(res);
    }

    // Update driver live status
    const updated = await this.update(
      `UPDATE users 
       SET is_live = ?, 
           last_lat = ?, 
           last_lng = ?, 
           last_active_at = NOW()
       WHERE id = ?`,
      [is_live ? 1 : 0, lat || null, lng || null, driverId]
    );

    if (!updated) {
      this.s = 0;
      this.m = "Failed to update live status";
      return this.send_res(res);
    }

    this.s = 1;
    this.m = is_live == 1 ? "Driver is LIVE now" : "Driver is OFFLINE now";
    this.r = {
      is_live
    };

    return this.send_res(res);

  } catch (error) {
    this.s = 0;
    this.err = error.message;
    return this.send_res(res);
  }
}

}
