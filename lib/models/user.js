const Base = require('./base');
const copyWithout = require('../utils').copyWithout;

const excluded = [
  '_id', 'status', 'roleid', 'dubs', 'created', 'userInfo', '__v',
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

    copyWithout(userObject, this, excluded);
  }
}

module.exports = User;
