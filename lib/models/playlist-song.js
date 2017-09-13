'use strict';
const Base = require('./base');
const Song = require('./song');
const copyWithout = require('../common/utils').copyWithout;

const excluded = ['_id', 'added', '_song', 'playlistid', '__v'];

/**
 * Represents song in a playlist
 */
class PlaylistSong extends Base {
  /**
   * Constructs object from raw data returned by Dubtrack API
   * 
   * @param {Object} songObject
   */
  constructor(songObject) {
    super(songObject);

    this.songId = songObject.songid;
    this.playlistId = songObject.playlistid;
    this.song = new Song(songObject._song);
    this.added = new Date(songObject.added);

    copyWithout(songObject, this, excluded);
  }
}

module.exports = PlaylistSong;
