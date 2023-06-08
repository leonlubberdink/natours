const path = require('path');
const pug = require('pug');
const express = require('express');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
var xss = require('xss-clean');
const hpp = require('hpp');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const cors = require('cors');

const tourRouter = require('./routes/tourRoutes');
const userRouter = require('./routes/userRoutes');
const reviewRouter = require('./routes/reviewRoutes');
const bookingRouter = require('./routes/bookingRoutes');
const viewRouter = require('./routes/viewRoutes');

const AppError = require('./utils/appError');
const globalErrorHandler = require('./controllers/errorController');

//Start express app
const app = express();

app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));

const limiter = rateLimit({
  max: 100,
  windowMs: 10 * 60 * 1000, // 10 min in ms, max 100 reqs per 10 mins
  message: 'Too many requests from this IP, please try again in an hour',
});

// 1) GLOBAL MIDDLEWARES
// Implement CORS
app.use(cors());

app.options('*', cors());

// Serving static files
app.use(express.static(path.join(__dirname, 'public')));

// Set security https headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'", 'data:', 'blob:', 'https:', 'ws:'],
        baseUri: ["'self'"],
        fontSrc: ["'self'", 'https:', 'data:'],
        scriptSrc: [
          "'self'",
          'https:',
          'http:',
          'blob:',
          'https://*.mapbox.com',
          'https://js.stripe.com',
          'https://m.stripe.network',
        ],
        frameSrc: ["'self'", 'https://js.stripe.com'],
        objectSrc: ["'none'"],
        styleSrc: ["'self'", 'https:', "'unsafe-inline'"],
        workerSrc: [
          "'self'",
          'data:',
          'blob:',
          'https://*.tiles.mapbox.com',
          'https://api.mapbox.com',
          'https://events.mapbox.com',
          'https://m.stripe.network',
        ],
        childSrc: ["'self'", 'blob:'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        formAction: ["'self'"],
        connectSrc: [
          "'self'",
          "'unsafe-inline'",
          'data:',
          'blob:',
          'https://*.stripe.com',
          'https://*.mapbox.com',
          'https://bundle.js:*',
          'ws://localhost:*/',
        ],
        upgradeInsecureRequests: [],
      },
    },
  })
);

// Morgan Middleware for development. Logging request info to console.
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Limit reqs from same IP
app.use('/api', limiter);

// Parse incoming requests with JSON payloads (body-parser)
app.use(express.json({ limit: '10kb' }));

// Parse data comming from url encoded form
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Parse data from incoming cookies
app.use(cookieParser());

// Sanatize data against NoSQL query injection
app.use(mongoSanitize());

// Sanatize data against XSS
app.use(xss());

// Prevent paramater pollution
app.use(
  hpp({
    whiteList: [
      'duration',
      'ratingsAverage',
      'ratingsQuantity',
      'maxGroupSize',
      'difficulty',
      'price',
    ],
  })
);

app.use(compression());

// 2 ROUTES
app.use('/', viewRouter);
app.use('/api/v1/tours', tourRouter);
app.use('/api/v1/users', userRouter);
app.use('/api/v1/reviews', reviewRouter);
app.use('/api/v1/bookings', bookingRouter);

// Error handling for non existing routes
app.all('*', (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

app.use(globalErrorHandler);

module.exports = app;
