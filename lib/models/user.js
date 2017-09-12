'use strict';
const Base = require('./base');
const copyWithout = require('../common/utils').copyWithout;

const excluded = [
  '_id', 'status', 'roleid', 'dubs', 'created', 'userInfo', '_force_updated',
  '__v',
];

/**
 * 
 */
class User extends Base {
  /**
   * 
   * 
   * @param {Object} userObject
   */
  constructor(userObject) {
    super(userObject);

    this.id = userObject._id;
    this.created = new Date(userObject.created);
    this.lastLogin = null; // exist in session and events, but is not in others
    if (userObject._force_updated) {
      this.lastLogin = new Date(userObject._force_updated);
    }

    copyWithout(userObject, this, excluded);
  }
}

module.exports = User;
