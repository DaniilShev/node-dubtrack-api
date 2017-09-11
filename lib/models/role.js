'use strict';
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
   * @param {Object|string} role
   */
  constructor(role) {
    super(role);


    if (typeof role == 'string' || role == null) {
      // TODO
    } else {
      this.id = role._id;

      copyWithout(role, this, excluded);
    }
  }
}

module.exports = Role;
