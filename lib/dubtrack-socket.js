'use strict';
const errors = require('./common/errors');
const Promise = require('bluebird');
const SocketClient = require('dubtrack-ws-client');

/**
  * 
  */
class DubtrackEvents {
  /**
   * @constructor
   * @param {DubtrackAPI} api 
   * @param {Object} options - Socket options
   * @param {boolean} [options.secure=true] - Use secure connection
   * @param {string} [options.host=ws.dubtrack.fm] - Socket host
   * @param {boolean} [options.autoReconnect=true] - Reconnect automatically
   * @param {number} [options.retriesAmount=7] - Amount of reconnect retries
   */
  constructor(api, options) {
    this._api = api;

    options = Object.assign({
      secure: true,
      host: 'ws.dubtrack.fm',
      autoReconnect: true,
      retriesAmount: 7,
      transports: ['websocket'],
    }, options, {
      authCallback(data, callback) {
        api.getToken()
          .then((token) => callback(null, token))
          .catch(callback);
      },
    });

    this._socket = new SocketClient(options);
    this._socket.connection.on('connected', () => this._onConnected());
    this._socket.connection.on('disconnected',
        () => this._api.emit('disconnected'));
    this._socket.connection.on('failed',
        (message) => this._api.emit('failed', message));

    if (this._api.isAuthorized()) {
      this._socket.connection.once('connected', () => {
        this._api.getMe({raw: false})
          .then((session) => this._subscribe('user:' + session.id));
      });
    }

    this._api.on('login', () => this._updateToken())
      .on('logout', () => this._updateToken());
  }

  /**
   * 
   * 
   * @param {string} channelName
   * @return {boolean}
   * @private
   */
  _isPresenceChannel(channelName) {
    return /^room:/.test(channelName);
  }

  /**
   * Processes connection
   * 
   * @private
   */
  _onConnected() {
    for (let channelName in this._socket.channels.all) {
      if (this._socket.channels.all.hasOwnProperty(channelName)) {
        let channel = this._socket.channels.get(channelName);

        channel.attach();

        if (this._isPresenceChannel(channelName)) {
          channel.presence.enter();
        }
      }
    }

    this._api.emit('connected');
  }

  /**
   * 
   * 
   * @private
   */
  _updateToken() {
    this._api.getToken().then((token) => {
      this.disconnect();

      this._socket.token = token.token;
      this._socket.clientId = token.clientId;

      this.connect();
    });
  }

  /**
   * Subscribe on channel events
   * 
   * @param {string} channelName - Channel name
   * @return {Promise}
   * @private
   */
  _subscribe(channelName) {
    let channel = this._socket.channels.get(channelName);

    return Promise.fromCallback((next) => channel.attach(next))
      .then(() => {
        channel.subscribe((event) => this._api.processEvents(event.data));

        if (this._isPresenceChannel(channelName)) {
          channel.presence.subscribe(['enter', 'leave'], (event) => {
            event.data.type = event.data.type || 'presence';
            this._api.processEvents(event.data);
          });
        }
      });
  }

  /**
   *  
   */
  connect() {
    if (this.isConnected()) {
      Promise.reject(new errors.FatalError('Already connected'));
    }

    this._socket.connection.connect();
  }

  /**
   * 
   * @return {boolean}
   */
  isConnected() {
    return this._socket.connection.isConnected();
  }

  /**
   * Join to room
   * 
   * @param {string} roomIdentifier - Room ID or URL-based name
   * @return {Promise}
   */
  join(roomIdentifier) {
    if (!roomIdentifier) {
      return Promise.reject(
          new errors.FatalError('Room ID or URL-based name can not be empty'));
    }
    if (!this.isConnected()) {
      return Promise.reject(new errors.FatalError('Not connected'));
    }

    return this._api.getRoom(roomIdentifier)
      .then((room) => this._subscribe('room:' + room.id));
  }

  /**
   * 
   */
  disconnect() {
    if (!this.isConnected()) {
      Promise.reject(new errors.FatalError('Not connected'));
    }

    this._socket.close();
  }
}

module.exports = DubtrackEvents;
