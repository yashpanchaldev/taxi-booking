import "../../routes/auth.js";
import { Base } from "../../service/base.js";

export default class AuthController extends Base {
  constructor() {
    super();
  }

  async signup(req, res, next) {
    try {
    } catch (err) {
      this.err = err.message;
    }
  }
}
