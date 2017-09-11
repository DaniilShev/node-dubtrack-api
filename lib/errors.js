'use strict';
exports.BaseError = class BaseError extends Error {};

exports.FatalError = class FatalError extends exports.BaseError {
  /**
   * 
   * @param {string|Error} error 
   */
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

exports.DubtrackError = class DubtrackError extends exports.BaseError {
  /**
   * 
   * @param {Object} error 
   */
  constructor(error) {
    super(`Error ${error.code} with message "${error.message}" and data "${JSON.stringify(error.data)}"`); // eslint-disable-line max-len
    Error.captureStackTrace(this);

    this.code = error.code;
    this.data = error.data;
  }
};


exports.AccessDeniedError = class AccessDeniedError extends exports.FatalError {
  /**
   * 
   */
  constructor() {
    super('Not logged in');
    Error.captureStackTrace(this);
  }
};
