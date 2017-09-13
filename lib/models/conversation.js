'use strict';
const Base = require('./base');
const User = require('./user');

/**
 * Represents Dubtrack conversation
 */
class Conversation extends Base {
  /**
   * Constructs object from raw data returned by Dubtrack API
   * 
   * @param {Object} obj
   * @param {DubtrackAPI} api
   */
  constructor(obj, api) {
    super(obj);

    this.id = obj._id;
    this.created = new Date(obj.created);
    this.latestMessageDate = new Date(obj.latest_message);
    this.latestMessageText = obj.latest_message_str;
    this.readBy = obj.users_read;

    if (typeof(obj.usersid[0]) == 'string') {
      this.userIds = obj.usersid;
      this.users = null;
    } else {
      this.userIds = obj.usersid.map((userObj) => userObj._id);
      this.users = obj.usersid.map((userObj) => new User(userObj));
    }

    Object.defineProperty(this, '_api', {
      enumerable: false,
      configurable: false,
      writable: false,
      value: api,
    });
  }

  /**
   * Get users involved in conversation
   * 
   * @return {Promise}
   */
  getUsers() {
    if (this.users) {
      return Promise.resolve(this.users);
    }

    return Promise.all(this.userIds.map(this._api.getUser.bind(this._api)))
      .then((users) => {
        this.users = users;
        return users;
      });
  }
}

module.exports = Conversation;
