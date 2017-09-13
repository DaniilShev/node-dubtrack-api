'use strict';
const Base = require('./base');
const User = require('./user');
const copyWithout = require('../common/utils').copyWithout;

const excluded = [
  '_id', 'status', 'isPublic', 'lang', 'musicType', 'allowedDjs',
  'created', 'updated',
];

/**
 * Represents a Dubtrack room
 */
class Room extends Base {
  /**
   * Constructs object from raw data returned by Dubtrack API
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
