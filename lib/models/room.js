'use strict';
const Base = require('./base');
const User = require('./user');
const copyWithout = require('../utils').copyWithout;

const excluded = [
  '_id', 'status', 'isPublic', 'lang', 'musicType', 'allowedDjs',
  'created', 'updated',
];

/**
 * 
 */
class Room extends Base {
  /**
   * 
   * 
   * @param {Object} roomObject
   */
  constructor(roomObject) {
    super(roomObject);

    this.id = roomObject._id;
    this.user = new User(roomObject._user);
    this.created = new Date(roomObject.created);
    this.updated = new Date(roomObject.updated);

    copyWithout(roomObject, this, excluded);
  }
}

module.exports = Room;
