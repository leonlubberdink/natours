const mongoose = require('mongoose');
const Tour = require('./tourModel');

const reviewSchema = mongoose.Schema(
  {
    review: {
      type: String,
      required: [true, 'Review can not be empty'],
    },
    rating: {
      type: Number,
      min: [1, 'A rating must be at least 1.0'],
      max: [5, 'A rating can not be higher than 5.0'],
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now(),
    },
    tour: {
      type: mongoose.Schema.ObjectId,
      ref: 'Tour',
      required: [true, 'Review must belong to a tour'],
    },
    user: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
      required: [true, 'Review must belong to a tour'],
    },
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    id: false,
  }
);

reviewSchema.index({ tour: 1, user: 1 }, { unique: true, dropDups: true });

// STATIC METHODS (direct on model, not on instances like instanc methods, that are called on instances)
// For calculating average rating
reviewSchema.statics.calcAverageRatings = async function (tourId) {
  // In static methods, this points to current model
  const stats = await this.aggregate([
    {
      $match: { tour: tourId },
    },
    {
      $group: {
        _id: '$tour',
        numRatings: { $sum: 1 },
        averageRating: { $avg: '$rating' },
      },
    },
  ]);

  if (stats.length > 0) {
    await Tour.findByIdAndUpdate(tourId, {
      ratingsAverage: stats[0].averageRating.toFixed(1),
      ratingsQuantity: stats[0].numRatings,
    });
  } else {
    await Tour.findByIdAndUpdate(tourId, {
      ratingsAverage: 0,
      ratingsQuantity: 0,
    });
  }
};

// QUERY MIDDLEWARE
reviewSchema.pre(/^find/, function (next) {
  this.populate({
    path: 'user',
    select: 'name photo',
  });
  next();
});

// For findOneAndUpdate and findOneAndDelete
// First create query and store found review in the query object (this)
// This variable is then also available in the post query middleware, wehere we then save the update review
// This is not possible in de pre query middleware
reviewSchema.pre(/^findOneAnd/, async function (next) {
  // this point to current query
  this.rv = await this.findOne();
  next();
});

reviewSchema.post(/^findOneAnd/, async function () {
  this.rv.constructor.calcAverageRatings(this.rv.tour);
});

// DOCUMENT MIDDLEWARE
reviewSchema.post('save', function () {
  // this points to current document(review)
  this.constructor.calcAverageRatings(this.tour);
});

const Review = mongoose.model('Review', reviewSchema);

Review.createIndexes();

module.exports = Review;
