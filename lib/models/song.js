'use strict';
const Base = require('./base');
const copyWithout = require('../common/utils').copyWithout;

const excluded = ['_id', 'images', 'created', '__v'];

/**
 * Represents a song
 */
class Song extends Base {
  /**
   * Constructs object from raw data returned by Dubtrack API
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
