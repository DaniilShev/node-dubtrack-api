const Base = require('./base');
const copyWithout = require('../utils').copyWithout;

const excluded = ['_id', '__v'];

/**
 * 
 */
class Role extends Base {
  /**
   * 
   * 
   * @param {Object} roleObject
   */
  constructor(roleObject) {
    super(roleObject);

    this.id = roleObject._id;

    copyWithout(roleObject, this, excluded);
  }
}

module.exports = Role;
