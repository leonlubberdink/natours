const crypto = require('crypto');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { default: validator } = require('validator');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'A name must be provided'],
  },
  email: {
    type: String,
    required: [true, 'Please provide your email address'],
    unique: [
      true,
      'Email address already in use, please use a different email address',
    ],
    trim: true,
    lowercase: true,
    validate: [validator.isEmail, 'Please use a valid email address'],
  },
  photo: {
    type: String,
    default: 'default.jpg',
  },
  role: {
    type: String,
    enum: ['user', 'guide', 'lead-guide', 'admin'],
    default: 'user',
  },
  password: {
    type: String,
    required: [true, 'Please provide a password'],
    minlength: [8, 'A password must contain at least 8 characters'],
    select: false,
  },
  passwordConfirm: {
    type: String,
    required: [true, 'Please confirm your password'],
    validate: function (val) {
      return val === this.password;
    },
    message: 'Please use the same password',
  },
  passwordChangedAt: Date,
  passwordResetToken: String,
  passwordResetExpires: Date,
  active: {
    type: Boolean,
    default: true,
    select: false,
  },
});

// MIDDLEWARES
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();

  this.password = await bcrypt.hash(this.password, 12);

  this.passwordConfirm = undefined;
  next();
});

userSchema.pre('save', async function (next) {
  if (!this.isModified('password') || this.isNew) return next();

  this.passwordChangedAt = Date.now() - 1000;
  next();
});

userSchema.pre(/^find/, function (next) {
  this.find({ active: { $ne: false } });
  next();
});

// INSTANCE METHODS
// Create instance method to compare given PW with existing PW at login
userSchema.methods.correctPassword = async function (candidatePass) {
  return await bcrypt.compare(candidatePass, this.password);
};

userSchema.methods.hasPasswordChanged = function (JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = this.passwordChangedAt.getTime() / 1000;
    return JWTTimestamp < changedTimestamp;
  }
  return false;
};

userSchema.methods.createPasswordResetToken = async function (candidatePass) {
  const resetToken = crypto.randomBytes(32).toString('hex');
  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  this.passwordResetExpires = Date.now() + 600000; //set to 600000ms = 10min
  return resetToken;
};

userSchema.methods.hasTokenExpired = function (user) {
  if (this.passwordResetExpires < Date.now()) return true;
  return false;
};

const User = mongoose.model('User', userSchema);

module.exports = User;
