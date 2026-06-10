const jwt = require("jsonwebtoken");
const SECRET = process.env.JWT_SECRET;
const { UnauthorizedError, ForbiddenError } = require("../lib/errors");

function authenticate(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith("Bearer "))
    throw new UnauthorizedError("No token provided");
  try {
    req.user = jwt.verify(h.split(" ")[1], SECRET, { algorithms: ["HS256"] });
    next();
  } catch {
    throw new ForbiddenError("Invalid or expired token");
  }
}

module.exports = authenticate;
