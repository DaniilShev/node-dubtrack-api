const Base = require('./base');

/**
 * 
 */
class Session extends Base {
  /**
   * 
   * 
   * @param {Object} sessionObject
   */
  constructor(sessionObject) {
    super(sessionObject);

    this.id = sessionObject._id;
    this.username = sessionObject.username;
    this.created = new Date(sessionObject.created);
    this.lastLogin = new Date(sessionObject._force_updated);
  }
}

module.exports = Session;
