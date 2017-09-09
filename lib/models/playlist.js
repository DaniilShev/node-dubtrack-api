const Base = require('./base');
const copyWithout = require('../utils').copyWithout;

const excluded = [
  '_id', 'status', 'removed', 'isPublic', 'created', 'userid', '__v',
];

/**
 * 
 */
class Playlist extends Base {
  /**
   * 
   * 
   * @param {Object} playlistObject
   */
  constructor(playlistObject) {
    super(playlistObject);

    this.id = playlistObject._id;
    this.userId = playlistObject.userid;
    this.created = new Date(playlistObject.created);

    copyWithout(playlistObject, this, excluded);
  }
}

module.exports = Playlist;
