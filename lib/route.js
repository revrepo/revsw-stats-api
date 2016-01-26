/*************************************************************************
 *
 * REV SOFTWARE CONFIDENTIAL
 *
 * [2013] - [2015] Rev Software, Inc.
 * All Rights Reserved.
 *
 * NOTICE:  All information contained herein is, and remains
 * the property of Rev Software, Inc. and its suppliers,
 * if any.  The intellectual and technical concepts contained
 * herein are proprietary to Rev Software, Inc.
 * and its suppliers and may be covered by U.S. and Foreign Patents,
 * patents in process, and are protected by trade secret or copyright law.
 * Dissemination of this information or reproduction of this material
 * is strictly forbidden unless prior written permission is obtained
 * from Rev Software, Inc.
 */

/*jslint node: true */
'use strict';

//  ----------------------------------------------------------------------------------------------//

var _ = require('lodash');
var config = require('config');
var logger = require('revsw-logger')(config.log);
var promise = require('bluebird');

var dispatcher = require('./dispatcher.js');
dispatcher.init();

var keys = require('./keys.js');
var metrics = require('./metrics.js');
//  disabled
// var channel = require('./channel.js');

var API_version_ = require('fs').readFileSync(config.version_file, {
  encoding: 'utf8'
}).trim();

//  ----------------------------------------------------------------------------------------------//
var _reply = function(resp, code, data) {
  data = data || {};
  if (_.isString(data)) {
    data = {
      message: data
    };
  }
  data.code = code;
  resp.writeHead(code, {
    'Content-Type': 'application/json'
  });
  resp.end(JSON.stringify(data));
};

var _200 = function(resp) {
  resp.writeHead(200, {
    'Content-Type': 'text/html'
  });
  resp.end('<!doctype html><html><head><title>ok</title></head><body>ok</body></html>');
};
var _400 = function(resp) {
  resp.writeHead(400, {
    'Content-Type': 'text/html'
  });
  resp.end('<!doctype html><html><head><title>400</title></head><body>400: Bad Bad Request</body></html>');
};
var _401 = function(resp) {
  resp.writeHead(401, {
    'Content-Type': 'text/html'
  });
  resp.end('<!doctype html><html><head><title>401</title></head><body>401: WTF are ya doin here, buddy</body></html>');
};
var _404 = function(resp) {
  resp.writeHead(404, {
    'Content-Type': 'text/html'
  });
  resp.end('<!doctype html><html><head><title>404</title></head><body>404: Resource Not Found</body></html>');
};
var _413 = function(resp) {
  resp.writeHead(413, 'Request Entity Too Large', {
    'Content-Type': 'text/html'
  });
  resp.end('<!doctype html><html><head><title>413</title></head><body>413: Request Entity Too Large</body></html>');
};
var _501 = function(resp) {
  resp.writeHead(501, {
    'Content-Type': 'text/html'
  });
  resp.end('<!doctype html><html><head><title>501</title></head><body>501: Not yet implemented</body></html>');
};


var endpoint_ = '/v' + config.api.version + '/';
var endpoint_stats_ = endpoint_ + config.api.main_endpoint + '/';
var routes_ = {
  'GET': {},
  'PUT': {},
  'POST': {}
};

//  ---------------------------------
//  kinda default
routes_.GET['/'] = function(req, resp) {
  _200(resp);
};

//  ---------------------------------
//  kinda debug/testing
routes_.POST['/test'] = function(req, resp) {

  resp.writeHead(200, {
    'Content-Type': 'application/json'
  });
  resp.end(JSON.stringify({
    headers: req.headers,
    conn: req.connection.remoteAddress
  }));
};

//  ---------------------------------
//  apps

routes_.PUT[endpoint_stats_ + 'apps'] = function(req, resp) {

  var body_ = '';

  req.on('data', function(data) {
    body_ += data;
    if (body_.length > (1024 * 1024)) {
      _413(resp);
    }
  });

  req.on('end', function() {
    var message;
    var ip_ = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    try {
      message = JSON.parse(body_);
      message.ip = ip_;
    } catch (e) {
      //  JSON not parsed properly
      logger.error('ip: ' + ip_, e);
      metrics.addMetric('errors');
      _reply(resp, 400, 'JSON parse failed');
      return;
    }

    //  handle the message
    dispatcher.handle( message )
      .then( function() {
        _reply(resp, 200, 'ok');
      })
      .catch( function( err ) {
        if ( err.code ) {
          _reply(resp, err.code, err.msg);
        } else {
          _reply(resp, 500, err.toString());
        }
      });
  });
};
//  temporary workaround
routes_.POST[endpoint_stats_ + 'apps'] = routes_.PUT[endpoint_stats_ + 'apps'];

//  ---------------------------------
//  healthcheck

routes_.GET[endpoint_ + 'healthcheck'] = function(req, resp) {

  var messages = [];
  keys.checkMongoStatus()
    .catch(function(err) {
      messages.push('BUMMER: APIkey/AccountID database (MongoDB) update failed: ' + err.toString());
    })
    .then(function() {
      return keys.getAccountAppIDs('0');
    })
    .catch(function(err) {
      messages.push('BUMMER: local Redis server connection failure: ' + err.toString());
    })
    .then(function() {
      return dispatcher.healthCheck();
    })
    .catch(function(err) {
      messages.push('BUMMER: ElasticSearch cluster health error: ' + err.toString());
    })
    .then(function() {
      if (messages.length) {
        resp.writeHead(500, {
          'Content-Type': 'application/json'
        });
        resp.end(JSON.stringify({
          message: messages.join('; '),
          version: API_version_
        }));
      } else {
        resp.writeHead(200, {
          'Content-Type': 'application/json'
        });
        resp.end(JSON.stringify({
          message: 'Everything is OK',
          version: API_version_
        }));
      }
    });
};


//  ---------------------------------
//  status

routes_.GET[endpoint_stats_ + 'status'] = function(req, resp) {

  metrics.getMetrics()
    .then(function(data) {
      resp.writeHead(200, {
        'Content-Type': 'application/json'
      });
      resp.end(JSON.stringify(data));
    })
    .catch(function(err) {
      resp.writeHead(500, {
        'Content-Type': 'application/json'
      });
      resp.end(JSON.stringify(err));
    });
};

//  ----------------------------------------------------------------------------------------------//
module.exports = function(req, resp) {

  if (!routes_[req.method] || !routes_[req.method][req.url]) {
    var ip_ = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    logger.warn('404(not found), ip: ' + ip_ + ', method: ' + req.method + ', url: ' + req.url);
    _404(resp);
    return;
  }

  //  here we go
  routes_[req.method][req.url](req, resp);
};

