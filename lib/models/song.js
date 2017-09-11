'use strict';
const Base = require('./base');
const copyWithout = require('../utils').copyWithout;

const excluded = ['_id', 'images', 'created', '__v'];

/**
 * 
 */
class Song extends Base {
  /**
   * 
   * 
   * @param {Object} songObject
   */
  constructor(songObject) {
    super(songObject);

    this.id = songObject._id;
    this.created = new Date(songObject.created);
    this.thumbnail = songObject.images.thumbnail;

    copyWithout(songObject, this, excluded);
  }
}

module.exports = Song;
