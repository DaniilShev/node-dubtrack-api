'use strict';

const EventEmitter = require('events').EventEmitter;
const request = require('request-promise');
const Promise = require('bluebird');

const errors = require('./errors');
const endpoints = require('./endpoints');

class DubtrackAPI extends EventEmitter {
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
    this._authorized = false;

    if (options.auth) {
      const autoLogin = options.auth.autoLogin;
      if (typeof autoLogin === 'undefined' || autoLogin === true) {
        this.login(options.auth);
      }
    }
  }

  _request(endpoint, options) {
    if (this._options.request) {
      Object.assign(options, this._options.request);
    }

    options.url = `${this._options.baseApiUrl}/${endpoint}`;
    options.simple = false;
    options.resolveWithFullResponse = true;

    return request(options).then(response => {
      let json;
      try {
        json = JSON.parse(response.body);
      } catch (err) {
        throw new errors.FatalError(`Error parsing Dubtrack response: ${response.body}`);
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
    });;
  }

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

  logout() {
    return this._request(endpoints.logout)
    .then((response) => {
      this._authorized = false;

      return response;
    });
  }

  getMe() {
    if (!this._authorized) {
      return Promise.reject(new errors.FatalError('Not logged in'));
    }

    return this._request(endpoints.session);
  }
}

function replaceTemplates(str, replacements) {
  return str.replace(/{(\w+)}/g, (match, p1) => {
    if (!replacements || !(p1 in replacements)) {
      throw new TypeError(`Not found a replacement for ${p1}`);
    }

    return replacements[p1];
  });
}