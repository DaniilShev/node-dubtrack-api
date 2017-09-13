'use strict';
const Base = require('./base');
const User = require('./user');
const Role = require('./role');
const copyWithout = require('../common/utils').copyWithout;

const excluded = [
  'roomid', 'userid', '_user', 'roleid', '_id', 'skippedCount', 'order',
  '__v', 'ot_token',
];

/**
 * Represents Dubtrack user's data related to a specific room
 */
class RoomUser extends Base {
  /**
   * Constructs object from raw data returned by Dubtrack API
   * 
   * @param {Object} userObject
   * @param {DubtrackAPI} api
   */
  constructor(userObject, api) {
    super(userObject);

    this.roomId = userObject.roomid;
    this.userId = userObject.userid;
    this.role = new Role(userObject.roleid);

    this.user = null; // does not exist in event with room user
    if (typeof userObject._user == 'object') {
      this.user = new User(userObject._user);
    }

    copyWithout(userObject, this, excluded);

    Object.defineProperty(this, '_api', {
      enumerable: false,
      configurable: false,
      writable: false,
      value: api,
    });
  }

  /**
   * Get the relevant user
   * 
   * @return {Promise}
   */
  getUser() {
    if (this.user) {
      return Promise.resolve(this.user);
    }

    return this._api.getUser(this.userId);
  }
}

module.exports = RoomUser;
