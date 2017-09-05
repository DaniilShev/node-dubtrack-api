'use strict';

const EventEmitter = require('events').EventEmitter;
const request = require('request-promise');
const Promise = require('bluebird');

const errors = require('./errors');
const endpoints = require('./endpoints');

/**
 * 
 * @param {string} str 
 * @param {Object} replacements
 * @return {string}
 */
function replaceTemplates(str, replacements = {}) {
  return str.replace(/{(\w+)}/g, (match, p1) => {
    if (!(p1 in replacements)) {
      throw new TypeError(`Not found a replacement for ${p1} in "${str}"`);
    }

    return replacements[p1];
  });
}

/**
 * 
 * 
 * @extends EventEmitter
 */
class DubtrackAPI extends EventEmitter {
  /**
   * 
   */
  static get errors() {
    return errors;
  }

  /**
   *
   * 
   * @class DubtrackAPI
   * @constructor
   * @param {Object} [options] - 
   * @param {Object} [options.auth] - 
   * @param {string} [options.auth.username] - 
   * @param {string} [options.auth.password] - 
   * @param {string} [options.auth.autoLogin=true] - 
   * @param {Object} [options.request] -
   * @param {string} [options.baseApiUrl=https://api.dubtrack.fm] - 
   */
  constructor(options = {}) {
    super();

    this._options = options;
    this._options.baseApiUrl = options.baseApiUrl || 'https://api.dubtrack.fm';
    this._cookieJar = request.jar();
    this._authorized = false;

    if (options.auth) {
      const autoLogin = options.auth.autoLogin;
      if (typeof autoLogin === 'undefined' || autoLogin === true) {
        this.login(options.auth);
      }
    }
  }

  /**
   * 
   * @param {*} path 
   * @param {*} options
   * @return {Promise}
   * @private
   */
  _request(path, options = {}) {
    if (this._options.request) {
      Object.assign(options, this._options.request);
    }

    options.url = `${this._options.baseApiUrl}/${path}`;
    options.jar = this._cookieJar;
    options.simple = false;
    options.resolveWithFullResponse = true;

    return request(options).then((response) => {
      let json;
      try {
        json = JSON.parse(response.body);
      } catch (err) {
        throw new errors.FatalError(`Error parsing Dubtrack response: ${response.body}`); // eslint-disable-line max-len
      }

      if (json.code == 200) {
        return json.data;
      }

      throw new errors.DubtrackError(json);
    }).catch((error) => {
      if (error instanceof errors.BaseError) {
        throw error;
      }

      throw new errors.DubtrackError(error);
    });
  }

  /**
   * 
   * 
   * @param {Object} [auth] - 
   * @param {string} [auth.username] - 
   * @param {string} [auth.password] - 
   * @return {Promise}
   */
  login(auth = {}) {
    if (this._options.auth) {
      auth = Object.assign({}, this._options.auth, auth);
    }

    return this._request(endpoints.loginDubtrack, {method: 'POST', form: auth})
      .then((response) => {
        this._authorized = true;

        return response;
      });
  }

  /**
   * 
   * 
   * @return {Promise}
   */
  logout() {
    return this._request(endpoints.logout)
      .then((response) => {
        this._authorized = false;

        return response;
      });
  }

  /**
   * 
   * 
   * @return {Promise}
   */
  getMe() {
    if (!this._authorized) {
      return Promise.reject(new errors.FatalError('Not logged in'));
    }

    return this._request(endpoints.session);
  }

  /**
   * 
   * 
   * @param {string} userIdentifier
   * @return {Promise}
   */
  getUser(userIdentifier) {
    return this._request(replaceTemplates(endpoints.user, {userIdentifier}));
  }

  /**
   * 
   * 
   * @param {string} userId
   * @param {bool} [large=false]
   * @return {Promise}
   */
  getUserImage(userId, large=false) {
    let endpoint = (large) ? endpoints.userLargeImage : endpoints.userImage;

    return this._request(replaceTemplates(endpoint, {userId}));
  }

  /**
   * 
   * 
   * @param {string} userId
   * @return {Promise}
   */
  getUserFollowers(userId) {
    return this._request(replaceTemplates(endpoints.userFollowers, {userId}));
  }

  /**
   * 
   * 
   * @param {string} userId
   * @return {Promise}
   */
  followUser(userId) {
    let path = replaceTemplates(endpoints.userFollowers, {userId});

    return this._request(path, {method: 'POST'});
  }

  /**
   * 
   * 
   * @param {string} userId
   * @return {Promise}
   */
  unfollowUser(userId) {
    let path = replaceTemplates(endpoints.userFollowers, {userId});

    return this._request(path, {method: 'DELETE'});
  }

  /**
   * 
   * 
   * @param {string} roomIdentifier 
   * @return {Promise}
   */
  getRoom(roomIdentifier) {
    return this._request(replaceTemplates(endpoints.room, {roomIdentifier}));
  }

  /**
   * 
   * 
   * @param {string} roomId 
   * @param {string} userId 
   * @return {Promise}
   */
  getRoomUser(roomId, userId) {
    let path = replaceTemplates(endpoints.roomUser, {roomId, userId});

    return this._request(path);
  }

  /**
   * 
   * 
   * @param {string} roomId 
   * @return {Promise}
   */
  getRoomUsers(roomId) {
    return this._request(replaceTemplates(endpoints.roomUsers, {roomId}));
  }

  /**
   * 
   * 
   * @param {string} roomId 
   * @return {Promise}
   */
  getMutedUsers(roomId) {
    return this._request(replaceTemplates(endpoints.mutedUsers, {roomId}));
  }

  /**
   * 
   * 
   * @param {string} roomId 
   * @return {Promise}
   */
  getBannedUsers(roomId) {
    return this._request(replaceTemplates(endpoints.bannedUsers, {roomId}));
  }

  /**
   * 
   * 
   * @param {string} roomId 
   * @return {Promise}
   */
  createRoom() {
    return this._request(endpoints.rooms, {method: 'POST'});
  }

  /**
   * 
   * @param {string} roomId 
   * @return {Promise}
   */
  updateRoom(roomId) {
    let path = replaceTemplates(endpoints.room, {roomIdentifier: roomId});

    return this._request(path, {method: 'PUT'});
  }

   /**
   * 
   * @return {Promise}
   */
  getRooms() {
    return this._request(endpoints.rooms);
  }

   /**
   * 
   * @param {string} roomId 
   * @return {Promise}
   */
  sendMessage(roomId) {
    let path = replaceTemplates(endpoints.chatMessage, {roomId});

    return this._request(path, {method: 'POST'});
  }

   /**
   * 
   * @param {string} roomId 
   * @param {string} messageId 
   * @return {Promise}
   */
  deleteMessage(roomId, messageId) {
    let path = replaceTemplates(endpoints.chatMessage, {roomId, messageId});

    return this._request(path, {method: 'DELETE'});
  }
}

module.exports = DubtrackAPI;
