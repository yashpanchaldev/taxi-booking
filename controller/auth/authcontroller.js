import "../../routes/auth.js";
import { Base } from "../../service/base.js";
import MailService from "../../service/mail.js";

export default class AuthController extends Base {
  constructor() {
    super();
  }

  async signup(req, res) {
    try {
      const requiredFields = [
        "name",
        "email",
        "password",
        "phone",
        "role",
        "gender",
        "dob"
      ];
      if (this.varify_req(req, requiredFields)) {
        this.s = 0;
        return this.send_res(res);
      }

      const {
        name,
        email,
        password,
        phone,
        role,
        gender,
        dob,
        country
      } = req.body;

      const existingUser = await this.selectOne(
        "SELECT id FROM users WHERE email = ?",
        [email]
      );

      if (existingUser) {
        this.s = 0;
        this.m = "Email already exists";
        return this.send_res(res);
      }

      const hashedPassword = await this.generate_password(password);

      const userId = await this.insert(
        `INSERT INTO users 
         (name, email, password, phone, role, gender, dob, country,is_live)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?,1)`,
        [name, email, hashedPassword, phone, role, gender, dob, country]
      );

      if (!userId) {
        this.s = 0;
        this.m = "Failed to create user";
        return this.send_res(res);
      }

      const apiKey = await this.generate_apikey(userId);
      const token = await this.generate_token(userId);

      const otp = Math.floor(100000 + Math.random() * 900000).toString()
      const hashedOtp = await this.generateHash(otp)
      const expires = new Date(Date.now() + 10 * 10 *1000)

      await this.insert(
        `INSERT INTO user_auth(user_id, apikey, token, otp_token, otp_expires)
       VALUES (?, ?, ?, ?, ?)`,
        [userId, apiKey, token, hashedOtp, expires]
      );

      const mailservices = new MailService()
      await mailservices.sendMail({
        to:email,
        subject:"Verify your email",
        templateName:"verify_email_otp",
        data:{name,otp}
      })

      this.s = 1;
      this.m = "Signup successful";
      this.r = { user_id: userId,user_token :{
        apiKey,
        token
      },otp };

      return this.send_res(res);

    } catch (error) {
      this.s = 0;
      this.err = error.message;
      return this.send_res(res);
    }
  }

  async login(req, res) {
    try {
      if (this.varify_req(req, ["email", "password"])) {
        this.s = 0;
        return this.send_res(res);
      }

      const { email, password } = req.body;

      const user = await this.selectOne(
        "SELECT * FROM users WHERE email = ?",
        [email]
      );

      if (!user) {
        this.s = 0;
        this.m = "Email does not exist";
        return this.send_res(res);
      }

      const isPasswordValid = await this.check_password(
        user.password,
        password
      );

      if (!isPasswordValid) {
        this.s = 0;
        this.m = "Incorrect password";
        return this.send_res(res);
      }

      const authData = await this.selectOne(
        "SELECT token, apikey FROM user_auth WHERE user_id = ?",
        [user.id]
      );

        if (!user.is_verified) {
        this.s = 0;
        this.m = "Please verify your email before login.";
        return this.send_res(res);
      }

      this.s = 1;
      this.m = "Login successful";
      this.r = {
        user_id: user.id,
        auth: authData
      };

      return this.send_res(res);

    } catch (error) {
      this.s = 0;
      this.err = error.message;
      return this.send_res(res);
    }
  }

  async verifyEmail(req, res) {
    try {
      if (this.varify_req(req, ["email", "otp"])) {
        this.s = 0;
        this.m = "Missing email or otp.";
        return this.send_res(res);
      }

      const { email, otp } = req.body;

      const user = await this.selectOne(
        "SELECT id, is_verified FROM users WHERE email = ?",
        [email]
      );
      if (!user) {
        this.s = 0;
        this.m = "Email not registered.";
        return this.send_res(res);
      }

      if (user.is_verified) {
        this.s = 0;
        this.m = "Email already verified.";
        return this.send_res(res);
      }

      const auth = await this.selectOne(
        "SELECT otp_expires, otp_token FROM user_auth WHERE user_id = ?",
        [user.id]
      );

      if (!auth || !auth.otp_token) {
        this.s = 0;
        this.m = "No OTP record found. Please request a new OTP.";
        return this.send_res(res);
      }

      if (new Date(auth.otp_expires) < new Date()) {
        this.s = 0;
        this.m = "OTP expired. Please resend.";
        return this.send_res(res);
      }

      const isValidOtp = await this.compareHash(otp, auth.otp_token);
      if (!isValidOtp) {
        this.s = 0;
        this.m = "Invalid OTP.";
        return this.send_res(res);
      }

      //  Update verification
      await this.update("UPDATE users SET is_verified = 1 WHERE id = ?", [
        user.id,
      ]);
      await this.update(
        "UPDATE user_auth SET otp_token = NULL, otp_expires = NULL WHERE user_id = ?",
        [user.id]
      );

      this.s = 1;
      this.m = "Email verified successfully. You can now login.";
      return this.send_res(res);
    } catch (err) {
      this.s = 0;
      this.err = err.message;
      return this.send_res(res);
    }
  }

  async resendEmailOtp(req,res,next){
    try {
      if(this.varify_req(req,["email"])){
        this.s =0;
        return this.send_res(res)
      }
      
      const {email}= req.body

    const user = await this.selectOne(
        "SELECT id, name, is_verified FROM users WHERE email = ?",
        [email]
      );
      if (!user) {
        this.s = 0;
        this.m = "Email not registered.";
        return this.send_res(res);
      }
      if (user.is_verified) {
        this.s = 0;
        this.m = "Email already verified.";
        return this.send_res(res);
      }

      const newOtp = Math.floor(100000 + Math.random() * 900000).toString();
      const hashedNewOtp = await this.generateHash(newOtp);
      const newExpires = new Date(Date.now() + 10 * 60 * 1000);

      await this.update(
        "UPDATE user_auth SET otp_token = ?, otp_expires = ? WHERE user_id = ?",
        [hashedNewOtp, newExpires, user.id]
      );

      const mailService = new MailService();
      await mailService.sendMail({
        to: email,
        subject: "Resend OTP - Verify your email",
        templateName: "verify_email_otp",
        data: { name: user.name, otp: newOtp },
      });

      this.s = 1;
      this.m = "OTP resent successfully.";
      return this.send_res(res);

      
    } catch (error) {
      this.s =0;
       this.err= error.message
       return this.send_res(res)
      
    }

  }


  
  async forgotPassword(req, res) {
    try {
      if (this.varify_req(req, ["email"])) {
        this.s = 0;
        this.m = "Missing email.";
        return this.send_res(res);
      }

      const { email } = req.body;

      const user = await this.selectOne(
        "SELECT id, name FROM users WHERE email = ?",
        [email]
      );

      if (!user) {
        this.s = 0;
        this.m = "Email not registered.";
        return this.send_res(res);
      }

      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const hashedOtp = await this.generateHash(otp);
      const expires = new Date(Date.now() + 10 * 60 * 1000);

      const existingAuth = await this.selectOne(
        "SELECT id FROM user_auth WHERE user_id = ?",
        [user.id]
      );

      if (existingAuth) {
        await this.update(
          "UPDATE user_auth SET otp_token = ?, otp_expires = ? WHERE user_id = ?",
          [hashedOtp, expires, user.id]
        );
      } else {
        await this.insert(
          "INSERT INTO user_auth (user_id, otp_token, otp_expires) VALUES (?, ?, ?)",
          [user.id, hashedOtp, expires]
        );
      }

      const mailService = new MailService();
      await mailService.sendMail({
        to: email,
        subject: "Reset your password - OTP Verification",
        templateName: "forgot_password_otp",
        data: { name: user.name, otp },
      });

      this.s = 1;
      this.m = "OTP sent to your email for password reset.";
      return this.send_res(res);
    } catch (err) {
      this.s = 0;
      this.err = err.message;
      return this.send_res(res);
    }
  }

  async resetPassword(req, res) {
    try {
      if (this.varify_req(req, ["email", "otp", "newPassword"])) {
        this.s = 0;
        this.m = "Missing required fields.";
        return this.send_res(res);
      }
      const { email, otp, newPassword } = req.body;
      const user = await this.selectOne(
        "SELECT id FROM users WHERE email = ?",
        [email]
      );
      if (!user) {
        this.s = 0;
        this.m = "Email not registered.";
        return this.send_res(res);
      }

      const auth = await this.selectOne(
        "SELECT otp_token, otp_expires FROM user_auth WHERE user_id = ?",
        [user.id]
      );

      if (!auth || !auth.otp_token) {
        this.s = 0;
        this.m = "No OTP found. Please request a new OTP.";
        return this.send_res(res);
      }

      if (new Date(auth.otp_expires) < new Date()) {
        this.s = 0;
        this.m = "OTP expired. Please resend.";
        return this.send_res(res);
      }

      const isValidOtp = await this.compareHash(otp, auth.otp_token);
      if (!isValidOtp) {
        this.s = 0;
        this.m = "Invalid OTP.";
        return this.send_res(res);
      }

      const hashedPassword = await this.generate_password(newPassword);
      await this.update("UPDATE users SET password = ? WHERE id = ?", [
        hashedPassword,
        user.id,
      ]);

      await this.update(
        "UPDATE user_auth SET otp_token = NULL, otp_expires = NULL WHERE user_id = ?",
        [user.id]
      );

      this.s = 1;
      this.m = "Password reset successfully. You can now login.";
      return this.send_res(res);
    } catch (err) {
      this.s = 0;
      this.err = err.message;
      return this.send_res(res);
    }
  }


}
