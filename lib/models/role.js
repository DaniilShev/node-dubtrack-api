'use strict';
const Base = require('./base');
const roles = require('../common/roles');
const merge = require('lodash/merge');

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

    if (typeof role == 'object' && role != null) {
      role = role._id;
    }

    merge(this, roles[role]);
  }

  /**
   * Checks role
   * 
   * @param {strong} roleType - Role type: co-owner, manager, mod, vip,
   * resident-dj or user
   * @return {bool}
   */
  is(roleType) {
    return (this.type == roleType);
  }

  /**
   * Checks right
   * 
   * @param {string} right - Rigth: update-room, set-roles, set-managers, skip,
   * queue-order, kick, ban, mute, set-dj, lock-queue, delete-chat, chat-mention
   * @return {bool}
   */
  hasRight(right) {
    return this.rights.includes(right);
  }
}

module.exports = Role;
