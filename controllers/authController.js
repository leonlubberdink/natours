const crypto = require('crypto');
const { promisify } = require('util');
const jwt = require('jsonwebtoken');
const User = require('../models/userModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const Email = require('../utils/email');

const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

const cookieOptions = {
  expires: new Date(Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 86400000), // (90 days in milisec)
  httpOnly: true,
};

// In DEV we do not use https, so the secure option should only be set in production
if (process.env.NODE_ENV === 'production') cookieOptions.secure = true;

const createAndSendToken = (user, statusCode, res) => {
  const token = signToken(user._id);

  res.cookie('jwt', token, cookieOptions);

  // Remove password from the response.
  user.password = undefined;

  res.status(statusCode).json({
    status: 'success',
    token,
    data: {
      user,
    },
  });
};

exports.signup = catchAsync(async (req, res, next) => {
  const newUser = await User.create({
    name: req.body.name,
    email: req.body.email,
    password: req.body.password,
    passwordConfirm: req.body.passwordConfirm,
    passwordChangedAt: req.body.passwordChangedAt,
    role: req.body.role,
  });

  const url = `${req.protocol}://${req.get('host')}/me`;
  console.log(url);
  await new Email(newUser, url).sendWelcome();

  createAndSendToken(newUser, 201, res);
});

exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  // 1 Check if pass and email exsist
  if (!email || !password) {
    return next(new AppError('Please provide email and/or password!', 400));
  }

  // 2 Check if user exists and pass is correct
  const user = await User.findOne({ email: email }).select('+password');

  // Use our own created instance method (userModel) in if check
  if (!user || !(await user.correctPassword(password))) {
    return next(new AppError('Incorrect email or password!', 401));
  }

  // 3 If ok, send token to client
  createAndSendToken(user, 200, res);
});

exports.logout = catchAsync(async (req, res, next) => {
  res.cookie('jwt', 'loggedout', {
    expires: new Date(Date.now() + 10000),
    httpOnly: true,
  });
  res.status(200).json({ status: 'success' });
});

exports.protect = catchAsync(async (req, res, next) => {
  // 1) Getting JWT and check if it's there
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies.jwt) {
    token = req.cookies.jwt;
  }

  if (!token) {
    return next(
      new AppError('You are not logged in! Please login to get access', 401)
    );
  }

  // 2) Verification JWT
  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

  // 3) If verification success, check if user still exists
  const currentUser = await User.findById(decoded.id);

  if (!currentUser) {
    return next(new AppError('User no longer exists.', 401));
  }

  // 4) Check if user changed password after JWT was issued
  if (currentUser.hasPasswordChanged(decoded.iat)) {
    return next(
      new AppError('User changed password. Please login again!', 401)
    );
  }

  // Add current user to req. Grant access to protected route
  req.user = currentUser;
  res.locals.user = currentUser;
  next();
});

// Only for rendered pages, no errors
exports.isLoggedIn = async (req, res, next) => {
  if (req.cookies.jwt) {
    try {
      // 1) Verify token
      const decoded = await promisify(jwt.verify)(
        req.cookies.jwt,
        process.env.JWT_SECRET
      );

      // 2) If verification success, check if user still exists
      const currentUser = await User.findById(decoded.id);

      if (!currentUser) {
        return next();
      }

      // 3) Check if user changed password after JWT was issued
      if (currentUser.hasPasswordChanged(decoded.iat)) {
        return next();
      }

      // 4) Add current user to res.locals, so it's available in Pug.
      //    THERE IS A LOGGED IN USER
      res.locals.user = currentUser;
      return next();
    } catch (err) {
      return next();
    }
  }
  next();
};

exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(
        new AppError('You do not have persmission to perform this action.', 403)
      );
    }
    next();
  };
};

// // For later when Lead Guides are loaded
// exports.restrictLeadToOwnTours = (req, res, next) => {
//   if (!req.user.role === 'lead-guide') return next();

// };

exports.forgotPassword = catchAsync(async (req, res, next) => {
  // 1) Get user based on POSTed email
  const user = await User.findOne({ email: req.body.email });
  if (!user) {
    return next(new AppError('There is no user with that  email address'), 404);
  }

  // 2) Generate random token
  const resetToken = await user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false });

  // 3) Send token back to user's email
  const resetURL = `${req.protocol}://${req.get(
    'host'
  )}/api/v1/users/resetPassword/${resetToken}`;

  const message = `Forgot your password? Submit a PATCH request with
  your new password and passwordConfirm to: ${resetURL}.\n\n
  If you didn't forget your password, please ignore this email!`;

  // This time we need a try cath block,
  // because we want to do more than send down a error to client
  try {
    await new Email(user, resetURL).sendPasswordReset();

    res.status(200).json({
      status: 'success',
      message: 'Token sent to email!',
    });
  } catch (err) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({ validateBeforeSave: false });
    return next(
      new AppError(
        'There was an error sending the email. Please try again later',
        500
      )
    );
  }
});

exports.resetPassword = catchAsync(async (req, res, next) => {
  // 1) Get user based on token
  const hashedToken = crypto
    .createHash('sha256')
    .update(req.params.token)
    .digest('hex');
  const user = await User.findOne({ passwordResetToken: hashedToken });

  // 2) If token has not expired and user exists, set new Password
  if (!user) {
    return next(new AppError('Invalid token!', 401));
  }

  if (user.hasTokenExpired()) {
    return next(new AppError('Token has expired!', 401));
  }

  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;

  await user.save();

  // 3) Update changedPasswordAt property fo the user
  // 4) Login user and send JWT
  createAndSendToken(user, 200, res);
});

exports.updateMyPassword = catchAsync(async (req, res, next) => {
  // 1) Get user from collection
  const user = await User.findById(req.user.id).select('+password');

  // 2) Check if POSTed PW is correct
  if (!(await user.correctPassword(req.body.passwordCurrent))) {
    return next(new AppError('Your current password does not match!', 401));
  }

  // 3) Update the password
  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  await user.save();

  // 4) Log user in, send JWT
  createAndSendToken(user, 200, res);
});
