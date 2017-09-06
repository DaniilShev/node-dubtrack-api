'use strict';

const EventEmitter = require('events').EventEmitter;
const fs = require('fs');
const streamedRequest = require('request');
const Promise = require('bluebird');
const pump = require('pump');
const request = require('request-promise');

const errors = require('./errors');
const endpoints = require('./endpoints');

/**
 * Substitutes `{variables}` in original string
 * with corresponding values from `replacements`
 * 
 * @param {string} str - Original (template) string
 * @param {Object} replacements - Values of variables to substitute
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
   * Returns API errors
   */
  static get errors() {
    return errors;
  }

  /**
   * Initializes `node-dubtrack-api` object with specified settings
   * 
   * @class DubtrackAPI
   * @constructor
   * @param {Object} [options] - Options to use for this instance
   * @param {Object} [options.auth] - Credentials
   * @param {string} [options.auth.username] - Username or email to login with
   * @param {string} [options.auth.password] - Password
   * @param {string} [options.auth.autoLogin=true] - Login automatically
   * @param {Object} [options.request] - Custom parameters for request library
   * @param {string} [options.baseApiUrl=https://api.dubtrack.fm] - Base Dubtrack API URL
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
   * Builds URL using base API URL and path
   * 
   * @param {string} path - Path to make request to
   * @return {string}
   * @private
   */
  _buildURL(path) {
    return `${this._options.baseApiUrl}/${path}`;
  }

  /**
   * Makes a request to Dubtrack API and handles errors
   * 
   * @param {string} path - Path to make request to
   * @param {Object} options - Advanced settings for request library
   * @return {Promise}
   * @private
   */
  _request(path, options = {}) {
    if (this._options.request) {
      Object.assign(options, this._options.request);
    }

    options.url = this._buildURL(path);
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
    }).catch((err) => {
      if (err instanceof errors.BaseError) {
        throw err;
      }

      throw new errors.FatalError(err);
    });
  }

  /**
   * Tries to login to Dubtrack using provided credentials.
   * Use this method for more control over authentication process
   * 
   * @param {Object} [auth] - Credentials to be used
   * @param {string} [auth.username] - Username or email to be used
   * @param {string} [auth.password] - Password to be used
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
   * Logout from Dubtrack
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
   * Returns basic information about logged in user.
   * Requires authentication
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
   * Returns basic information about specfied user
   * 
   * @param {string} userIdentifier - User ID or username
   * @return {Promise}
   */
  getUser(userIdentifier) {
    return this._request(replaceTemplates(endpoints.user, {userIdentifier}));
  }

  /**
   * Get user image as stream
   * 
   * @param {string} userId - User ID
   * @param {bool} [large=false] - Should return large version
   * @return {Stream}
   */
  getUserImage(userId, large=false) {
    let endpoint = (large) ? endpoints.userLargeImage : endpoints.userImage;
    let url = this._buildURL(replaceTemplates(endpoint, {userId}));

    return streamedRequest({url});
  }

  /**
   * Download user image to file.
   * This is just a sugar for `getUserImage` method
   * 
   * @param {string} userId - User ID
   * @param {string} filePath - Path to file
   * @param {bool} [large=false] - Should return large version
   * @return {Promise}
   */
  downloadUserImage(userId, filePath, large=false) {
    return Promise
      .fromCallback((next) => {
        pump(this.getUserImage(userId, large),
             fs.createWriteStream(filePath), next);
      })
      .thenReturn(filePath)
      .catch((err) => {
        throw new errors.FatalError(err);
      });
  }

  /**
   * Get followers of specified user
   * 
   * @param {string} userId - User ID
   * @return {Promise}
   */
  getUserFollowers(userId) {
    return this._request(replaceTemplates(endpoints.userFollowers, {userId}));
  }

  /**
   * Follow specified user.
   * Requires authentication
   * 
   * @param {string} userId - User ID to follow
   * @return {Promise}
   */
  followUser(userId) {
    let path = replaceTemplates(endpoints.userFollowers, {userId});

    return this._request(path, {method: 'POST'});
  }

  /**
   * Unfollow specified user.
   * Requires authentication
   * 
   * @param {string} userId - User ID to unfollow
   * @return {Promise}
   */
  unfollowUser(userId) {
    let path = replaceTemplates(endpoints.userFollowers, {userId});

    return this._request(path, {method: 'DELETE'});
  }

  /**
   * Get basic information about specified room
   * 
   * @param {string} roomIdentifier - Room ID or URL-based name
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
   * Get users present in the room
   * 
   * @param {string} roomId - Room ID
   * @return {Promise}
   */
  getRoomUsers(roomId) {
    return this._request(replaceTemplates(endpoints.roomUsers, {roomId}));
  }

  /**
   * Get users muted in the room
   * 
   * @param {string} roomId - Room ID
   * @return {Promise}
   */
  getMutedUsers(roomId) {
    return this._request(replaceTemplates(endpoints.mutedUsers, {roomId}));
  }

  /**
   * Get users banned in the room
   * 
   * @param {string} roomId - Room ID
   * @return {Promise}
   */
  getBannedUsers(roomId) {
    return this._request(replaceTemplates(endpoints.bannedUsers, {roomId}));
  }

  /**
   * Create room.
   * Requires authentication
   * 
   * @param {string} roomId - Room ID
   * @return {Promise}
   */
  createRoom() {
    return this._request(endpoints.rooms, {method: 'POST'});
  }

  /**
   * Update room.
   * Requires authentication
   * 
   * @param {string} roomId - Room ID
   * @return {Promise}
   */
  updateRoom(roomId) {
    let path = replaceTemplates(endpoints.room, {roomIdentifier: roomId});

    return this._request(path, {method: 'PUT'});
  }

  /**
   * Get rooms list
   * 
   * @return {Promise}
   */
  getRooms() {
    return this._request(endpoints.rooms);
  }

  /**
   * Send chat message to the room.
   * Requires authentication
   * 
   * @param {string} roomId - Room ID
   * @param {string} message - Message to send
   * @return {Promise}
   */
  sendMessage(roomId, message) {
    let path = replaceTemplates(endpoints.chatMessage, {roomId});

    return this._request(path, {method: 'POST'});
  }

  /**
   * Deletes chat message.
   * Requires authentication and moderator or higher role in the room
   * 
   * @param {string} roomId - Room ID
   * @param {string} messageId - Message ID
   * @return {Promise}
   */
  deleteMessage(roomId, messageId) {
    let path = replaceTemplates(endpoints.chatMessage, {roomId, messageId});

    return this._request(path, {method: 'DELETE'});
  }

  /**
   * Get list of open conversations
   * 
   * @return {Promise}
   */
  getOpenConversations() {
    return this._request(endpoints.conversations);
  }

  /**
   * Creates or gets new conversation
   * 
   * @param {string[]} userIds Users involved in conversaton
   * 
   * @return {Promise}
   */
  getConversation(userIds) {
    return this._request(
      endpoints.conversations,
      {method: 'POST', form: {usersid: userIds}}
    );
  }

  /**
   * Sends message to specified conversation
   * 
   * @param {string} conversationId Conversation ID
   * @param {string} message Message text
   * 
   * @return {Promise}
   */
  sendMessageToConversation(conversationId, message) {
    return this._request(
      replaceTemplates(endpoints.conversation, {conversationId}),
      {method: 'POST', form: {message, time: Date.now()}}
    );
  }

  /**
   * Marks conversation as read
   * 
   * @param {string} conversationId 
   */
  readConversation(conversationId) {
    return this._request(
      replaceTemplates(endpoints.readConversation, {conversationId}),
      {method: 'POST'}
    );
  }
}

module.exports = DubtrackAPI;
