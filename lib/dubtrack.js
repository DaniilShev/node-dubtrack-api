'use strict';

const endpoints = require('./endpoints');
const models = require('./models');
const errors = require('./errors');
const replaceTemplates = require('./utils').replaceTemplates;

const EventEmitter = require('events').EventEmitter;
const fs = require('fs');
const streamedRequest = require('request');
const Promise = require('bluebird');
const pump = require('pump');
const request = require('request-promise');

/**
 * 
 * 
 * @extends EventEmitter
 */
class DubtrackAPI extends EventEmitter {
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
   * @param {boolean} [options.raw=false] - Do not process API requests and 
   *                                            return raw answers instead
   * @param {Object} [options.request] - Custom parameters for request library
   * @param {string} [options.baseApiUrl=https://api.dubtrack.fm] - Base Dubtrack API URL
   */
  constructor(options = {}) {
    super();

    this._options = options;
    this._options.baseApiUrl = options.baseApiUrl || 'https://api.dubtrack.fm';
    this._options.raw = (typeof options.raw === 'boolean') ? options.raw : false; // eslint-disable-line max-len
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

      if (json.code == 401) {
        this._authorized = false;

        throw new errors.AccessDeniedError();
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
   * Checks for authorization.
   * 
   * @return {bool}
   */
  isAuthorized() {
    return this._authorized;
  }

  /**
   * Returns basic information about logged in user.
   * Requires authentication
   * 
   * @return {Promise}
   */
  getMe() {
    if (!this._authorized) {
      return Promise.reject(new errors.AccessDeniedError());
    }

    return this._request(endpoints.session)
      .then((object) => {
        if (this._options.raw) {
          return object;
        }

        return new models.Session(object);
      });
  }

  /**
   * Returns token information of logged in user.
   * Requires authentication
   * 
   * @return {Promise}
   */
  getToken() {
    if (!this._authorized) {
      return Promise.reject(new errors.AccessDeniedError());
    }

    return this._request(endpoints.authToken);
  }

  /**
   * Returns basic information about specfied user
   * 
   * @param {string} userIdentifier - User ID or username
   * @return {Promise}
   */
  getUser(userIdentifier) {
    return this._request(replaceTemplates(endpoints.user, {userIdentifier}))
      .then((object) => {
        if (this._options.raw) {
          return object;
        }

        return new models.User(object);
      });
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
   * @param {string} userId - ID of the user to follow
   * @return {Promise}
   */
  followUser(userId) {
    if (!this._authorized) {
      return Promise.reject(new errors.AccessDeniedError());
    }
    let path = replaceTemplates(endpoints.userFollowers, {userId});

    return this._request(path, {method: 'POST'});
  }

  /**
   * Unfollow specified user.
   * Requires authentication
   * 
   * @param {string} userId - ID of the user to unfollow
   * @return {Promise}
   */
  unfollowUser(userId) {
    if (!this._authorized) {
      return Promise.reject(new errors.AccessDeniedError());
    }
    let path = replaceTemplates(endpoints.userFollowers, {userId});

    return this._request(path, {method: 'DELETE'});
  }

  /**
   * Create playlist
   * 
   * @param {string} name - Playlist name
   * @return {Promise}
   */
  createPlaylist(name) {
    return this._request(endpoints.playlists, {method: 'POST', form: {name}});
  }

  /**
   * Deletes playlist
   * 
   * @param {string} playlistId - Playlist ID
   * @return {Promise}
   */
  deletePlaylist(playlistId) {
    let path = replaceTemplates(endpoints.playlist, {playlistId});

    return this._request(path, {method: 'DELETE'});
  }

  /**
   * Get playlist songs
   * 
   * @param {string} playlistId - Playlist ID
   * @param {Object} [params] - Params
   * @param {string} [params.name] - Filter by name
   * @param {number} [params.page] - Page of the playlist
   * @return {Promise}
   */
  getPlaylistSongs(playlistId, params = {}) {
    return this._request(endpoints.playlistSongs, {qs: params})
      .then((objects) => {
        if (this._options.raw) {
          return objects;
        }

        return objects.map((object) => new models.PlaylistSong(object));
      });
  }

  /**
   * Add song to playlist
   * 
   * @param {string} playlistId - Playlist ID
   * @param {string} type - Source of the song: youtube or soundcloud
   * @param {string} fkid - ID of the song on youtube or soundcloud
   * @return {Promise}
   */
  addSongToPlaylist(playlistId, type, fkid) {
    let path = replaceTemplates(endpoints.playlistSongs, {playlistId});

    return this._request(path, {method: 'POST', data: {type, fkid}});
  }

  /**
   * Removes song from playlist
   * 
   * @param {string} playlistId - Playlist ID
   * @param {string} songId - Song ID
   * @return {Promise}
   */
  removePlaylistSong(playlistId, songId) {
    let path = replaceTemplates(endpoints.playlistSong, {playlistId, songId});

    return this._request(path, {method: 'DELETE'});
  }

  /**
   * Get playlists
   * 
   * @return {Promise}
   */
  getPlaylists() {
    return this._request(endpoints.playlists)
      .then((objects) => {
        if (this._options.raw) {
          return objects;
        }

        return objects.map((object) => new models.Playlist(object));
      });
  }

  /**
   * Get basic information about specified room
   * 
   * @param {string} roomIdentifier - Room ID or URL-based name
   * @return {Promise}
   */
  getRoom(roomIdentifier) {
    return this._request(replaceTemplates(endpoints.room, {roomIdentifier}))
      .then((object) => {
        if (this._options.raw) {
          return object;
        }

        return new models.Room(object);
      });
  }

  /**
   * Get the room user
   * 
   * @param {string} roomId - Room ID
   * @param {string} userId - User ID
   * @return {Promise}
   */
  getRoomUser(roomId, userId) {
    let path = replaceTemplates(endpoints.roomUser, {roomId, userId});

    return this._request(path)
      .then((object) => {
        if (this._options.raw) {
          return object;
        }

        return new models.RoomUser(object);
      });
  }

  /**
   * Get users present in the room
   * 
   * @param {string} roomId - Room ID
   * @return {Promise}
   */
  getRoomUsers(roomId) {
    return this._request(replaceTemplates(endpoints.roomUsers, {roomId}))
      .then((objects) => {
        if (this._options.raw) {
          return objects;
        }

        return objects.map((object) => new models.RoomUser(object));
      });
  }

  /**
   * Get users muted in the room
   * 
   * @param {string} roomId - Room ID
   * @return {Promise}
   */
  getMutedUsers(roomId) {
    return this._request(replaceTemplates(endpoints.mutedUsers, {roomId}))
      .then((objects) => {
        if (this._options.raw) {
          return objects;
        }

        return objects.map((object) => new models.RoomUser(object));
      });
  }

  /**
   * Get users banned in the room
   * 
   * @param {string} roomId - Room ID
   * @return {Promise}
   */
  getBannedUsers(roomId) {
    return this._request(replaceTemplates(endpoints.bannedUsers, {roomId}))
      .then((objects) => {
        if (this._options.raw) {
          return objects;
        }

        return objects.map((object) => new models.RoomUser(object));
      });
  }

  /**
   * Create room.
   * Requires authentication
   * 
   * @param {string} roomId - Room ID
   * @return {Promise}
   */
  createRoom() {
    if (!this._authorized) {
      return Promise.reject(new errors.AccessDeniedError());
    }

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
    if (!this._authorized) {
      return Promise.reject(new errors.AccessDeniedError());
    }
    let path = replaceTemplates(endpoints.room, {roomIdentifier: roomId});

    return this._request(path, {method: 'PUT'});
  }

  /**
   * Get rooms
   * 
   * @return {Promise}
   */
  getRooms() {
    return this._request(endpoints.rooms)
      .then((objects) => {
        if (this._options.raw) {
          return objects;
        }

        return objects.map((object) => new models.Room(object));
      });
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
    if (!this._authorized) {
      return Promise.reject(new errors.AccessDeniedError());
    }
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
    if (!this._authorized) {
      return Promise.reject(new errors.AccessDeniedError());
    }
    let path = replaceTemplates(endpoints.chatMessage, {roomId, messageId});

    return this._request(path, {method: 'DELETE'});
  }

  /**
   * Get list of open conversations.
   * Requires authentication
   * 
   * @return {Promise}
   */
  getOpenConversations() {
    if (!this._authorized) {
      return Promise.reject(new errors.AccessDeniedError());
    }
    return this._request(endpoints.conversations);
  }

  /**
   * Creates or gets new conversation.
   * Requires authentication
   * 
   * @param {string|string[]} userIds - User(s) involved in conversaton
   * @return {Promise}
   */
  getConversation(userIds) {
    if (!this._authorized) {
      return Promise.reject(new errors.AccessDeniedError());
    }
    let form = {
      usersid: Array.isArray(userIds)? userIds : [userIds],
    };

    return this._request(endpoints.conversations, {method: 'POST', form});
  }

  /**
   * Sends message to specified conversation.
   * Requires authentication
   * 
   * @param {string} conversationId - Conversation ID
   * @param {string} message - Message text
   * @return {Promise}
   */
  sendMessageToConversation(conversationId, message) {
    if (!this._authorized) {
      return Promise.reject(new errors.AccessDeniedError());
    }
    let path = replaceTemplates(endpoints.conversation, {conversationId});
    let form = {message, time: Date.now()};

    return this._request(path, {method: 'POST', form});
  }

  /**
   * Sends private message to user.
   * This is a sugar method: it calls `getConversation`
   * to get conversation ID and then sends the message
   * using `sendMessageToConversation`.
   * Requires authentication
   * 
   * @param {string} userId - User ID
   * @param {string} message - Message text
   * @return {Promise}
   */
  sendMessageToUser(userId, message) {
    return this.getConversation(userId).then((conversation) =>
      this.sendMessageToConversation(conversation._id, message)
    );
  }

  /**
   * Marks conversation as read.
   * Requires authentication
   * 
   * @param {string} conversationId - Conversation ID
   * @return {Promise}
   */
  readConversation(conversationId) {
    if (!this._authorized) {
      return Promise.reject(new errors.AccessDeniedError());
    }
    let path = replaceTemplates(endpoints.readConversation, {conversationId});

    return this._request(path, {method: 'POST'});
  }
}

DubtrackAPI.errors = errors;

module.exports = DubtrackAPI;
