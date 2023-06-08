class APIFeatures {
  constructor(buildQuery, requestQuery) {
    this.buildQuery = buildQuery;
    this.requestQuery = requestQuery;
  }

  filter() {
    // First create array with fields to exclude from the query
    const excludedFields = ['page', 'limit', 'sort', 'fields'];

    // Make shallow copy of request, so the request object stays as it is.
    const queryObj = { ...this.requestQuery };

    // Remove the non-filter fields from the shallow copy
    excludedFields.forEach((el) => delete queryObj[el]);

    // Add $ sign to operators in querystring (for mongoose)
    let queryStr = JSON.stringify(queryObj);
    queryStr = queryStr.replace(/\b(gte|gt|lte|lt)\b/g, (match) => `$${match}`);

    this.buildQuery = this.buildQuery.find(JSON.parse(queryStr));
    return this;
  }

  sort() {
    if (this.requestQuery.sort) {
      const sortCriteria = this.requestQuery.sort.split(',').join(' ');
      this.buildQuery = this.buildQuery.sort(sortCriteria);
    } else {
      this.buildQuery = this.buildQuery.sort('-createdAt');
    }
    return this;
  }

  limitFields() {
    if (this.requestQuery.fields) {
      const fields = this.requestQuery.fields.split(',').join(' ');
      this.buildQuery = this.buildQuery.select(fields);
    } else {
      this.buildQuery.select('-__v');
    }
    return this;
  }

  paginate() {
    const page = +this.requestQuery.page || 1;
    const limit = +this.requestQuery.limit || 10;
    const skip = (page - 1) * limit;
    this.buildQuery = this.buildQuery.skip(skip).limit(limit);

    return this;
  }
}

module.exports = APIFeatures;
