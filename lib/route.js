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

var config = require( 'config' );
var logger = require('revsw-logger')( config.log );
var promise = require( 'bluebird' );
var dispatcher = require( './dispatcher.js' );
var geo = require( './geo.js' );
var keys = require( './keys.js' );

//  ----------------------------------------------------------------------------------------------//
var _404 = function( resp ) {
  resp.writeHead( 404, {
    'Content-Type': 'text/html'
  } );
  resp.end( '<!doctype html><html><head><title>404</title></head><body>404: Resource Not Found</body></html>' );
};
var _405 = function( resp ) {
  resp.writeHead( 405, 'Method Not Supported', {
    'Content-Type': 'text/html'
  } );
  resp.end( '<!doctype html><html><head><title>405</title></head><body>405: Method Not Supported</body></html>' );
};
var _413 = function( resp ) {
  resp.writeHead( 413, 'Request Entity Too Large', {
    'Content-Type': 'text/html'
  } );
  resp.end( '<!doctype html><html><head><title>413</title></head><body>413: Request Entity Too Large</body></html>' );
};
var _200 = function( resp ) {
  resp.writeHead( 200, {
    'Content-Type': 'text/html'
  } );
  resp.end( '<!doctype html><html><head><title>ok</title></head><body>ok</body></html>' );
};
var _501 = function( resp ) {
  resp.writeHead( 501, {
    'Content-Type': 'text/html'
  } );
  resp.end( '<!doctype html><html><head><title>501</title></head><body>501: Not yet implemented</body></html>' );
};
// var _503 = function( resp ) {
//   resp.writeHead( 503, {
//     'Content-Type': 'text/html'
//   } );
//   resp.end( '<!doctype html><html><head><title>503</title></head><body>503: Service unavailable</body></html>' );
// };

// /v1/stats/apps, PUT method, to add user statistic data;
// /v1/stats/metrics, GET to retrieve metrics.

var endpoint_ = '/v' + config.api.version + '/' + config.api.main_endpoint + '/';
var routes_ = {
  'GET': {},
  'PUT': {}
  // 'POST': {},
};

//  ---------------------------------
//  kinda default
routes_.GET['/'] = function( req, resp ) {
  _200( resp );
};

//  ---------------------------------
routes_.GET[endpoint_ + 'metrics'] = function( req, resp ) {
  _501( resp );
};

//  ---------------------------------
//  apps
routes_.PUT[endpoint_ + 'apps'] = function( req, resp ) {

  var body_ = '';

  req.on( 'data', function( data ) {
    body_ += data;
    if ( body_.length > 10240 ) {
      _413( resp );
    }
  });
  req.on( 'end', function() {
    _200( resp );
    var message;
    try {
      message = JSON.parse( body_ );
      message.processing_started_at = Date.now();
    } catch ( e ) {
      //  TODO: Metric add error
      logger.error( e );
      return;
    }

    //  here we go
    ( message.network && message.network.cellular_ip_external ?
       geo( message.network.cellular_ip_external ) :
       promise.resolve({
          country_code2: '',
          region_name: '',
          city_name: ''
        }) )
      .then( function( geo ) {
        message.geoip = geo;
        return keys.getAccountID( message.sdk_key );
      })
      .then( function( aid ) {
        message.account_id = aid;
        return dispatcher.send( message );
      })
      .catch( function( err ) {
        logger.error( err );
        //  todo: metrics
      });

  });
};

//  ----------------------------------------------------------------------------------------------//
module.exports = function( req, resp ) {

  if ( routes_[req.method] ) {
    if ( routes_[req.method][req.url] ) {
      routes_[req.method][req.url]( req, resp );
    } else {
      logger.warn( req.method, req.url );
      _404( resp );
    }
  } else {
    logger.warn( req.method, req.url );
    _405( resp );
  }
};