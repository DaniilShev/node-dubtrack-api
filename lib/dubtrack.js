'use strict';
const DubtrackSocket = require('./dubtrack-socket');
const endpoints = require('./common/endpoints');
const models = require('./models');
const errors = require('./common/errors');
const replaceTemplates = require('./common/utils').replaceTemplates;
const EventEmitter = require('events').EventEmitter;
const fs = require('fs');
const streamedRequest = require('request');
const Promise = require('bluebird');
const pump = require('pump');
const request = require('request-promise');
const lodash = require('lodash');

/**
 * Basic class for interacting with Dubtrack API.
 * Holds authorization information and websocket connections
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
   * @param {string|string[]} [options.room] - Room ID or URL-based name
   * @param {boolean} [options.autoJoin=true] - Join automatically
   * @param {Object} [options.socket] - Options for `dubtrack-ws-client` library
   * @param {boolean} [options.socket.secure=true] - Use secure websocket connection
   * @param {string} [options.socket.host=ws.dubtrack.fm] - Websocket host
   * @param {boolean} [options.socket.autoReconnect=true] - Reconnect socket 
   * automatically
   * @param {number} [options.socket.retriesAmount=7] - Amount of reconnect 
   * retries
   * @param {boolean} [options.raw=false] - Do not process API requests and 
   *                                        return raw answers instead
   * @param {boolean} [options.onlyFirstMatch=false] - Stops comparing type
   *                             with regular expressions after first match
   * @param {Object} [options.request] - Custom parameters for request library
   * (only for API, not sockets)
   * @param {string} [options.baseApiUrl=https://api.dubtrack.fm] - Base 
   * Dubtrack API URL
   */
  constructor(options = {}) {
    super();

    this._options = options;
    this._options.baseApiUrl = options.baseApiUrl || 'https://api.dubtrack.fm';
    this._options.raw = (typeof options.raw === 'boolean') ? options.raw : false; // eslint-disable-line max-len
    this._cookieJar = request.jar();
    this._regexpListeners = [];

    this._authorized = false;
    this.on('login', () => {
      this._authorized = true;
    }).on('logout', () => {
      this._authorized = false;
    });

    if (typeof options.auth != 'object' || options.auth.autoLogin !== false) {
      this.login(options.auth)
        .finally(() => this._initializeSocket());
    } else {
      this._initializeSocket();
    }
  }

  /**
   * Initializes socket
   * 
   * @private
   */
  _initializeSocket() {
    this._socket = new DubtrackSocket(this, this._options.socket);

    if (this._options.autoJoin !== false) {
      this.once('connected', () => {
        this.join().catch((err) => this._onError(err));
      });
    }
  }

  /**
   * Processes error
   * 
   * @param {Error} err - Error
   * @private
   */
  _onError(err) {
    if (!this.listeners('error').length) {
      console.error(err); // eslint-disable-line no-console
    } else {
      this.emit('error', err);
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
        if (this._authorized) {
          this.emit('logout');
        }

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
   * Connect to Dubtrack sockets
   * 
   * @return {Promise}
   */
  connect() {
    return this._socket.connect();
  }

  /**
   * Checks if Dubtrack socket is connected
   * 
   * @return {bool}
   */
  isConnected() {
    return this._socket.isConnected();
  }

  /**
   * Join the room
   * 
   * @param {string} roomIdentifier - Room ID or URL-based name
   * @return {Promise}
   */
  join(roomIdentifier) {
    return this._socket.join(roomIdentifier || this._options.room)
      .then(() => this.emit('join', roomIdentifier));
  }

  /**
   * Leave the room
   * 
   * @param {string} roomIdentifier - Room ID or URL-based name
   * @return {Promise}
   */
  leave(roomIdentifier) {
    return this.getRoom(roomIdentifier)
      .then((object) => {
        let path = replaceTemplates(endpoints.roomUsers, {
          roomId: object.roomId,
        });

        return this._request(path, {method: 'DELETE'})
          .then((response) => {
            this.emit('leave', roomIdentifier);

            return response;
          });
      });
  }

  /**
   * Disconnect Dubtrack sockets
   */
  disconnect() {
    this._socket.disconnect();
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
        this.emit('login');

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
        this.emit('logout');

        return response;
      });
  }

  /**
   * Checks whether API is logged in
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
   * @param {Object} [options] - Options to use in this method
   * @param {boolean} [options.raw=false] - Do not process API requests and 
   *                                        return raw answers instead
   * @return {Promise}
   */
  getMe(options = {}) {
    if (!this._authorized) {
      return Promise.reject(new errors.AccessDeniedError());
    }

    return this._request(endpoints.session)
      .then((object) => {
        if (options.raw || this._options.raw) {
          return object;
        }

        return new models.User(object);
      });
  }

  /**
   * Returns token of current session.
   * 
   * @return {Promise}
   */
  getToken() {
    return this._request(endpoints.token);
  }

  /**
   * Returns basic information about specfied user
   * 
   * @param {string} userIdentifier - User ID or username
   * @param {Object} [options] - Options to use in this method
   * @param {boolean} [options.raw=false] - Do not process API requests and 
   *                                        return raw answers instead
   * @return {Promise}
   */
  getUser(userIdentifier, options = {}) {
    return this._request(replaceTemplates(endpoints.user, {userIdentifier}))
      .then((object) => {
        if (options.raw || this._options.raw) {
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
   * This is a sugar for `getUserImage` method
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
   * @param {Object} [options] - Options to use in this method
   * @param {boolean} [options.raw=false] - Do not process API requests and 
   *                                        return raw answers instead
   * @return {Promise}
   */
  getPlaylistSongs(playlistId, params = {}, options = {}) {
    return this._request(endpoints.playlistSongs, {qs: params})
      .then((objects) => {
        if (options.raw || this._options.raw) {
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
   * @param {Object} [options] - Options to use in this method
   * @param {boolean} [options.raw=false] - Do not process API requests and 
   *                                        return raw answers instead
   * @return {Promise}
   */
  getPlaylists(options = {}) {
    return this._request(endpoints.playlists)
      .then((objects) => {
        if (options.raw || this._options.raw) {
          return objects;
        }

        return objects.map((object) => new models.Playlist(object));
      });
  }

  /**
   * Get basic information about specified room
   * 
   * @param {string} roomIdentifier - Room ID or URL-based name
   * @param {Object} [options] - Options to use in this method
   * @param {boolean} [options.raw=false] - Do not process API requests and 
   *                                        return raw answers instead
   * @return {Promise}
   */
  getRoom(roomIdentifier, options = {}) {
    return this._request(replaceTemplates(endpoints.room, {roomIdentifier}))
      .then((object) => {
        if (options.raw || this._options.raw) {
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
   * @param {Object} [options] - Options to use in this method
   * @param {boolean} [options.raw=false] - Do not process API requests and 
   *                                        return raw answers instead
   * @return {Promise}
   */
  getRoomUser(roomId, userId, options = {}) {
    let path = replaceTemplates(endpoints.roomUser, {roomId, userId});

    return this._request(path)
      .then((object) => {
        if (options.raw || this._options.raw) {
          return object;
        }

        return new models.RoomUser(object, this);
      });
  }

  /**
   * Get room users by endpoint
   * 
   * @param {string} endpoint - Endpoint
   * @param {string} roomId - Room ID
   * @param {Object} options - Options to use in this method
   * @return {Promise}
   * @private
   */
  _getRoomUsersByEndpoint(endpoint, roomId, options) {
    return this._request(replaceTemplates(endpoint, {roomId}))
    .then((objects) => {
      if (options.raw || this._options.raw) {
        return objects;
      }

      return objects.map((object) => new models.RoomUser(object, this));
    });
  }

  /**
   * Get users present in the room
   * 
   * @param {string} roomId - Room ID
   * @param {Object} [options] - Options to use in this method
   * @param {boolean} [options.raw=false] - Do not process API requests and 
   *                                        return raw answers instead
   * @return {Promise}
   */
  getRoomUsers(roomId, options = {}) {
    return this._getRoomUsersByEndpoint(endpoints.roomUsers, roomId, options);
  }

  /**
   * Get room's staff list
   * 
   * @param {string} roomId - Room ID
   * @param {Object} [options] - Options to use in this method
   * @param {boolean} [options.raw=false] - Do not process API requests and 
   *                                        return raw answers instead
   * @return {Promise}
   */
  getRoomStaff(roomId, options = {}) {
    return this._getRoomUsersByEndpoint(endpoints.roomStaff, roomId, options);
  }

  /**
   * Get users muted in the room
   * 
   * @param {string} roomId - Room ID
   * @param {Object} [options] - Options to use in this method
   * @param {boolean} [options.raw=false] - Do not process API requests and 
   *                                        return raw answers instead
   * @return {Promise}
   */
  getMutedUsers(roomId, options = {}) {
    return this._getRoomUsersByEndpoint(endpoints.mutedUsers, roomId, options);
  }

  /**
   * Get users banned in the room
   * 
   * @param {string} roomId - Room ID
   * @param {Object} [options] - Options to use in this method
   * @param {boolean} [options.raw=false] - Do not process API requests and 
   *                                        return raw answers instead
   * @return {Promise}
   */
  getBannedUsers(roomId, options = {}) {
    return this._getRoomUsersByEndpoint(endpoints.bannedUsers, roomId, options);
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
   * @param {Object} [options] - Options to use in this method
   * @param {boolean} [options.raw=false] - Do not process API requests and 
   *                                        return raw answers instead
   * @return {Promise}
   */
  getRooms(options = {}) {
    return this._request(endpoints.rooms)
      .then((objects) => {
        if (options.raw || this._options.raw) {
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
   * Requires authentication and moderator or higher role
   * in the room if deleting messages sent by other users
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
        this.sendMessageToConversation(conversation._id, message));
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

  /**
   * Register RegExp listener for Dubtrack events.
   * This is a sugar method that can be used to handle events: 
   * user-update, user_update
   * For example, /^user-update/ for user-update-{userId} events
   * 
   * Note: This method works only with Dubtrack events!
   * It does not work with library events like `connected` and others!
   * 
   * @param {string|RegExp} regexp - Regular experssion
   * @param {Function} listener - Listener
   * @return {DubtrackAPI}
   */
  addRegexpListener(regexp, listener) {
    this._regexpListeners.push({regexp, listener});

    return this;
  }

  /**
   * Remove RegExp listener for Dubtrack events.
   * This is a sugar method that can be used to handle events: 
   * user-update, user_update
   * For example, /^user-update/ for user-update-{userId} events
   * 
   * Note: This method works only with Dubtrack events!
   * It does not work with library events like `connected` and others!
   * 
   * @param {string|RegExp} regexp - Regular experssion
   * @param {Function} listener - Listener
   * @return {DubtrackAPI}
   */
  removeRegexpListener(regexp, listener) {
    let index = lodash.findIndex(this._regexpListeners, (listener) => {
      if (listener.regexp.source == regexp.source &&
          listener.regexp.flags == regexp.flags) {
        return true;
      }

      return false;
    });

    if (~index) {
      this._regexpListeners.splice(index, 1);
    }

    return this;
  }

  /**
   * Processes event
   * 
   * @param {Object} event 
   */
  processEvents(event) {
    if (!this._options.raw) {
      event.raw = lodash.cloneDeep(event);

      if (event.type == 'chat-message') {
        event.chatId = event.chatid;
        event.user = new models.User(event.user);
        event.time = new Date(event.time);

        delete event.chatid;
      } else if (event.type == 'room_playlist-dub' ||
          event.type == 'room_playlist-queue-update-dub' ||
          event.type == 'delete-chat-message' ||
          event.type.includes('user-update')) {
        event.user = new models.User(event.user);
      } else if (event.type == 'user-join') {
        event.user = new models.User(event.user);
        event.roomUser = new models.RoomUser(event.roomUser, this);
      } else if (event.type == 'user-leave') {
        event.user = new models.User(event.user);
        event.room = new models.Room(event.room);
      } else if (event.type == 'room_playlist-queue-update-grabs' ||
          event.type == 'user-pause-queue') {
        event.user = new models.User(event.user);
        // data.user_queue => new UserQueue
      } else if (event.type == 'room_playlist-update') {
        // data.song => new QueueSong => data.playlistSong, check room
        event.song = new models.Song(event.songInfo);
        delete event.songInfo;
      } else if (event.type == 'user-ban') {
        event.user = new models.User(event.kickedUser);
        event.moderator = new models.User(event.user);

        delete event.kickedUser;
      } else if (event.type.includes('user_update')) {
        event.user = new models.RoomUser(event.user);
      }
    }

    if (this._regexpListeners.length) {
      for (let listener of this._regexpListeners) {
        if (listener.regexp.test(event.type)) {
          listener.listener(event);

          if (this._options.onlyFirstMatch) {
            break;
          }
        }
      }
    }

    this.emit(event.type, event);
  }
}

DubtrackAPI.errors = errors;

module.exports = DubtrackAPI;
