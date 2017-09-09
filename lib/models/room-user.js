const Base = require('./base');
const User = require('./user');
const Role = require('./role');
const copyWithout = require('../utils').copyWithout;

const excluded = [
  'roomid', 'userid', '_user', 'roleid', '_id', 'skippedCount', 'order',
  '__v', 'ot_token',
];

/**
 * 
 */
class RoomUser extends Base {
  /**
   * 
   * 
   * @param {Object} userObject
   */
  constructor(userObject) {
    super(userObject);

    this.roomId = userObject.roomid;
    this.userId = userObject.userid;
    this.user = new User(userObject._user);
    this.role = new Role(userObject.roleid);

    copyWithout(userObject, this, excluded);
  }
}

module.exports = RoomUser;
