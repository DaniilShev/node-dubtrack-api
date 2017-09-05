exports.BaseError = class BaseError extends Error {};

exports.FatalError = class FatalError extends BaseError {
  constructor(error) {
    if (error instanceof Error) {
      super(error.message);
      this.stack = error.stack;
    } else {
      super(error);
      Error.captureStackTrace(this);
    }
  }
};
  
  
exports.DubtrackError = class DubtrackError extends BaseError {
  constructor(error) {
    super(`Error ${error.code} with message "${error.message}"`);
    Error.captureStackTrace(this);

    this.code = dubtrackError.code;
    this.data = dubtrackError.data;
  }
};